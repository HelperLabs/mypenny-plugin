
// plugins/mypenny-core/lib/auth-store.ts
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
function guidanceDir() {
  return path.join(mypennyDir(), "guidance");
}
function claimsDir() {
  return path.join(mypennyDir(), "claims");
}

// plugins/mypenny-core/lib/auth-store.ts
var DEFAULT_BASE_URL = "https://engine.mypenny.ai";
function ensureDir() {
  fs.mkdirSync(mypennyDir(), { recursive: true });
}
function atomicWrite(target, contents, mode) {
  ensureDir();
  const tmp = `${target}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, contents, { mode });
  fs.renameSync(tmp, target);
  if (process.platform !== "win32") {
    fs.chmodSync(target, mode);
  }
}
function readToken() {
  const envToken = process.env.MYPENNY_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return fs.readFileSync(tokenPath(), "utf-8").trim() || null;
  } catch {
    return null;
  }
}
function writeToken(token) {
  atomicWrite(tokenPath(), token.trim(), 384);
}
function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return readEnvConfig();
  }
}
function writeConfig(cfg) {
  atomicWrite(configPath(), JSON.stringify(cfg, null, 2) + "\n", 420);
}
function writeTokenExpiry(expiresAt) {
  const cfg = readConfig();
  if (!cfg) return;
  const next = { ...cfg };
  if (expiresAt === void 0) delete next.tokenExpiresAt;
  else next.tokenExpiresAt = expiresAt;
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
import * as fs2 from "node:fs";
import * as path2 from "node:path";
function deriveProjectKey(cwd) {
  try {
    const gitRoot = findGitRoot(cwd);
    if (gitRoot) {
      const configPath2 = resolveGitConfigPath(gitRoot);
      if (configPath2 && fs2.existsSync(configPath2)) {
        const remote = parseOriginRemote(fs2.readFileSync(configPath2, "utf-8"));
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
    if (fs2.existsSync(gitPath)) return dir;
    const parent = path2.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function resolveGitConfigPath(gitRoot) {
  const gitPath = path2.join(gitRoot, ".git");
  try {
    const stat = fs2.statSync(gitPath);
    if (stat.isDirectory()) {
      return path2.join(gitPath, "config");
    }
    if (stat.isFile()) {
      const contents = fs2.readFileSync(gitPath, "utf-8");
      const match = contents.match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      const gitdir = path2.resolve(gitRoot, match[1].trim());
      const commondirPath = path2.join(gitdir, "commondir");
      if (fs2.existsSync(commondirPath)) {
        const commondir = path2.resolve(
          gitdir,
          fs2.readFileSync(commondirPath, "utf-8").trim()
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
import * as fs3 from "node:fs";
import * as path3 from "node:path";
import * as crypto2 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  const safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim";
  const digest = crypto2.createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${safe}.${digest}`;
}
function prune(dir, stem, currentWindow) {
  try {
    for (const file of fs3.readdirSync(dir)) {
      if (!file.startsWith(`${stem}.`)) continue;
      const w = Number(file.slice(stem.length + 1));
      if (!Number.isFinite(w) || w > currentWindow - KEEP_WINDOWS) continue;
      try {
        fs3.unlinkSync(path3.join(dir, file));
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
    fs3.mkdirSync(dir, { recursive: true });
  } catch {
    return failOpen;
  }
  try {
    fs3.closeSync(fs3.openSync(target, "wx"));
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
    return now >= cfg.tokenExpiresAt - (cfg.tokenExpiresAt - now) / 2;
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
    if (!response.ok) return null;
    const data = await response.json();
    const next = typeof data.access_token === "string" ? data.access_token.trim() : "";
    if (!next.startsWith("mpt_")) return null;
    writeToken(next);
    const expiresIn = typeof data.expires_in === "number" && Number.isFinite(data.expires_in) ? data.expires_in : void 0;
    writeTokenExpiry(
      expiresIn === void 0 ? void 0 : Date.now() + expiresIn * 1e3
    );
    return next;
  } catch {
    return null;
  }
}
async function withTokenRotation(attempt, token, timeoutMs) {
  let active = token;
  if (!tokenIsEnvPinned() && renewalIsDue(readConfig(), Date.now()) && claimWindow("token-rotate", PROACTIVE_ROTATION_WINDOW_MS)) {
    const renewed = await rotateToken(timeoutMs);
    if (renewed) active = renewed;
  }
  const first = await attempt(active);
  if (!first.unauthorized) return first.value;
  const rotated = await rotateToken(timeoutMs);
  if (!rotated) return first.value;
  const second = await attempt(rotated);
  return second.value;
}

// plugins/mypenny-core/lib/guidance-cache.ts
import * as fs4 from "node:fs";
import * as path4 from "node:path";
import * as crypto3 from "node:crypto";
var GUIDANCE_TTL_MS = 10 * 60 * 1e3;
function cacheFile(projectKey) {
  const safe = projectKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unknown";
  const digest = crypto3.createHash("sha256").update(projectKey).digest("hex").slice(0, 8);
  return path4.join(guidanceDir(), `${safe}.${digest}.json`);
}
function writeGuidanceCache(projectKey, bundle, now = Date.now()) {
  try {
    fs4.mkdirSync(guidanceDir(), { recursive: true });
    const target = cacheFile(projectKey);
    const tmp = `${target}.${crypto3.randomUUID()}.tmp`;
    const payload = { bundle, fetchedAt: now };
    fs4.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    try {
      fs4.renameSync(tmp, target);
    } catch (err) {
      try {
        fs4.unlinkSync(tmp);
      } catch {
      }
      throw err;
    }
  } catch {
  }
}

// plugins/mypenny-core/lib/memory-client.ts
var TIMEOUT_MS = 6e3;
function debugEnabled() {
  const value = process.env.MYPENNY_DEBUG?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
function debugLog(message) {
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
      debugLog(`[mypenny] MCP tool ${name} failed: HTTP ${response.status}`);
      return { unauthorized: response.status === 401, value: null };
    }
    const data = await response.json();
    if (data.error) {
      debugLog(`[mypenny] MCP tool ${name} failed: ${data.error.message}`);
      return { unauthorized: false, value: null };
    }
    return {
      unauthorized: false,
      value: data.result?.content?.find((c) => c.type === "text")?.text ?? null
    };
  } catch (err) {
    debugLog(
      `[mypenny] MCP tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { unauthorized: false, value: null };
  }
}
async function fetchCoreMemoryBlocks(projectKey, timeoutMs) {
  const raw = await callTool(
    "penny_get_profile",
    {
      projectKey,
      blockNames: ["user_facts", "coding_guidance", `subconscious:${projectKey}`]
    },
    timeoutMs
  );
  if (raw === null) return { blocks: [], ok: false };
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
    return { blocks: [...byName.values()], ok: true };
  } catch {
    return { blocks: [], ok: false };
  }
}
async function fetchGuidance(cwd, timeoutMs) {
  const projectKey = deriveProjectKey(cwd);
  const { blocks, ok } = await fetchCoreMemoryBlocks(projectKey, timeoutMs);
  return {
    ok,
    guidance: {
      userFacts: blocks.find((b) => b.blockName === "user_facts")?.content ?? "",
      subconscious: blocks.find((b) => b.blockName === `subconscious:${projectKey}`)?.content ?? "",
      codingGuidance: blocks.find((b) => b.blockName === "coding_guidance")?.content ?? "",
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
