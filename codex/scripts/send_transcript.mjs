var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
};

// plugins/mypenny-core/scripts/send_transcript.ts
import * as fs10 from "node:fs";

// plugins/mypenny-core/lib/hook-input.ts
import * as readline from "node:readline";
function readHookInputFrom(stream) {
  return new Promise((resolve2) => {
    let input = "", rl = readline.createInterface({ input: stream }), timer = setTimeout(() => rl.close(), 500);
    rl.on("line", (line) => {
      input += line + `
`;
    }), rl.on("close", () => {
      clearTimeout(timer);
      let trimmed = input.trim();
      if (!trimmed) return resolve2(null);
      try {
        resolve2(JSON.parse(trimmed));
      } catch {
        resolve2(null);
      }
    });
  });
}
function readHookInput() {
  return readHookInputFrom(process.stdin);
}
var ALLOWED_KEYS = /* @__PURE__ */ new Set([
  "session_id",
  "cwd",
  "prompt",
  "transcript_path",
  "stop_hook_active",
  "tool_name"
]);
function normalizeHookInput(input) {
  if (input === null || typeof input != "object" || Array.isArray(input))
    return null;
  let out = {};
  for (let [k, v] of Object.entries(input))
    ALLOWED_KEYS.has(k) && (out[k] = v);
  if (!out.cwd) {
    let roots = input.workspace_roots;
    Array.isArray(roots) && typeof roots[0] == "string" && roots[0] && (out.cwd = roots[0]);
  }
  return out;
}

// plugins/mypenny-core/lib/state.ts
import * as fs from "node:fs";

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

// plugins/mypenny-core/lib/state.ts
var STALE_THRESHOLD_MS = 10080 * 60 * 1e3, OFF_RECORD_THRESHOLD_MS = 2160 * 60 * 60 * 1e3, CLEANUP_INTERVAL_MS = 1440 * 60 * 1e3;
function readState(sessionId) {
  try {
    let data = fs.readFileSync(sessionPath(sessionId), "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// plugins/mypenny-core/lib/auth-store.ts
import * as fs3 from "node:fs";
import * as crypto2 from "node:crypto";

// plugins/mypenny-core/lib/auth-health.ts
import * as fs2 from "node:fs";
import * as crypto from "node:crypto";
var RETRY_PENDING_HORIZON_MS = 720 * 1e3, REJECTED_BACKOFF_MS = 360 * 60 * 1e3, REJECTION_THRESHOLD = 2, REPAIR_EVIDENCE_HORIZON_MS = 1440 * 60 * 1e3;
function debugLog(message) {
  process.env.MYPENNY_DEBUG === "1" && console.error(message);
}
function asTime(value) {
  return typeof value == "number" && Number.isFinite(value) ? value : void 0;
}
function readAuthHealth() {
  try {
    let parsed = JSON.parse(fs2.readFileSync(authHealthPath(), "utf-8"));
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
    fs2.mkdirSync(mypennyDir(), { recursive: !0 });
    let target = authHealthPath(), tmp = `${target}.${crypto.randomUUID()}.tmp`;
    fs2.writeFileSync(tmp, JSON.stringify(health) + `
`, { mode: 384 }), fs2.renameSync(tmp, target);
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
    fs2.unlinkSync(authHealthPath());
  } catch (err) {
    if (err?.code === "ENOENT") return;
    try {
      fs2.writeFileSync(authHealthPath(), `{}
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
  fs3.mkdirSync(mypennyDir(), { recursive: !0 });
}
function atomicWrite(target, contents, mode) {
  ensureDir();
  let tmp = `${target}.${crypto2.randomUUID()}.tmp`;
  fs3.writeFileSync(tmp, contents, { mode }), fs3.renameSync(tmp, target), process.platform !== "win32" && fs3.chmodSync(target, mode);
}
function readToken() {
  let envToken = process.env.MYPENNY_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return fs3.readFileSync(tokenPath(), "utf-8").trim() || null;
  } catch {
    return null;
  }
}
function writeToken(token) {
  atomicWrite(tokenPath(), token.trim(), 384), clearAuthHealth();
}
function readConfig() {
  try {
    let raw = fs3.readFileSync(configPath(), "utf-8");
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
import * as fs4 from "node:fs";
import * as path2 from "node:path";
import * as crypto3 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  let safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim", digest = crypto3.createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${safe}.${digest}`;
}
function prune(dir, stem, currentWindow) {
  try {
    for (let file of fs4.readdirSync(dir)) {
      if (!file.startsWith(`${stem}.`)) continue;
      let w = Number(file.slice(stem.length + 1));
      if (!(!Number.isFinite(w) || w > currentWindow - KEEP_WINDOWS))
        try {
          fs4.unlinkSync(path2.join(dir, file));
        } catch {
        }
    }
  } catch {
  }
}
function claimWindow(name, windowMs, now = Date.now(), failOpen = !0) {
  let dir = claimsDir(), stem = claimStem(name), window = Math.floor(now / windowMs), target = path2.join(dir, `${stem}.${window}`);
  try {
    fs4.mkdirSync(dir, { recursive: !0 });
  } catch {
    return failOpen;
  }
  try {
    fs4.closeSync(fs4.openSync(target, "wx"));
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

// plugins/mypenny-core/lib/diag.ts
import * as fs5 from "node:fs";
import * as path3 from "node:path";
var MAX_BYTES = 256 * 1024, diagContext = {};
function setDiagContext(context) {
  diagContext = { ...diagContext, ...context };
}
function diagEnabled() {
  return !(process.env.MYPENNY_SUBCONSCIOUS === "off" || process.env.MYPENNY_DIAG?.trim().toLowerCase() === "off");
}
function rotateIfNeeded(file) {
  try {
    fs5.statSync(file).size >= MAX_BYTES && fs5.renameSync(file, `${file}.1`);
  } catch {
  }
}
function recordDiag(record) {
  if (diagEnabled())
    try {
      let file = diagLogPath();
      fs5.mkdirSync(path3.dirname(file), { recursive: !0 }), rotateIfNeeded(file);
      let line = JSON.stringify({ at: Date.now(), ...diagContext, ...record }) + `
`;
      fs5.appendFileSync(file, line);
    } catch {
    }
}

// plugins/mypenny-core/lib/off-record.ts
import * as fs7 from "node:fs";
import * as path5 from "node:path";
import * as crypto5 from "node:crypto";

// plugins/mypenny-core/lib/posture.ts
var SILENT = Object.freeze({ kind: "silent" });
function errorDetail(err) {
  let name = err instanceof Error ? err.name : typeof err, code = err?.code;
  return typeof code == "string" ? `${name}:${code}` : name;
}

// plugins/mypenny-core/lib/transcript-cursor.ts
import * as fs6 from "node:fs";
import * as path4 from "node:path";
import * as crypto4 from "node:crypto";

// plugins/mypenny-core/lib/transcript-source-clock.ts
function foldSourceClock(clock, raw) {
  if (clock === 0) return 0;
  try {
    let line = JSON.parse(raw), role = line.type || line.role || line.message?.role;
    if (role !== "user" && role !== "assistant") return clock;
    let timestamp = typeof line.timestamp == "number" ? line.timestamp : typeof line.timestamp == "string" ? Date.parse(line.timestamp) : NaN;
    return !Number.isFinite(timestamp) || timestamp <= 0 ? 0 : clock === void 0 ? timestamp : Math.min(clock, timestamp);
  } catch {
    return 0;
  }
}

// plugins/mypenny-core/lib/transcript-cursor.ts
var ANCHOR_BYTES = 256;
function transcriptCursorPath(sessionId) {
  return path4.join(sessionsDir(), `${sessionId}.transcript.json`);
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
    raw = fs6.readFileSync(transcriptCursorPath(sessionId), "utf-8");
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
function writeCursors(sessionId, cursors) {
  fs6.mkdirSync(sessionsDir(), { recursive: !0 });
  let target = transcriptCursorPath(sessionId), tmp = `${target}.${crypto4.randomUUID()}.tmp`;
  try {
    fs6.writeFileSync(tmp, JSON.stringify(cursors)), fs6.renameSync(tmp, target);
  } catch (err) {
    try {
      fs6.unlinkSync(tmp);
    } catch {
    }
    throw err;
  }
}
function cursorAt(file, offset, last = {}) {
  return {
    offset,
    anchor: anchorAt(file, offset),
    ...last.lastUuid !== void 0 ? { lastUuid: last.lastUuid } : {},
    ...last.lastTimestamp !== void 0 ? { lastTimestamp: last.lastTimestamp } : {},
    ...last.sourceClock !== void 0 ? { sourceClock: last.sourceClock } : {}
  };
}
function readRange(fd, start, end) {
  let length = Math.max(0, end - start), buf = Buffer.alloc(length), read = 0;
  for (; read < length; ) {
    let n = fs6.readSync(fd, buf, read, length - read, start + read);
    if (n === 0) break;
    read += n;
  }
  return read === length ? buf : buf.subarray(0, read);
}
function hashAnchor(bytes) {
  return crypto4.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}
function anchorFromFd(fd, offset) {
  return hashAnchor(readRange(fd, Math.max(0, offset - ANCHOR_BYTES), offset));
}
function anchorAt(file, offset) {
  let fd = fs6.openSync(file, "r");
  try {
    return anchorFromFd(fd, offset);
  } finally {
    fs6.closeSync(fd);
  }
}
function linesIn(fd, start, end) {
  let buf = readRange(fd, start, end), lastNewline = buf.lastIndexOf(10), lines = [];
  if (lastNewline < 0) return { lines, consumedTo: start, bytesRead: buf.length };
  let lineStart = 0;
  for (; lineStart <= lastNewline; ) {
    let nl = buf.indexOf(10, lineStart), text = buf.subarray(lineStart, nl).toString("utf-8");
    text.trim() && lines.push({ text, endOffset: start + nl + 1 }), lineStart = nl + 1;
  }
  return { lines, consumedTo: start + lastNewline + 1, bytesRead: buf.length };
}
function rowField(text, field) {
  try {
    return JSON.parse(text)[field];
  } catch {
    return;
  }
}
function readNewLines(file, cursor) {
  let fd = fs6.openSync(file, "r");
  try {
    let size = fs6.fstatSync(fd).size;
    if (!cursor) return { ...linesIn(fd, 0, size), mode: "fresh" };
    let anchorBytes = Math.min(ANCHOR_BYTES, cursor.offset);
    if (cursor.offset <= size && anchorFromFd(fd, cursor.offset) === cursor.anchor) {
      let r = linesIn(fd, cursor.offset, size);
      return { ...r, bytesRead: r.bytesRead + anchorBytes, mode: "resume" };
    }
    let all = linesIn(fd, 0, size), lines = all.lines, at = cursor.lastUuid ? all.lines.findIndex(
      (l) => l.text.includes(cursor.lastUuid) && rowField(l.text, "uuid") === cursor.lastUuid
    ) : -1;
    if (at >= 0)
      lines = all.lines.slice(at + 1);
    else if (cursor.lastTimestamp !== void 0) {
      let since = cursor.lastTimestamp;
      lines = all.lines.filter((l) => {
        let t = Date.parse(String(rowField(l.text, "timestamp") ?? ""));
        return !Number.isFinite(t) || t >= since;
      });
    }
    return { lines, consumedTo: all.consumedTo, bytesRead: all.bytesRead + anchorBytes, mode: "recovered" };
  } finally {
    fs6.closeSync(fd);
  }
}
function migrateLineCursor(file, count) {
  let fd = fs6.openSync(file, "r"), offset = 0, last = {};
  try {
    let { lines, consumedTo } = linesIn(fd, 0, fs6.fstatSync(fd).size), migrated = count <= 0 ? [] : lines.slice(0, count);
    offset = count <= 0 ? 0 : count <= lines.length ? lines[count - 1].endOffset : consumedTo;
    let clock;
    for (let line of migrated) {
      let uuid = rowField(line.text, "uuid"), ts = Date.parse(String(rowField(line.text, "timestamp") ?? ""));
      typeof uuid == "string" && (last.lastUuid = uuid), Number.isFinite(ts) && (last.lastTimestamp = ts), clock = foldSourceClock(clock, line.text);
    }
    last.sourceClock = clock ?? null;
  } finally {
    fs6.closeSync(fd);
  }
  return cursorAt(file, offset, last);
}

// plugins/mypenny-core/lib/off-record.ts
var SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/;
function safeId(sessionId) {
  return typeof sessionId == "string" && SAFE_SESSION_ID.test(sessionId);
}
function offRecordPath(sessionId) {
  return path5.join(sessionsDir(), `${sessionId}.offrecord.json`);
}
function isOffRecord(sessionId) {
  return safeId(sessionId) && fs7.existsSync(offRecordPath(sessionId));
}
function readMarker(file) {
  try {
    let parsed = JSON.parse(fs7.readFileSync(file, "utf-8"));
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
  fs7.mkdirSync(sessionsDir(), { recursive: !0 });
  let tmp = `${target}.${crypto5.randomUUID()}.tmp`;
  try {
    fs7.writeFileSync(tmp, JSON.stringify(marker), { mode: 384 }), fs7.renameSync(tmp, target);
  } catch (err) {
    try {
      fs7.rmSync(tmp, { force: !0 });
    } catch {
    }
    throw err;
  }
  return !0;
}
function touchOffRecord(sessionId, now = Date.now()) {
  if (safeId(sessionId))
    try {
      fs7.utimesSync(offRecordPath(sessionId), new Date(now), new Date(now));
    } catch {
    }
}
var TAIL_BYTES = 256 * 1024;
function lastRowUuid(transcriptPath) {
  let tail;
  try {
    let fd = fs7.openSync(transcriptPath, "r");
    try {
      let size = fs7.fstatSync(fd).size, len = Math.min(size, TAIL_BYTES), buf = Buffer.alloc(len), n = fs7.readSync(fd, buf, 0, len, size - len);
      tail = buf.subarray(0, n).toString("utf-8");
    } finally {
      fs7.closeSync(fd);
    }
  } catch {
    return null;
  }
  let lines = tail.split(`
`);
  for (let i = lines.length - 1; i >= 0; i--)
    try {
      let uuid = JSON.parse(lines[i]).uuid;
      if (typeof uuid == "string" && uuid.length > 0) return uuid;
    } catch {
    }
  let keys = [...tail.matchAll(/"uuid":"([^"\\]{1,200})"/g)];
  return keys.length > 0 ? keys[keys.length - 1][1] : null;
}
function noteAnchorRow(sessionId, transcriptPath) {
  if (!isOffRecord(sessionId) || readMarker(offRecordPath(sessionId))?.anchorUuid) return;
  let uuid = lastRowUuid(transcriptPath);
  uuid && markOffRecord(sessionId, Date.now(), uuid);
}
function inheritOffRecord(sessionId, transcriptPath) {
  if (!safeId(sessionId)) return "on";
  if (isOffRecord(sessionId)) return "off";
  if (fs7.existsSync(transcriptCursorPath(sessionId))) return "on";
  let names;
  try {
    names = fs7.readdirSync(sessionsDir()).filter((n) => n.endsWith(".offrecord.json"));
  } catch {
    return "on";
  }
  let anchors = names.map((n) => readMarker(path5.join(sessionsDir(), n))?.anchorUuid).filter((a) => typeof a == "string" && a.length > 0);
  if (anchors.length === 0) return "on";
  let text;
  try {
    text = fs7.readFileSync(transcriptPath, "utf-8");
  } catch {
    return "on";
  }
  return anchors.some((a) => text.includes(`"${a}"`)) ? (markOffRecord(sessionId, Date.now()), "inherited") : "on";
}
var LIVE_WINDOW_MS = 7200 * 1e3;

// plugins/mypenny-core/lib/transcript-client.ts
async function readAck(response) {
  if (typeof response.json != "function") return { offRecord: !1, duplicate: !1 };
  try {
    let body = await response.json();
    return { offRecord: body?.offRecord === !0, duplicate: body?.duplicate === !0 };
  } catch {
    return { offRecord: !1, duplicate: !1 };
  }
}
var TIMEOUT_MS = 3e4;
function debugEnabled() {
  let value = process.env.MYPENNY_DEBUG?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
function debugLog2(message) {
  debugEnabled() && console.error(message);
}
async function sendTranscript(sessionId, projectKey, messages, metadata = {}) {
  if (messages.length === 0) return !0;
  if (isOffRecord(sessionId))
    return touchOffRecord(sessionId), recordDiag({ event: "transcript_ingest", outcome: "skip", hook: "stop", sessionId, reason: "off_record_local", count: messages.length }), !0;
  let token = readToken(), cfg = readConfig();
  return !token || !cfg ? (recordDiag({
    event: "transcript_ingest",
    outcome: "skip",
    hook: "stop",
    sessionId,
    reason: token ? "no_config" : "no_auth"
  }), !1) : withTokenRotation(
    (bearer) => ingestOnce(bearer, cfg.ingestUrl, sessionId, projectKey, messages, metadata),
    token
  );
}
async function ingestOnce(token, ingestUrl, sessionId, projectKey, messages, metadata) {
  try {
    let controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT_MS), response = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        sessionId,
        projectKey,
        messages,
        ...metadata.sourceStartedAt === void 0 ? {} : { sourceStartedAt: metadata.sourceStartedAt },
        ...metadata.legacyProjectKey === void 0 ? {} : { legacyProjectKey: metadata.legacyProjectKey },
        ...metadata.batchId === void 0 ? {} : { batchId: metadata.batchId }
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {
        detail = "";
      }
      return clearTimeout(timer), debugLog2(
        `[mypenny] transcript ingest failed: HTTP ${response.status}${detail ? ` ${detail}` : ""}`
      ), recordDiag({
        event: "transcript_ingest",
        outcome: "fail",
        hook: "stop",
        sessionId,
        reason: "http",
        status: response.status,
        count: messages.length
      }), { unauthorized: response.status === 401, value: !1 };
    }
    let { offRecord, duplicate } = await readAck(response);
    if (clearTimeout(timer), offRecord) {
      try {
        markOffRecord(sessionId), recordDiag({ event: "transcript_ingest", outcome: "skip", hook: "stop", sessionId, reason: "off_record", count: messages.length });
      } catch (err) {
        recordDiag({ event: "off_record", outcome: "fail", hook: "stop", sessionId, reason: "marker_write", detail: errorDetail(err) });
      }
      return { unauthorized: !1, value: !0 };
    }
    return recordDiag({
      event: "transcript_ingest",
      outcome: "ok",
      hook: "stop",
      sessionId,
      // The server had already stored this batch (a lost response, retried):
      // nothing was added. Visible so a stuck-resend loop shows up.
      ...duplicate ? { reason: "duplicate" } : {},
      count: messages.length
    }), { unauthorized: !1, value: !0 };
  } catch (err) {
    let reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
    return debugLog2(
      `[mypenny] transcript ingest failed: ${err instanceof Error ? err.message : String(err)}`
    ), recordDiag({
      event: "transcript_ingest",
      outcome: "fail",
      hook: "stop",
      sessionId,
      reason,
      count: messages.length
    }), { unauthorized: !1, value: !1 };
  }
}

// plugins/mypenny-core/lib/project-key.ts
var project_key_exports = {};
__export(project_key_exports, {
  deriveLegacyProjectKey: () => deriveLegacyProjectKey,
  deriveProjectKey: () => deriveProjectKey,
  deriveProjectKeys: () => deriveProjectKeys
});
import * as crypto6 from "node:crypto";
import * as fs8 from "node:fs";
import * as path6 from "node:path";
function deriveProjectKey(cwd) {
  return deriveProjectKeys(cwd).projectKey;
}
function deriveLegacyProjectKey(cwd) {
  let identity = deriveIdentity(cwd);
  return identity.hostAndPath ? sanitizeKey(identity.path) : identity.key;
}
var READABLE_KEY_MAX = 200;
function deriveProjectKeys(cwd) {
  let identity = deriveIdentity(cwd);
  if (!identity.hostAndPath) return { projectKey: identity.key };
  let readable = sanitizeKey(identity.path), capped = readable.length > READABLE_KEY_MAX ? readable.slice(0, READABLE_KEY_MAX).replace(/-+$/, "") : readable, projectKey = `${capped}-${repositoryHash(identity.path)}`;
  return capped === readable && readable !== "unknown" ? { projectKey, legacyProjectKey: readable } : { projectKey };
}
function deriveIdentity(cwd) {
  try {
    let gitRoot = findGitRoot(cwd);
    if (gitRoot) {
      let configPath2 = resolveGitConfigPath(gitRoot);
      if (configPath2 && fs8.existsSync(configPath2)) {
        let url = parseOriginUrl(fs8.readFileSync(configPath2, "utf-8"));
        if (url) {
          let repo = extractRepoPath(url);
          if (repo?.hostAndPath) return { hostAndPath: !0, path: repo.path };
          if (repo) return { hostAndPath: !1, key: sanitizeKey(repo.path) };
        }
      }
      return { hostAndPath: !1, key: sanitizeKey(path6.basename(gitRoot)) };
    }
  } catch {
  }
  return { hostAndPath: !1, key: sanitizeKey(path6.basename(cwd)) };
}
function findGitRoot(start) {
  let dir = start;
  for (let i = 0; i < 32; i++) {
    let gitPath = path6.join(dir, ".git");
    if (fs8.existsSync(gitPath)) return dir;
    let parent = path6.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function resolveGitConfigPath(gitRoot) {
  let gitPath = path6.join(gitRoot, ".git");
  try {
    let stat = fs8.statSync(gitPath);
    if (stat.isDirectory())
      return path6.join(gitPath, "config");
    if (stat.isFile()) {
      let match = fs8.readFileSync(gitPath, "utf-8").match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      let gitdir = path6.resolve(gitRoot, match[1].trim()), commondirPath = path6.join(gitdir, "commondir");
      if (fs8.existsSync(commondirPath)) {
        let commondir = path6.resolve(
          gitdir,
          fs8.readFileSync(commondirPath, "utf-8").trim()
        );
        return path6.join(commondir, "config");
      }
      return path6.join(gitdir, "config");
    }
  } catch {
    return null;
  }
  return null;
}
function parseOriginUrl(configText) {
  let lines = configText.split(`
`), inOrigin = !1;
  for (let line of lines) {
    let trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inOrigin = trimmed === '[remote "origin"]';
      continue;
    }
    if (!inOrigin) continue;
    let urlMatch = trimmed.match(/^url\s*=\s*(.+)$/);
    if (urlMatch) return urlMatch[1];
  }
  return null;
}
function extractRepoPath(url) {
  let cleaned = url.trim().replace(/[/\\]+$/, "");
  if (!cleaned) return null;
  if (/^[a-z]:[\\/]/i.test(cleaned)) return basenameOf(cleaned);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned))
    try {
      let parsed = new URL(cleaned), host = parsed.hostname;
      if (!host) return basenameOf(parsed.pathname);
      let repoPath = normalizeRepoPath(parsed.pathname, !0);
      return repoPath ? { path: `${host}/${repoPath}`, hostAndPath: !0 } : { path: host, hostAndPath: !1 };
    } catch {
      return null;
    }
  let scp = cleaned.match(/^(?:[^@\s/]+@)?([^:/\s]+):(.+)$/);
  if (scp) {
    let repoPath = normalizeRepoPath(scp[2], !1);
    return repoPath ? { path: `${scp[1]}/${repoPath}`, hostAndPath: !0 } : null;
  }
  return basenameOf(cleaned);
}
function normalizeRepoPath(raw, percentEncoded) {
  let segments = [];
  for (let part of raw.split("/")) {
    let segment = part;
    if (percentEncoded)
      try {
        segment = decodeURIComponent(segment);
      } catch {
      }
    if (segment = segment.normalize("NFC"), !(segment === "" || segment === ".")) {
      if (segment === "..") {
        segments.pop();
        continue;
      }
      segments.push(segment);
    }
  }
  if (segments.length > 0 && segments[segments.length - 1].toLowerCase() === ".git" && segments.pop(), segments.length > 0) {
    let last = segments.length - 1;
    segments[last] = segments[last].replace(/\.git$/i, ""), segments[last] === "" && segments.pop();
  }
  return segments.join("/");
}
function repositoryHash(hostAndPath) {
  return crypto6.createHash("sha256").update(hostAndPath.toLowerCase()).digest("hex").slice(0, 8);
}
function basenameOf(location) {
  let name = extractRepoName(location);
  return name ? { path: name, hostAndPath: !1 } : null;
}
function extractRepoName(url) {
  return url.trim().replace(/[/\\]+$/, "").replace(/\.git$/i, "").split(/[/:\\]/).pop() || null;
}
function sanitizeKey(raw) {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

// plugins/mypenny-core/lib/guidance-cache.ts
import * as crypto7 from "node:crypto";
var GUIDANCE_TTL_MS = 600 * 1e3;
function tokenTag(token) {
  return crypto7.createHash("sha256").update(token).digest("hex").slice(0, 16);
}

// plugins/mypenny-core/lib/memory-client.ts
var TIMEOUT_MS2 = 6e3;
function debugEnabled2() {
  let value = process.env.MYPENNY_DEBUG?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
function debugLog3(message) {
  debugEnabled2() && console.error(message);
}
async function callTool(name, args, timeoutMs = TIMEOUT_MS2, onCredential) {
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
async function callToolOnce(name, args, token, memoryUrl, timeoutMs = TIMEOUT_MS2) {
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
      return debugLog3(`[mypenny] MCP tool ${name} failed: HTTP ${response.status}`), recordDiag({
        event: "memory_tool",
        outcome: "fail",
        tool: name,
        reason: "http",
        status: response.status
      }), { unauthorized: response.status === 401, value: null };
    let data = await response.json();
    if (data.error)
      return debugLog3(`[mypenny] MCP tool ${name} failed: ${data.error.message}`), recordDiag({
        event: "memory_tool",
        outcome: "fail",
        tool: name,
        reason: "jsonrpc",
        status: data.error.code
      }), { unauthorized: !1, value: null };
    if (data.result?.isError === !0)
      return debugLog3(`[mypenny] MCP tool ${name} returned a tool error`), recordDiag({ event: "memory_tool", outcome: "fail", tool: name, reason: "tool_error" }), { unauthorized: !1, value: null };
    let text = data.result?.content?.find((c) => c.type === "text")?.text;
    return typeof text != "string" || text.length === 0 ? (recordDiag({ event: "memory_tool", outcome: "fail", tool: name, reason: "empty" }), { unauthorized: !1, value: null }) : { unauthorized: !1, value: text };
  } catch (err) {
    let reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
    return debugLog3(
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

// plugins/mypenny-core/lib/transcript-ship.ts
import * as fs9 from "node:fs";
import * as path7 from "node:path";
import * as crypto8 from "node:crypto";

// plugins/mypenny-core/lib/scrub.ts
var PATTERNS = [
  { name: "anthropic_key", regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "openai_key", regex: /sk-[A-Za-z0-9]{20,}/g },
  { name: "perplexity_key", regex: /pplx-[A-Za-z0-9]{20,}/g },
  { name: "bearer_token", regex: /Bearer\s+[A-Za-z0-9._\-]{20,}/g },
  { name: "convex_admin_key", regex: /convex-self-hosted\|[A-Za-z0-9]+/g },
  {
    name: "generic_api_key",
    regex: /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}["']?/gi
  },
  {
    name: "jwt_token",
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
  },
  {
    name: "password_field",
    regex: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{4,}["']/gi
  },
  {
    name: "private_key",
    regex: /-----BEGIN (?:ENCRYPTED |RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:ENCRYPTED |RSA |EC |DSA )?PRIVATE KEY-----/g
  },
  { name: "github_token", regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
  // The formats below match the engine's scrubber
  // (apps/cloud/convex/components/memory-core/_shared/safetyPatterns.ts).
  // Tool output (an env dump, a config file) ships with transcripts, so the
  // plugin has to catch them before anything leaves the machine.
  { name: "github_fine_grained_token", regex: /github_pat_[A-Za-z0-9_]{22,}/g },
  // `sk-` above needs 20 letters or digits straight after the prefix, which
  // the hyphen in these two prefixes breaks.
  { name: "openai_project_key", regex: /sk-proj-[A-Za-z0-9_-]{20,}/g },
  { name: "openrouter_key", regex: /sk-or-[A-Za-z0-9_-]{20,}/g },
  { name: "aws_access_key_id", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    name: "aws_secret_access_key",
    regex: /(?:aws_secret_access_key|secret_access_key)\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}["']?/gi
  },
  { name: "slack_token", regex: /xox[bpsar]-[0-9]+-[A-Za-z0-9-]+/g },
  {
    name: "connection_string",
    regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"'`]+/gi
  },
  { name: "plane_api_key", regex: /plane_api_[A-Za-z0-9]{20,}/g },
  {
    name: "convex_deploy_key",
    regex: /(?:prod|dev|preview):[A-Za-z0-9_-]+\|[A-Za-z0-9+/=_-]{20,}/g
  },
  {
    name: "openssh_private_key",
    regex: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g
  },
  {
    name: "mypenny_plugin_token",
    regex: /mpt_[A-Za-z0-9_-]{40,}/g
  }
];
function scrubCredentials(text) {
  let scrubbed = text;
  for (let { regex } of PATTERNS)
    scrubbed = scrubbed.replace(regex, "[REDACTED]");
  return scrubbed;
}

// plugins/mypenny-core/lib/transcript-extract.ts
var TEXT_MAX_CHARS = 32e3, META_TEXT_MAX_CHARS = 2e3, TOOL_USE_EXCERPT_MAX = 300, TOOL_RESULT_HEAD_CHARS = 500, TOOL_RESULT_TAIL_CHARS = 1500, TEXT_TAIL_CHARS = 4e3, ROW_ID = /^[A-Za-z0-9_-]{1,128}$/, MAX_ROW_PART = 1e3;
function isRowId(value) {
  return typeof value == "string" && ROW_ID.test(value);
}
function rowTimestamp(raw) {
  if (typeof raw != "string") return;
  let parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : void 0;
}
function truncateHead(text, max) {
  return text.length <= max ? text : text.slice(0, max) + "... [truncated]";
}
function keepHeadAndTail(text, head, tail) {
  if (text.length <= head + tail) return text;
  let elided = text.length - head - tail;
  return `${text.slice(0, head)}
... [${elided} chars elided] ...
${text.slice(text.length - tail)}`;
}
function safeStringify(value) {
  try {
    let s = JSON.stringify(value);
    return s === void 0 ? String(value) : s;
  } catch {
    return String(value);
  }
}
function toolResultText(content) {
  return typeof content == "string" ? content : Array.isArray(content) ? content.filter((c) => c && c.type === "text" && typeof c.text == "string").map((c) => c.text).join(`
`) : "";
}
function sizeText(text, isMeta) {
  let scrubbed = scrubCredentials(text);
  return isMeta ? truncateHead(scrubbed, META_TEXT_MAX_CHARS) : keepHeadAndTail(scrubbed, TEXT_MAX_CHARS - TEXT_TAIL_CHARS, TEXT_TAIL_CHARS);
}
function extractMessages(line, opts = {}) {
  let role = line.type || line.role || line.message?.role;
  if (role !== "user" && role !== "assistant") return [];
  let timestamp = rowTimestamp(line.timestamp) ?? opts.fallbackTimestamp ?? Date.now(), includeTools = opts.includeToolBlocks ?? !0, isMeta = line.isMeta === !0, uuid = isRowId(line.uuid) ? line.uuid : void 0, agentId = isRowId(opts.agentId) ? opts.agentId : void 0, messages = [], push = (msgRole, content2) => {
    let part = messages.length;
    messages.push({
      role: msgRole,
      content: content2,
      timestamp,
      ...uuid !== void 0 && part <= MAX_ROW_PART ? { uuid, part } : {},
      ...agentId !== void 0 ? { agentId } : {}
    });
  }, content = line.message?.content;
  if (typeof content == "string")
    return content.trim().length > 0 && push(role, sizeText(content, isMeta)), messages;
  if (!Array.isArray(content)) return messages;
  let blocks = content.filter(
    (c) => c !== null && typeof c == "object"
  ), textParts = blocks.filter((c) => c.type === "text" && typeof c.text == "string" && c.text).map((c) => c.text);
  if (textParts.length > 0) {
    let joined = textParts.join(`
`);
    joined.trim().length > 0 && push(role, sizeText(joined, isMeta));
  }
  if (!includeTools) return messages;
  for (let block of blocks)
    if (block.type === "tool_use") {
      let name = block.name ?? "unknown", scrubbed = scrubCredentials(safeStringify(block.input));
      push("tool", `[tool_use ${name}] ${truncateHead(scrubbed, TOOL_USE_EXCERPT_MAX)}`);
    } else if (block.type === "tool_result") {
      let text = toolResultText(block.content);
      if (text.trim().length === 0) continue;
      let scrubbed = scrubCredentials(text), excerpt = keepHeadAndTail(scrubbed, TOOL_RESULT_HEAD_CHARS, TOOL_RESULT_TAIL_CHARS);
      push("tool", `[tool_result${block.is_error === !0 ? " error" : ""}] ${excerpt}`);
    }
  return messages;
}

// plugins/mypenny-core/lib/transcript-ship.ts
var MAX_BATCH_BYTES = 4e5, ENVELOPE_BYTES = 400, SUBAGENT_TOOL_BLOCKS = !1, MAIN_KEY = "main", AGENT_FILE = /^agent-(.+)\.jsonl$/;
function errCode(err) {
  return err?.code ?? (err instanceof Error ? err.name : typeof err);
}
function transcriptSources(transcriptPath) {
  let sources = [{ key: MAIN_KEY, file: transcriptPath, includeToolBlocks: !0 }], dir = path7.join(
    path7.dirname(transcriptPath),
    path7.basename(transcriptPath, ".jsonl"),
    "subagents"
  ), names = [];
  try {
    names = fs9.readdirSync(dir).filter((n) => AGENT_FILE.test(n)).sort();
  } catch (err) {
    let code = errCode(err);
    code !== "ENOENT" && code !== "ENOTDIR" && recordDiag({ event: "transcript_source", outcome: "fail", reason: "list_error", detail: code });
  }
  for (let name of names)
    sources.push({
      key: `subagents/${name}`,
      file: path7.join(dir, name),
      agentId: AGENT_FILE.exec(name)[1],
      includeToolBlocks: SUBAGENT_TOOL_BLOCKS
    });
  return sources;
}
function toWire(m) {
  return {
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    ...m.uuid !== void 0 ? { uuid: m.uuid, part: m.part } : {},
    ...m.agentId !== void 0 ? { agentId: m.agentId } : {}
  };
}
function storedBytes(m) {
  return Math.ceil(Buffer.byteLength(JSON.stringify(m), "utf-8") * 4 / 3) + ENVELOPE_BYTES;
}
function entriesFor(source, sourceIndex, lastTimestamp, lines) {
  let entries = [], malformed = 0, lastTs = lastTimestamp;
  for (let line of lines) {
    let row = null, messages = [], rowTs;
    try {
      row = JSON.parse(line.text), rowTs = rowTimestamp(row?.timestamp), rowTs !== void 0 && (lastTs = rowTs);
      let agentId = source.agentId === void 0 ? void 0 : typeof row?.agentId == "string" ? row.agentId : source.agentId;
      messages = extractMessages(row ?? {}, {
        agentId,
        includeToolBlocks: source.includeToolBlocks,
        fallbackTimestamp: lastTs
      }).map(toWire);
    } catch {
      malformed++, row = null, messages = [];
    }
    entries.push({
      source: sourceIndex,
      endOffset: line.endOffset,
      sortTs: lastTs ?? 0,
      uuid: typeof row?.uuid == "string" ? row.uuid : void 0,
      rowTs,
      messages,
      bytes: messages.reduce((n, m) => n + storedBytes(m), 0)
    });
  }
  return { entries, malformed };
}
function mergeByTime(perSource) {
  let merged = [], next = perSource.map(() => 0);
  for (; ; ) {
    let pick = -1;
    for (let s = 0; s < perSource.length; s++) {
      let e = perSource[s][next[s]];
      e && (pick < 0 || e.sortTs < perSource[pick][next[pick]].sortTs) && (pick = s);
    }
    if (pick < 0) return merged;
    merged.push(perSource[pick][next[pick]++]);
  }
}
function batchesOf(entries, maxBytes) {
  let batches = [], current = [], bytes = 0;
  for (let e of entries)
    e.bytes > 0 && bytes > 0 && bytes + e.bytes > maxBytes && (batches.push(current), current = [], bytes = 0), current.push(e), bytes += e.bytes;
  return current.length > 0 && batches.push(current), batches;
}
var messagesOf = (entries) => entries.flatMap((e) => e.messages);
function digestOf(messages) {
  return crypto8.createHash("sha256").update(JSON.stringify(messages)).digest("hex").slice(0, 32);
}
function endsOf(entries, sources) {
  let ends = {};
  for (let e of entries) ends[sources[e.source].key] = e.endOffset;
  return ends;
}
function pendingPrefix(merged, sources, pending) {
  let prefix = [];
  for (let e of merged) {
    let limit = pending.ends[sources[e.source].key];
    if (limit === void 0 || e.endOffset > limit) break;
    prefix.push(e);
  }
  let ends = endsOf(prefix, sources), keys = Object.keys(pending.ends);
  return keys.length !== Object.keys(ends).length || keys.some((k) => ends[k] !== pending.ends[k]) ? null : digestOf(messagesOf(prefix)) === pending.digest ? prefix : null;
}
async function shipTranscript(opts) {
  let sources = transcriptSources(opts.transcriptPath), cursors = readCursors(opts.sessionId), dirty = !1;
  !cursors.files[MAIN_KEY] && (opts.legacyLastSentLine ?? 0) > 0 && (cursors.files[MAIN_KEY] = migrateLineCursor(opts.transcriptPath, opts.legacyLastSentLine), recordDiag({ event: "transcript_cursor", outcome: "ok", reason: "migrated", detail: MAIN_KEY }), dirty = !0);
  let bytesRead = 0, malformed = 0, mainClock, reads = [], perSource = [];
  for (let [i, source] of sources.entries()) {
    let cursor = cursors.files[source.key], read;
    try {
      if (read = readNewLines(source.file, cursor), source.key === MAIN_KEY) {
        let prior = cursor === void 0 ? void 0 : cursor.sourceClock === void 0 ? 0 : cursor.sourceClock ?? void 0;
        mainClock = read.lines.reduce((clock, l) => foldSourceClock(clock, l.text), prior);
      }
    } catch (err) {
      if (source.key === MAIN_KEY) throw err;
      recordDiag({ event: "transcript_source", outcome: "fail", reason: "read_error", detail: errCode(err) }), reads.push(null), perSource.push([]);
      continue;
    }
    read.mode === "recovered" && recordDiag({
      event: "transcript_cursor",
      outcome: "ok",
      reason: "recovered",
      detail: source.key === MAIN_KEY ? "main" : "subagent",
      count: read.lines.length
    }), bytesRead += read.bytesRead, reads.push(read);
    let { entries, malformed: bad } = entriesFor(source, i, cursor?.lastTimestamp, read.lines);
    malformed += bad, perSource.push(entries);
  }
  malformed > 0 && recordDiag({ event: "transcript_rows", outcome: "skip", reason: "malformed", count: malformed });
  let meta = { sourceStartedAt: mainClock ?? 0 }, clockFor = (s) => sources[s].key === MAIN_KEY ? { sourceClock: mainClock ?? null } : {}, advance = (batch) => {
    let last = /* @__PURE__ */ new Map();
    for (let e of batch) {
      let prev = last.get(e.source) ?? cursors.files[sources[e.source].key];
      last.set(e.source, {
        offset: e.endOffset,
        lastUuid: e.uuid ?? prev?.lastUuid,
        lastTimestamp: e.rowTs ?? prev?.lastTimestamp,
        ...clockFor(e.source)
      });
    }
    for (let [s, c] of last)
      cursors.files[sources[s].key] = cursorAt(sources[s].file, c.offset, c);
    last.size > 0 && (dirty = !0);
  }, merged = mergeByTime(perSource), maxBytes = opts.maxBatchBytes ?? MAX_BATCH_BYTES, newBatchId = opts.newBatchId ?? (() => crypto8.randomUUID()), reused = cursors.pending ? pendingPrefix(merged, sources, cursors.pending) : null, reusedId = reused ? cursors.pending.batchId : void 0;
  cursors.pending && !reused && (delete cursors.pending, dirty = !0);
  let batches = reused ? [reused, ...batchesOf(merged.slice(reused.length), maxBytes)] : batchesOf(merged, maxBytes), messagesSent = 0, batchesSent = 0;
  for (let [b, batch] of batches.entries()) {
    let messages = messagesOf(batch);
    if (messages.length > 0) {
      let batchId = b === 0 && reusedId !== void 0 ? reusedId : newBatchId();
      if (cursors.pending = { batchId, ends: endsOf(batch, sources), digest: digestOf(messages) }, writeCursors(opts.sessionId, cursors), dirty = !1, !await opts.send(messages, { ...meta, batchId })) {
        let messagesPending = batches.slice(b).reduce((n, rest) => n + messagesOf(rest).length, 0);
        return { ok: !1, messagesSent, batchesSent, messagesPending, bytesRead };
      }
    }
    messages.length > 0 && (messagesSent += messages.length, batchesSent++), advance(batch), delete cursors.pending, writeCursors(opts.sessionId, cursors), dirty = !1;
  }
  for (let [i, source] of sources.entries()) {
    let read = reads[i];
    if (!read) continue;
    let c = cursors.files[source.key];
    (read.consumedTo > (c?.offset ?? 0) || read.mode === "recovered" && read.consumedTo !== c?.offset) && (cursors.files[source.key] = cursorAt(source.file, read.consumedTo, { ...c, ...clockFor(i) }), dirty = !0);
  }
  return dirty && writeCursors(opts.sessionId, cursors), { ok: !0, messagesSent, batchesSent, messagesPending: 0, bytesRead };
}

// plugins/mypenny-core/lib/watchdog.ts
function armWatchdog(budgetMs, exitCode = 0) {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) return () => {
  };
  let timer = setTimeout(() => {
    recordDiag({ event: "watchdog", outcome: "fail", reason: "timeout" }), process.exit(exitCode);
  }, budgetMs);
  return timer.unref?.(), () => clearTimeout(timer);
}

// plugins/mypenny-core/scripts/send_transcript.ts
var DEBUG = process.env.MYPENNY_DEBUG === "1", WATCHDOG_MS = 11e4, debug = (...args) => {
  DEBUG && console.error("[mypenny:send]", ...args);
};
async function main() {
  if (process.env.MYPENNY_SUBCONSCIOUS === "off" || !readToken()) return;
  let disarm = armWatchdog(WATCHDOG_MS, 1), raw = await readHookInput(), hookInput = normalizeHookInput(raw);
  if (!hookInput || (setDiagContext({ hook: "stop", sessionId: hookInput.session_id }), hookInput.stop_hook_active)) return;
  if (!hookInput.transcript_path || !fs10.existsSync(hookInput.transcript_path)) {
    debug("no transcript file"), recordDiag({ event: "transcript_ingest", outcome: "skip", reason: "no_transcript" });
    return;
  }
  let keyDerivers = project_key_exports, { projectKey, legacyProjectKey } = keyDerivers.deriveProjectKeys?.(hookInput.cwd) ?? { projectKey: keyDerivers.deriveProjectKey(hookInput.cwd), legacyProjectKey: void 0 };
  try {
    inheritOffRecord(hookInput.session_id, hookInput.transcript_path) === "inherited" && (debug("resumed or forked from an off-the-record session \u2014 marking this one too"), recordDiag({ event: "off_record", outcome: "ok", hook: "stop", sessionId: hookInput.session_id, reason: "inherited" }), (await takeSessionOffRecord(hookInput.session_id))?.offRecord !== !0 && recordDiag({ event: "off_record", outcome: "fail", hook: "stop", sessionId: hookInput.session_id, reason: "inherit_unconfirmed" }));
  } catch (err) {
    recordDiag({ event: "off_record", outcome: "fail", hook: "stop", sessionId: hookInput.session_id, reason: "inherit_blocked", detail: errorDetail(err) }), process.exit(1);
  }
  try {
    noteAnchorRow(hookInput.session_id, hookInput.transcript_path);
  } catch (err) {
    recordDiag({ event: "off_record", outcome: "fail", hook: "stop", sessionId: hookInput.session_id, reason: "anchor", detail: errorDetail(err) });
  }
  let result = await shipTranscript({
    sessionId: hookInput.session_id,
    transcriptPath: hookInput.transcript_path,
    legacyLastSentLine: readState(hookInput.session_id)?.lastSentLine,
    send: (messages, meta) => sendTranscript(hookInput.session_id, projectKey, messages, {
      sourceStartedAt: meta.sourceStartedAt,
      legacyProjectKey,
      batchId: meta.batchId
    })
  });
  if (debug(
    `sent=${result.messagesSent} batches=${result.batchesSent} pending=${result.messagesPending} bytesRead=${result.bytesRead}`
  ), result.ok) {
    disarm();
    return;
  }
  recordDiag({
    event: "transcript_pending",
    outcome: "fail",
    hook: "stop",
    sessionId: hookInput.session_id,
    count: result.messagesPending
  }), process.exit(1);
}
main().catch((err) => {
  DEBUG && console.error("[mypenny:send] error:", err);
  let code = err?.code;
  recordDiag({
    event: "transcript_ingest",
    outcome: "fail",
    hook: "stop",
    reason: "crash",
    detail: typeof code == "string" ? code : err instanceof Error ? err.name : typeof err
  }), process.exit(1);
});
