
// plugins/mypenny-code-core/lib/hook-input.ts
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

// plugins/mypenny-code-core/lib/state.ts
import * as fs from "node:fs";
import * as crypto from "node:crypto";

// plugins/mypenny-code-core/lib/paths.ts
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

// plugins/mypenny-code-core/lib/state.ts
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

// plugins/mypenny-code-core/lib/auth-store.ts
import * as fs2 from "node:fs";
var DEFAULT_BASE_URL = "https://engine.mypenny.ai";
function readToken() {
  const envToken = process.env.MYPENNY_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return fs2.readFileSync(tokenPath(), "utf-8").trim() || null;
  } catch {
    return null;
  }
}
function readConfig() {
  try {
    const raw = fs2.readFileSync(configPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return readEnvConfig();
  }
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

// plugins/mypenny-code-core/lib/project-key.ts
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

// plugins/mypenny-code-core/lib/workspace.ts
var CONVEX_ID_RE = /^[A-Za-z0-9:_-]{8,128}$/;
function isLikelyConvexId(value) {
  return CONVEX_ID_RE.test(value);
}
function debugEnabled() {
  const value = process.env.MYPENNY_DEBUG?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
function configuredWorkspaceId() {
  const workspaceId = process.env.MYPENNY_WORKSPACE_ID?.trim();
  if (!workspaceId) return void 0;
  if (isLikelyConvexId(workspaceId)) return workspaceId;
  if (debugEnabled()) {
    console.error(
      "[mypenny] ignoring malformed MYPENNY_WORKSPACE_ID; expected a Convex sharedWorkspaces id"
    );
  }
  return void 0;
}
function debugLog(message) {
  if (debugEnabled()) console.error(message);
}

// plugins/mypenny-code-core/lib/memory-client.ts
var TIMEOUT_MS = 8e3;
function withConfiguredWorkspace(args) {
  const workspaceId = configuredWorkspaceId();
  return workspaceId ? { ...args, workspaceId } : args;
}
async function callTool(name, args) {
  const token = readToken();
  const cfg = readConfig();
  if (!token || !cfg) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(cfg.memoryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name, arguments: withConfiguredWorkspace(args) },
        id: Date.now()
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) {
      debugLog(`[mypenny] MCP tool ${name} failed: HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    if (data.error) {
      debugLog(`[mypenny] MCP tool ${name} failed: ${data.error.message}`);
      return null;
    }
    return data.result?.content?.find((c) => c.type === "text")?.text ?? null;
  } catch (err) {
    debugLog(
      `[mypenny] MCP tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
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
    const blocks = [];
    for (const b of parsed.global ?? []) {
      blocks.push({ blockName: b.blockName, content: b.content || "" });
    }
    return blocks;
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

// plugins/mypenny-code-core/lib/format.ts
function formatGuidanceUpdate(guidance) {
  const hasUser = guidance.userFacts.trim().length > 0;
  const hasSub = guidance.subconscious.trim().length > 0;
  const hasCoding = guidance.codingGuidance.trim().length > 0;
  if (!hasUser && !hasSub && !hasCoding) return "";
  let inner = "";
  if (hasUser) inner += `  <user_facts>
    ${guidance.userFacts.trim()}
  </user_facts>
`;
  if (hasSub) inner += `  <project_subconscious key="${guidance.projectKey}">
    ${guidance.subconscious.trim()}
  </project_subconscious>
`;
  if (hasCoding) inner += `  <coding_guidance>
    ${guidance.codingGuidance.trim()}
  </coding_guidance>
`;
  return `<mypenny_subconscious_update>
${inner}</mypenny_subconscious_update>`;
}

// plugins/mypenny-code-core/scripts/pretool_sync.ts
var DEBUG = process.env.MYPENNY_DEBUG === "1";
var RATE_LIMIT_MS = 3e4;
var debug = (...args) => {
  if (DEBUG) console.error("[mypenny:pretool]", ...args);
};
async function main() {
  if (process.env.MYPENNY_SUBCONSCIOUS === "off") return;
  if (!readToken()) return;
  const raw = await readHookInput();
  const hookInput = normalizeHookInput(raw);
  if (!hookInput) return;
  const state = readState(hookInput.session_id);
  if (!state) return;
  const now = Date.now();
  if (state.lastCheckTime && now - state.lastCheckTime < RATE_LIMIT_MS) {
    debug("rate-limited");
    return;
  }
  writeState({ ...state, lastCheckTime: now });
  const guidance = await getGuidanceForCwd(state.projectPath);
  const joined = joinBundle(guidance);
  const currentHash = joined ? hashContent(joined) : null;
  if (currentHash === state.guidanceHash) {
    debug("guidance unchanged");
    return;
  }
  debug(`guidance changed (project=${guidance.projectKey}), injecting update`);
  const output = formatGuidanceUpdate(guidance);
  if (output) {
    console.log(JSON.stringify({ additionalContext: output }));
  }
  writeState({ ...state, lastCheckTime: now, guidanceHash: currentHash });
}
main().catch((err) => {
  if (DEBUG) console.error("[mypenny:pretool] error:", err);
  process.exit(0);
});
