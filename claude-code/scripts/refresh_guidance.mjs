
// plugins/mypenny-core/lib/auth-store.ts
import * as fs2 from "node:fs";
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

// plugins/mypenny-core/lib/auth-health.ts
import * as fs from "node:fs";
import * as crypto from "node:crypto";
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
    const parsed = JSON.parse(fs.readFileSync(authHealthPath(), "utf-8"));
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
    fs.mkdirSync(mypennyDir(), { recursive: true });
    const target = authHealthPath();
    const tmp = `${target}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(health) + "\n", { mode: 384 });
    fs.renameSync(tmp, target);
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
    fs.unlinkSync(authHealthPath());
  } catch (err) {
    if (err?.code === "ENOENT") return;
    try {
      fs.writeFileSync(authHealthPath(), "{}\n", { mode: 384 });
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
var DEFAULT_BASE_URL = "https://engine.mypenny.ai";
function ensureDir() {
  fs2.mkdirSync(mypennyDir(), { recursive: true });
}
function atomicWrite(target, contents, mode) {
  ensureDir();
  const tmp = `${target}.${crypto2.randomUUID()}.tmp`;
  fs2.writeFileSync(tmp, contents, { mode });
  fs2.renameSync(tmp, target);
  if (process.platform !== "win32") {
    fs2.chmodSync(target, mode);
  }
}
function readToken() {
  const envToken = process.env.MYPENNY_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return fs2.readFileSync(tokenPath(), "utf-8").trim() || null;
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
    const raw = fs2.readFileSync(configPath(), "utf-8");
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
import * as fs3 from "node:fs";
import * as path2 from "node:path";
function deriveProjectKey(cwd) {
  try {
    const gitRoot = findGitRoot(cwd);
    if (gitRoot) {
      const configPath2 = resolveGitConfigPath(gitRoot);
      if (configPath2 && fs3.existsSync(configPath2)) {
        const remote = parseOriginRemote(fs3.readFileSync(configPath2, "utf-8"));
        if (remote) return sanitizeKey(remote);
      }
      return sanitizeKey(path2.basename(gitRoot));
    }
  } catch {
  }
  return sanitizeKey(path2.basename(cwd));
}
function findGitRoot(start) {
  let dir = start;
  for (let i = 0; i < 32; i++) {
    const gitPath = path2.join(dir, ".git");
    if (fs3.existsSync(gitPath)) return dir;
    const parent = path2.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function resolveGitConfigPath(gitRoot) {
  const gitPath = path2.join(gitRoot, ".git");
  try {
    const stat = fs3.statSync(gitPath);
    if (stat.isDirectory()) {
      return path2.join(gitPath, "config");
    }
    if (stat.isFile()) {
      const contents = fs3.readFileSync(gitPath, "utf-8");
      const match = contents.match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      const gitdir = path2.resolve(gitRoot, match[1].trim());
      const commondirPath = path2.join(gitdir, "commondir");
      if (fs3.existsSync(commondirPath)) {
        const commondir = path2.resolve(
          gitdir,
          fs3.readFileSync(commondirPath, "utf-8").trim()
        );
        return path2.join(commondir, "config");
      }
      return path2.join(gitdir, "config");
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
import * as fs4 from "node:fs";
import * as path3 from "node:path";
import * as crypto3 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  const safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim";
  const digest = crypto3.createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${safe}.${digest}`;
}
function prune(dir, stem, currentWindow) {
  try {
    for (const file of fs4.readdirSync(dir)) {
      if (!file.startsWith(`${stem}.`)) continue;
      const w = Number(file.slice(stem.length + 1));
      if (!Number.isFinite(w) || w > currentWindow - KEEP_WINDOWS) continue;
      try {
        fs4.unlinkSync(path3.join(dir, file));
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
  const target = path3.join(dir, `${stem}.${window}`);
  try {
    fs4.mkdirSync(dir, { recursive: true });
  } catch {
    return failOpen;
  }
  try {
    fs4.closeSync(fs4.openSync(target, "wx"));
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
import * as fs5 from "node:fs";
import * as path4 from "node:path";
import * as crypto4 from "node:crypto";
var GUIDANCE_TTL_MS = 10 * 60 * 1e3;
function cacheFile(projectKey) {
  const safe = projectKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unknown";
  const digest = crypto4.createHash("sha256").update(projectKey).digest("hex").slice(0, 8);
  return path4.join(guidanceDir(), `${safe}.${digest}.json`);
}
function writeGuidanceCache(projectKey, bundle, now = Date.now()) {
  try {
    fs5.mkdirSync(guidanceDir(), { recursive: true });
    const target = cacheFile(projectKey);
    const tmp = `${target}.${crypto4.randomUUID()}.tmp`;
    const payload = { bundle, fetchedAt: now };
    fs5.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 384 });
    try {
      fs5.renameSync(tmp, target);
      if (process.platform !== "win32") fs5.chmodSync(target, 384);
    } catch (err) {
      try {
        fs5.unlinkSync(tmp);
      } catch {
      }
      throw err;
    }
  } catch {
  }
}

// plugins/mypenny-core/lib/diag.ts
import * as fs6 from "node:fs";
import * as path5 from "node:path";
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
    const size = fs6.statSync(file).size;
    if (size >= MAX_BYTES) {
      fs6.renameSync(file, `${file}.1`);
    }
  } catch {
  }
}
function recordDiag(record) {
  if (!diagEnabled()) return;
  try {
    const file = diagLogPath();
    fs6.mkdirSync(path5.dirname(file), { recursive: true });
    rotateIfNeeded(file);
    const line = JSON.stringify({ at: Date.now(), ...diagContext, ...record }) + "\n";
    fs6.appendFileSync(file, line);
  } catch {
  }
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
  const { blocks, contract, ok } = await fetchCoreMemoryBlocks(projectKey, timeoutMs);
  const block = (name) => blocks.find((b) => b.blockName === name)?.content ?? "";
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

// plugins/mypenny-core/scripts/refresh_guidance.ts
var DEBUG = process.env.MYPENNY_DEBUG === "1";
var debug = (...args) => {
  if (DEBUG) console.error("[mypenny:refresh]", ...args);
};
var WATCHDOG_MS = 2e4;
async function main() {
  if (process.env.MYPENNY_SUBCONSCIOUS === "off") return;
  if (!readToken()) return;
  const cwd = process.argv[2];
  if (!cwd) {
    debug("no cwd argument; nothing to refresh");
    return;
  }
  setDiagContext({ hook: "refresh_guidance" });
  armWatchdog(WATCHDOG_MS);
  const projectKey = deriveProjectKey(cwd);
  const { guidance, ok } = await fetchGuidance(cwd);
  if (!ok) {
    debug(`fetch failed for project=${projectKey}; leaving cache untouched`);
    return;
  }
  writeGuidanceCache(projectKey, guidance);
  debug(
    `cached project=${projectKey} user=${guidance.userFacts.length}b sub=${guidance.subconscious.length}b coding=${guidance.codingGuidance.length}b`
  );
}
main().catch((err) => {
  if (DEBUG) console.error("[mypenny:refresh] error:", err);
  process.exit(0);
});
