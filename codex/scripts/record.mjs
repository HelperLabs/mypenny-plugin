
// plugins/mypenny-core/scripts/record.ts
import * as fs7 from "node:fs";

// plugins/mypenny-core/lib/off-record.ts
import * as fs3 from "node:fs";
import * as path4 from "node:path";
import * as crypto from "node:crypto";

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
function sessionsDir() {
  return path.join(mypennyDir(), "sessions");
}
function sessionPath(sessionId) {
  return path.join(sessionsDir(), `${sessionId}.json`);
}
function claimsDir() {
  return path.join(mypennyDir(), "claims");
}
function authHealthPath() {
  return path.join(mypennyDir(), "auth-health.json");
}
function diagLogPath() {
  return path.join(mypennyDir(), "logs", "hooks.log");
}

// plugins/mypenny-core/lib/diag.ts
import * as fs from "node:fs";
import * as path2 from "node:path";
var MAX_BYTES = 256 * 1024, diagContext = {};
function diagEnabled() {
  return !(process.env.MYPENNY_SUBCONSCIOUS === "off" || process.env.MYPENNY_DIAG?.trim().toLowerCase() === "off");
}
function rotateIfNeeded(file) {
  try {
    fs.statSync(file).size >= MAX_BYTES && fs.renameSync(file, `${file}.1`);
  } catch {
  }
}
function recordDiag(record) {
  if (diagEnabled())
    try {
      let file = diagLogPath();
      fs.mkdirSync(path2.dirname(file), { recursive: !0 }), rotateIfNeeded(file);
      let line = JSON.stringify({ at: Date.now(), ...diagContext, ...record }) + `
`;
      fs.appendFileSync(file, line);
    } catch {
    }
}

// plugins/mypenny-core/lib/posture.ts
var SILENT = Object.freeze({ kind: "silent" });
function errorDetail(err) {
  let name = err instanceof Error ? err.name : typeof err, code = err?.code;
  return typeof code == "string" ? `${name}:${code}` : name;
}

// plugins/mypenny-core/lib/transcript-cursor.ts
import * as fs2 from "node:fs";
import * as path3 from "node:path";
function transcriptCursorPath(sessionId) {
  return path3.join(sessionsDir(), `${sessionId}.transcript.json`);
}
function isPendingBatch(value) {
  let p = value;
  return p !== null && typeof p == "object" && typeof p.batchId == "string" && p.batchId.length > 0 && typeof p.digest == "string" && p.ends !== null && typeof p.ends == "object" && Object.values(p.ends).every((n) => Number.isSafeInteger(n) && n >= 0);
}
function isFileCursor(value) {
  let c = value;
  return c !== null && typeof c == "object" && Number.isSafeInteger(c.offset) && c.offset >= 0 && typeof c.anchor == "string" && c.anchor.length > 0 && (c.lastUuid === void 0 || typeof c.lastUuid == "string") && (c.lastTimestamp === void 0 || Number.isFinite(c.lastTimestamp)) && (c.sourceClock === void 0 || c.sourceClock === null || Number.isFinite(c.sourceClock));
}
function readCursors(sessionId) {
  let raw;
  try {
    raw = fs2.readFileSync(transcriptCursorPath(sessionId), "utf-8");
  } catch (err) {
    let code = err.code;
    return code !== "ENOENT" && recordDiag({ event: "transcript_cursor", outcome: "fail", reason: "reset", detail: code ?? "read" }), { v: 1, files: {} };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return recordDiag({ event: "transcript_cursor", outcome: "fail", reason: "reset", detail: "parse" }), { v: 1, files: {} };
  }
  if (parsed?.v !== 1 || !parsed.files || typeof parsed.files != "object")
    return recordDiag({ event: "transcript_cursor", outcome: "fail", reason: "reset", detail: "shape" }), { v: 1, files: {} };
  let files = {}, dropped = 0;
  for (let [key, value] of Object.entries(parsed.files))
    isFileCursor(value) ? files[key] = value : dropped++;
  return dropped > 0 && recordDiag({ event: "transcript_cursor", outcome: "fail", reason: "reset", detail: "shape", count: dropped }), isPendingBatch(parsed.pending) ? { v: 1, files, pending: parsed.pending } : { v: 1, files };
}

// plugins/mypenny-core/lib/off-record.ts
var SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/;
function safeId(sessionId) {
  return typeof sessionId == "string" && SAFE_SESSION_ID.test(sessionId);
}
function offRecordPath(sessionId) {
  return path4.join(sessionsDir(), `${sessionId}.offrecord.json`);
}
function isOffRecord(sessionId) {
  return safeId(sessionId) && fs3.existsSync(offRecordPath(sessionId));
}
function readMarker(file) {
  try {
    let parsed = JSON.parse(fs3.readFileSync(file, "utf-8"));
    return typeof parsed.offRecordAt == "number" ? parsed : null;
  } catch {
    return null;
  }
}
function markOffRecord(sessionId, now = Date.now(), anchorUuid) {
  if (!safeId(sessionId)) return !1;
  let target = offRecordPath(sessionId), existing = readMarker(target), anchor = existing?.anchorUuid ?? anchorUuid ?? readCursors(sessionId).files.main?.lastUuid, marker = {
    offRecordAt: existing?.offRecordAt ?? now,
    ...anchor ? { anchorUuid: anchor } : {}
  };
  fs3.mkdirSync(sessionsDir(), { recursive: !0 });
  let tmp = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    fs3.writeFileSync(tmp, JSON.stringify(marker), { mode: 384 }), fs3.renameSync(tmp, target);
  } catch (err) {
    try {
      fs3.rmSync(tmp, { force: !0 });
    } catch {
    }
    throw err;
  }
  return !0;
}
var TAIL_BYTES = 256 * 1024;
var LIVE_WINDOW_MS = 7200 * 1e3;
function pickSession(cwdIn, now = Date.now()) {
  let names;
  try {
    names = fs3.readdirSync(sessionsDir());
  } catch {
    return { kind: "none" };
  }
  let real = (p) => {
    try {
      return fs3.realpathSync(p);
    } catch {
      return p;
    }
  }, cwd = real(cwdIn), live = [];
  for (let name of names)
    if (!(!name.endsWith(".json") || name.endsWith(".offrecord.json") || name.endsWith(".transcript.json")))
      try {
        let file = path4.join(sessionsDir(), name), state = JSON.parse(fs3.readFileSync(file, "utf-8"));
        if (!safeId(state.sessionId) || typeof state.projectPath != "string") continue;
        let root = real(state.projectPath).replace(/\/+$/, "");
        if (cwd !== root && !cwd.startsWith(`${root}/`)) continue;
        let shippedAt = 0;
        try {
          shippedAt = fs3.statSync(transcriptCursorPath(state.sessionId)).mtimeMs;
        } catch {
        }
        let activeAt = Math.max(shippedAt, fs3.statSync(file).mtimeMs);
        if (now - activeAt > LIVE_WINDOW_MS) continue;
        live.push({ id: state.sessionId, depth: root.length, activeAt });
      } catch {
      }
  if (live.length === 0) return { kind: "none" };
  let deepest = Math.max(...live.map((c) => c.depth)), best = live.filter((c) => c.depth === deepest).sort((a, b) => b.activeAt - a.activeAt);
  return best.length === 1 ? { kind: "one", id: best[0].id } : { kind: "ambiguous", ids: best.map((c) => c.id) };
}

// plugins/mypenny-core/lib/auth-store.ts
import * as fs5 from "node:fs";
import * as crypto3 from "node:crypto";

// plugins/mypenny-core/lib/auth-health.ts
import * as fs4 from "node:fs";
import * as crypto2 from "node:crypto";
var RETRY_PENDING_HORIZON_MS = 720 * 1e3, REJECTED_BACKOFF_MS = 360 * 60 * 1e3, REJECTION_THRESHOLD = 2, REPAIR_EVIDENCE_HORIZON_MS = 1440 * 60 * 1e3;
function debugLog(message) {
  process.env.MYPENNY_DEBUG === "1" && console.error(message);
}
function asTime(value) {
  return typeof value == "number" && Number.isFinite(value) ? value : void 0;
}
function readAuthHealth() {
  try {
    let parsed = JSON.parse(fs4.readFileSync(authHealthPath(), "utf-8"));
    if (parsed === null || typeof parsed != "object" || Array.isArray(parsed))
      return {};
    let raw = parsed, count = asTime(raw.rotateRejections);
    return {
      retryPendingAt: asTime(raw.retryPendingAt),
      rotateRejections: count === void 0 ? void 0 : Math.floor(count),
      lastRejectedAt: asTime(raw.lastRejectedAt),
      requestUnauthorizedAt: asTime(raw.requestUnauthorizedAt)
    };
  } catch {
    return {};
  }
}
function writeAuthHealth(health) {
  try {
    fs4.mkdirSync(mypennyDir(), { recursive: !0 });
    let target = authHealthPath(), tmp = `${target}.${crypto2.randomUUID()}.tmp`;
    fs4.writeFileSync(tmp, JSON.stringify(health) + `
`, { mode: 384 }), fs4.renameSync(tmp, target);
  } catch (err) {
    debugLog(`[mypenny] auth-health write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function recordRotationRetryable(now = Date.now()) {
  writeAuthHealth({ ...readAuthHealth(), retryPendingAt: now });
}
function recordRotationRejected(now = Date.now()) {
  let health = readAuthHealth(), sameEpisode = health.lastRejectedAt !== void 0 && now - health.lastRejectedAt < REJECTED_BACKOFF_MS;
  writeAuthHealth({
    ...health,
    rotateRejections: sameEpisode ? (health.rotateRejections ?? 0) + 1 : 1,
    lastRejectedAt: now
  });
}
function recordRequestUnauthorized(now = Date.now()) {
  writeAuthHealth({ ...readAuthHealth(), requestUnauthorizedAt: now });
}
function clearAuthHealth() {
  try {
    fs4.unlinkSync(authHealthPath());
  } catch (err) {
    if (err?.code === "ENOENT") return;
    try {
      fs4.writeFileSync(authHealthPath(), `{}
`, { mode: 384 });
    } catch (writeErr) {
      debugLog(
        `[mypenny] auth-health clear failed: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`
      );
    }
  }
}
function rotationRetryPending(health, now) {
  return health.retryPendingAt !== void 0 && now - health.retryPendingAt < RETRY_PENDING_HORIZON_MS;
}
function rotationKnownRejected(health, now) {
  return (health.rotateRejections ?? 0) >= REJECTION_THRESHOLD && health.lastRejectedAt !== void 0 && now - health.lastRejectedAt < REJECTED_BACKOFF_MS;
}

// plugins/mypenny-core/lib/auth-store.ts
var DEFAULT_BASE_URL = buildBaseUrl();
function ensureDir() {
  fs5.mkdirSync(mypennyDir(), { recursive: !0 });
}
function atomicWrite(target, contents, mode) {
  ensureDir();
  let tmp = `${target}.${crypto3.randomUUID()}.tmp`;
  fs5.writeFileSync(tmp, contents, { mode }), fs5.renameSync(tmp, target), process.platform !== "win32" && fs5.chmodSync(target, mode);
}
function readToken() {
  let envToken = process.env.MYPENNY_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return fs5.readFileSync(tokenPath(), "utf-8").trim() || null;
  } catch {
    return null;
  }
}
function writeToken(token) {
  atomicWrite(tokenPath(), token.trim(), 384), clearAuthHealth();
}
function readConfig() {
  try {
    let raw = fs5.readFileSync(configPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return readEnvConfig();
  }
}
function writeConfig(cfg) {
  atomicWrite(configPath(), JSON.stringify(cfg, null, 2) + `
`, 420);
}
function writeTokenExpiry(expiresAt, issuedAt) {
  let cfg = readConfig();
  if (!cfg) return;
  let next = { ...cfg };
  expiresAt === void 0 ? delete next.tokenExpiresAt : next.tokenExpiresAt = expiresAt, issuedAt !== void 0 && (next.issuedAt = issuedAt), writeConfig(next);
}
function readEnvConfig() {
  if (!process.env.MYPENNY_TOKEN && !process.env.MYPENNY_BASE_URL && !process.env.MYPENNY_MEMORY_URL && !process.env.MYPENNY_MCP_URL && !process.env.MYPENNY_INGEST_URL)
    return null;
  let baseUrl = process.env.MYPENNY_BASE_URL?.trim() || DEFAULT_BASE_URL;
  return {
    memoryUrl: process.env.MYPENNY_MEMORY_URL?.trim() || process.env.MYPENNY_MCP_URL?.trim() || `${baseUrl}/mcp`,
    ingestUrl: process.env.MYPENNY_INGEST_URL?.trim() || `${baseUrl}/api/ingestTranscript`,
    userId: process.env.MYPENNY_USER_ID?.trim() || "env",
    issuedAt: 0
  };
}

// plugins/mypenny-core/lib/claim.ts
import * as fs6 from "node:fs";
import * as path5 from "node:path";
import * as crypto4 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  let safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim", digest = crypto4.createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${safe}.${digest}`;
}
function prune(dir, stem, currentWindow) {
  try {
    for (let file of fs6.readdirSync(dir)) {
      if (!file.startsWith(`${stem}.`)) continue;
      let w = Number(file.slice(stem.length + 1));
      if (!(!Number.isFinite(w) || w > currentWindow - KEEP_WINDOWS))
        try {
          fs6.unlinkSync(path5.join(dir, file));
        } catch {
        }
    }
  } catch {
  }
}
function claimWindow(name, windowMs, now = Date.now(), failOpen = !0) {
  let dir = claimsDir(), stem = claimStem(name), window = Math.floor(now / windowMs), target = path5.join(dir, `${stem}.${window}`);
  try {
    fs6.mkdirSync(dir, { recursive: !0 });
  } catch {
    return failOpen;
  }
  try {
    fs6.closeSync(fs6.openSync(target, "wx"));
  } catch (err) {
    return err?.code === "EEXIST" ? !1 : failOpen;
  }
  return prune(dir, stem, window), !0;
}

// plugins/mypenny-core/lib/token-rotation.ts
var ROTATION_TIMEOUT_MS = 8e3, PROACTIVE_ROTATION_WINDOW_MS = 360 * 60 * 1e3, ROTATION_RETRY_WINDOW_MS = 120 * 1e3, RENEW_AFTER_FRACTION = 2 / 3, rotationAttempted = !1;
function tokenIsEnvPinned() {
  return !!process.env.MYPENNY_TOKEN?.trim();
}
function renewalIsDue(cfg, now) {
  if (!cfg) return !1;
  if (cfg.tokenExpiresAt === void 0) return !0;
  let issuedAt = cfg.issuedAt && cfg.issuedAt > 0 ? cfg.issuedAt : void 0;
  if (issuedAt === void 0)
    return now >= cfg.tokenExpiresAt - 2592e6 / 3;
  let lifetime = cfg.tokenExpiresAt - issuedAt;
  return lifetime <= 0 ? !0 : now - issuedAt >= lifetime * RENEW_AFTER_FRACTION;
}
function rotationUrl(memoryUrl) {
  try {
    return new URL("/api/auth/token/rotate", memoryUrl).toString();
  } catch {
    return null;
  }
}
async function rotateToken(timeoutMs = ROTATION_TIMEOUT_MS) {
  if (rotationAttempted || (rotationAttempted = !0, tokenIsEnvPinned())) return null;
  let token = readToken(), cfg = readConfig();
  if (!token || !cfg) return null;
  let url = rotationUrl(cfg.memoryUrl);
  if (!url || rotationKnownRejected(readAuthHealth(), Date.now())) return null;
  try {
    let controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs), response = await fetch(url, {
      method: "POST",
      headers: {
        // The boundary requires a declared JSON media type on POST; the
        // credential itself rides in the Authorization header.
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: "{}",
      signal: controller.signal
    });
    if (clearTimeout(timer), !response.ok)
      return response.status === 400 || response.status === 401 || response.status === 403 ? recordRotationRejected() : response.status !== 429 && recordRotationRetryable(), null;
    let data = await response.json(), next = typeof data.access_token == "string" ? data.access_token.trim() : "";
    if (!next.startsWith("mpt_"))
      return recordRotationRetryable(), null;
    writeToken(next);
    let expiresIn = typeof data.expires_in == "number" && Number.isFinite(data.expires_in) ? data.expires_in : void 0;
    return writeTokenExpiry(
      expiresIn === void 0 ? void 0 : Date.now() + expiresIn * 1e3,
      // Refresh the issue time too (#1410): renewal timing measures "two
      // thirds of life" against issuedAt, so leaving the ORIGINAL pairing
      // time here made every install drift toward always-due — once the
      // recorded age passed two thirds of the recorded lifetime, renewal was
      // permanently due (~4 needless rotations/day, bounded by the 6h claim).
      Date.now()
    ), next;
  } catch {
    return recordRotationRetryable(), null;
  }
}
async function withTokenRotation(attempt, token, timeoutMs) {
  let active = token;
  if (!tokenIsEnvPinned() && renewalIsDue(readConfig(), Date.now()) && (claimWindow("token-rotate", PROACTIVE_ROTATION_WINDOW_MS) || rotationRetryPending(readAuthHealth(), Date.now()) && claimWindow("token-rotate-retry", ROTATION_RETRY_WINDOW_MS))) {
    let renewed = await rotateToken(timeoutMs);
    renewed && (active = renewed);
  }
  let first = await attempt(active);
  if (!first.unauthorized) return first.value;
  tokenIsEnvPinned() || recordRequestUnauthorized();
  let rotated = await rotateToken(timeoutMs);
  return rotated ? (await attempt(rotated)).value : first.value;
}

// plugins/mypenny-core/lib/guidance-cache.ts
import * as crypto5 from "node:crypto";
var GUIDANCE_TTL_MS = 600 * 1e3;
function tokenTag(token) {
  return crypto5.createHash("sha256").update(token).digest("hex").slice(0, 16);
}

// plugins/mypenny-core/lib/memory-client.ts
var TIMEOUT_MS = 6e3;
function debugEnabled() {
  let value = process.env.MYPENNY_DEBUG?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
function debugLog2(message) {
  debugEnabled() && console.error(message);
}
async function callTool(name, args, timeoutMs = TIMEOUT_MS, onCredential) {
  let token = readToken(), cfg = readConfig();
  return !token || !cfg ? (recordDiag({
    event: "memory_tool",
    outcome: "skip",
    tool: name,
    reason: token ? "no_config" : "no_auth"
  }), null) : withTokenRotation(
    (bearer) => (onCredential?.(tokenTag(bearer)), callToolOnce(name, args, bearer, cfg.memoryUrl, timeoutMs)),
    token,
    timeoutMs
  );
}
async function callToolOnce(name, args, token, memoryUrl, timeoutMs = TIMEOUT_MS) {
  try {
    let controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs), response = await fetch(memoryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name, arguments: args },
        id: Date.now()
      }),
      signal: controller.signal
    });
    if (clearTimeout(timer), !response.ok)
      return debugLog2(`[mypenny] MCP tool ${name} failed: HTTP ${response.status}`), recordDiag({
        event: "memory_tool",
        outcome: "fail",
        tool: name,
        reason: "http",
        status: response.status
      }), { unauthorized: response.status === 401, value: null };
    let data = await response.json();
    if (data.error)
      return debugLog2(`[mypenny] MCP tool ${name} failed: ${data.error.message}`), recordDiag({
        event: "memory_tool",
        outcome: "fail",
        tool: name,
        reason: "jsonrpc",
        status: data.error.code
      }), { unauthorized: !1, value: null };
    if (data.result?.isError === !0)
      return debugLog2(`[mypenny] MCP tool ${name} returned a tool error`), recordDiag({ event: "memory_tool", outcome: "fail", tool: name, reason: "tool_error" }), { unauthorized: !1, value: null };
    let text = data.result?.content?.find((c) => c.type === "text")?.text;
    return typeof text != "string" || text.length === 0 ? (recordDiag({ event: "memory_tool", outcome: "fail", tool: name, reason: "empty" }), { unauthorized: !1, value: null }) : { unauthorized: !1, value: text };
  } catch (err) {
    let reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
    return debugLog2(
      `[mypenny] MCP tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`
    ), recordDiag({ event: "memory_tool", outcome: "fail", tool: name, reason }), { unauthorized: !1, value: null };
  }
}
async function takeSessionOffRecord(sessionId) {
  let raw = await callTool("penny_edit", { entityType: "session", sessionId, record: "off" });
  if (raw === null) return null;
  try {
    let parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed == "object" ? parsed : null;
  } catch {
    return null;
  }
}

// plugins/mypenny-core/scripts/record.ts
var SAFE_SESSION_ID2 = /^[A-Za-z0-9._-]{1,200}$/;
function fail(message, code = 1) {
  process.stderr.write(`${message}
`), process.exit(code);
}
function usage() {
  fail("Usage: mypenny-record off|status [--session <id>]", 2);
}
function parseArgs(argv) {
  let [command, ...rest] = argv;
  command !== "off" && command !== "status" && usage();
  let session = null;
  for (let i = 0; i < rest.length; i++) {
    let a = rest[i];
    a === "--session" ? session = rest[++i] ?? usage() : a.startsWith("--session=") ? session = a.slice(10) : usage(), session === "" && fail("--session was given an empty id.", 2);
  }
  return { command, session };
}
function resolveSession(explicit) {
  if (explicit !== null)
    return SAFE_SESSION_ID2.test(explicit) || fail(`"${explicit}" isn't a session id.`, 2), !fs7.existsSync(sessionPath(explicit)) && !fs7.existsSync(transcriptCursorPath(explicit)) && fail(`No Penny session ${explicit} on this machine. Check the id (it's in the session's <mypenny-session> line).`), explicit;
  let pick = pickSession(process.cwd());
  if (pick.kind === "one")
    return process.stdout.write(`Session: ${pick.id} (the one active here in the last two hours)
`), pick.id;
  pick.kind === "ambiguous" && fail(
    `More than one session has been active here in the last two hours:
${pick.ids.map((id) => `  ${id}`).join(`
`)}
Taking a session off the record can't be undone, so pick one: --session <id>.`
  ), fail("No Penny session has been active in this directory in the last two hours. Pass --session <id>.");
}
async function main() {
  let { command, session } = parseArgs(process.argv.slice(2)), sessionId = resolveSession(session);
  if (command === "status") {
    process.stdout.write(
      isOffRecord(sessionId) ? `Off the record on this machine: it sends nothing from this session.
` : `This machine has no off-the-record marker for this session, so it is still sending it.
`
    );
    return;
  }
  let localError = null;
  try {
    markOffRecord(sessionId);
  } catch (err) {
    localError = errorDetail(err);
  }
  let local = localError ? `This machine's marker couldn't be written (${localError}), so it may still send this session; the server drops what it sends once the session is off the record.` : `This machine has stopped sending session ${sessionId}.`, result = await takeSessionOffRecord(sessionId);
  result?.offRecord !== !0 && fail(
    `${local} The server didn't confirm, so what it already holds from this session hasn't been dropped. The reason is in ~/.mypenny/logs/hooks.log (signed out, offline, or a server error). Run this again once that's fixed.`
  );
  let confirmed = typeof result.message == "string" ? result.message : "Off the record from now on.";
  localError && fail(`${confirmed}
${local}`), process.stdout.write(`${confirmed}
`);
}
main().catch((err) => {
  fail(`mypenny-record failed: ${errorDetail(err)}`);
});
