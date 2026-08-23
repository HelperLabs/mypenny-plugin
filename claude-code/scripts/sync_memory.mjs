
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

// plugins/mypenny-core/lib/state.ts
import * as fs from "node:fs";
import * as crypto from "node:crypto";

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
function guidanceDir() {
  return path.join(mypennyDir(), "guidance");
}
function claimsDir() {
  return path.join(mypennyDir(), "claims");
}
function authHealthPath() {
  return path.join(mypennyDir(), "auth-health.json");
}

// plugins/mypenny-core/lib/state.ts
var STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1e3;
var CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1e3;
function ensureSessionsDir() {
  fs.mkdirSync(sessionsDir(), { recursive: true });
}
function readState(sessionId) {
  try {
    const data = fs.readFileSync(sessionPath(sessionId), "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
function writeState(state) {
  ensureSessionsDir();
  const target = sessionPath(state.sessionId);
  const tmp = `${target}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, target);
}
function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}
function joinBundle(g) {
  if (!g.userFacts && !g.subconscious && !g.codingGuidance) return "";
  return `${g.userFacts}\0${g.subconscious}\0${g.codingGuidance}`;
}

// plugins/mypenny-core/lib/auth-store.ts
import * as fs3 from "node:fs";
import * as crypto3 from "node:crypto";

// plugins/mypenny-core/lib/auth-health.ts
import * as fs2 from "node:fs";
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
    const parsed = JSON.parse(fs2.readFileSync(authHealthPath(), "utf-8"));
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
    fs2.mkdirSync(mypennyDir(), { recursive: true });
    const target = authHealthPath();
    const tmp = `${target}.${crypto2.randomUUID()}.tmp`;
    fs2.writeFileSync(tmp, JSON.stringify(health) + "\n", { mode: 384 });
    fs2.renameSync(tmp, target);
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
    fs2.unlinkSync(authHealthPath());
  } catch (err) {
    if (err?.code === "ENOENT") return;
    try {
      fs2.writeFileSync(authHealthPath(), "{}\n", { mode: 384 });
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
  fs3.mkdirSync(mypennyDir(), { recursive: true });
}
function atomicWrite(target, contents, mode) {
  ensureDir();
  const tmp = `${target}.${crypto3.randomUUID()}.tmp`;
  fs3.writeFileSync(tmp, contents, { mode });
  fs3.renameSync(tmp, target);
  if (process.platform !== "win32") {
    fs3.chmodSync(target, mode);
  }
}
function readToken() {
  const envToken = process.env.MYPENNY_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return fs3.readFileSync(tokenPath(), "utf-8").trim() || null;
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
    const raw = fs3.readFileSync(configPath(), "utf-8");
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
import * as fs4 from "node:fs";
import * as path2 from "node:path";
function deriveProjectKey(cwd) {
  try {
    const gitRoot = findGitRoot(cwd);
    if (gitRoot) {
      const configPath2 = resolveGitConfigPath(gitRoot);
      if (configPath2 && fs4.existsSync(configPath2)) {
        const remote = parseOriginRemote(fs4.readFileSync(configPath2, "utf-8"));
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
    if (fs4.existsSync(gitPath)) return dir;
    const parent = path2.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function resolveGitConfigPath(gitRoot) {
  const gitPath = path2.join(gitRoot, ".git");
  try {
    const stat = fs4.statSync(gitPath);
    if (stat.isDirectory()) {
      return path2.join(gitPath, "config");
    }
    if (stat.isFile()) {
      const contents = fs4.readFileSync(gitPath, "utf-8");
      const match = contents.match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      const gitdir = path2.resolve(gitRoot, match[1].trim());
      const commondirPath = path2.join(gitdir, "commondir");
      if (fs4.existsSync(commondirPath)) {
        const commondir = path2.resolve(
          gitdir,
          fs4.readFileSync(commondirPath, "utf-8").trim()
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
import * as fs5 from "node:fs";
import * as path3 from "node:path";
import * as crypto4 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  const safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim";
  const digest = crypto4.createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${safe}.${digest}`;
}
function prune(dir, stem, currentWindow) {
  try {
    for (const file of fs5.readdirSync(dir)) {
      if (!file.startsWith(`${stem}.`)) continue;
      const w = Number(file.slice(stem.length + 1));
      if (!Number.isFinite(w) || w > currentWindow - KEEP_WINDOWS) continue;
      try {
        fs5.unlinkSync(path3.join(dir, file));
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
    fs5.mkdirSync(dir, { recursive: true });
  } catch {
    return failOpen;
  }
  try {
    fs5.closeSync(fs5.openSync(target, "wx"));
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
import * as fs6 from "node:fs";
import * as path4 from "node:path";
import * as crypto5 from "node:crypto";
var GUIDANCE_TTL_MS = 10 * 60 * 1e3;
function cacheFile(projectKey) {
  const safe = projectKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unknown";
  const digest = crypto5.createHash("sha256").update(projectKey).digest("hex").slice(0, 8);
  return path4.join(guidanceDir(), `${safe}.${digest}.json`);
}
function readGuidanceCache(projectKey) {
  try {
    const parsed = JSON.parse(fs6.readFileSync(cacheFile(projectKey), "utf-8"));
    if (typeof parsed?.fetchedAt !== "number" || parsed.bundle === null || typeof parsed.bundle !== "object") {
      return null;
    }
    const b = parsed.bundle;
    return {
      fetchedAt: parsed.fetchedAt,
      bundle: {
        userFacts: typeof b.userFacts === "string" ? b.userFacts : "",
        subconscious: typeof b.subconscious === "string" ? b.subconscious : "",
        codingGuidance: typeof b.codingGuidance === "string" ? b.codingGuidance : "",
        projectKey: typeof b.projectKey === "string" ? b.projectKey : projectKey
      }
    };
  } catch {
    return null;
  }
}
function isGuidanceStale(cached, now = Date.now(), ttlMs = GUIDANCE_TTL_MS) {
  if (!cached) return true;
  const age = now - cached.fetchedAt;
  if (age < 0) return true;
  return age > ttlMs;
}

// plugins/mypenny-core/lib/background-refresh.ts
import { spawn } from "node:child_process";
import * as fs7 from "node:fs";
import * as path5 from "node:path";
import { fileURLToPath } from "node:url";
var REFRESH_CLAIM_WINDOW_MS = 6e4;
function resolveRefresherScript() {
  let here;
  try {
    here = path5.dirname(fileURLToPath(import.meta.url));
  } catch {
    return null;
  }
  const candidates = [
    path5.join(here, "refresh_guidance.mjs"),
    path5.join(here, "..", "scripts", "refresh_guidance.mjs"),
    path5.join(here, "..", "scripts", "refresh_guidance.ts")
  ];
  return candidates.find((script) => fs7.existsSync(script)) ?? null;
}
function interpreterArgs() {
  return process.execArgv.filter((flag) => !flag.startsWith("--inspect"));
}
function spawnGuidanceRefresh(projectKey, cwd) {
  const script = resolveRefresherScript();
  if (!script) return false;
  if (!claimWindow(`guidance-refresh:${projectKey}`, REFRESH_CLAIM_WINDOW_MS, void 0, false)) {
    return false;
  }
  try {
    const child = spawn(process.execPath, [...interpreterArgs(), script, cwd], {
      detached: true,
      stdio: "ignore",
      // Inherit env so MYPENNY_HOME / MYPENNY_TOKEN reach the child.
      env: process.env
    });
    child.on("error", () => {
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// plugins/mypenny-core/lib/memory-client.ts
var TIMEOUT_MS = 6e3;
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
  if (!token || !cfg) return null;
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
      return { unauthorized: response.status === 401, value: null };
    }
    const data = await response.json();
    if (data.error) {
      debugLog2(`[mypenny] MCP tool ${name} failed: ${data.error.message}`);
      return { unauthorized: false, value: null };
    }
    return {
      unauthorized: false,
      value: data.result?.content?.find((c) => c.type === "text")?.text ?? null
    };
  } catch (err) {
    debugLog2(
      `[mypenny] MCP tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { unauthorized: false, value: null };
  }
}
async function searchMemories(query, limit = 5, timeoutMs) {
  const raw = await callTool(
    "penny_search_notes",
    { query, limit, graphTraversal: false },
    timeoutMs
  );
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) => ({
      id: r.id ?? "",
      content: r.content ?? "",
      score: r.score ?? 0,
      tags: r.tags ?? []
    }));
  } catch {
    return [];
  }
}
function getCachedGuidanceForCwd(cwd) {
  const projectKey = deriveProjectKey(cwd);
  const cached = readGuidanceCache(projectKey);
  const refreshStarted = isGuidanceStale(cached) ? spawnGuidanceRefresh(projectKey, cwd) : false;
  return {
    guidance: cached?.bundle ?? {
      userFacts: "",
      subconscious: "",
      codingGuidance: "",
      projectKey
    },
    cacheHit: cached !== null,
    refreshStarted
  };
}

// plugins/mypenny-core/lib/format.ts
function formatInjection(guidance, memories) {
  const hasUser = guidance.userFacts.trim().length > 0;
  const hasSub = guidance.subconscious.trim().length > 0;
  const hasCoding = guidance.codingGuidance.trim().length > 0;
  const hasMem = memories.length > 0;
  if (!hasUser && !hasSub && !hasCoding && !hasMem) return "";
  let out = "<mypenny_subconscious>\n";
  if (hasUser) {
    out += `  <user_facts>
    ${guidance.userFacts.trim()}
  </user_facts>
`;
  }
  if (hasSub) {
    out += `  <project_subconscious key="${guidance.projectKey}">
    ${guidance.subconscious.trim()}
  </project_subconscious>
`;
  }
  if (hasCoding) {
    out += `  <coding_guidance>
    ${guidance.codingGuidance.trim()}
  </coding_guidance>
`;
  }
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
  for (const { regex } of PATTERNS) {
    scrubbed = scrubbed.replace(regex, "[REDACTED]");
  }
  return scrubbed;
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

// plugins/mypenny-core/scripts/sync_memory.ts
var DEBUG = process.env.MYPENNY_DEBUG === "1";
var debug = (...args) => {
  if (DEBUG) console.error("[mypenny:sync]", ...args);
};
var SEARCH_TIMEOUT_MS = 6e3;
var WATCHDOG_MS = 8e3;
var SKIP_PATTERNS = [
  /^\/\w+/,
  /^(yes|no|y|n|ok|sure|thanks|continue|go|lgtm|looks good|commit)$/i
];
function shouldSearch(prompt) {
  const trimmed = prompt.trim();
  if (trimmed.split(/\s+/).length < 3) return false;
  if (trimmed.length > 200) return false;
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  return true;
}
async function main() {
  if (process.env.MYPENNY_SUBCONSCIOUS === "off") return;
  if (!readToken()) return;
  const disarm = armWatchdog(WATCHDOG_MS);
  const raw = await readHookInput();
  const hookInput = normalizeHookInput(raw);
  if (!hookInput) return;
  const prompt = hookInput.prompt || "";
  debug("Prompt(scrubbed,80):", scrubCredentials(prompt.slice(0, 80)));
  const state = readState(hookInput.session_id);
  const cwd = hookInput.cwd ?? state?.projectPath ?? process.cwd();
  const { guidance, refreshStarted } = getCachedGuidanceForCwd(cwd);
  if (refreshStarted) debug("stale cache \u2014 refresh spawned");
  const memories = shouldSearch(prompt) ? await searchMemories(prompt, 5, SEARCH_TIMEOUT_MS) : [];
  const joined = joinBundle(guidance);
  const currentHash = joined ? hashContent(joined) : null;
  const guidanceChanged = !state || state.guidanceHash !== currentHash;
  const effectiveGuidance = guidanceChanged ? guidance : { userFacts: "", subconscious: "", codingGuidance: "", projectKey: guidance.projectKey };
  disarm();
  const output = formatInjection(effectiveGuidance, memories);
  if (output) console.log(output);
  if (state && currentHash !== null && currentHash !== state.guidanceHash) {
    writeState({ ...state, guidanceHash: currentHash });
  }
}
main().catch((err) => {
  if (DEBUG) console.error("[mypenny:sync] error:", err);
  process.exit(0);
});
