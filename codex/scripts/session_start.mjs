
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
function versionCheckPath() {
  return path.join(mypennyDir(), "version-check.json");
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

// plugins/mypenny-core/lib/state.ts
import * as fs2 from "node:fs";
import * as path3 from "node:path";
import * as crypto from "node:crypto";
var STALE_THRESHOLD_MS = 10080 * 60 * 1e3, OFF_RECORD_THRESHOLD_MS = 2160 * 60 * 60 * 1e3, CLEANUP_INTERVAL_MS = 1440 * 60 * 1e3;
function ensureSessionsDir() {
  fs2.mkdirSync(sessionsDir(), { recursive: !0 });
}
function cleanupMarkerPath() {
  return path3.join(mypennyDir(), "last_cleanup");
}
function readState(sessionId) {
  try {
    let data = fs2.readFileSync(sessionPath(sessionId), "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
function writeState(state) {
  ensureSessionsDir();
  let target = sessionPath(state.sessionId), tmp = `${target}.${crypto.randomUUID()}.tmp`;
  fs2.writeFileSync(tmp, JSON.stringify(state, null, 2)), fs2.renameSync(tmp, target);
}
function createState(sessionId, projectPath) {
  let state = {
    sessionId,
    projectPath,
    startedAt: Date.now(),
    lastSentLine: 0,
    guidanceHash: null
  };
  return writeState(state), state;
}
function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
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
function withGuidanceHash(state, guidance) {
  let joined = joinBundle(guidance);
  return joined ? { ...state, guidanceHash: hashContent(joined) } : state;
}
function cleanupStaleSessions() {
  try {
    let lastCleanup = 0;
    try {
      let data = fs2.readFileSync(cleanupMarkerPath(), "utf-8");
      lastCleanup = parseInt(data, 10);
    } catch {
    }
    if (Date.now() - lastCleanup < CLEANUP_INTERVAL_MS || (fs2.mkdirSync(path3.dirname(cleanupMarkerPath()), { recursive: !0 }), fs2.writeFileSync(cleanupMarkerPath(), String(Date.now())), !fs2.existsSync(sessionsDir()))) return;
    let files = fs2.readdirSync(sessionsDir()), now = Date.now();
    for (let file of files) {
      let filePath = path3.join(sessionsDir(), file);
      try {
        if (file.endsWith(".posture")) {
          now - fs2.statSync(filePath).mtimeMs > STALE_THRESHOLD_MS && fs2.rmSync(filePath, { recursive: !0, force: !0 });
          continue;
        }
        if (!file.endsWith(".json") && !file.endsWith(".mod") && !file.endsWith(".profile.txt")) continue;
        let threshold = file.endsWith(".offrecord.json") ? OFF_RECORD_THRESHOLD_MS : STALE_THRESHOLD_MS;
        now - fs2.statSync(filePath).mtimeMs > threshold && fs2.unlinkSync(filePath);
      } catch {
      }
    }
  } catch {
  }
}

// plugins/mypenny-core/lib/auth-store.ts
import * as fs4 from "node:fs";
import * as crypto3 from "node:crypto";

// plugins/mypenny-core/lib/auth-health.ts
import * as fs3 from "node:fs";
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
    let parsed = JSON.parse(fs3.readFileSync(authHealthPath(), "utf-8"));
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
    fs3.mkdirSync(mypennyDir(), { recursive: !0 });
    let target = authHealthPath(), tmp = `${target}.${crypto2.randomUUID()}.tmp`;
    fs3.writeFileSync(tmp, JSON.stringify(health) + `
`, { mode: 384 }), fs3.renameSync(tmp, target);
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
    fs3.unlinkSync(authHealthPath());
  } catch (err) {
    if (err?.code === "ENOENT") return;
    try {
      fs3.writeFileSync(authHealthPath(), `{}
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
function authNeedsRepair(health, now = Date.now()) {
  return (health.rotateRejections ?? 0) >= REJECTION_THRESHOLD && health.lastRejectedAt !== void 0 && now - health.lastRejectedAt < REPAIR_EVIDENCE_HORIZON_MS && health.requestUnauthorizedAt !== void 0 && now - health.requestUnauthorizedAt < REPAIR_EVIDENCE_HORIZON_MS;
}
function authRepairNotice(health, now = Date.now()) {
  return authNeedsRepair(health, now) ? "Penny can no longer authenticate: this install's access token was replaced or revoked, and the server is refusing to renew it. Memory and transcript capture are paused until you re-pair." : null;
}

// plugins/mypenny-core/lib/auth-store.ts
var DEFAULT_BASE_URL = buildBaseUrl();
function ensureDir() {
  fs4.mkdirSync(mypennyDir(), { recursive: !0 });
}
function atomicWrite(target, contents, mode) {
  ensureDir();
  let tmp = `${target}.${crypto3.randomUUID()}.tmp`;
  fs4.writeFileSync(tmp, contents, { mode }), fs4.renameSync(tmp, target), process.platform !== "win32" && fs4.chmodSync(target, mode);
}
function readToken() {
  let envToken = process.env.MYPENNY_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return fs4.readFileSync(tokenPath(), "utf-8").trim() || null;
  } catch {
    return null;
  }
}
function writeToken(token) {
  atomicWrite(tokenPath(), token.trim(), 384), clearAuthHealth();
}
function readConfig() {
  try {
    let raw = fs4.readFileSync(configPath(), "utf-8");
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
import * as crypto4 from "node:crypto";
import * as fs5 from "node:fs";
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
      if (configPath2 && fs5.existsSync(configPath2)) {
        let url = parseOriginUrl(fs5.readFileSync(configPath2, "utf-8"));
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
    if (fs5.existsSync(gitPath)) return dir;
    let parent = path4.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function resolveGitConfigPath(gitRoot) {
  let gitPath = path4.join(gitRoot, ".git");
  try {
    let stat = fs5.statSync(gitPath);
    if (stat.isDirectory())
      return path4.join(gitPath, "config");
    if (stat.isFile()) {
      let match = fs5.readFileSync(gitPath, "utf-8").match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      let gitdir = path4.resolve(gitRoot, match[1].trim()), commondirPath = path4.join(gitdir, "commondir");
      if (fs5.existsSync(commondirPath)) {
        let commondir = path4.resolve(
          gitdir,
          fs5.readFileSync(commondirPath, "utf-8").trim()
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
  return crypto4.createHash("sha256").update(hostAndPath.toLowerCase()).digest("hex").slice(0, 8);
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
import * as fs6 from "node:fs";
import * as path5 from "node:path";
import * as crypto5 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  let safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim", digest = crypto5.createHash("sha256").update(name).digest("hex").slice(0, 8);
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
import * as fs7 from "node:fs";
import * as path6 from "node:path";
import * as crypto6 from "node:crypto";
var GUIDANCE_TTL_MS = 600 * 1e3;
function tokenTag(token) {
  return crypto6.createHash("sha256").update(token).digest("hex").slice(0, 16);
}
function cacheFile(projectKey) {
  let safe = projectKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unknown", digest = crypto6.createHash("sha256").update(projectKey).digest("hex").slice(0, 8);
  return path6.join(guidanceDir(), `${safe}.${digest}.json`);
}
function readGuidanceCache(projectKey, expectedTokenTag) {
  if (expectedTokenTag === null) return null;
  try {
    let parsed = JSON.parse(fs7.readFileSync(cacheFile(projectKey), "utf-8"));
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
function writeGuidanceCache(projectKey, bundle, now = Date.now(), fetchedWithTokenTag) {
  try {
    fs7.mkdirSync(guidanceDir(), { recursive: !0 });
    let target = cacheFile(projectKey), tmp = `${target}.${crypto6.randomUUID()}.tmp`, payload = {
      bundle,
      fetchedAt: now,
      ...fetchedWithTokenTag ? { tokenTag: fetchedWithTokenTag } : {}
    };
    fs7.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 384 });
    try {
      fs7.renameSync(tmp, target), process.platform !== "win32" && fs7.chmodSync(target, 384);
    } catch (err) {
      try {
        fs7.unlinkSync(tmp);
      } catch {
      }
      throw err;
    }
  } catch {
  }
}
function isGuidanceStale(cached, now = Date.now(), ttlMs = GUIDANCE_TTL_MS) {
  if (!cached) return !0;
  let age = now - cached.fetchedAt;
  return age < 0 ? !0 : age > ttlMs;
}

// plugins/mypenny-core/lib/posture.ts
var ACTING_TOOLS_BLOCK = "acting_tools";
var SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/;
function nonEmpty(x) {
  return typeof x == "string" && x.length > 0 ? x : null;
}
function hookSessionId(payload) {
  let id = nonEmpty(payload.session_id) ?? nonEmpty(payload.conversation_id);
  return id !== null && SAFE_SESSION_ID.test(id) ? id : null;
}
var LIST_LINE = /^(acting|reading)\s*:\s*(.+?)\s*$/i, BASH_PATTERN = /^Bash\((.*)\)$/, TOOL_GLOB = /^[A-Za-z0-9_*:.-]+$/;
function parseActingToolsBlock(content) {
  let out = { acting: [], reading: [], invalid: [] };
  for (let rawLine of String(content).split(`
`)) {
    let line = rawLine.replace(/^\s*(?:[-*•]\s+)?/, "").trim();
    if (line === "" || line.startsWith("#")) continue;
    let m = LIST_LINE.exec(line), kind = m?.[1]?.toLowerCase(), pattern = m?.[2] ?? "", bash = BASH_PATTERN.exec(pattern);
    if (!(m !== null && (bash ? kind === "acting" && bash[1].trim().length > 0 : TOOL_GLOB.test(pattern)))) {
      out.invalid.push(line);
      continue;
    }
    (kind === "acting" ? out.acting : out.reading).push(pattern);
  }
  return out;
}
function actingToolsNotice(content) {
  let { invalid } = parseActingToolsBlock(content);
  if (invalid.length === 0) return null;
  let shown = invalid.slice(0, 3).map((l) => `"${l.length > 80 ? `${l.slice(0, 80)}\u2026` : l}"`), count = invalid.length === 1 ? "1 line" : `${invalid.length} lines`;
  return [
    "<mypenny_notice>",
    `The user's ${ACTING_TOOLS_BLOCK} profile block has ${count} Penny can't use, so skill-run posture checks ignore them: ${shown.join(", ")}.`,
    'Each line should be "acting: <tool>" or "reading: <tool>", where <tool> is a tool name (* allowed); an acting line can also be Bash(<command words>). Offer to fix them.',
    "</mypenny_notice>"
  ].join(`
`);
}
var SILENT = Object.freeze({ kind: "silent" });

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
var TIMEOUT_MS = 6e3;
var PROFILE_TOOL = "penny_read", GUIDANCE_BLOCK_NAMES = [
  "user_facts",
  "persona",
  "preferences",
  "coding_guidance",
  "memory_policy",
  // Not injected: the posture gate reads it from the cache (lib/posture.ts).
  // Requesting it changes the #1516 revision, because the server folds the
  // requested block names into it, so no stale "unchanged" can hide it.
  ACTING_TOOLS_BLOCK
];
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
async function fetchCoreMemoryBlocks(projectKey, legacyProjectKey, timeoutMs, ifRevision, onCredential) {
  let raw = await callTool(
    PROFILE_TOOL,
    {
      target: "profile",
      projectKey,
      ...legacyProjectKey !== void 0 ? { legacyProjectKey } : {},
      blockNames: [
        ...GUIDANCE_BLOCK_NAMES,
        `subconscious:${projectKey}`,
        ...legacyProjectKey !== void 0 ? [`subconscious:${legacyProjectKey}`] : []
      ],
      ...ifRevision !== void 0 ? { ifRevision } : {}
    },
    timeoutMs,
    onCredential
  );
  if (raw === null) return { blocks: [], globalBlocks: [], contract: "", ok: !1, unchanged: !1 };
  try {
    let parsed = JSON.parse(raw);
    if (Object.hasOwn(parsed, "unchanged"))
      return parsed.unchanged !== !0 || ifRevision === void 0 || typeof parsed.revision != "string" || parsed.revision !== ifRevision ? { blocks: [], globalBlocks: [], contract: "", ok: !1, unchanged: !1 } : { blocks: [], globalBlocks: [], contract: "", ok: !0, unchanged: !0, revision: parsed.revision };
    let toBlocks = (group) => Array.isArray(group) ? group.filter((b) => typeof b?.blockName == "string").map((b) => ({ blockName: b.blockName, content: b.content || "" })) : [], globalBlocks = toBlocks(parsed.global), byName = /* @__PURE__ */ new Map();
    for (let b of [...globalBlocks, ...toBlocks(parsed.workspace)]) byName.set(b.blockName, b);
    let contract = typeof parsed.contract == "string" ? parsed.contract : "", revision = typeof parsed.revision == "string" ? parsed.revision : void 0;
    return { blocks: [...byName.values()], globalBlocks, contract, ok: !0, unchanged: !1, revision };
  } catch {
    return recordDiag({ event: "memory_tool", outcome: "fail", tool: PROFILE_TOOL, reason: "parse" }), { blocks: [], globalBlocks: [], contract: "", ok: !1, unchanged: !1 };
  }
}
async function fetchGuidance(cwd, timeoutMs, ifRevision) {
  let { projectKey, legacyProjectKey } = deriveProjectKeys(cwd), fetchedWith, { blocks: blocks2, globalBlocks, contract, ok, unchanged, revision } = await fetchCoreMemoryBlocks(
    projectKey,
    legacyProjectKey,
    timeoutMs,
    ifRevision,
    (tag) => {
      fetchedWith = tag;
    }
  );
  if (!fetchedWith || fetchedWith !== currentTokenTag())
    return { guidance: emptyGuidance(projectKey), ok: !1, unchanged: !1, tokenTag: fetchedWith };
  if (unchanged)
    return {
      ok,
      unchanged: !0,
      tokenTag: fetchedWith,
      guidance: { ...emptyGuidance(projectKey), revision }
    };
  let block = (name) => blocks2.find((b) => b.blockName === name)?.content ?? "", subconscious = block(`subconscious:${projectKey}`) || (legacyProjectKey !== void 0 ? block(`subconscious:${legacyProjectKey}`) : "");
  return {
    ok,
    unchanged: !1,
    tokenTag: fetchedWith,
    guidance: {
      userFacts: block("user_facts"),
      subconscious,
      codingGuidance: block("coding_guidance"),
      // memory_policy: how this user wants to be remembered (spec 2026-09-05).
      // Empty string when the user has not taught Penny anything yet — the
      // shipped guidance is the floor and this block holds only their deltas.
      memoryPolicy: block("memory_policy"),
      persona: block("persona"),
      preferences: block("preferences"),
      contract,
      // The user's own list only. A shared Space's block would otherwise win
      // the merge below, and any member of the Space can write it.
      actingTools: globalBlocks.find((b) => b.blockName === ACTING_TOOLS_BLOCK)?.content ?? "",
      projectKey,
      revision
    }
  };
}
async function getSessionStartGuidance(cwd, timeoutMs) {
  let cached = readGuidanceCache(deriveProjectKey(cwd), currentTokenTag());
  if (cached && !isGuidanceStale(cached))
    return { guidance: cached.bundle, fromCache: !0 };
  let { guidance } = await refreshAndCache(cwd, timeoutMs);
  return { guidance, fromCache: !1 };
}
async function refreshAndCache(cwd, timeoutMs) {
  let cached = readGuidanceCache(deriveProjectKey(cwd), currentTokenTag()), { guidance, ok, unchanged, tokenTag: fetchedWith } = await fetchGuidance(
    cwd,
    timeoutMs,
    cached?.bundle.revision
  );
  return !ok || !fetchedWith || fetchedWith !== currentTokenTag() ? { guidance: emptyGuidance(deriveProjectKey(cwd)), ok: !1, unchanged: !1 } : unchanged ? cached ? (writeGuidanceCache(cached.bundle.projectKey, cached.bundle, Date.now(), fetchedWith), { guidance: cached.bundle, ok: !0, unchanged: !0 }) : { guidance, ok: !1, unchanged: !1 } : (ok && writeGuidanceCache(guidance.projectKey, guidance, Date.now(), fetchedWith), { guidance, ok, unchanged: !1 });
}
function currentTokenTag() {
  let token = readToken();
  return token ? tokenTag(token) : null;
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

// plugins/mypenny-core/lib/version-check.ts
import * as fs8 from "node:fs";
import * as path7 from "node:path";
import { fileURLToPath } from "node:url";
var DAY_MS = 1440 * 60 * 1e3, REGISTRY = "https://registry.npmjs.org", PLUGIN_ROOT_ENV_VARS = ["CLAUDE_PLUGIN_ROOT", "PLUGIN_ROOT"], MANIFEST_SUBPATHS = [
  [".claude-plugin", "plugin.json"],
  [".codex-plugin", "plugin.json"]
];
function parseSemverCore(v) {
  if (typeof v != "string") return null;
  let parts = v.trim().replace(/^v/i, "").split(/[-+]/)[0].split(".");
  if (parts[0] === void 0 || parts[0] === "") return null;
  let out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let raw = parts[i] ?? "0";
    if (!/^\d+$/.test(raw)) return null;
    out[i] = Number(raw);
  }
  return out;
}
function compareSemver(a, b) {
  let pa = parseSemverCore(a), pb = parseSemverCore(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}
function pluginNpmName(pluginName) {
  let m = /^mypenny-([a-z0-9-]+)$/.exec(pluginName);
  return m ? `@mypenny/${m[1]}` : null;
}
function readManifest(root) {
  for (let sub of MANIFEST_SUBPATHS)
    try {
      let raw = fs8.readFileSync(path7.join(root, ...sub), "utf8"), json = JSON.parse(raw);
      if (typeof json.name != "string" || typeof json.version != "string") continue;
      let npmName = pluginNpmName(json.name);
      if (npmName) return { name: json.name, version: json.version, npmName };
    } catch {
    }
  return null;
}
function resolveInstalledPlugin(fromDir) {
  let candidates = [];
  for (let envVar of PLUGIN_ROOT_ENV_VARS) {
    let root = process.env[envVar];
    root && candidates.push(root);
  }
  let dir = fromDir ?? path7.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    candidates.push(dir);
    let parent = path7.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (let root of candidates) {
    let hit = readManifest(root);
    if (hit) return hit;
  }
  return null;
}
async function fetchLatestVersion(npmName, fetchImpl, timeoutMs) {
  try {
    let res = await fetchImpl(`${REGISTRY}/${npmName}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return null;
    let body = await res.json(), latest = body["dist-tags"]?.latest ?? body.version;
    return typeof latest == "string" && latest.length > 0 ? latest : null;
  } catch {
    return null;
  }
}
function readCache() {
  try {
    let parsed = JSON.parse(fs8.readFileSync(versionCheckPath(), "utf8"));
    return parsed && typeof parsed == "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeCache(cache) {
  try {
    fs8.mkdirSync(path7.dirname(versionCheckPath()), { recursive: !0 }), fs8.writeFileSync(versionCheckPath(), JSON.stringify(cache), { mode: 384 });
  } catch {
  }
}
async function checkPluginFreshness(opts = {}) {
  if (process.env.MYPENNY_VERSION_CHECK === "off") return null;
  let installed = opts.installed !== void 0 ? opts.installed : resolveInstalledPlugin();
  if (!installed) return null;
  let now = opts.now ?? Date.now(), ttlMs = opts.ttlMs ?? DAY_MS, fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl != "function") return null;
  let cache = readCache(), entry = cache[installed.npmName] ?? {}, mutated = !1;
  if (!(typeof entry.checkedAt == "number" && now - entry.checkedAt < ttlMs)) {
    let fetched = await fetchLatestVersion(
      installed.npmName,
      fetchImpl,
      opts.fetchTimeoutMs ?? 1500
    );
    fetched && (entry.latestVersion = fetched), entry.checkedAt = now, mutated = !0;
  }
  let latest = entry.latestVersion ?? null, cmp = latest === null ? null : compareSemver(installed.version, latest);
  return latest === null || cmp === null || cmp >= 0 || entry.lastNotifiedVersion === latest && typeof entry.lastNotifiedAt == "number" && now - entry.lastNotifiedAt < ttlMs ? (mutated && (cache[installed.npmName] = entry, writeCache(cache)), null) : (entry.lastNotifiedVersion = latest, entry.lastNotifiedAt = now, cache[installed.npmName] = entry, writeCache(cache), `Penny plugin update available: installed ${installed.version}, latest ${latest}. Updating refreshes the memory skill and MCP tool catalog. Let the user know they can update the Penny plugin via their plugin marketplace (or reinstall ${installed.npmName}).`);
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
function codexToolLoadingNotice(host) {
  return host !== "codex" ? null : [
    "<mypenny_tooling>",
    "Your Penny memory tools (penny_session_start, penny_read, penny_write,",
    "penny_edit, penny_delete) are MCP tools that Codex loads on demand. If they",
    "are not in your available tools right now, they are deferred \u2014 NOT",
    'unavailable. Use the `tool_search` tool (query "mypenny" or "memory") to',
    "load them, then call penny_session_start when private memory is allowed.",
    "For Projects, penny_read target:projects works even without startup.",
    "A workspace-only connection uses view:scopes, then an explicit workspaceId;",
    "it cannot fall back to private memory. Never tell the user their memory",
    "is unavailable, or that a save failed, without first loading the tools via",
    "tool_search.",
    "</mypenny_tooling>"
  ].join(`
`);
}

// plugins/mypenny-core/lib/off-record.ts
import * as fs9 from "node:fs";
import * as path8 from "node:path";
var SAFE_SESSION_ID2 = /^[A-Za-z0-9._-]{1,200}$/;
function safeId(sessionId) {
  return typeof sessionId == "string" && SAFE_SESSION_ID2.test(sessionId);
}
function offRecordPath(sessionId) {
  return path8.join(sessionsDir(), `${sessionId}.offrecord.json`);
}
function isOffRecord(sessionId) {
  return safeId(sessionId) && fs9.existsSync(offRecordPath(sessionId));
}
var TAIL_BYTES = 256 * 1024;
function sessionLine(sessionId, host) {
  if (!safeId(sessionId) || !/^[a-z-]{1,40}$/.test(host)) return null;
  let body = isOffRecord(sessionId) ? "This session is off the record: its transcript no longer reaches Penny. Don't save notes from it unless the user asks for a specific one." : 'If the user asks to go off the record, call penny_edit with entityType "session", record "off" and this id as sessionId.';
  return `<mypenny-session id="${sessionId}" host="${host}">${body}</mypenny-session>`;
}
var LIVE_WINDOW_MS = 7200 * 1e3;

// plugins/mypenny-core/lib/profile-file.ts
import * as fs10 from "node:fs";
import * as path9 from "node:path";
import * as crypto7 from "node:crypto";
function profilePath(sessionId) {
  return path9.join(sessionsDir(), `${encodeURIComponent(sessionId)}.profile.txt`);
}
function markerPath(sessionId) {
  return path9.join(sessionsDir(), `${encodeURIComponent(sessionId)}.mod`);
}
function hasProfileMod(sessionId) {
  return fs10.existsSync(markerPath(sessionId));
}
function writeProfile(sessionId, text) {
  fs10.mkdirSync(sessionsDir(), { recursive: !0 });
  let target = profilePath(sessionId), temp = `${target}.${crypto7.randomUUID()}.tmp`;
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
  return path9.join(sessionsDir(), `${encodeURIComponent(sessionId)}.guidance-part-${part}.json`);
}
function writeGuidanceSnapshot(sessionId, part, guidance) {
  fs10.mkdirSync(sessionsDir(), { recursive: !0 });
  let target = snapshotPath(sessionId, part), temp = `${target}.${crypto7.randomUUID()}.tmp`;
  try {
    fs10.writeFileSync(temp, JSON.stringify(guidance), { mode: 384 }), fs10.renameSync(temp, target);
  } finally {
    try {
      fs10.unlinkSync(temp);
    } catch {
    }
  }
}

// plugins/mypenny-core/scripts/session_start.ts
import { fileURLToPath as fileURLToPath2 } from "node:url";
import * as path10 from "node:path";
var DEBUG = process.env.MYPENNY_DEBUG === "1", debug = (...args) => {
  DEBUG && console.error("[mypenny:session_start]", ...args);
}, GUIDANCE_TIMEOUT_MS = 2500, WATCHDOG_MS = 4e3, HOST = parseHost(process.argv.slice(2)), partArg = process.argv.indexOf("--part"), PART = HOST === "claude-code" && partArg >= 0 ? Number(process.argv[partArg + 1]) : 0, cursorLines = HOST === "cursor" ? [] : null, cursorFlushed = !1;
function emit(line) {
  cursorLines ? cursorLines.push(line) : console.log(line);
}
function flushForCursor() {
  !cursorLines || cursorFlushed || (cursorFlushed = !0, console.log(JSON.stringify(cursorLines.length > 0 ? { additional_context: cursorLines.join(`
`) } : {})));
}
function clearClaimedProfile(sessionId) {
  if (!(HOST !== "claude-code" || PART === 2 || PART === 3))
    try {
      hasProfileMod(sessionId) && writeProfile(sessionId, "");
    } catch {
    }
}
async function main() {
  let raw = await readHookInput(), hookInput = normalizeHookInput(raw);
  if (!hookInput) return;
  if (process.env.MYPENNY_SUBCONSCIOUS === "off") {
    clearClaimedProfile(hookInput.session_id);
    return;
  }
  if (setDiagContext({ hook: "session_start", sessionId: hookInput.session_id }), PART === 2 || PART === 3) {
    if (hasProfileMod(hookInput.session_id) || !readToken()) return;
    let disarm = armWatchdog(WATCHDOG_MS), { guidance: guidance2 } = await getSessionStartGuidance(hookInput.cwd, GUIDANCE_TIMEOUT_MS), output2 = formatGuidanceParts(guidance2, "start")[PART - 1];
    disarm(), output2 && emit(output2), writeGuidanceSnapshot(hookInput.session_id, PART, guidance2);
    return;
  }
  let ownId = raw ? hookSessionId(raw) : null, idLine = ownId === null ? null : sessionLine(ownId, HOST ?? "unknown");
  if (idLine ? emit(idLine) : recordDiag({ event: "off_record", outcome: "skip", reason: "no_session_line" }), !readToken()) {
    clearClaimedProfile(hookInput.session_id);
    let authScript = path10.join(path10.dirname(fileURLToPath2(import.meta.url)), "auth_login.mjs");
    process.stderr.write(
      `[mypenny] plugin not authenticated. Run: node "${authScript}"
`
    );
    return;
  }
  let repairNotice = authRepairNotice(readAuthHealth());
  if (repairNotice) {
    let authScript = path10.join(path10.dirname(fileURLToPath2(import.meta.url)), "auth_login.mjs");
    process.stderr.write(`[mypenny] ${repairNotice} Run: node "${authScript}"
`), emit(
      `<mypenny_auth_notice>
${repairNotice} Tell the user to re-pair by running: node "${authScript}"
</mypenny_auth_notice>`
    );
  }
  armWatchdog(WATCHDOG_MS, cursorLines ? 1 : 0), debug("Session start:", hookInput.session_id, hookInput.cwd), readState(hookInput.session_id) || createState(hookInput.session_id, hookInput.cwd), cleanupStaleSessions();
  let { guidance, fromCache } = await getSessionStartGuidance(
    hookInput.cwd,
    GUIDANCE_TIMEOUT_MS
  );
  debug(
    `Guidance (${fromCache ? "cache" : "network"}): project=${guidance.projectKey} contract=${guidance.contract.length}b persona=${guidance.persona.length}b user=${guidance.userFacts.length}b prefs=${guidance.preferences.length}b sub=${guidance.subconscious.length}b coding=${guidance.codingGuidance.length}b policy=${guidance.memoryPolicy.length}b`
  );
  let output = formatInjection(guidance, []);
  HOST === "claude-code" ? (writeProfile(hookInput.session_id, output), output && !hasProfileMod(hookInput.session_id) && (emit(PART === 1 ? formatGuidanceParts(guidance, "start")[0] : output), PART === 1 && writeGuidanceSnapshot(hookInput.session_id, PART, guidance))) : output && emit(output);
  let listNotice = actingToolsNotice(guidance.actingTools ?? "");
  listNotice && emit(listNotice);
  let state = readState(hookInput.session_id);
  state && writeState(withGuidanceHash(state, guidance));
  let toolNotice = codexToolLoadingNotice(HOST);
  if (toolNotice && emit(toolNotice), cursorLines) {
    flushForCursor();
    return;
  }
  try {
    let updateNotice = await checkPluginFreshness();
    updateNotice && console.log(`<mypenny_update_notice>
${updateNotice}
</mypenny_update_notice>`);
  } catch (err) {
    debug("version check failed:", err);
  }
}
main().then(flushForCursor).catch((err) => {
  DEBUG && console.error("[mypenny:session_start] error:", err), process.exit(cursorLines ? 1 : 0);
});
