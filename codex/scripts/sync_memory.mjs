
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
        params: { name, arguments: args },
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
async function searchMemories(query, limit = 5) {
  const raw = await callTool("penny_search_notes", { query, limit });
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

// plugins/mypenny-core/scripts/sync_memory.ts
var DEBUG = process.env.MYPENNY_DEBUG === "1";
var debug = (...args) => {
  if (DEBUG) console.error("[mypenny:sync]", ...args);
};
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
  const raw = await readHookInput();
  const hookInput = normalizeHookInput(raw);
  if (!hookInput) return;
  const prompt = hookInput.prompt || "";
  debug("Prompt(scrubbed,80):", scrubCredentials(prompt.slice(0, 80)));
  const state = readState(hookInput.session_id);
  const cwd = hookInput.cwd ?? state?.projectPath ?? process.cwd();
  const doSearch = shouldSearch(prompt);
  const [guidance, memories] = await Promise.all([
    getGuidanceForCwd(cwd),
    doSearch ? searchMemories(prompt, 5) : Promise.resolve([])
  ]);
  const joined = joinBundle(guidance);
  const currentHash = joined ? hashContent(joined) : null;
  const guidanceChanged = !state || state.guidanceHash !== currentHash;
  const effectiveGuidance = guidanceChanged ? guidance : { userFacts: "", subconscious: "", codingGuidance: "", projectKey: guidance.projectKey };
  const output = formatInjection(effectiveGuidance, memories);
  if (output) console.log(output);
  if (state && currentHash !== state.guidanceHash) {
    writeState({ ...state, guidanceHash: currentHash });
  }
}
main().catch((err) => {
  if (DEBUG) console.error("[mypenny:sync] error:", err);
  process.exit(0);
});
