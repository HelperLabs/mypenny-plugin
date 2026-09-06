
// plugins/mypenny-core/lib/hook-input.ts
import * as readline from "node:readline";
function readHookInputFrom(stream) {
  return new Promise((resolve2) => {
    let input = "";
    const rl = readline.createInterface({ input: stream });
    const timer = setTimeout(() => rl.close(), 500);
    rl.on("line", (line) => {
      input += line + "\n";
    });
    rl.on("close", () => {
      clearTimeout(timer);
      const trimmed = input.trim();
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
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (ALLOWED_KEYS.has(k)) out[k] = v;
  }
  return out;
}

// plugins/mypenny-core/lib/diag.ts
import * as fs from "node:fs";
import * as path2 from "node:path";

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
var MAX_BYTES = 256 * 1024;
var diagContext = {};
function setDiagContext(context) {
  diagContext = { ...diagContext, ...context };
}
function diagEnabled() {
  if (process.env.MYPENNY_SUBCONSCIOUS === "off") return false;
  if (process.env.MYPENNY_DIAG?.trim().toLowerCase() === "off") return false;
  return true;
}
function rotateIfNeeded(file) {
  try {
    const size = fs.statSync(file).size;
    if (size >= MAX_BYTES) {
      fs.renameSync(file, `${file}.1`);
    }
  } catch {
  }
}
function recordDiag(record) {
  if (!diagEnabled()) return;
  try {
    const file = diagLogPath();
    fs.mkdirSync(path2.dirname(file), { recursive: true });
    rotateIfNeeded(file);
    const line = JSON.stringify({ at: Date.now(), ...diagContext, ...record }) + "\n";
    fs.appendFileSync(file, line);
  } catch {
  }
}

// plugins/mypenny-core/lib/state.ts
import * as fs2 from "node:fs";
import * as path3 from "node:path";
import * as crypto from "node:crypto";
var STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1e3;
var CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1e3;
function ensureSessionsDir() {
  fs2.mkdirSync(sessionsDir(), { recursive: true });
}
function cleanupMarkerPath() {
  return path3.join(mypennyDir(), "last_cleanup");
}
function readState(sessionId) {
  try {
    const data = fs2.readFileSync(sessionPath(sessionId), "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
function writeState(state) {
  ensureSessionsDir();
  const target = sessionPath(state.sessionId);
  const tmp = `${target}.${crypto.randomUUID()}.tmp`;
  fs2.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs2.renameSync(tmp, target);
}
function createState(sessionId, projectPath) {
  const state = {
    sessionId,
    projectPath,
    startedAt: Date.now(),
    lastSentLine: 0,
    guidanceHash: null
  };
  writeState(state);
  return state;
}
function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}
function joinBundle(g) {
  const fields = [
    g.userFacts,
    g.subconscious,
    g.codingGuidance,
    g.memoryPolicy,
    g.persona,
    g.preferences,
    g.contract
  ];
  if (fields.every((f) => !f)) return "";
  return fields.join("\0");
}
function withGuidanceHash(state, guidance) {
  const joined = joinBundle(guidance);
  if (!joined) return state;
  return { ...state, guidanceHash: hashContent(joined) };
}
function cleanupStaleSessions() {
  try {
    let lastCleanup = 0;
    try {
      const data = fs2.readFileSync(cleanupMarkerPath(), "utf-8");
      lastCleanup = parseInt(data, 10);
    } catch {
    }
    if (Date.now() - lastCleanup < CLEANUP_INTERVAL_MS) return;
    fs2.mkdirSync(path3.dirname(cleanupMarkerPath()), { recursive: true });
    fs2.writeFileSync(cleanupMarkerPath(), String(Date.now()));
    if (!fs2.existsSync(sessionsDir())) return;
    const files = fs2.readdirSync(sessionsDir());
    const now = Date.now();
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path3.join(sessionsDir(), file);
      try {
        const stat = fs2.statSync(filePath);
        if (now - stat.mtimeMs > STALE_THRESHOLD_MS) {
          fs2.unlinkSync(filePath);
        }
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
var RETRY_PENDING_HORIZON_MS = 12 * 60 * 1e3;
var REJECTED_BACKOFF_MS = 6 * 60 * 60 * 1e3;
var REJECTION_THRESHOLD = 2;
var REPAIR_EVIDENCE_HORIZON_MS = 24 * 60 * 60 * 1e3;
function debugLog(message) {
  if (process.env.MYPENNY_DEBUG === "1") console.error(message);
}
function asTime(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readAuthHealth() {
  try {
    const parsed = JSON.parse(fs3.readFileSync(authHealthPath(), "utf-8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const raw = parsed;
    const count = asTime(raw.rotateRejections);
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
    fs3.mkdirSync(mypennyDir(), { recursive: true });
    const target = authHealthPath();
    const tmp = `${target}.${crypto2.randomUUID()}.tmp`;
    fs3.writeFileSync(tmp, JSON.stringify(health) + "\n", { mode: 384 });
    fs3.renameSync(tmp, target);
  } catch (err) {
    debugLog(`[mypenny] auth-health write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function recordRotationRetryable(now = Date.now()) {
  writeAuthHealth({ ...readAuthHealth(), retryPendingAt: now });
}
function recordRotationRejected(now = Date.now()) {
  const health = readAuthHealth();
  const sameEpisode = health.lastRejectedAt !== void 0 && now - health.lastRejectedAt < REJECTED_BACKOFF_MS;
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
      fs3.writeFileSync(authHealthPath(), "{}\n", { mode: 384 });
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
  if (!authNeedsRepair(health, now)) return null;
  return "MyPenny can no longer authenticate: this install's access token was replaced or revoked, and the server is refusing to renew it. Memory and transcript capture are paused until you re-pair.";
}

// plugins/mypenny-core/lib/auth-store.ts
var DEFAULT_BASE_URL = "https://engine.mypenny.ai";
function ensureDir() {
  fs4.mkdirSync(mypennyDir(), { recursive: true });
}
function atomicWrite(target, contents, mode) {
  ensureDir();
  const tmp = `${target}.${crypto3.randomUUID()}.tmp`;
  fs4.writeFileSync(tmp, contents, { mode });
  fs4.renameSync(tmp, target);
  if (process.platform !== "win32") {
    fs4.chmodSync(target, mode);
  }
}
function readToken() {
  const envToken = process.env.MYPENNY_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return fs4.readFileSync(tokenPath(), "utf-8").trim() || null;
  } catch {
    return null;
  }
}
function writeToken(token) {
  atomicWrite(tokenPath(), token.trim(), 384);
  clearAuthHealth();
}
function readConfig() {
  try {
    const raw = fs4.readFileSync(configPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return readEnvConfig();
  }
}
function writeConfig(cfg) {
  atomicWrite(configPath(), JSON.stringify(cfg, null, 2) + "\n", 420);
}
function writeTokenExpiry(expiresAt, issuedAt) {
  const cfg = readConfig();
  if (!cfg) return;
  const next = { ...cfg };
  if (expiresAt === void 0) delete next.tokenExpiresAt;
  else next.tokenExpiresAt = expiresAt;
  if (issuedAt !== void 0) next.issuedAt = issuedAt;
  writeConfig(next);
}
function readEnvConfig() {
  if (!process.env.MYPENNY_TOKEN && !process.env.MYPENNY_BASE_URL && !process.env.MYPENNY_MEMORY_URL && !process.env.MYPENNY_MCP_URL && !process.env.MYPENNY_INGEST_URL) {
    return null;
  }
  const baseUrl = process.env.MYPENNY_BASE_URL?.trim() || DEFAULT_BASE_URL;
  return {
    memoryUrl: process.env.MYPENNY_MEMORY_URL?.trim() || process.env.MYPENNY_MCP_URL?.trim() || `${baseUrl}/mcp`,
    ingestUrl: process.env.MYPENNY_INGEST_URL?.trim() || `${baseUrl}/api/ingestTranscript`,
    userId: process.env.MYPENNY_USER_ID?.trim() || "env",
    issuedAt: 0
  };
}

// plugins/mypenny-core/lib/project-key.ts
import * as fs5 from "node:fs";
import * as path4 from "node:path";
function deriveProjectKey(cwd) {
  try {
    const gitRoot = findGitRoot(cwd);
    if (gitRoot) {
      const configPath2 = resolveGitConfigPath(gitRoot);
      if (configPath2 && fs5.existsSync(configPath2)) {
        const remote = parseOriginRemote(fs5.readFileSync(configPath2, "utf-8"));
        if (remote) return sanitizeKey(remote);
      }
      return sanitizeKey(path4.basename(gitRoot));
    }
  } catch {
  }
  return sanitizeKey(path4.basename(cwd));
}
function findGitRoot(start) {
  let dir = start;
  for (let i = 0; i < 32; i++) {
    const gitPath = path4.join(dir, ".git");
    if (fs5.existsSync(gitPath)) return dir;
    const parent = path4.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function resolveGitConfigPath(gitRoot) {
  const gitPath = path4.join(gitRoot, ".git");
  try {
    const stat = fs5.statSync(gitPath);
    if (stat.isDirectory()) {
      return path4.join(gitPath, "config");
    }
    if (stat.isFile()) {
      const contents = fs5.readFileSync(gitPath, "utf-8");
      const match = contents.match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      const gitdir = path4.resolve(gitRoot, match[1].trim());
      const commondirPath = path4.join(gitdir, "commondir");
      if (fs5.existsSync(commondirPath)) {
        const commondir = path4.resolve(
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
function parseOriginRemote(configText) {
  const lines = configText.split("\n");
  let inOrigin = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inOrigin = trimmed === '[remote "origin"]';
      continue;
    }
    if (!inOrigin) continue;
    const urlMatch = trimmed.match(/^url\s*=\s*(.+)$/);
    if (urlMatch) return extractRepoName(urlMatch[1]);
  }
  return null;
}
function extractRepoName(url) {
  const cleaned = url.trim().replace(/\.git$/, "");
  const lastSegment = cleaned.split(/[/:]/).pop();
  return lastSegment || null;
}
function sanitizeKey(raw) {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

// plugins/mypenny-core/lib/claim.ts
import * as fs6 from "node:fs";
import * as path5 from "node:path";
import * as crypto4 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  const safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim";
  const digest = crypto4.createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${safe}.${digest}`;
}
function prune(dir, stem, currentWindow) {
  try {
    for (const file of fs6.readdirSync(dir)) {
      if (!file.startsWith(`${stem}.`)) continue;
      const w = Number(file.slice(stem.length + 1));
      if (!Number.isFinite(w) || w > currentWindow - KEEP_WINDOWS) continue;
      try {
        fs6.unlinkSync(path5.join(dir, file));
      } catch {
      }
    }
  } catch {
  }
}
function claimWindow(name, windowMs, now = Date.now(), failOpen = true) {
  const dir = claimsDir();
  const stem = claimStem(name);
  const window = Math.floor(now / windowMs);
  const target = path5.join(dir, `${stem}.${window}`);
  try {
    fs6.mkdirSync(dir, { recursive: true });
  } catch {
    return failOpen;
  }
  try {
    fs6.closeSync(fs6.openSync(target, "wx"));
  } catch (err) {
    if (err?.code === "EEXIST") return false;
    return failOpen;
  }
  prune(dir, stem, window);
  return true;
}

// plugins/mypenny-core/lib/token-rotation.ts
var ROTATION_TIMEOUT_MS = 8e3;
var PROACTIVE_ROTATION_WINDOW_MS = 6 * 60 * 60 * 1e3;
var ROTATION_RETRY_WINDOW_MS = 2 * 60 * 1e3;
var RENEW_AFTER_FRACTION = 2 / 3;
var rotationAttempted = false;
function tokenIsEnvPinned() {
  return Boolean(process.env.MYPENNY_TOKEN?.trim());
}
function renewalIsDue(cfg, now) {
  if (!cfg) return false;
  if (cfg.tokenExpiresAt === void 0) return true;
  const issuedAt = cfg.issuedAt && cfg.issuedAt > 0 ? cfg.issuedAt : void 0;
  if (issuedAt === void 0) {
    const NOMINAL_LIFETIME_MS = 30 * 24 * 60 * 60 * 1e3;
    return now >= cfg.tokenExpiresAt - NOMINAL_LIFETIME_MS / 3;
  }
  const lifetime = cfg.tokenExpiresAt - issuedAt;
  if (lifetime <= 0) return true;
  return now - issuedAt >= lifetime * RENEW_AFTER_FRACTION;
}
function rotationUrl(memoryUrl) {
  try {
    return new URL("/api/auth/token/rotate", memoryUrl).toString();
  } catch {
    return null;
  }
}
async function rotateToken(timeoutMs = ROTATION_TIMEOUT_MS) {
  if (rotationAttempted) return null;
  rotationAttempted = true;
  if (tokenIsEnvPinned()) return null;
  const token = readToken();
  const cfg = readConfig();
  if (!token || !cfg) return null;
  const url = rotationUrl(cfg.memoryUrl);
  if (!url) return null;
  if (rotationKnownRejected(readAuthHealth(), Date.now())) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
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
    clearTimeout(timer);
    if (!response.ok) {
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        recordRotationRejected();
      } else if (response.status !== 429) {
        recordRotationRetryable();
      }
      return null;
    }
    const data = await response.json();
    const next = typeof data.access_token === "string" ? data.access_token.trim() : "";
    if (!next.startsWith("mpt_")) {
      recordRotationRetryable();
      return null;
    }
    writeToken(next);
    const expiresIn = typeof data.expires_in === "number" && Number.isFinite(data.expires_in) ? data.expires_in : void 0;
    writeTokenExpiry(
      expiresIn === void 0 ? void 0 : Date.now() + expiresIn * 1e3,
      // Refresh the issue time too (#1410): renewal timing measures "two
      // thirds of life" against issuedAt, so leaving the ORIGINAL pairing
      // time here made every install drift toward always-due — once the
      // recorded age passed two thirds of the recorded lifetime, renewal was
      // permanently due (~4 needless rotations/day, bounded by the 6h claim).
      Date.now()
    );
    return next;
  } catch {
    recordRotationRetryable();
    return null;
  }
}
async function withTokenRotation(attempt, token, timeoutMs) {
  let active = token;
  if (!tokenIsEnvPinned() && renewalIsDue(readConfig(), Date.now())) {
    const allowed = claimWindow("token-rotate", PROACTIVE_ROTATION_WINDOW_MS) || rotationRetryPending(readAuthHealth(), Date.now()) && claimWindow("token-rotate-retry", ROTATION_RETRY_WINDOW_MS);
    if (allowed) {
      const renewed = await rotateToken(timeoutMs);
      if (renewed) active = renewed;
    }
  }
  const first = await attempt(active);
  if (!first.unauthorized) return first.value;
  if (!tokenIsEnvPinned()) recordRequestUnauthorized();
  const rotated = await rotateToken(timeoutMs);
  if (!rotated) return first.value;
  const second = await attempt(rotated);
  return second.value;
}

// plugins/mypenny-core/lib/guidance-cache.ts
import * as fs7 from "node:fs";
import * as path6 from "node:path";
import * as crypto5 from "node:crypto";
var GUIDANCE_TTL_MS = 10 * 60 * 1e3;
function cacheFile(projectKey) {
  const safe = projectKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unknown";
  const digest = crypto5.createHash("sha256").update(projectKey).digest("hex").slice(0, 8);
  return path6.join(guidanceDir(), `${safe}.${digest}.json`);
}
function writeGuidanceCache(projectKey, bundle, now = Date.now()) {
  try {
    fs7.mkdirSync(guidanceDir(), { recursive: true });
    const target = cacheFile(projectKey);
    const tmp = `${target}.${crypto5.randomUUID()}.tmp`;
    const payload = { bundle, fetchedAt: now };
    fs7.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 384 });
    try {
      fs7.renameSync(tmp, target);
      if (process.platform !== "win32") fs7.chmodSync(target, 384);
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

// plugins/mypenny-core/lib/format.ts
function blocks(guidance) {
  const out = [];
  const push = (tag, raw) => {
    const text = raw.trim();
    if (text.length > 0) out.push({ tag, text });
  };
  push("operating_contract", guidance.contract);
  push("persona", guidance.persona);
  push("user_facts", guidance.userFacts);
  push("preferences", guidance.preferences);
  if (guidance.subconscious.trim().length > 0) {
    out.push({
      tag: `project_subconscious key="${guidance.projectKey}"`,
      text: guidance.subconscious.trim()
    });
  }
  push("coding_guidance", guidance.codingGuidance);
  push("memory_policy", guidance.memoryPolicy);
  return out;
}
function renderBlocks(guidance) {
  let out = "";
  for (const { tag, text } of blocks(guidance)) {
    const close = tag.split(" ")[0];
    out += `  <${tag}>
    ${text}
  </${close}>
`;
  }
  return out;
}
function formatInjection(guidance, memories) {
  const inner = renderBlocks(guidance);
  const hasMem = memories.length > 0;
  if (inner.length === 0 && !hasMem) return "";
  let out = "<mypenny_subconscious>\n" + inner;
  if (hasMem) {
    out += "  <relevant_memories>\n";
    for (const m of memories) {
      const score = m.score.toFixed(2);
      const tags = m.tags.join(", ");
      const content = m.content.length > 300 ? m.content.slice(0, 300) + "..." : m.content;
      out += `    [${score}] ${content} (tags: ${tags})
`;
    }
    out += "  </relevant_memories>\n";
  }
  out += "</mypenny_subconscious>";
  return out;
}

// plugins/mypenny-core/lib/memory-client.ts
var TIMEOUT_MS = 6e3;
var GUIDANCE_BLOCK_NAMES = [
  "user_facts",
  "persona",
  "preferences",
  "coding_guidance",
  "memory_policy"
];
function debugEnabled() {
  const value = process.env.MYPENNY_DEBUG?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
function debugLog2(message) {
  if (debugEnabled()) console.error(message);
}
async function callTool(name, args, timeoutMs = TIMEOUT_MS) {
  const token = readToken();
  const cfg = readConfig();
  if (!token || !cfg) {
    recordDiag({
      event: "memory_tool",
      outcome: "skip",
      tool: name,
      reason: !token ? "no_auth" : "no_config"
    });
    return null;
  }
  return withTokenRotation(
    (bearer) => callToolOnce(name, args, bearer, cfg.memoryUrl, timeoutMs),
    token,
    timeoutMs
  );
}
async function callToolOnce(name, args, token, memoryUrl, timeoutMs = TIMEOUT_MS) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(memoryUrl, {
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
    clearTimeout(timer);
    if (!response.ok) {
      debugLog2(`[mypenny] MCP tool ${name} failed: HTTP ${response.status}`);
      recordDiag({
        event: "memory_tool",
        outcome: "fail",
        tool: name,
        reason: "http",
        status: response.status
      });
      return { unauthorized: response.status === 401, value: null };
    }
    const data = await response.json();
    if (data.error) {
      debugLog2(`[mypenny] MCP tool ${name} failed: ${data.error.message}`);
      recordDiag({
        event: "memory_tool",
        outcome: "fail",
        tool: name,
        reason: "jsonrpc",
        status: data.error.code
      });
      return { unauthorized: false, value: null };
    }
    return {
      unauthorized: false,
      value: data.result?.content?.find((c) => c.type === "text")?.text ?? null
    };
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
    debugLog2(
      `[mypenny] MCP tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`
    );
    recordDiag({ event: "memory_tool", outcome: "fail", tool: name, reason });
    return { unauthorized: false, value: null };
  }
}
async function fetchCoreMemoryBlocks(projectKey, timeoutMs) {
  const raw = await callTool(
    "penny_get_profile",
    {
      projectKey,
      blockNames: [...GUIDANCE_BLOCK_NAMES, `subconscious:${projectKey}`]
    },
    timeoutMs
  );
  if (raw === null) return { blocks: [], contract: "", ok: false };
  try {
    const parsed = JSON.parse(raw);
    const byName = /* @__PURE__ */ new Map();
    for (const group of [parsed.global, parsed.workspace]) {
      if (!Array.isArray(group)) continue;
      for (const b of group) {
        if (typeof b?.blockName !== "string") continue;
        byName.set(b.blockName, { blockName: b.blockName, content: b.content || "" });
      }
    }
    const contract = typeof parsed.contract === "string" ? parsed.contract : "";
    return { blocks: [...byName.values()], contract, ok: true };
  } catch {
    recordDiag({ event: "memory_tool", outcome: "fail", tool: "penny_get_profile", reason: "parse" });
    return { blocks: [], contract: "", ok: false };
  }
}
async function fetchGuidance(cwd, timeoutMs) {
  const projectKey = deriveProjectKey(cwd);
  const { blocks: blocks2, contract, ok } = await fetchCoreMemoryBlocks(projectKey, timeoutMs);
  const block = (name) => blocks2.find((b) => b.blockName === name)?.content ?? "";
  return {
    ok,
    guidance: {
      userFacts: block("user_facts"),
      subconscious: block(`subconscious:${projectKey}`),
      codingGuidance: block("coding_guidance"),
      // memory_policy: how this user wants to be remembered (spec 2026-09-05).
      // Empty string when the user has not taught Penny anything yet — the
      // shipped guidance is the floor and this block holds only their deltas.
      memoryPolicy: block("memory_policy"),
      persona: block("persona"),
      preferences: block("preferences"),
      contract,
      projectKey
    }
  };
}

// plugins/mypenny-core/lib/watchdog.ts
function armWatchdog(budgetMs, exitCode = 0) {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) return () => {
  };
  const timer = setTimeout(() => {
    process.exit(exitCode);
  }, budgetMs);
  timer.unref?.();
  return () => clearTimeout(timer);
}

// plugins/mypenny-core/lib/version-check.ts
import * as fs8 from "node:fs";
import * as path7 from "node:path";
import { fileURLToPath } from "node:url";
var DAY_MS = 24 * 60 * 60 * 1e3;
var REGISTRY = "https://registry.npmjs.org";
var PLUGIN_ROOT_ENV_VARS = ["CLAUDE_PLUGIN_ROOT", "CODEX_PLUGIN_ROOT", "PLUGIN_ROOT"];
var MANIFEST_SUBPATHS = [
  [".claude-plugin", "plugin.json"],
  [".codex-plugin", "plugin.json"]
];
function parseSemverCore(v) {
  if (typeof v !== "string") return null;
  const core = v.trim().replace(/^v/i, "").split(/[-+]/)[0];
  const parts = core.split(".");
  if (parts[0] === void 0 || parts[0] === "") return null;
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const raw = parts[i] ?? "0";
    if (!/^\d+$/.test(raw)) return null;
    out[i] = Number(raw);
  }
  return out;
}
function compareSemver(a, b) {
  const pa = parseSemverCore(a);
  const pb = parseSemverCore(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}
function pluginNpmName(pluginName) {
  const m = /^mypenny-([a-z0-9-]+)$/.exec(pluginName);
  return m ? `@mypenny/${m[1]}` : null;
}
function readManifest(root) {
  for (const sub of MANIFEST_SUBPATHS) {
    try {
      const raw = fs8.readFileSync(path7.join(root, ...sub), "utf8");
      const json = JSON.parse(raw);
      if (typeof json.name !== "string" || typeof json.version !== "string") continue;
      const npmName = pluginNpmName(json.name);
      if (npmName) return { name: json.name, version: json.version, npmName };
    } catch {
    }
  }
  return null;
}
function resolveInstalledPlugin(fromDir) {
  const candidates = [];
  for (const envVar of PLUGIN_ROOT_ENV_VARS) {
    const root = process.env[envVar];
    if (root) candidates.push(root);
  }
  let dir = fromDir ?? path7.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    candidates.push(dir);
    const parent = path7.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const root of candidates) {
    const hit = readManifest(root);
    if (hit) return hit;
  }
  return null;
}
async function fetchLatestVersion(npmName, fetchImpl, timeoutMs) {
  try {
    const res = await fetchImpl(`${REGISTRY}/${npmName}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return null;
    const body = await res.json();
    const latest = body["dist-tags"]?.latest ?? body.version;
    return typeof latest === "string" && latest.length > 0 ? latest : null;
  } catch {
    return null;
  }
}
function readCache() {
  try {
    const parsed = JSON.parse(fs8.readFileSync(versionCheckPath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeCache(cache) {
  try {
    fs8.mkdirSync(path7.dirname(versionCheckPath()), { recursive: true });
    fs8.writeFileSync(versionCheckPath(), JSON.stringify(cache), { mode: 384 });
  } catch {
  }
}
async function checkPluginFreshness(opts = {}) {
  if (process.env.MYPENNY_VERSION_CHECK === "off") return null;
  const installed = opts.installed !== void 0 ? opts.installed : resolveInstalledPlugin();
  if (!installed) return null;
  const now = opts.now ?? Date.now();
  const ttlMs = opts.ttlMs ?? DAY_MS;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return null;
  const cache = readCache();
  const entry = cache[installed.npmName] ?? {};
  let mutated = false;
  const cacheFresh = typeof entry.checkedAt === "number" && now - entry.checkedAt < ttlMs;
  if (!cacheFresh) {
    const fetched = await fetchLatestVersion(
      installed.npmName,
      fetchImpl,
      opts.fetchTimeoutMs ?? 1500
    );
    if (fetched) entry.latestVersion = fetched;
    entry.checkedAt = now;
    mutated = true;
  }
  const latest = entry.latestVersion ?? null;
  const cmp = latest === null ? null : compareSemver(installed.version, latest);
  if (latest === null || cmp === null || cmp >= 0) {
    if (mutated) {
      cache[installed.npmName] = entry;
      writeCache(cache);
    }
    return null;
  }
  const alreadyNotified = entry.lastNotifiedVersion === latest && typeof entry.lastNotifiedAt === "number" && now - entry.lastNotifiedAt < ttlMs;
  if (alreadyNotified) {
    if (mutated) {
      cache[installed.npmName] = entry;
      writeCache(cache);
    }
    return null;
  }
  entry.lastNotifiedVersion = latest;
  entry.lastNotifiedAt = now;
  cache[installed.npmName] = entry;
  writeCache(cache);
  return `MyPenny plugin update available: installed ${installed.version}, latest ${latest}. Updating refreshes the memory skill and MCP tool catalog. Let the user know they can update the MyPenny plugin via their plugin marketplace (or reinstall ${installed.npmName}).`;
}

// plugins/mypenny-core/lib/host.ts
function parseHost(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--host") return argv[i + 1] ?? null;
    if (a.startsWith("--host=")) return a.slice("--host=".length) || null;
  }
  return null;
}
function codexToolLoadingNotice(host) {
  if (host !== "codex") return null;
  return [
    "<mypenny_tooling>",
    "Your MyPenny memory tools (penny_session_start, penny_read, penny_write,",
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
  ].join("\n");
}

// plugins/mypenny-core/scripts/session_start.ts
import { fileURLToPath as fileURLToPath2 } from "node:url";
import * as path8 from "node:path";
var DEBUG = process.env.MYPENNY_DEBUG === "1";
var debug = (...args) => {
  if (DEBUG) console.error("[mypenny:session_start]", ...args);
};
var GUIDANCE_TIMEOUT_MS = 2500;
var WATCHDOG_MS = 4e3;
async function main() {
  if (process.env.MYPENNY_SUBCONSCIOUS === "off") return;
  const raw = await readHookInput();
  const hookInput = normalizeHookInput(raw);
  if (!hookInput) return;
  setDiagContext({ hook: "session_start", sessionId: hookInput.session_id });
  if (!readToken()) {
    const authScript = path8.join(path8.dirname(fileURLToPath2(import.meta.url)), "auth_login.mjs");
    process.stderr.write(
      `[mypenny] plugin not authenticated. Run: node "${authScript}"
`
    );
    return;
  }
  const repairNotice = authRepairNotice(readAuthHealth());
  if (repairNotice) {
    const authScript = path8.join(path8.dirname(fileURLToPath2(import.meta.url)), "auth_login.mjs");
    process.stderr.write(`[mypenny] ${repairNotice} Run: node "${authScript}"
`);
    console.log(
      `<mypenny_auth_notice>
${repairNotice} Tell the user to re-pair by running: node "${authScript}"
</mypenny_auth_notice>`
    );
  }
  armWatchdog(WATCHDOG_MS);
  debug("Session start:", hookInput.session_id, hookInput.cwd);
  if (!readState(hookInput.session_id)) {
    createState(hookInput.session_id, hookInput.cwd);
  }
  cleanupStaleSessions();
  const { guidance, ok } = await fetchGuidance(hookInput.cwd, GUIDANCE_TIMEOUT_MS);
  debug(
    `Guidance: project=${guidance.projectKey} contract=${guidance.contract.length}b persona=${guidance.persona.length}b user=${guidance.userFacts.length}b prefs=${guidance.preferences.length}b sub=${guidance.subconscious.length}b coding=${guidance.codingGuidance.length}b policy=${guidance.memoryPolicy.length}b`
  );
  if (ok) writeGuidanceCache(guidance.projectKey, guidance);
  const output = formatInjection(guidance, []);
  if (output) console.log(output);
  const state = readState(hookInput.session_id);
  if (state) writeState(withGuidanceHash(state, guidance));
  const toolNotice = codexToolLoadingNotice(parseHost(process.argv.slice(2)));
  if (toolNotice) console.log(toolNotice);
  try {
    const updateNotice = await checkPluginFreshness();
    if (updateNotice) {
      console.log(`<mypenny_update_notice>
${updateNotice}
</mypenny_update_notice>`);
    }
  } catch (err) {
    debug("version check failed:", err);
  }
}
main().catch((err) => {
  if (DEBUG) console.error("[mypenny:session_start] error:", err);
  process.exit(0);
});
