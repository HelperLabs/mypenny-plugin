
// plugins/mypenny-core/scripts/auth_login.ts
import * as os2 from "node:os";
import { spawn } from "node:child_process";

// plugins/mypenny-core/lib/auth-store.ts
import * as fs2 from "node:fs";
import * as crypto2 from "node:crypto";

// plugins/mypenny-core/lib/paths.ts
import * as os from "node:os";
import * as path from "node:path";

// plugins/mypenny-core/lib/build-config.ts
function buildBaseUrl() {
  return "https://engine.mypenny.ai";
}
function buildStateDir() {
  return ".mypenny";
}

// plugins/mypenny-core/lib/paths.ts
function mypennyDir() {
  return process.env.MYPENNY_HOME || path.join(os.homedir(), buildStateDir());
}
function tokenPath() {
  return path.join(mypennyDir(), "token");
}
function configPath() {
  return path.join(mypennyDir(), "config.json");
}
function authHealthPath() {
  return path.join(mypennyDir(), "auth-health.json");
}

// plugins/mypenny-core/lib/auth-health.ts
import * as fs from "node:fs";
var RETRY_PENDING_HORIZON_MS = 12 * 60 * 1e3, REJECTED_BACKOFF_MS = 6 * 60 * 60 * 1e3;
var REPAIR_EVIDENCE_HORIZON_MS = 24 * 60 * 60 * 1e3;
function debugLog(message) {
  process.env.MYPENNY_DEBUG === "1" && console.error(message);
}
function clearAuthHealth() {
  try {
    fs.unlinkSync(authHealthPath());
  } catch (err) {
    if (err?.code === "ENOENT") return;
    try {
      fs.writeFileSync(authHealthPath(), `{}
`, { mode: 384 });
    } catch (writeErr) {
      debugLog(
        `[mypenny] auth-health clear failed: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`
      );
    }
  }
}

// plugins/mypenny-core/lib/auth-store.ts
var DEFAULT_BASE_URL = buildBaseUrl();
function ensureDir() {
  fs2.mkdirSync(mypennyDir(), { recursive: !0 });
}
function atomicWrite(target, contents, mode) {
  ensureDir();
  let tmp = `${target}.${crypto2.randomUUID()}.tmp`;
  fs2.writeFileSync(tmp, contents, { mode }), fs2.renameSync(tmp, target), process.platform !== "win32" && fs2.chmodSync(target, mode);
}
function writeToken(token) {
  atomicWrite(tokenPath(), token.trim(), 384), clearAuthHealth();
}
function writeConfig(cfg) {
  atomicWrite(configPath(), JSON.stringify(cfg, null, 2) + `
`, 420);
}

// plugins/mypenny-core/lib/device-flow.ts
var DEVICE_CLIENT_ID = "mypenny-core", DEVICE_RESOURCE = "urn:mypenny:plugin-api", defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function secureRandomBytes() {
  let bytes = new Uint8Array(32);
  return crypto.getRandomValues(bytes), bytes;
}
async function sha256Base64Url(value) {
  let digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return base64Url(new Uint8Array(digest));
}
async function requestDeviceCode(baseUrl, clientName, deps = {}) {
  let bytes = (deps.randomBytes ?? secureRandomBytes)();
  if (bytes.length !== 32) throw new Error("device authorization setup failed");
  let clientContext = base64Url(bytes), response = await fetch(`${baseUrl}/api/auth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: DEVICE_CLIENT_ID,
      client_name: clientName,
      resource: DEVICE_RESOURCE,
      client_context_challenge: await sha256Base64Url(clientContext)
    })
  });
  if (!response.ok) {
    let error = "";
    try {
      let body = await response.json();
      error = typeof body?.error == "string" ? `: ${body.error}` : "";
    } catch {
    }
    throw new Error(`device-code request failed (HTTP ${response.status})${error}`);
  }
  return {
    response: await response.json(),
    clientContext
  };
}
async function pollForToken(baseUrl, authorization, deps = {}) {
  let sleep = deps.sleep ?? defaultSleep, deadline = Date.now() + authorization.response.expires_in * 1e3, intervalSeconds = authorization.response.interval;
  for (; ; ) {
    if (Date.now() > deadline)
      throw new Error("expired_token (deadline passed before user approved)");
    await sleep(intervalSeconds * 1e3);
    let response = await fetch(`${baseUrl}/api/auth/device/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_code: authorization.response.device_code,
        client_id: DEVICE_CLIENT_ID,
        resource: DEVICE_RESOURCE,
        client_context: authorization.clientContext,
        // #996: advertising rotation support is what makes the server issue
        // the modern credential (expiring, resource- and scope-bound). A
        // client that omits this — an older install — keeps receiving the
        // legacy non-expiring token until the dated retirement gate.
        client_capabilities: ["token_rotation"]
      })
    }), body = {};
    try {
      body = await response.json();
    } catch {
    }
    if (response.ok && body.access_token && body.userId)
      return {
        access_token: body.access_token,
        userId: body.userId,
        ...typeof body.expires_in == "number" && Number.isFinite(body.expires_in) ? { expires_in: body.expires_in } : {}
      };
    let error = body.error ?? "unknown_error";
    if (error !== "authorization_pending") {
      if (error === "slow_down") {
        intervalSeconds += 5;
        continue;
      }
      throw error === "expired_token" ? new Error("expired_token (server-side)") : error === "access_denied" ? new Error("access_denied (authorization rejected)") : new Error(`device-flow poll failed: ${error}`);
    }
  }
}

// plugins/mypenny-core/scripts/auth_login.ts
var BASE_URL = process.env.MYPENNY_BASE_URL ?? buildBaseUrl(), CLIENT_NAME = process.env.MYPENNY_CLIENT_NAME ?? os2.hostname();
function openBrowser(url) {
  let cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { detached: !0, stdio: "ignore" }).unref();
  } catch {
  }
}
async function main() {
  process.stderr.write(`[mypenny] requesting device code from ${BASE_URL} ...
`);
  let authorization = await requestDeviceCode(BASE_URL, CLIENT_NAME), dc = authorization.response;
  process.stderr.write(`
  Visit: ${dc.verification_uri_complete}
`), process.stderr.write(`  If prompted, enter code: ${dc.user_code}

`), openBrowser(dc.verification_uri_complete);
  let approved = await pollForToken(BASE_URL, authorization);
  writeToken(approved.access_token);
  let issuedAt = Date.now();
  writeConfig({
    memoryUrl: process.env.MYPENNY_MEMORY_URL ?? `${BASE_URL}/mcp`,
    ingestUrl: process.env.MYPENNY_INGEST_URL ?? `${BASE_URL}/api/ingestTranscript`,
    userId: approved.userId,
    issuedAt,
    // #996: the server returns expires_in only for the modern expiring
    // credential. Recording the deadline is what lets the plugin renew
    // part-way through the token's life instead of discovering the problem
    // when a request finally fails.
    ...approved.expires_in !== void 0 ? { tokenExpiresAt: issuedAt + approved.expires_in * 1e3 } : {}
  }), process.stderr.write(`[mypenny] authenticated as ${approved.userId}
`);
}
main().catch((err) => {
  let msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[mypenny] auth failed: ${msg}
`), process.exit(1);
});
