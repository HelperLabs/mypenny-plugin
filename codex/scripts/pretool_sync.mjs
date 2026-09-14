
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
  return out;
}

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

// plugins/mypenny-core/lib/diag.ts
var MAX_BYTES = 256 * 1024, diagContext = {};
function setDiagContext(context) {
  diagContext = { ...diagContext, ...context };
}

// plugins/mypenny-core/lib/state.ts
import * as fs from "node:fs";
import * as crypto from "node:crypto";
var STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1e3, CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1e3;
function ensureSessionsDir() {
  fs.mkdirSync(sessionsDir(), { recursive: !0 });
}
function readState(sessionId) {
  try {
    let data = fs.readFileSync(sessionPath(sessionId), "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
function writeState(state) {
  ensureSessionsDir();
  let target = sessionPath(state.sessionId), tmp = `${target}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2)), fs.renameSync(tmp, target);
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

// plugins/mypenny-core/lib/auth-store.ts
import * as fs2 from "node:fs";

// plugins/mypenny-core/lib/auth-health.ts
var RETRY_PENDING_HORIZON_MS = 12 * 60 * 1e3, REJECTED_BACKOFF_MS = 6 * 60 * 60 * 1e3;
var REPAIR_EVIDENCE_HORIZON_MS = 24 * 60 * 60 * 1e3;

// plugins/mypenny-core/lib/auth-store.ts
var DEFAULT_BASE_URL = buildBaseUrl();
function readToken() {
  let envToken = process.env.MYPENNY_TOKEN?.trim();
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
    let gitRoot = findGitRoot(cwd);
    if (gitRoot) {
      let configPath2 = resolveGitConfigPath(gitRoot);
      if (configPath2 && fs3.existsSync(configPath2)) {
        let remote = parseOriginRemote(fs3.readFileSync(configPath2, "utf-8"));
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
    let gitPath = path2.join(dir, ".git");
    if (fs3.existsSync(gitPath)) return dir;
    let parent = path2.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function resolveGitConfigPath(gitRoot) {
  let gitPath = path2.join(gitRoot, ".git");
  try {
    let stat = fs3.statSync(gitPath);
    if (stat.isDirectory())
      return path2.join(gitPath, "config");
    if (stat.isFile()) {
      let match = fs3.readFileSync(gitPath, "utf-8").match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      let gitdir = path2.resolve(gitRoot, match[1].trim()), commondirPath = path2.join(gitdir, "commondir");
      if (fs3.existsSync(commondirPath)) {
        let commondir = path2.resolve(
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
    if (urlMatch) return extractRepoName(urlMatch[1]);
  }
  return null;
}
function extractRepoName(url) {
  return url.trim().replace(/\.git$/, "").split(/[/:]/).pop() || null;
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
  let safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim", digest = crypto2.createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${safe}.${digest}`;
}
function prune(dir, stem, currentWindow) {
  try {
    for (let file of fs4.readdirSync(dir)) {
      if (!file.startsWith(`${stem}.`)) continue;
      let w = Number(file.slice(stem.length + 1));
      if (!(!Number.isFinite(w) || w > currentWindow - KEEP_WINDOWS))
        try {
          fs4.unlinkSync(path3.join(dir, file));
        } catch {
        }
    }
  } catch {
  }
}
function claimWindow(name, windowMs, now = Date.now(), failOpen = !0) {
  let dir = claimsDir(), stem = claimStem(name), window = Math.floor(now / windowMs), target = path3.join(dir, `${stem}.${window}`);
  try {
    fs4.mkdirSync(dir, { recursive: !0 });
  } catch {
    return failOpen;
  }
  try {
    fs4.closeSync(fs4.openSync(target, "wx"));
  } catch (err) {
    return err?.code === "EEXIST" ? !1 : failOpen;
  }
  return prune(dir, stem, window), !0;
}

// plugins/mypenny-core/lib/token-rotation.ts
var PROACTIVE_ROTATION_WINDOW_MS = 6 * 60 * 60 * 1e3, ROTATION_RETRY_WINDOW_MS = 2 * 60 * 1e3, RENEW_AFTER_FRACTION = 2 / 3;

// plugins/mypenny-core/lib/guidance-cache.ts
import * as fs5 from "node:fs";
import * as path4 from "node:path";
import * as crypto3 from "node:crypto";
var GUIDANCE_TTL_MS = 10 * 60 * 1e3;
function cacheFile(projectKey) {
  let safe = projectKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unknown", digest = crypto3.createHash("sha256").update(projectKey).digest("hex").slice(0, 8);
  return path4.join(guidanceDir(), `${safe}.${digest}.json`);
}
function readGuidanceCache(projectKey) {
  try {
    let parsed = JSON.parse(fs5.readFileSync(cacheFile(projectKey), "utf-8"));
    if (typeof parsed?.fetchedAt != "number" || parsed.bundle === null || typeof parsed.bundle != "object")
      return null;
    let b = parsed.bundle, preUpgrade = typeof b.memoryPolicy != "string" || typeof b.persona != "string" || typeof b.preferences != "string" || typeof b.contract != "string", str = (v) => typeof v == "string" ? v : "";
    return {
      fetchedAt: preUpgrade ? Number.NEGATIVE_INFINITY : parsed.fetchedAt,
      bundle: {
        userFacts: str(b.userFacts),
        subconscious: str(b.subconscious),
        codingGuidance: str(b.codingGuidance),
        memoryPolicy: str(b.memoryPolicy),
        persona: str(b.persona),
        preferences: str(b.preferences),
        contract: str(b.contract),
        projectKey: typeof b.projectKey == "string" ? b.projectKey : projectKey
      }
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
  return [
    path5.join(here, "refresh_guidance.mjs"),
    path5.join(here, "..", "scripts", "refresh_guidance.mjs"),
    path5.join(here, "..", "scripts", "refresh_guidance.ts")
  ].find((script) => fs6.existsSync(script)) ?? null;
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
function formatGuidanceUpdate(guidance) {
  let inner = renderBlocks(guidance);
  return inner.length === 0 ? "" : `<mypenny_subconscious_update>
${inner}</mypenny_subconscious_update>`;
}

// plugins/mypenny-core/lib/memory-client.ts
function getCachedGuidanceForCwd(cwd) {
  let projectKey = deriveProjectKey(cwd), cached = readGuidanceCache(projectKey), refreshStarted = isGuidanceStale(cached) ? spawnGuidanceRefresh(projectKey, cwd) : !1;
  return {
    guidance: cached?.bundle ?? emptyGuidance(projectKey),
    cacheHit: cached !== null,
    refreshStarted
  };
}

// plugins/mypenny-core/lib/watchdog.ts
function armWatchdog(budgetMs, exitCode = 0) {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) return () => {
  };
  let timer = setTimeout(() => {
    process.exit(exitCode);
  }, budgetMs);
  return timer.unref?.(), () => clearTimeout(timer);
}

// plugins/mypenny-core/scripts/pretool_sync.ts
var DEBUG = process.env.MYPENNY_DEBUG === "1", debug = (...args) => {
  DEBUG && console.error("[mypenny:pretool]", ...args);
}, WATCHDOG_MS = 3e3, INJECT_CLAIM_MS = 1e4;
async function main() {
  if (process.env.MYPENNY_SUBCONSCIOUS === "off" || !readToken()) return;
  let disarm = armWatchdog(WATCHDOG_MS), raw = await readHookInput(), hookInput = normalizeHookInput(raw);
  if (!hookInput) return;
  setDiagContext({ hook: "pre_tool_use", sessionId: hookInput.session_id });
  let state = readState(hookInput.session_id);
  if (!state) return;
  let cwd = hookInput.cwd ?? state.projectPath, { guidance, cacheHit, refreshStarted } = getCachedGuidanceForCwd(cwd);
  if (refreshStarted && debug("stale cache \u2014 refresh spawned"), !cacheHit) {
    debug("cold cache \u2014 nothing to inject");
    return;
  }
  let joined = joinBundle(guidance), currentHash = joined ? hashContent(joined) : null;
  if (currentHash === state.guidanceHash) {
    debug("guidance unchanged");
    return;
  }
  if (!claimWindow(`guidance-inject:${hookInput.session_id}:${currentHash}`, INJECT_CLAIM_MS, void 0, !1)) {
    debug("another concurrent hook is injecting this same guidance");
    return;
  }
  debug(`guidance changed (project=${guidance.projectKey}), injecting update`), disarm();
  let output = formatGuidanceUpdate(guidance);
  output && console.log(JSON.stringify({ additionalContext: output })), writeState({ ...state, guidanceHash: currentHash });
}
main().catch((err) => {
  DEBUG && console.error("[mypenny:pretool] error:", err), process.exit(0);
});
