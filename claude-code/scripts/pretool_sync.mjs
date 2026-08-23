
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

// plugins/mypenny-core/lib/auth-health.ts
var RETRY_PENDING_HORIZON_MS = 12 * 60 * 1e3;
var REJECTED_BACKOFF_MS = 6 * 60 * 60 * 1e3;
var REPAIR_EVIDENCE_HORIZON_MS = 24 * 60 * 60 * 1e3;

// plugins/mypenny-core/lib/auth-store.ts
function readToken() {
  const envToken = process.env.MYPENNY_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return fs2.readFileSync(tokenPath(), "utf-8").trim() || null;
  } catch {
    return null;
  }
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
import * as crypto2 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  const safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim";
  const digest = crypto2.createHash("sha256").update(name).digest("hex").slice(0, 8);
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
var PROACTIVE_ROTATION_WINDOW_MS = 6 * 60 * 60 * 1e3;
var ROTATION_RETRY_WINDOW_MS = 2 * 60 * 1e3;
var RENEW_AFTER_FRACTION = 2 / 3;

// plugins/mypenny-core/lib/guidance-cache.ts
import * as fs5 from "node:fs";
import * as path4 from "node:path";
import * as crypto3 from "node:crypto";
var GUIDANCE_TTL_MS = 10 * 60 * 1e3;
function cacheFile(projectKey) {
  const safe = projectKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unknown";
  const digest = crypto3.createHash("sha256").update(projectKey).digest("hex").slice(0, 8);
  return path4.join(guidanceDir(), `${safe}.${digest}.json`);
}
function readGuidanceCache(projectKey) {
  try {
    const parsed = JSON.parse(fs5.readFileSync(cacheFile(projectKey), "utf-8"));
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
import * as fs6 from "node:fs";
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
  return candidates.find((script) => fs6.existsSync(script)) ?? null;
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

// plugins/mypenny-core/scripts/pretool_sync.ts
var DEBUG = process.env.MYPENNY_DEBUG === "1";
var debug = (...args) => {
  if (DEBUG) console.error("[mypenny:pretool]", ...args);
};
var WATCHDOG_MS = 3e3;
var INJECT_CLAIM_MS = 1e4;
async function main() {
  if (process.env.MYPENNY_SUBCONSCIOUS === "off") return;
  if (!readToken()) return;
  const disarm = armWatchdog(WATCHDOG_MS);
  const raw = await readHookInput();
  const hookInput = normalizeHookInput(raw);
  if (!hookInput) return;
  const state = readState(hookInput.session_id);
  if (!state) return;
  const cwd = hookInput.cwd ?? state.projectPath;
  const { guidance, cacheHit, refreshStarted } = getCachedGuidanceForCwd(cwd);
  if (refreshStarted) debug("stale cache \u2014 refresh spawned");
  if (!cacheHit) {
    debug("cold cache \u2014 nothing to inject");
    return;
  }
  const joined = joinBundle(guidance);
  const currentHash = joined ? hashContent(joined) : null;
  if (currentHash === state.guidanceHash) {
    debug("guidance unchanged");
    return;
  }
  if (!claimWindow(`guidance-inject:${hookInput.session_id}:${currentHash}`, INJECT_CLAIM_MS, void 0, false)) {
    debug("another concurrent hook is injecting this same guidance");
    return;
  }
  debug(`guidance changed (project=${guidance.projectKey}), injecting update`);
  disarm();
  const output = formatGuidanceUpdate(guidance);
  if (output) {
    console.log(JSON.stringify({ additionalContext: output }));
  }
  writeState({ ...state, guidanceHash: currentHash });
}
main().catch((err) => {
  if (DEBUG) console.error("[mypenny:pretool] error:", err);
  process.exit(0);
});
