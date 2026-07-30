
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
import * as path2 from "node:path";
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
function versionCheckPath() {
  return path.join(mypennyDir(), "version-check.json");
}

// plugins/mypenny-core/lib/state.ts
var STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1e3;
var CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1e3;
function ensureSessionsDir() {
  fs.mkdirSync(sessionsDir(), { recursive: true });
}
function cleanupMarkerPath() {
  return path2.join(mypennyDir(), "last_cleanup");
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
  if (!g.userFacts && !g.subconscious && !g.codingGuidance) return "";
  return `${g.userFacts}\0${g.subconscious}\0${g.codingGuidance}`;
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
      const data = fs.readFileSync(cleanupMarkerPath(), "utf-8");
      lastCleanup = parseInt(data, 10);
    } catch {
    }
    if (Date.now() - lastCleanup < CLEANUP_INTERVAL_MS) return;
    fs.mkdirSync(path2.dirname(cleanupMarkerPath()), { recursive: true });
    fs.writeFileSync(cleanupMarkerPath(), String(Date.now()));
    if (!fs.existsSync(sessionsDir())) return;
    const files = fs.readdirSync(sessionsDir());
    const now = Date.now();
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path2.join(sessionsDir(), file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > STALE_THRESHOLD_MS) {
          fs.unlinkSync(filePath);
        }
      } catch {
      }
    }
  } catch {
  }
}

// plugins/mypenny-core/lib/auth-store.ts
import * as fs2 from "node:fs";
import * as crypto2 from "node:crypto";
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
import * as fs3 from "node:fs";
import * as path3 from "node:path";
function deriveProjectKey(cwd) {
  try {
    const gitRoot = findGitRoot(cwd);
    if (gitRoot) {
      const configPath2 = resolveGitConfigPath(gitRoot);
      if (configPath2 && fs3.existsSync(configPath2)) {
        const remote = parseOriginRemote(fs3.readFileSync(configPath2, "utf-8"));
        if (remote) return sanitizeKey(remote);
      }
      return sanitizeKey(path3.basename(gitRoot));
    }
  } catch {
  }
  return sanitizeKey(path3.basename(cwd));
}
function findGitRoot(start) {
  let dir = start;
  for (let i = 0; i < 32; i++) {
    const gitPath = path3.join(dir, ".git");
    if (fs3.existsSync(gitPath)) return dir;
    const parent = path3.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function resolveGitConfigPath(gitRoot) {
  const gitPath = path3.join(gitRoot, ".git");
  try {
    const stat = fs3.statSync(gitPath);
    if (stat.isDirectory()) {
      return path3.join(gitPath, "config");
    }
    if (stat.isFile()) {
      const contents = fs3.readFileSync(gitPath, "utf-8");
      const match = contents.match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      const gitdir = path3.resolve(gitRoot, match[1].trim());
      const commondirPath = path3.join(gitdir, "commondir");
      if (fs3.existsSync(commondirPath)) {
        const commondir = path3.resolve(
          gitdir,
          fs3.readFileSync(commondirPath, "utf-8").trim()
        );
        return path3.join(commondir, "config");
      }
      return path3.join(gitdir, "config");
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

// plugins/mypenny-core/lib/token-rotation.ts
var ROTATION_TIMEOUT_MS = 8e3;
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
async function rotateToken() {
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
    const timer = setTimeout(() => controller.abort(), ROTATION_TIMEOUT_MS);
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
async function withTokenRotation(attempt, token) {
  let active = token;
  if (!tokenIsEnvPinned() && renewalIsDue(readConfig(), Date.now())) {
    const renewed = await rotateToken();
    if (renewed) active = renewed;
  }
  const first = await attempt(active);
  if (!first.unauthorized) return first.value;
  const rotated = await rotateToken();
  if (!rotated) return first.value;
  const second = await attempt(rotated);
  return second.value;
}

// plugins/mypenny-core/lib/memory-client.ts
var TIMEOUT_MS = 8e3;
function debugEnabled() {
  const value = process.env.MYPENNY_DEBUG?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
function debugLog(message) {
  if (debugEnabled()) console.error(message);
}
async function callTool(name, args) {
  const token = readToken();
  const cfg = readConfig();
  if (!token || !cfg) return null;
  return withTokenRotation(
    (bearer) => callToolOnce(name, args, bearer, cfg.memoryUrl),
    token
  );
}
async function callToolOnce(name, args, token, memoryUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
async function getCoreMemoryBlocks(projectKey) {
  const raw = await callTool("penny_get_profile", {
    projectKey,
    blockNames: ["user_facts", "coding_guidance", `subconscious:${projectKey}`]
  });
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const byName = /* @__PURE__ */ new Map();
    for (const group of [parsed.global, parsed.workspace]) {
      if (!Array.isArray(group)) continue;
      for (const b of group) {
        if (typeof b?.blockName !== "string") continue;
        byName.set(b.blockName, {
          blockName: b.blockName,
          content: b.content || ""
        });
      }
    }
    return [...byName.values()];
  } catch {
    return [];
  }
}
async function getGuidanceForCwd(cwd) {
  const projectKey = deriveProjectKey(cwd);
  const blocks = await getCoreMemoryBlocks(projectKey);
  return {
    userFacts: blocks.find((b) => b.blockName === "user_facts")?.content ?? "",
    subconscious: blocks.find((b) => b.blockName === `subconscious:${projectKey}`)?.content ?? "",
    codingGuidance: blocks.find((b) => b.blockName === "coding_guidance")?.content ?? "",
    projectKey
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

// plugins/mypenny-core/lib/version-check.ts
import * as fs4 from "node:fs";
import * as path4 from "node:path";
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
      const raw = fs4.readFileSync(path4.join(root, ...sub), "utf8");
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
  let dir = fromDir ?? path4.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    candidates.push(dir);
    const parent = path4.dirname(dir);
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
    const parsed = JSON.parse(fs4.readFileSync(versionCheckPath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeCache(cache) {
  try {
    fs4.mkdirSync(path4.dirname(versionCheckPath()), { recursive: true });
    fs4.writeFileSync(versionCheckPath(), JSON.stringify(cache), { mode: 384 });
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

// plugins/mypenny-core/scripts/session_start.ts
import { fileURLToPath as fileURLToPath2 } from "node:url";
import * as path5 from "node:path";
var DEBUG = process.env.MYPENNY_DEBUG === "1";
var debug = (...args) => {
  if (DEBUG) console.error("[mypenny:session_start]", ...args);
};
async function main() {
  if (process.env.MYPENNY_SUBCONSCIOUS === "off") return;
  const raw = await readHookInput();
  const hookInput = normalizeHookInput(raw);
  if (!hookInput) return;
  if (!readToken()) {
    const authScript = path5.join(path5.dirname(fileURLToPath2(import.meta.url)), "auth_login.mjs");
    process.stderr.write(
      `[mypenny] plugin not authenticated. Run: node "${authScript}"
`
    );
    return;
  }
  debug("Session start:", hookInput.session_id, hookInput.cwd);
  if (!readState(hookInput.session_id)) {
    createState(hookInput.session_id, hookInput.cwd);
  }
  cleanupStaleSessions();
  const guidance = await getGuidanceForCwd(hookInput.cwd);
  debug(
    `Guidance: project=${guidance.projectKey} user=${guidance.userFacts.length}b sub=${guidance.subconscious.length}b coding=${guidance.codingGuidance.length}b`
  );
  const output = formatInjection(guidance, []);
  if (output) console.log(output);
  const state = readState(hookInput.session_id);
  if (state) writeState(withGuidanceHash(state, guidance));
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
