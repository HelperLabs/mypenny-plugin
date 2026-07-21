
// plugins/mypenny-core/scripts/auth_login.ts
import * as os2 from "node:os";
import { spawn } from "node:child_process";

// plugins/mypenny-core/lib/auth-store.ts
import * as fs from "node:fs";
import * as crypto2 from "node:crypto";

// plugins/mypenny-core/lib/paths.ts
import * as os from "node:os";
import * as path from "node:path";
function mypennyDir() {
  return process.env.MYPENNY_HOME || path.join(os.homedir(), ".mypenny");
}
function tokenPath() {
  return path.join(mypennyDir(), "token");
}
function configPath() {
  return path.join(mypennyDir(), "config.json");
}

// plugins/mypenny-core/lib/auth-store.ts
function ensureDir() {
  fs.mkdirSync(mypennyDir(), { recursive: true });
}
function atomicWrite(target, contents, mode) {
  ensureDir();
  const tmp = `${target}.${crypto2.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, contents, { mode });
  fs.renameSync(tmp, target);
  if (process.platform !== "win32") {
    fs.chmodSync(target, mode);
  }
}
function writeToken(token) {
  atomicWrite(tokenPath(), token.trim(), 384);
}
function writeConfig(cfg) {
  atomicWrite(configPath(), JSON.stringify(cfg, null, 2) + "\n", 420);
}

// plugins/mypenny-core/lib/device-flow.ts
var DEVICE_CLIENT_ID = "mypenny-core";
var DEVICE_RESOURCE = "urn:mypenny:plugin-api";
var defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function secureRandomBytes() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}
async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return base64Url(new Uint8Array(digest));
}
async function requestDeviceCode(baseUrl, clientName, deps = {}) {
  const bytes = (deps.randomBytes ?? secureRandomBytes)();
  if (bytes.length !== 32) throw new Error("device authorization setup failed");
  const clientContext = base64Url(bytes);
  const response = await fetch(`${baseUrl}/api/auth/device`, {
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
      const body = await response.json();
      error = typeof body?.error === "string" ? `: ${body.error}` : "";
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
  const sleep = deps.sleep ?? defaultSleep;
  const deadline = Date.now() + authorization.response.expires_in * 1e3;
  let intervalSeconds = authorization.response.interval;
  while (true) {
    if (Date.now() > deadline) {
      throw new Error("expired_token (deadline passed before user approved)");
    }
    await sleep(intervalSeconds * 1e3);
    const response = await fetch(`${baseUrl}/api/auth/device/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_code: authorization.response.device_code,
        client_id: DEVICE_CLIENT_ID,
        resource: DEVICE_RESOURCE,
        client_context: authorization.clientContext
      })
    });
    let body = {};
    try {
      body = await response.json();
    } catch {
    }
    if (response.ok && body.access_token && body.userId) {
      return { access_token: body.access_token, userId: body.userId };
    }
    const error = body.error ?? "unknown_error";
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      intervalSeconds += 5;
      continue;
    }
    if (error === "expired_token") throw new Error("expired_token (server-side)");
    if (error === "access_denied") {
      throw new Error("access_denied (authorization rejected)");
    }
    throw new Error(`device-flow poll failed: ${error}`);
  }
}

// plugins/mypenny-core/scripts/auth_login.ts
var BASE_URL = process.env.MYPENNY_BASE_URL ?? "https://engine.mypenny.ai";
var CLIENT_NAME = process.env.MYPENNY_CLIENT_NAME ?? os2.hostname();
function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
  }
}
async function main() {
  process.stderr.write(`[mypenny] requesting device code from ${BASE_URL} ...
`);
  const authorization = await requestDeviceCode(BASE_URL, CLIENT_NAME);
  const dc = authorization.response;
  process.stderr.write(`
  Visit: ${dc.verification_uri_complete}
`);
  process.stderr.write(`  If prompted, enter code: ${dc.user_code}

`);
  openBrowser(dc.verification_uri_complete);
  const approved = await pollForToken(BASE_URL, authorization);
  writeToken(approved.access_token);
  writeConfig({
    memoryUrl: process.env.MYPENNY_MEMORY_URL ?? `${BASE_URL}/mcp`,
    ingestUrl: process.env.MYPENNY_INGEST_URL ?? `${BASE_URL}/api/ingestTranscript`,
    userId: approved.userId,
    issuedAt: Date.now()
  });
  process.stderr.write(`[mypenny] authenticated as ${approved.userId}
`);
}
main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[mypenny] auth failed: ${msg}
`);
  process.exit(1);
});
