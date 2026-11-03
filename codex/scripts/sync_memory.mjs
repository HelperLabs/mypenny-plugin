
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

// plugins/mypenny-core/lib/diag.ts
import * as fs from "node:fs";
import * as path2 from "node:path";

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
function guidanceDir() {
  return path.join(mypennyDir(), "guidance");
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
var MAX_BYTES = 256 * 1024, diagContext = {};
function setDiagContext(context) {
  diagContext = { ...diagContext, ...context };
}
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
import * as fs2 from "node:fs";
import * as path3 from "node:path";
import * as crypto from "node:crypto";
var UNREADABLE_RUN = "unreadable", SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/;
function postureDir(sessionId) {
  return path3.join(sessionsDir(), `${sessionId}.posture`);
}
function holdPath(sessionId, runId) {
  let name = crypto.createHash("sha256").update(runId).digest("hex").slice(0, 16);
  return path3.join(postureDir(sessionId), `${name}.json`);
}
function isHold(x) {
  let h = x;
  return !!h && typeof h.runId == "string" && (h.posture === "read" || h.posture === "propose") && typeof h.skillName == "string" && typeof h.startedAt == "number" && (h.actingTools === void 0 || typeof h.actingTools == "string") && (h.closedAt === void 0 || typeof h.closedAt == "number");
}
var UNREADABLE_HOLD = { runId: UNREADABLE_RUN, posture: "read", skillName: "", startedAt: 0 };
function readHolds(sessionId) {
  let names;
  try {
    names = fs2.readdirSync(postureDir(sessionId));
  } catch (err) {
    let code = err?.code;
    return code === "ENOENT" || code === "ENOTDIR" ? { kind: "none" } : { kind: "holds", holds: [UNREADABLE_HOLD] };
  }
  let holds = [];
  for (let name of names)
    if (name.endsWith(".json"))
      try {
        let parsed = JSON.parse(fs2.readFileSync(path3.join(postureDir(sessionId), name), "utf-8"));
        holds.push(isHold(parsed) ? parsed : UNREADABLE_HOLD);
      } catch (err) {
        if (err?.code === "ENOENT") continue;
        holds.push(UNREADABLE_HOLD);
      }
  let [first, ...rest] = holds;
  return first ? { kind: "holds", holds: [first, ...rest] } : { kind: "none" };
}
function releaseClosedHolds(sessionId) {
  if (!SAFE_SESSION_ID.test(sessionId)) return;
  let read = readHolds(sessionId);
  if (read.kind !== "none")
    for (let hold of read.holds)
      hold.closedAt !== void 0 && fs2.rmSync(holdPath(sessionId, hold.runId), { force: !0 });
}
var SILENT = Object.freeze({ kind: "silent" });
function errorDetail(err) {
  let name = err instanceof Error ? err.name : typeof err, code = err?.code;
  return typeof code == "string" ? `${name}:${code}` : name;
}

// plugins/mypenny-core/lib/state.ts
import * as fs3 from "node:fs";
import * as crypto2 from "node:crypto";
var STALE_THRESHOLD_MS = 10080 * 60 * 1e3, OFF_RECORD_THRESHOLD_MS = 2160 * 60 * 60 * 1e3, CLEANUP_INTERVAL_MS = 1440 * 60 * 1e3;
function ensureSessionsDir() {
  fs3.mkdirSync(sessionsDir(), { recursive: !0 });
}
function readState(sessionId) {
  try {
    let data = fs3.readFileSync(sessionPath(sessionId), "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
function writeState(state) {
  ensureSessionsDir();
  let target = sessionPath(state.sessionId), tmp = `${target}.${crypto2.randomUUID()}.tmp`;
  fs3.writeFileSync(tmp, JSON.stringify(state, null, 2)), fs3.renameSync(tmp, target);
}
function hashContent(content) {
  return crypto2.createHash("sha256").update(content).digest("hex").slice(0, 16);
}
function joinBundle(g) {
  let fields = [
    g.userFacts,
    g.subconscious,
    g.codingGuidance,
    g.memoryPolicy,
    g.persona,
    g.preferences,
    g.contract
  ];
  return fields.every((f) => !f) ? "" : fields.join("\0");
}

// plugins/mypenny-core/lib/auth-store.ts
import * as fs5 from "node:fs";
import * as crypto4 from "node:crypto";

// plugins/mypenny-core/lib/auth-health.ts
import * as fs4 from "node:fs";
import * as crypto3 from "node:crypto";
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
    let target = authHealthPath(), tmp = `${target}.${crypto3.randomUUID()}.tmp`;
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
  let tmp = `${target}.${crypto4.randomUUID()}.tmp`;
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

// plugins/mypenny-core/lib/project-key.ts
import * as crypto5 from "node:crypto";
import * as fs6 from "node:fs";
import * as path4 from "node:path";
function deriveProjectKey(cwd) {
  return deriveProjectKeys(cwd).projectKey;
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
      if (configPath2 && fs6.existsSync(configPath2)) {
        let url = parseOriginUrl(fs6.readFileSync(configPath2, "utf-8"));
        if (url) {
          let repo = extractRepoPath(url);
          if (repo?.hostAndPath) return { hostAndPath: !0, path: repo.path };
          if (repo) return { hostAndPath: !1, key: sanitizeKey(repo.path) };
        }
      }
      return { hostAndPath: !1, key: sanitizeKey(path4.basename(gitRoot)) };
    }
  } catch {
  }
  return { hostAndPath: !1, key: sanitizeKey(path4.basename(cwd)) };
}
function findGitRoot(start) {
  let dir = start;
  for (let i = 0; i < 32; i++) {
    let gitPath = path4.join(dir, ".git");
    if (fs6.existsSync(gitPath)) return dir;
    let parent = path4.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function resolveGitConfigPath(gitRoot) {
  let gitPath = path4.join(gitRoot, ".git");
  try {
    let stat = fs6.statSync(gitPath);
    if (stat.isDirectory())
      return path4.join(gitPath, "config");
    if (stat.isFile()) {
      let match = fs6.readFileSync(gitPath, "utf-8").match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      let gitdir = path4.resolve(gitRoot, match[1].trim()), commondirPath = path4.join(gitdir, "commondir");
      if (fs6.existsSync(commondirPath)) {
        let commondir = path4.resolve(
          gitdir,
          fs6.readFileSync(commondirPath, "utf-8").trim()
        );
        return path4.join(commondir, "config");
      }
      return path4.join(gitdir, "config");
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
  return crypto5.createHash("sha256").update(hostAndPath.toLowerCase()).digest("hex").slice(0, 8);
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

// plugins/mypenny-core/lib/claim.ts
import * as fs7 from "node:fs";
import * as path5 from "node:path";
import * as crypto6 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  let safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim", digest = crypto6.createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${safe}.${digest}`;
}
function prune(dir, stem, currentWindow) {
  try {
    for (let file of fs7.readdirSync(dir)) {
      if (!file.startsWith(`${stem}.`)) continue;
      let w = Number(file.slice(stem.length + 1));
      if (!(!Number.isFinite(w) || w > currentWindow - KEEP_WINDOWS))
        try {
          fs7.unlinkSync(path5.join(dir, file));
        } catch {
        }
    }
  } catch {
  }
}
function claimWindow(name, windowMs, now = Date.now(), failOpen = !0) {
  let dir = claimsDir(), stem = claimStem(name), window = Math.floor(now / windowMs), target = path5.join(dir, `${stem}.${window}`);
  try {
    fs7.mkdirSync(dir, { recursive: !0 });
  } catch {
    return failOpen;
  }
  try {
    fs7.closeSync(fs7.openSync(target, "wx"));
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
import * as fs8 from "node:fs";
import * as path6 from "node:path";
import * as crypto7 from "node:crypto";
var GUIDANCE_TTL_MS = 600 * 1e3;
function tokenTag(token) {
  return crypto7.createHash("sha256").update(token).digest("hex").slice(0, 16);
}
function cacheFile(projectKey) {
  let safe = projectKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unknown", digest = crypto7.createHash("sha256").update(projectKey).digest("hex").slice(0, 8);
  return path6.join(guidanceDir(), `${safe}.${digest}.json`);
}
function readGuidanceCache(projectKey, expectedTokenTag) {
  if (expectedTokenTag === null) return null;
  try {
    let parsed = JSON.parse(fs8.readFileSync(cacheFile(projectKey), "utf-8"));
    if (typeof parsed?.fetchedAt != "number" || parsed.bundle === null || typeof parsed.bundle != "object" || expectedTokenTag !== void 0 && parsed.tokenTag !== expectedTokenTag)
      return null;
    let b = parsed.bundle, incomplete = [
      b.userFacts,
      b.subconscious,
      b.codingGuidance,
      b.memoryPolicy,
      b.persona,
      b.preferences,
      b.contract,
      b.actingTools
    ].some((value) => typeof value != "string"), str = (v) => typeof v == "string" ? v : "";
    return {
      fetchedAt: incomplete ? Number.NEGATIVE_INFINITY : parsed.fetchedAt,
      bundle: {
        userFacts: str(b.userFacts),
        subconscious: str(b.subconscious),
        codingGuidance: str(b.codingGuidance),
        memoryPolicy: str(b.memoryPolicy),
        persona: str(b.persona),
        preferences: str(b.preferences),
        contract: str(b.contract),
        actingTools: str(b.actingTools),
        projectKey: typeof b.projectKey == "string" ? b.projectKey : projectKey,
        // A missing revision alone is compatible with an older full response.
        ...!incomplete && typeof b.revision == "string" ? { revision: b.revision } : {}
      },
      ...typeof parsed.tokenTag == "string" ? { tokenTag: parsed.tokenTag } : {}
    };
  } catch {
    return null;
  }
}
function isGuidanceStale(cached, now = Date.now(), ttlMs = GUIDANCE_TTL_MS) {
  if (!cached) return !0;
  let age = now - cached.fetchedAt;
  return age < 0 ? !0 : age > ttlMs;
}

// plugins/mypenny-core/lib/background-refresh.ts
import { spawn } from "node:child_process";
import * as fs9 from "node:fs";
import * as path7 from "node:path";
import { fileURLToPath } from "node:url";
var REFRESH_CLAIM_WINDOW_MS = 6e4;
function resolveRefresherScript() {
  let here;
  try {
    here = path7.dirname(fileURLToPath(import.meta.url));
  } catch {
    return null;
  }
  return [
    path7.join(here, "refresh_guidance.mjs"),
    path7.join(here, "..", "scripts", "refresh_guidance.mjs"),
    path7.join(here, "..", "scripts", "refresh_guidance.ts")
  ].find((script) => fs9.existsSync(script)) ?? null;
}
function interpreterArgs() {
  return process.execArgv.filter((flag) => !flag.startsWith("--inspect"));
}
function spawnGuidanceRefresh(projectKey, cwd) {
  let script = resolveRefresherScript();
  if (!script || !claimWindow(`guidance-refresh:${projectKey}`, REFRESH_CLAIM_WINDOW_MS, void 0, !1))
    return !1;
  try {
    let child = spawn(process.execPath, [...interpreterArgs(), script, cwd], {
      detached: !0,
      stdio: "ignore",
      // Inherit env so MYPENNY_HOME / MYPENNY_TOKEN reach the child.
      env: process.env
    });
    return child.on("error", () => {
    }), child.unref(), !0;
  } catch {
    return !1;
  }
}

// plugins/mypenny-core/lib/format.ts
function emptyGuidance(projectKey) {
  return {
    userFacts: "",
    subconscious: "",
    codingGuidance: "",
    memoryPolicy: "",
    persona: "",
    preferences: "",
    contract: "",
    actingTools: "",
    projectKey
  };
}
function blocks(guidance) {
  let out = [], push = (tag, raw) => {
    let text = raw.trim();
    text.length > 0 && out.push({ tag, text });
  };
  return push("operating_contract", guidance.contract), push("persona", guidance.persona), push("user_facts", guidance.userFacts), push("preferences", guidance.preferences), guidance.subconscious.trim().length > 0 && out.push({
    tag: `project_subconscious key="${guidance.projectKey}"`,
    text: guidance.subconscious.trim()
  }), push("coding_guidance", guidance.codingGuidance), push("memory_policy", guidance.memoryPolicy), out;
}
function renderBlocks(guidance) {
  let out = "";
  for (let { tag, text } of blocks(guidance)) {
    let close = tag.split(" ")[0];
    out += `  <${tag}>
    ${text}
  </${close}>
`;
  }
  return out;
}
function formatInjection(guidance, memories) {
  let inner = renderBlocks(guidance), hasMem = memories.length > 0;
  if (inner.length === 0 && !hasMem) return "";
  let out = `<mypenny_subconscious>
` + inner;
  if (hasMem) {
    out += `  <relevant_memories>
`;
    for (let m of memories) {
      let score = m.score.toFixed(2), tags = m.tags.join(", "), content = m.content.length > 300 ? m.content.slice(0, 300) + "..." : m.content;
      out += `    [${score}] ${content} (tags: ${tags})
`;
    }
    out += `  </relevant_memories>
`;
  }
  return out += "</mypenny_subconscious>", out;
}
function changedGuidance(previous, current) {
  if (!previous) return current;
  let changed = emptyGuidance(current.projectKey);
  for (let field of ["contract", "persona", "userFacts", "preferences", "subconscious", "codingGuidance", "memoryPolicy"])
    (current[field] !== previous[field] || field === "subconscious" && current.projectKey !== previous.projectKey) && (changed[field] = current[field] || "(removed)");
  return changed;
}
var PART_ONE_LIMIT = 8500;
function formatGuidanceParts(guidance, kind) {
  let outer = kind === "start" ? "mypenny_subconscious" : "mypenny_subconscious_update", body = ["", "", ""], limit = (kind === "start" ? [PART_ONE_LIMIT, 9500, 9500] : [9500, 9500, 9500]).map((n) => n - 100), size = kind === "start" ? (s) => s.length : (s) => JSON.stringify(s).length - 2, fit = (text, room) => kind === "start" ? Math.min(text.length, room) : escapedPrefix(text, room), used = [0, 0, 0], part = 0;
  for (let { tag, text } of blocks(guidance)) {
    let close = tag.split(" ")[0], rest = text, continued = !1;
    for (; rest.length > 0; ) {
      let open = continued ? `${tag} continued="true"` : tag, wrap = size(`  <${open}>
    
  </${close}>
`), whole = size(rest) + wrap;
      part < 2 && used[part] > 0 && used[part] + whole > limit[part] && (whole <= limit[part + 1] || limit[part] - used[part] - wrap < 1e3) && part++;
      let room = part === 2 ? 1 / 0 : limit[part] - used[part] - wrap, cut = whole - wrap <= room ? rest.length : splitAt(rest, fit(rest, room)), piece = `  <${open}>
    ${rest.slice(0, cut)}
  </${close}>
`;
      rest = rest.slice(cut), body[part] += piece, used[part] += size(piece), continued = !0;
    }
  }
  return body.map((inner, index) => inner ? `<${outer} part="${index + 1} of 3">
${inner}</${outer}>` : "");
}
function escapedPrefix(text, max) {
  let total = 0;
  for (let i = 0; i < text.length; i++)
    if (total += JSON.stringify(text[i]).length - 2, total > max) return i;
  return text.length;
}
function splitAt(text, max) {
  if (text.length <= max) return text.length;
  let line = text.lastIndexOf(`
`, max), sentence = text.lastIndexOf(". ", max), space = text.lastIndexOf(" ", max), boundary = [line, sentence >= 0 ? sentence + 1 : -1, space].find((i) => i >= max / 2);
  return boundary === void 0 ? max : boundary + 1;
}

// plugins/mypenny-core/lib/memory-client.ts
var TIMEOUT_MS = 6e3, SEARCH_TOOL = "penny_read";
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
async function searchMemories(query, limit = 5, timeoutMs) {
  let raw = await callTool(
    SEARCH_TOOL,
    { target: "search", query, limit, graphTraversal: !1 },
    timeoutMs
  );
  if (!raw) return [];
  try {
    let parsed = JSON.parse(raw);
    if (!Array.isArray(parsed))
      return recordDiag({ event: "memory_tool", outcome: "fail", tool: SEARCH_TOOL, reason: "parse" }), [];
    let usable = parsed.filter(
      (r) => r && typeof r.id == "string" && typeof r.content == "string"
    );
    return usable.length < parsed.length && recordDiag({
      event: "memory_tool",
      outcome: "fail",
      tool: SEARCH_TOOL,
      reason: "parse",
      count: parsed.length - usable.length
    }), usable.map((r) => ({
      id: r.id,
      content: r.content,
      score: typeof r.score == "number" ? r.score : 0,
      tags: Array.isArray(r.tags) ? r.tags : []
    }));
  } catch {
    return recordDiag({ event: "memory_tool", outcome: "fail", tool: SEARCH_TOOL, reason: "parse" }), [];
  }
}
function currentTokenTag() {
  let token = readToken();
  return token ? tokenTag(token) : null;
}
function getCachedGuidanceForCwd(cwd) {
  let projectKey = deriveProjectKey(cwd), cached = readGuidanceCache(projectKey, currentTokenTag()), refreshStarted = isGuidanceStale(cached) ? spawnGuidanceRefresh(projectKey, cwd) : !1;
  return {
    guidance: cached?.bundle ?? emptyGuidance(projectKey),
    cacheHit: cached !== null,
    refreshStarted
  };
}

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

// plugins/mypenny-core/lib/watchdog.ts
function armWatchdog(budgetMs, exitCode = 0) {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) return () => {
  };
  let timer = setTimeout(() => {
    recordDiag({ event: "watchdog", outcome: "fail", reason: "timeout" }), process.exit(exitCode);
  }, budgetMs);
  return timer.unref?.(), () => clearTimeout(timer);
}

// plugins/mypenny-core/lib/recall-query.ts
var MAX_QUERY_CHARS = 200, MIN_WORDS = 3, SKIP_PATTERNS = [
  /^\/\w+/,
  /^(yes|no|y|n|ok|sure|thanks|continue|go|lgtm|looks good|commit)$/i
], FENCE = /^\s*(```|~~~)/, PASTED_BLOCK = /<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content>/g, LOG_OR_TRACE_LINE = [
  /^\s+at\s+\S/,
  // JS / Java stack frame
  /^at\s+(async\s+)?[\w$.<>[\]]+\s*\(/,
  // unindented JS frame
  /^\s*File ".*", line \d+/,
  // Python frame
  /^\s*Traceback \(most recent call last\)/,
  /^\s*#\d+\s+0x[0-9a-fA-F]+/,
  // native backtrace frame ("#3  0x7fff… in f () at x.c:12"), not "#1729 fails in CI"
  /^\s*\.\.\. \d+ more/,
  // Java elided frames
  /^\s*\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/,
  // leading ISO timestamp
  /^\s*\[?\d{2}:\d{2}:\d{2}(\.\d+)?\]?\s/,
  // leading clock time
  /^\s*\[?(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|ERR|FATAL|CRITICAL)\]?[:\s]/,
  // level prefix
  /^\s*(npm|pnpm|yarn) (ERR!|WARN|error)/,
  // A typed headline ("TypeError: …", "java.lang.NullPointerException: …"). A
  // bare "Error:" stays prose: people open sentences with it.
  /^\s*(([\w$]+\.)+[\w$]*|[A-Z][\w$]*?[a-z][\w$]*)(Error|Exception)\b[:(]/,
  /^\s*(FAIL|PASS|✓|✗|×|❯)\s/,
  // test-runner result lines
  /^\s*(Test Files|Tests|Exit code)\s+\d+/
];
function wordCount(text) {
  let trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
function proseParagraphs(prompt) {
  let paragraphs = [], current = [], flush = () => {
    current.length > 0 && paragraphs.push(current.join(" ").replace(/\s+/g, " ").trim()), current = [];
  }, inFence = !1;
  for (let line of prompt.replace(PASTED_BLOCK, `
`).split(`
`)) {
    if (FENCE.test(line)) {
      inFence = !inFence, flush();
      continue;
    }
    if (inFence || !line.trim() || LOG_OR_TRACE_LINE.some((re) => re.test(line))) {
      flush();
      continue;
    }
    current.push(line.trim());
  }
  return flush(), paragraphs.filter((p) => p.length > 0);
}
var NOT_A_SENTENCE_END = /(^|\s)(\d+|[A-Za-z]|e\.g|i\.e|etc|vs|cf|approx|incl|no|fig)\.$/i;
function firstSentence(paragraph) {
  for (let end of paragraph.matchAll(/[.!?](?=\s|$)/g)) {
    let upTo = paragraph.slice(0, end.index + 1);
    if (!(end[0] === "." && NOT_A_SENTENCE_END.test(upTo)))
      return upTo.trim();
  }
  return paragraph.trim();
}
function cutAtWord(text, max) {
  if (text.length <= max) return text;
  let head = text.slice(0, max + 1), lastSpace = head.lastIndexOf(" ");
  return (lastSpace > 0 ? head.slice(0, lastSpace) : text.slice(0, max)).trim();
}
function deriveSearchQuery(prompt) {
  let trimmed = prompt.trim();
  if (wordCount(trimmed) < MIN_WORDS) return null;
  for (let pattern of SKIP_PATTERNS)
    if (pattern.test(trimmed)) return null;
  let scrubbed = scrubCredentials(trimmed);
  if (trimmed.length <= MAX_QUERY_CHARS) return scrubbed;
  let paragraphs = proseParagraphs(scrubbed);
  if (paragraphs.length === 0) return null;
  let sentence = firstSentence(paragraphs[0]), query = wordCount(sentence) >= MIN_WORDS && sentence.length <= MAX_QUERY_CHARS ? sentence : cutAtWord(paragraphs.join(" "), MAX_QUERY_CHARS);
  return wordCount(query) >= MIN_WORDS ? query : null;
}

// plugins/mypenny-core/lib/host.ts
function parseHost(argv) {
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === "--host") return argv[i + 1] ?? null;
    if (a.startsWith("--host=")) return a.slice(7) || null;
  }
  return null;
}

// plugins/mypenny-core/lib/profile-file.ts
import * as fs10 from "node:fs";
import * as path8 from "node:path";
import * as crypto8 from "node:crypto";
function profilePath(sessionId) {
  return path8.join(sessionsDir(), `${encodeURIComponent(sessionId)}.profile.txt`);
}
function markerPath(sessionId) {
  return path8.join(sessionsDir(), `${encodeURIComponent(sessionId)}.mod`);
}
function hasProfileMod(sessionId) {
  return fs10.existsSync(markerPath(sessionId));
}
function writeProfile(sessionId, text) {
  fs10.mkdirSync(sessionsDir(), { recursive: !0 });
  let target = profilePath(sessionId), temp = `${target}.${crypto8.randomUUID()}.tmp`;
  try {
    fs10.writeFileSync(temp, text, { mode: 384 }), fs10.renameSync(temp, target);
  } finally {
    try {
      fs10.unlinkSync(temp);
    } catch {
    }
  }
}
function snapshotPath(sessionId, part) {
  return path8.join(sessionsDir(), `${encodeURIComponent(sessionId)}.guidance-part-${part}.json`);
}
function readSnapshot(sessionId, part) {
  try {
    return JSON.parse(fs10.readFileSync(snapshotPath(sessionId, part), "utf8"));
  } catch {
    return null;
  }
}
function writeGuidanceSnapshot(sessionId, part, guidance) {
  fs10.mkdirSync(sessionsDir(), { recursive: !0 });
  let target = snapshotPath(sessionId, part), temp = `${target}.${crypto8.randomUUID()}.tmp`;
  try {
    fs10.writeFileSync(temp, JSON.stringify(guidance), { mode: 384 }), fs10.renameSync(temp, target);
  } finally {
    try {
      fs10.unlinkSync(temp);
    } catch {
    }
  }
}
function changedFallbackPart(sessionId, part, guidance) {
  let previous = readSnapshot(sessionId, part), changed = changedGuidance(previous, guidance), output = formatGuidanceParts(changed, "update")[part - 1];
  if (!previous || JSON.stringify(previous) !== JSON.stringify(guidance)) {
    if (!claimWindow(`claude-guidance:${sessionId}:${part}:${hashContent(JSON.stringify(guidance))}`, 1e4)) return "";
    writeGuidanceSnapshot(sessionId, part, guidance);
  }
  return output;
}

// plugins/mypenny-core/scripts/sync_memory.ts
var DEBUG = process.env.MYPENNY_DEBUG === "1", debug = (...args) => {
  DEBUG && console.error("[mypenny:sync]", ...args);
}, SEARCH_TIMEOUT_MS = 6e3, WATCHDOG_MS = 8e3, HOST = parseHost(process.argv.slice(2)), ON_CURSOR = HOST === "cursor", partArg = process.argv.indexOf("--part"), PART = HOST === "claude-code" && partArg >= 0 ? Number(process.argv[partArg + 1]) : null;
async function main() {
  let raw = await readHookInput(), sessionId = typeof raw?.session_id == "string" ? raw.session_id : raw?.conversation_id;
  if ((PART === null || PART === 0) && typeof sessionId == "string")
    try {
      releaseClosedHolds(sessionId);
    } catch (err) {
      recordDiag({ event: "posture_release", outcome: "fail", hook: "user_prompt_submit", reason: "crash", detail: errorDetail(err) });
    }
  if (ON_CURSOR) {
    console.log(JSON.stringify({ continue: !0 }));
    return;
  }
  if (process.env.MYPENNY_SUBCONSCIOUS === "off") return;
  let credential = readToken();
  if (!credential) return;
  let disarm = armWatchdog(WATCHDOG_MS), hookInput = normalizeHookInput(raw);
  if (!hookInput) return;
  setDiagContext({ hook: "user_prompt_submit", sessionId: hookInput.session_id });
  let prompt = hookInput.prompt || "";
  debug("Prompt(scrubbed,80):", scrubCredentials(prompt.slice(0, 80)));
  let state = readState(hookInput.session_id), cwd = hookInput.cwd ?? state?.projectPath ?? process.cwd();
  if ((PART === 2 || PART === 3) && hasProfileMod(hookInput.session_id)) {
    disarm();
    return;
  }
  if (PART === 0) {
    let query2 = deriveSearchQuery(prompt), memories2 = query2 ? await searchMemories(query2, 5, SEARCH_TIMEOUT_MS) : [];
    if (disarm(), readToken() !== credential) return;
    let output2 = formatInjection(emptyGuidance(""), memories2);
    output2 && console.log(output2);
    return;
  }
  let { guidance, cacheHit, refreshStarted } = getCachedGuidanceForCwd(cwd);
  if (refreshStarted && debug("stale cache \u2014 refresh spawned"), PART !== null && PART >= 1 && PART <= 3) {
    if (hasProfileMod(hookInput.session_id)) {
      if (PART === 1) {
        let joined2 = joinBundle(guidance), currentHash2 = joined2 ? hashContent(joined2) : null;
        if (currentHash2 && state?.guidanceHash !== currentHash2) {
          let profile = formatInjection(guidance, []);
          profile && writeProfile(hookInput.session_id, profile), state && writeState({ ...state, guidanceHash: currentHash2 });
        }
      }
      disarm();
      return;
    }
    if (!cacheHit) {
      disarm();
      return;
    }
    let output2 = changedFallbackPart(hookInput.session_id, PART, guidance);
    disarm(), output2 && console.log(output2);
    return;
  }
  let query = deriveSearchQuery(prompt), memories = query ? await searchMemories(query, 5, SEARCH_TIMEOUT_MS) : [];
  if (readToken() !== credential) {
    disarm();
    return;
  }
  let joined = joinBundle(guidance), currentHash = joined ? hashContent(joined) : null, guidanceChanged = !state || state.guidanceHash !== currentHash, effectiveGuidance = guidanceChanged ? guidance : emptyGuidance(guidance.projectKey);
  disarm();
  let modActive = HOST === "claude-code" && hasProfileMod(hookInput.session_id);
  if (modActive && guidanceChanged) {
    let profile = formatInjection(guidance, []);
    profile && writeProfile(hookInput.session_id, profile);
  }
  let output = formatInjection(modActive ? emptyGuidance(guidance.projectKey) : effectiveGuidance, memories);
  output && console.log(output), state && currentHash !== null && currentHash !== state.guidanceHash && writeState({ ...state, guidanceHash: currentHash });
}
main().catch((err) => {
  DEBUG && console.error("[mypenny:sync] error:", err), recordDiag({
    event: "recall",
    outcome: "fail",
    reason: "crash",
    detail: err instanceof Error ? err.name : typeof err
  }), process.exit(ON_CURSOR ? 1 : 0);
});
