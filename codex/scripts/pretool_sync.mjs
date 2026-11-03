
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
import * as crypto from "node:crypto";
var STALE_THRESHOLD_MS = 10080 * 60 * 1e3, OFF_RECORD_THRESHOLD_MS = 2160 * 60 * 60 * 1e3, CLEANUP_INTERVAL_MS = 1440 * 60 * 1e3;
function ensureSessionsDir() {
  fs2.mkdirSync(sessionsDir(), { recursive: !0 });
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
import * as fs3 from "node:fs";

// plugins/mypenny-core/lib/auth-health.ts
var RETRY_PENDING_HORIZON_MS = 720 * 1e3, REJECTED_BACKOFF_MS = 360 * 60 * 1e3;
var REPAIR_EVIDENCE_HORIZON_MS = 1440 * 60 * 1e3;

// plugins/mypenny-core/lib/auth-store.ts
var DEFAULT_BASE_URL = buildBaseUrl();
function readToken() {
  let envToken = process.env.MYPENNY_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return fs3.readFileSync(tokenPath(), "utf-8").trim() || null;
  } catch {
    return null;
  }
}

// plugins/mypenny-core/lib/project-key.ts
import * as crypto2 from "node:crypto";
import * as fs4 from "node:fs";
import * as path3 from "node:path";
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
      if (configPath2 && fs4.existsSync(configPath2)) {
        let url = parseOriginUrl(fs4.readFileSync(configPath2, "utf-8"));
        if (url) {
          let repo = extractRepoPath(url);
          if (repo?.hostAndPath) return { hostAndPath: !0, path: repo.path };
          if (repo) return { hostAndPath: !1, key: sanitizeKey(repo.path) };
        }
      }
      return { hostAndPath: !1, key: sanitizeKey(path3.basename(gitRoot)) };
    }
  } catch {
  }
  return { hostAndPath: !1, key: sanitizeKey(path3.basename(cwd)) };
}
function findGitRoot(start) {
  let dir = start;
  for (let i = 0; i < 32; i++) {
    let gitPath = path3.join(dir, ".git");
    if (fs4.existsSync(gitPath)) return dir;
    let parent = path3.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function resolveGitConfigPath(gitRoot) {
  let gitPath = path3.join(gitRoot, ".git");
  try {
    let stat = fs4.statSync(gitPath);
    if (stat.isDirectory())
      return path3.join(gitPath, "config");
    if (stat.isFile()) {
      let match = fs4.readFileSync(gitPath, "utf-8").match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      let gitdir = path3.resolve(gitRoot, match[1].trim()), commondirPath = path3.join(gitdir, "commondir");
      if (fs4.existsSync(commondirPath)) {
        let commondir = path3.resolve(
          gitdir,
          fs4.readFileSync(commondirPath, "utf-8").trim()
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
  return crypto2.createHash("sha256").update(hostAndPath.toLowerCase()).digest("hex").slice(0, 8);
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
import * as fs5 from "node:fs";
import * as path4 from "node:path";
import * as crypto3 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  let safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim", digest = crypto3.createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${safe}.${digest}`;
}
function prune(dir, stem, currentWindow) {
  try {
    for (let file of fs5.readdirSync(dir)) {
      if (!file.startsWith(`${stem}.`)) continue;
      let w = Number(file.slice(stem.length + 1));
      if (!(!Number.isFinite(w) || w > currentWindow - KEEP_WINDOWS))
        try {
          fs5.unlinkSync(path4.join(dir, file));
        } catch {
        }
    }
  } catch {
  }
}
function claimWindow(name, windowMs, now = Date.now(), failOpen = !0) {
  let dir = claimsDir(), stem = claimStem(name), window = Math.floor(now / windowMs), target = path4.join(dir, `${stem}.${window}`);
  try {
    fs5.mkdirSync(dir, { recursive: !0 });
  } catch {
    return failOpen;
  }
  try {
    fs5.closeSync(fs5.openSync(target, "wx"));
  } catch (err) {
    return err?.code === "EEXIST" ? !1 : failOpen;
  }
  return prune(dir, stem, window), !0;
}

// plugins/mypenny-core/lib/token-rotation.ts
var PROACTIVE_ROTATION_WINDOW_MS = 360 * 60 * 1e3, ROTATION_RETRY_WINDOW_MS = 120 * 1e3, RENEW_AFTER_FRACTION = 2 / 3;

// plugins/mypenny-core/lib/guidance-cache.ts
import * as fs6 from "node:fs";
import * as path5 from "node:path";
import * as crypto4 from "node:crypto";
var GUIDANCE_TTL_MS = 600 * 1e3;
function tokenTag(token) {
  return crypto4.createHash("sha256").update(token).digest("hex").slice(0, 16);
}
function cacheFile(projectKey) {
  let safe = projectKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unknown", digest = crypto4.createHash("sha256").update(projectKey).digest("hex").slice(0, 8);
  return path5.join(guidanceDir(), `${safe}.${digest}.json`);
}
function readGuidanceCache(projectKey, expectedTokenTag) {
  if (expectedTokenTag === null) return null;
  try {
    let parsed = JSON.parse(fs6.readFileSync(cacheFile(projectKey), "utf-8"));
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
function isGuidanceStale(cached, now = Date.now(), ttlMs = GUIDANCE_TTL_MS) {
  if (!cached) return !0;
  let age = now - cached.fetchedAt;
  return age < 0 ? !0 : age > ttlMs;
}

// plugins/mypenny-core/lib/background-refresh.ts
import { spawn } from "node:child_process";
import * as fs7 from "node:fs";
import * as path6 from "node:path";
import { fileURLToPath } from "node:url";
var REFRESH_CLAIM_WINDOW_MS = 6e4;
function resolveRefresherScript() {
  let here;
  try {
    here = path6.dirname(fileURLToPath(import.meta.url));
  } catch {
    return null;
  }
  return [
    path6.join(here, "refresh_guidance.mjs"),
    path6.join(here, "..", "scripts", "refresh_guidance.mjs"),
    path6.join(here, "..", "scripts", "refresh_guidance.ts")
  ].find((script) => fs7.existsSync(script)) ?? null;
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

// plugins/mypenny-core/lib/posture.ts
import * as fs8 from "node:fs";
import * as path7 from "node:path";

// plugins/mypenny-core/lib/shell-command.ts
var SEGMENT_BREAKS = /* @__PURE__ */ new Set([";", "&", "|", `
`, "(", ")"]);
function commandSegments(command) {
  return parseCommand(command)?.segments ?? null;
}
function parseCommand(command) {
  let expanded = [], raw = splitSegments(command, expanded);
  if (!raw) return null;
  let segments = [];
  for (let seg of raw) {
    let normalized = normalizeSegment(seg, expanded);
    if (normalized === null) return null;
    segments.push(...normalized);
  }
  return { segments, expanded };
}
function readHeredocMarker(s, i) {
  if (s[i] !== "<" || s[i + 1] !== "<" || s[i + 2] === "<" || s[i - 1] === "<") return null;
  let j = i + 2;
  for (s[j] === "-" && j++; s[j] === " " || s[j] === "	"; ) j++;
  let q = s[j];
  if (q === "'" || q === '"') {
    let close = s.indexOf(q, j + 1);
    return close < 0 ? null : { doc: { delimiter: s.slice(j + 1, close), quoted: !0 }, end: close + 1 };
  }
  let m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(j));
  return m ? { doc: { delimiter: m[0], quoted: !1 }, end: j + m[0].length } : null;
}
function skipHeredocBodies(s, newline, pending, expanded) {
  let pos = newline;
  for (let doc of pending) {
    let body = [];
    for (; ; ) {
      if (pos >= s.length) return -1;
      let next = s.indexOf(`
`, pos + 1), line = s.slice(pos + 1, next < 0 ? s.length : next);
      if (pos = next < 0 ? s.length : next, line.trim() === doc.delimiter) break;
      body.push(line);
    }
    doc.quoted || expanded.push(body.join(`
`));
  }
  return pos;
}
function splitSegments(command, expanded) {
  let main2 = [], nested = [], segment = [], token = null, pending = [], endToken = () => {
    token !== null && segment.push(token), token = null;
  }, endSegment = () => {
    endToken(), segment.length > 0 && main2.push(segment), segment = [];
  }, addNested = (inner) => {
    let parsed = splitSegments(inner, expanded);
    return parsed ? (nested.push(...parsed), !0) : !1;
  }, i = 0;
  for (; i < command.length; ) {
    let c = command[i];
    if (c === " " || c === "	")
      endToken(), i++;
    else if (c === "\\" && command[i + 1] === `
`)
      i += 2;
    else if (c === "<" && command[i + 1] === "<" && command[i + 2] === "<")
      endToken(), segment.push("<<<"), i += 3;
    else if (c === "<" && readHeredocMarker(command, i)) {
      let { doc, end } = readHeredocMarker(command, i);
      endToken(), pending.push(doc), i = end;
    } else if (c === `
` && pending.length > 0) {
      endSegment();
      let after = skipHeredocBodies(command, i, pending, expanded);
      if (after < 0) return null;
      pending = [], i = after;
    } else if (c === "$" && command[i + 1] === "(") {
      let close = findClosingParen(command, i + 2);
      if (close < 0 || !addNested(command.slice(i + 2, close))) return null;
      i = close + 1;
    } else if (c === "`") {
      let close = command.indexOf("`", i + 1);
      if (close < 0 || !addNested(command.slice(i + 1, close))) return null;
      i = close + 1;
    } else if (SEGMENT_BREAKS.has(c))
      endSegment(), i++;
    else if (c === "#" && token === null) {
      let nl = command.indexOf(`
`, i);
      i = nl < 0 ? command.length : nl;
    } else if (c === "\\")
      token = (token ?? "") + (command[i + 1] ?? ""), i += 2;
    else if (c === "'") {
      let close = command.indexOf("'", i + 1);
      if (close < 0) return null;
      token = (token ?? "") + command.slice(i + 1, close), i = close + 1;
    } else if (c === '"') {
      let j = i + 1, text = "";
      for (; ; ) {
        if (j >= command.length) return null;
        let d = command[j];
        if (d === '"') break;
        if (d === "\\" && j + 1 < command.length)
          command[j + 1] !== `
` && (text += command[j + 1]), j += 2;
        else if (d === "$" && command[j + 1] === "(") {
          let close = findClosingParen(command, j + 2);
          if (close < 0 || !addNested(command.slice(j + 2, close))) return null;
          j = close + 1;
        } else if (d === "`") {
          let close = command.indexOf("`", j + 1);
          if (close < 0 || !addNested(command.slice(j + 1, close))) return null;
          j = close + 1;
        } else
          text += d, j++;
      }
      token = (token ?? "") + text, i = j + 1;
    } else
      token = (token ?? "") + c, i++;
  }
  return pending.length > 0 ? null : (endSegment(), [...main2, ...nested]);
}
function findClosingParen(s, start) {
  let depth = 1, quote = null, pending = [];
  for (let i = start; i < s.length; i++) {
    let c = s[i];
    if (quote)
      c === "\\" && quote === '"' ? i++ : c === quote && (quote = null);
    else if (c === "<" && s[i + 1] === "<" && s[i + 2] === "<")
      i += 2;
    else if (c === "<" && readHeredocMarker(s, i)) {
      let { doc, end } = readHeredocMarker(s, i);
      pending.push(doc), i = end - 1;
    } else if (c === `
` && pending.length > 0) {
      let after = skipHeredocBodies(s, i, pending, []);
      if (after < 0) return -1;
      pending = [], i = after - 1;
    } else if (c === "'" || c === '"')
      quote = c;
    else if (c === "\\")
      i++;
    else if (c === "(")
      depth++;
    else if (c === ")" && (depth--, depth === 0))
      return i;
  }
  return -1;
}
var ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/, SHELLS = /* @__PURE__ */ new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"]), SHELL_KEYWORDS = /* @__PURE__ */ new Set(["then", "else", "elif", "do", "if", "while", "until", "!", "{", "}", "done", "fi"]), WRAPPER_VALUE_FLAGS = {
  sudo: /* @__PURE__ */ new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-r", "-t", "-U"]),
  env: /* @__PURE__ */ new Set(["-u", "-C", "-S"]),
  nice: /* @__PURE__ */ new Set(["-n"]),
  timeout: /* @__PURE__ */ new Set(["-s", "-k", "--signal", "--kill-after"]),
  xargs: /* @__PURE__ */ new Set(["-I", "-n", "-P", "-L", "-s", "-E", "-d", "-a"]),
  command: /* @__PURE__ */ new Set(),
  nohup: /* @__PURE__ */ new Set(),
  time: /* @__PURE__ */ new Set(),
  exec: /* @__PURE__ */ new Set(["-a"])
};
function normalizeSegment(tokens, expanded) {
  let t = [...tokens];
  for (let guard = 0; guard < 12; guard++) {
    for (; t.length > 0 && (ENV_ASSIGNMENT.test(t[0]) || SHELL_KEYWORDS.has(t[0])); ) t.shift();
    let head = t[0];
    if (head === void 0) return [];
    let program = basename2(head), valueFlags = WRAPPER_VALUE_FLAGS[program];
    if (valueFlags) {
      let i = 1;
      for (; i < t.length && (t[i].startsWith("-") || ENV_ASSIGNMENT.test(t[i])); )
        i += valueFlags.has(t[i]) ? 2 : 1;
      program === "timeout" && i < t.length && /^\d/.test(t[i]) && i++, t = t.slice(i);
      continue;
    }
    if (SHELLS.has(program)) {
      let args = t.slice(1), flagIdx = args.findIndex((x) => /^-[a-z]*c[a-z]*$/.test(x));
      if (flagIdx >= 0 && flagIdx + 1 < args.length) return nestedSegments(args[flagIdx + 1], expanded);
      let hereIdx = args.indexOf("<<<");
      if (hereIdx >= 0 && hereIdx + 1 < args.length) return nestedSegments(args[hereIdx + 1], expanded);
      let script = args.findIndex((x) => !x.startsWith("-"));
      if (script < 0) return null;
      t = args.slice(script);
      continue;
    }
    if (program === "eval") return nestedSegments(t.slice(1).join(" "), expanded);
    let unwrapped = unwrapRunner(program, t.slice(1));
    if (unwrapped) {
      t = unwrapped;
      continue;
    }
    return [[program, ...t.slice(1)]];
  }
  return null;
}
function nestedSegments(inner, expanded) {
  let parsed = parseCommand(inner);
  return parsed ? (expanded.push(...parsed.expanded), parsed.segments) : null;
}
function unwrapRunner(program, args) {
  let rest = null;
  if (program === "npx" || program === "bunx" ? rest = args : ((program === "pnpm" || program === "yarn") && (args[0] === "exec" || args[0] === "dlx") || program === "bun" && args[0] === "x" || program === "npm" && (args[0] === "exec" || args[0] === "x")) && (rest = args.slice(1)), rest === null) return null;
  let i = 0;
  for (; i < rest.length && rest[i].startsWith("-"); ) {
    let flag = rest[i];
    if (i += flag === "-p" || flag === "--package" ? 2 : 1, flag === "--") break;
  }
  return i >= rest.length ? null : [stripVersion(rest[i]), ...rest.slice(i + 1)];
}
function stripVersion(pkg) {
  let at = pkg.indexOf("@", 1);
  return at > 0 ? pkg.slice(0, at) : pkg;
}
function basename2(p) {
  if (p.startsWith("@")) return p;
  let slash = p.lastIndexOf("/");
  return slash >= 0 ? p.slice(slash + 1) : p;
}
function subcommand(args, valueFlags = /* @__PURE__ */ new Set()) {
  let i = 0;
  for (; i < args.length; ) {
    let a = args[i];
    if (a === "--") return { sub: args[i + 1], index: i + 1 };
    if (!a.startsWith("-")) return { sub: a, index: i };
    i += valueFlags.has(a) ? 2 : 1;
  }
  return { index: i };
}
var GIT_VALUE_FLAGS = /* @__PURE__ */ new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]), GH_VALUE_FLAGS = /* @__PURE__ */ new Set(["-R", "--repo", "--hostname"]), DOCKER_VALUE_FLAGS = /* @__PURE__ */ new Set(["--context", "-c", "-H", "--host", "--config", "-l", "--log-level"]), PKG_VALUE_FLAGS = {
  npm: /* @__PURE__ */ new Set(["-w", "--workspace", "--registry", "--tag", "--otp", "--prefix"]),
  pnpm: /* @__PURE__ */ new Set(["--filter", "-F", "-C", "--dir", "--registry", "--tag", "--otp", "--reporter"]),
  yarn: /* @__PURE__ */ new Set(["--cwd"]),
  bun: /* @__PURE__ */ new Set(["--cwd"])
}, KUBE_VALUE_FLAGS = /* @__PURE__ */ new Set(["-n", "--namespace", "--context", "--kubeconfig", "--cluster", "--user", "-s", "--server"]), GH_ACTING = {
  pr: /* @__PURE__ */ new Set(["create", "merge", "comment", "review", "close", "edit", "ready", "reopen"]),
  issue: /* @__PURE__ */ new Set(["create", "comment", "close", "edit", "reopen", "delete", "transfer"]),
  release: /* @__PURE__ */ new Set(["create", "upload", "delete", "edit"]),
  repo: /* @__PURE__ */ new Set(["create", "delete", "edit", "archive", "rename"]),
  gist: /* @__PURE__ */ new Set(["create", "edit", "delete"]),
  workflow: /* @__PURE__ */ new Set(["run", "enable", "disable"]),
  secret: /* @__PURE__ */ new Set(["set", "delete"]),
  variable: /* @__PURE__ */ new Set(["set", "delete"])
}, VERCEL_ACTING = /* @__PURE__ */ new Set(["deploy", "promote", "rollback", "alias", "redeploy", "remove", "rm"]), KUBECTL_ACTING = /* @__PURE__ */ new Set([
  "apply",
  "delete",
  "create",
  "patch",
  "replace",
  "scale",
  "rollout",
  "edit",
  "set",
  "label",
  "annotate",
  "drain",
  "cordon",
  "taint"
]), HELM_ACTING = /* @__PURE__ */ new Set(["install", "upgrade", "uninstall", "rollback", "delete"]), CURL_DATA_FLAGS = /* @__PURE__ */ new Set([
  "-d",
  "--data",
  "--data-raw",
  "--data-binary",
  "--data-urlencode",
  "--json",
  "-F",
  "--form",
  "--form-string",
  "-T",
  "--upload-file"
]), MAIL_PROGRAMS = /* @__PURE__ */ new Set(["sendmail", "mail", "mailx", "mutt"]), INLINE_CODE_FLAGS = {
  python: /* @__PURE__ */ new Set(["-c"]),
  python3: /* @__PURE__ */ new Set(["-c"]),
  node: /* @__PURE__ */ new Set(["-e", "--eval", "-p", "--print"]),
  deno: /* @__PURE__ */ new Set(["eval"]),
  bun: /* @__PURE__ */ new Set(["-e", "--eval"]),
  perl: /* @__PURE__ */ new Set(["-e", "-E"]),
  ruby: /* @__PURE__ */ new Set(["-e"]),
  osascript: /* @__PURE__ */ new Set()
};
function methodIsWrite(m) {
  if (m === void 0) return !1;
  let up = m.toUpperCase();
  return up !== "GET" && up !== "HEAD" && up !== "OPTIONS";
}
function methodFlag(args, short, longs) {
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    if (a === short || longs.includes(a)) return args[i + 1];
    if (a.startsWith(short) && a.length > short.length && !a.startsWith("--")) return a.slice(short.length);
    for (let l of longs) if (a.startsWith(`${l}=`)) return a.slice(l.length + 1);
  }
}
function curlWrites(args) {
  if (methodIsWrite(methodFlag(args, "-X", ["--request"]))) return !0;
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    if (CURL_DATA_FLAGS.has(a) || a.startsWith("--data") || /^-[dFT]./.test(a)) return !0;
    if (/^-[A-Za-z]{2,}$/.test(a)) {
      if (/[dFT]/.test(a)) return !0;
      let x = a.indexOf("X");
      if (x > 0) {
        let method = x === a.length - 1 ? args[i + 1] : a.slice(x + 1);
        if (methodIsWrite(method)) return !0;
      }
    }
  }
  return !1;
}
function actingSegment(tokens) {
  let [program, ...args] = tokens;
  if (program === void 0) return null;
  let inline = INLINE_CODE_FLAGS[program];
  if (inline && program !== "osascript") {
    let at = args.findIndex((a) => inline.has(a)), code = at >= 0 ? args[at + 1] : void 0;
    if (code !== void 0 && scanForActing(code)) return `${program} inline code`;
    if (program !== "bun") return null;
  }
  switch (program) {
    case "git": {
      let { sub } = subcommand(args, GIT_VALUE_FLAGS);
      return sub === "push" || sub === "send-email" ? `git ${sub}` : null;
    }
    case "gh": {
      let { sub: group, index } = subcommand(args, GH_VALUE_FLAGS);
      if (group === "api") {
        let rest = args.slice(index + 1), method = methodFlag(rest, "-X", ["--method"]);
        return method !== void 0 ? methodIsWrite(method) ? "gh api (write)" : null : rest.some((a) => ["-f", "-F", "--field", "--raw-field", "--input"].includes(a)) ? "gh api (write)" : null;
      }
      let { sub: verb } = subcommand(args.slice(index + 1), GH_VALUE_FLAGS);
      return group && verb && GH_ACTING[group]?.has(verb) ? `gh ${group} ${verb}` : null;
    }
    case "npm":
    case "pnpm":
    case "yarn":
    case "bun": {
      let { sub, index } = subcommand(args, PKG_VALUE_FLAGS[program]);
      return sub === "publish" || sub === "unpublish" || sub === "deprecate" ? `${program} ${sub}` : program === "yarn" && sub === "npm" && args[index + 1] === "publish" ? "yarn npm publish" : sub !== void 0 ? actingSegment(args.slice(index)) : null;
    }
    case "cargo":
      return subcommand(args).sub === "publish" ? "cargo publish" : null;
    case "gem":
      return subcommand(args).sub === "push" ? "gem push" : null;
    case "twine":
      return subcommand(args).sub === "upload" ? "twine upload" : null;
    case "docker":
    case "podman": {
      let { sub, index } = subcommand(args, DOCKER_VALUE_FLAGS);
      return sub === "push" || args.includes("--push") ? `${program} push` : (sub === "compose" || sub === "image") && subcommand(args.slice(index + 1)).sub === "push" ? `${program} ${sub} push` : null;
    }
    case "convex":
      return subcommand(args).sub === "deploy" ? "convex deploy" : null;
    case "vercel": {
      let { sub } = subcommand(args, /* @__PURE__ */ new Set(["--token", "--scope", "-t", "-S", "--cwd"]));
      return args.includes("--prod") || sub === void 0 || VERCEL_ACTING.has(sub) ? "vercel deploy" : null;
    }
    case "terraform":
    case "tofu": {
      let { sub } = subcommand(args.filter((a) => !a.startsWith("-chdir")));
      return sub === "apply" || sub === "destroy" || sub === "import" ? `${program} ${sub}` : null;
    }
    case "kubectl": {
      let { sub } = subcommand(args, KUBE_VALUE_FLAGS);
      return sub && KUBECTL_ACTING.has(sub) ? `kubectl ${sub}` : null;
    }
    case "helm": {
      let { sub } = subcommand(args, KUBE_VALUE_FLAGS);
      return sub && HELM_ACTING.has(sub) ? `helm ${sub}` : null;
    }
    case "curl":
      return curlWrites(args) ? "curl (write)" : null;
    case "wget":
      return methodIsWrite(methodFlag(args, "--method", ["--method"])) || args.some((a) => /^--(post|body)-(data|file)/.test(a)) ? "wget (write)" : null;
    case "http":
    case "https":
    case "xh":
      return args[0] && /^(POST|PUT|PATCH|DELETE)$/.test(args[0]) ? `${program} ${args[0]}` : null;
    case "osascript":
      return "osascript";
    case "ssh":
    case "sftp":
      return program;
    case "scp":
    case "rsync":
      return args.some((a) => !a.startsWith("-") && /^[^/]*:/.test(a)) ? program : null;
    default:
      return MAIL_PROGRAMS.has(program) ? program : null;
  }
}
var SCAN = [
  [/\bgit\b[^\n;&|]*\bpush\b/, "git push"],
  [/\bgh\s+(pr|issue|release)\s+(create|merge|comment|review|close|edit)\b/, "gh write"],
  [/\b(npm|pnpm|yarn|bun)\b[^\n;&|]*\bpublish\b/, "publish"],
  [/\bconvex\s+deploy\b/, "convex deploy"],
  [/\bvercel\b/, "vercel deploy"],
  [/\b(osascript|sendmail|ssh)\b/, "outside-world command"]
];
function scanForActing(text) {
  for (let [re, label] of SCAN) if (re.test(text)) return label;
  return null;
}
var UNREADABLE_COMMAND = "an unreadable command";
function actingCommand(command) {
  let parsed = parseCommand(command);
  if (!parsed) return UNREADABLE_COMMAND;
  for (let seg of parsed.segments) {
    let label = actingSegment(seg);
    if (label) return label;
  }
  for (let body of parsed.expanded) {
    let label = scanForActing(body);
    if (label) return label;
  }
  return null;
}
function globToRegExp(glob) {
  let escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}
function matchesCommandPattern(command, pattern) {
  let normalized = commandSegments(pattern)?.[0], words = normalized && normalized.length > 0 ? [...normalized] : pattern.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return !1;
  words[0] = basename2(words[0]);
  let res = words.map(globToRegExp), segments = commandSegments(command);
  return segments ? segments.some((seg) => seg.length >= res.length && res.every((re, i) => re.test(seg[i]))) : new RegExp(words.map((w) => w.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "\\S*")).join("\\s+")).test(command);
}

// plugins/mypenny-core/lib/posture.ts
function postureHost(parsed) {
  return parsed === "codex" || parsed === "cursor" ? parsed : "claude-code";
}
var ACTING_TOOLS_BLOCK = "acting_tools";
var UNREADABLE_RUN = "unreadable", SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/, PENNY_VERBS = /* @__PURE__ */ new Set([
  "penny_session_start",
  "penny_read",
  "penny_write",
  "penny_edit",
  "penny_delete",
  "penny_get_skill",
  "penny_start_setup"
]);
function postureDir(sessionId) {
  return path7.join(sessionsDir(), `${sessionId}.posture`);
}
function isHold(x) {
  let h = x;
  return !!h && typeof h.runId == "string" && (h.posture === "read" || h.posture === "propose") && typeof h.skillName == "string" && typeof h.startedAt == "number" && (h.actingTools === void 0 || typeof h.actingTools == "string") && (h.closedAt === void 0 || typeof h.closedAt == "number");
}
var UNREADABLE_HOLD = { runId: UNREADABLE_RUN, posture: "read", skillName: "", startedAt: 0 };
function readHolds(sessionId) {
  let names;
  try {
    names = fs8.readdirSync(postureDir(sessionId));
  } catch (err) {
    let code = err?.code;
    return code === "ENOENT" || code === "ENOTDIR" ? { kind: "none" } : { kind: "holds", holds: [UNREADABLE_HOLD] };
  }
  let holds = [];
  for (let name of names)
    if (name.endsWith(".json"))
      try {
        let parsed = JSON.parse(fs8.readFileSync(path7.join(postureDir(sessionId), name), "utf-8"));
        holds.push(isHold(parsed) ? parsed : UNREADABLE_HOLD);
      } catch (err) {
        if (err?.code === "ENOENT") continue;
        holds.push(UNREADABLE_HOLD);
      }
  let [first, ...rest] = holds;
  return first ? { kind: "holds", holds: [first, ...rest] } : { kind: "none" };
}
function asObject(x) {
  return x !== null && typeof x == "object" && !Array.isArray(x) ? x : null;
}
function nonEmpty(x) {
  return typeof x == "string" && x.length > 0 ? x : null;
}
function inputObject(x) {
  return typeof x == "string" ? tryJsonObject(x) : asObject(x);
}
function hookSessionId(payload) {
  let id = nonEmpty(payload.session_id) ?? nonEmpty(payload.conversation_id);
  return id !== null && SAFE_SESSION_ID.test(id) ? id : null;
}
function pennyVerb(toolName) {
  if (typeof toolName != "string") return null;
  let verb = /(?:^|__|:)(penny_[a-z_]+)$/.exec(toolName)?.[1];
  return verb && PENNY_VERBS.has(verb) ? verb : null;
}
function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return;
  }
}
function tryJsonObject(text) {
  return asObject(tryJson(text));
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
function globMatch(glob, name) {
  let re = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${re}$`).test(name);
}
function mergeLists(holds, cached) {
  let sources = [...holds.map((h) => h.actingTools), cached].filter((s) => typeof s == "string"), out = { acting: [], reading: [], invalid: [] };
  for (let s of sources) {
    let l = parseActingToolsBlock(s);
    out.acting.push(...l.acting), out.reading.push(...l.reading), out.invalid.push(...l.invalid);
  }
  return out;
}
var BUILTIN_READING = {
  "claude-code": /* @__PURE__ */ new Set([
    "Read",
    "Glob",
    "Grep",
    "LS",
    "WebSearch",
    "WebFetch",
    "ToolSearch",
    "TodoWrite",
    "TodoRead",
    "NotebookRead",
    "Agent",
    "Task",
    "TaskOutput",
    "BashOutput",
    "Skill",
    "AskUserQuestion",
    "ListMcpResourcesTool",
    "ReadMcpResourceTool",
    "EnterPlanMode",
    "ExitPlanMode",
    "LSP"
  ]),
  codex: /* @__PURE__ */ new Set(["view_image", "web_search", "update_plan", "read_file", "list_dir", "grep_files"]),
  cursor: /* @__PURE__ */ new Set(["Read", "Grep", "Glob", "LS", "WebSearch", "WebFetch", "SemanticSearch", "ReadLints", "TodoWrite"])
}, BUILTIN_LOCAL = {
  "claude-code": /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "EnterWorktree", "ExitWorktree", "TaskStop", "KillShell"]),
  codex: /* @__PURE__ */ new Set(["apply_patch", "Edit", "Write"]),
  cursor: /* @__PURE__ */ new Set(["Write", "Edit", "StrReplace", "MultiEdit", "Delete"])
}, SHELL_TOOLS = {
  "claude-code": /* @__PURE__ */ new Set(["Bash"]),
  codex: /* @__PURE__ */ new Set(["Bash", "shell", "exec_command", "local_shell"]),
  cursor: /* @__PURE__ */ new Set(["Shell"])
}, IGNORES_ASK = /* @__PURE__ */ new Set(["codex", "cursor"]), ASK_PROMPTING_MODES = /* @__PURE__ */ new Set(["default", "auto", "plan"]);
function askReachesUser(host, permissionMode) {
  return !IGNORES_ASK.has(host) && typeof permissionMode == "string" && ASK_PROMPTING_MODES.has(permissionMode);
}
function isMcpTool(name) {
  return name.startsWith("mcp__") || name.startsWith("MCP:");
}
function mcpToolSegment(name) {
  let parts = name.split(/__|:/);
  return parts[parts.length - 1] ?? name;
}
var MCP_ACTING_VERBS = /* @__PURE__ */ new Set([
  "send",
  "post",
  "publish",
  "reply",
  "forward",
  "compose",
  "tweet",
  "deploy",
  "merge",
  "push",
  "invite",
  "share",
  "broadcast",
  "transfer",
  "pay",
  "purchase",
  "buy",
  "shell",
  "exec",
  "execute",
  "run",
  "applescript"
]), MCP_READ_VERBS = /* @__PURE__ */ new Set([
  "get",
  "list",
  "search",
  "read",
  "fetch",
  "query",
  "find",
  "describe",
  "view",
  "show",
  "count",
  "check",
  "status",
  "lookup",
  "inspect"
]);
function defaultActingMcp(name) {
  let words = mcpToolSegment(name).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[_\-.\s]+/).filter(Boolean);
  for (let w of words) {
    if (MCP_READ_VERBS.has(w)) return !1;
    if (MCP_ACTING_VERBS.has(w)) return !0;
  }
  return !1;
}
function shellInputOf(host, toolName, toolInput) {
  if (isMcpTool(toolName)) return { kind: "none" };
  let cmd = toolInput.command ?? toolInput.cmd;
  return typeof cmd == "string" ? { kind: "command", text: cmd } : Array.isArray(cmd) && cmd.length > 0 && cmd.every((c) => typeof c == "string") ? {
    kind: "command",
    text: cmd.map((c) => /^[\w./=:@%+-]+$/.test(c) ? c : `'${c.replace(/'/g, "'\\''")}'`).join(" ")
  } : SHELL_TOOLS[host].has(toolName) || cmd !== void 0 ? { kind: "unreadable" } : { kind: "none" };
}
function touchesMyPennyState(toolInput, shell) {
  let dir = mypennyDir(), name = path7.basename(dir);
  return [shell.kind === "command" ? shell.text : void 0, toolInput.file_path, toolInput.path, toolInput.notebook_path].filter((t) => typeof t == "string").some((t) => t.includes(dir) || t.includes(`/${name}`) || t.includes(`~/${name}`));
}
function touchesActingToolsBlock(verb, args) {
  return verb === "penny_write" || verb === "penny_edit" ? args.entityType === "profile" && args.blockName === ACTING_TOOLS_BLOCK : verb === "penny_delete" ? args.entityType !== "profile_block" ? !1 : [args.ids, args.blockNames, [args.blockName]].flatMap((v) => Array.isArray(v) ? v : []).includes(ACTING_TOOLS_BLOCK) : !1;
}
function skillPhrase(name) {
  return name ? `"${name}"` : "an open skill run";
}
function unreadableNote(eff) {
  return eff.unreadable ? " (A posture hold file in ~/.mypenny/sessions/ can't be read, so Penny treats it as read-only until the session ends.)" : "";
}
function postureWord(p) {
  return p === "read" ? "read-only" : "propose-only";
}
function nextStep(eff, open) {
  return eff.closed ? "The run has closed, but outside-world actions stay blocked until the user's next message." : open;
}
function actingReason(what, eff) {
  let skill = skillPhrase(eff.skill), closeIt = "then close the run with penny_edit (its entityType and runId) when you're done.";
  return (eff.posture === "read" ? `${what} acts outside your Penny memory, and this run is read-only by your settings for ${skill}. Don't retry it. ${nextStep(eff, `Save what you would have done as a proposal note instead, ${closeIt}`)}` : `${what} would act outside your Penny memory, and this run can propose but not act, by your settings for ${skill}. ${nextStep(eff, `Draft it and save the draft as a proposal note for the user to approve, ${closeIt}`)}`) + unreadableNote(eff);
}
function classify(host, toolName, toolInput, permissionMode, eff, loadList) {
  let deny = (reason) => ({ kind: "deny", reason }), skill = skillPhrase(eff.skill), verb = pennyVerb(toolName);
  if (verb) {
    let listedActing = !1;
    try {
      listedActing = loadList().acting.some((p) => p === toolName);
    } catch {
      listedActing = !1;
    }
    if (listedActing) return deny(actingReason(toolName, eff));
    if (verb === "penny_write" || verb === "penny_edit" || verb === "penny_delete") {
      if (nonEmpty(toolInput.workspaceId))
        return deny(
          `Writing to a shared Space puts it in front of other members, and this run is ${postureWord(eff.posture)} by your settings for ${skill}. Save it to private memory (leave out workspaceId) instead.`
        );
      if (touchesActingToolsBlock(verb, toolInput))
        return deny(
          `A skill run can't change the ${ACTING_TOOLS_BLOCK} list while it is open. Close the run first; the user can edit the list outside a run.`
        );
    }
    return { kind: "pass" };
  }
  let shell = shellInputOf(host, toolName, toolInput);
  if (touchesMyPennyState(toolInput, shell))
    return deny(`Penny's own state can't change while a ${postureWord(eff.posture)} run for ${skill} holds this session.`);
  let list = loadList();
  if (list.acting.some((p) => !BASH_PATTERN.test(p) && globMatch(p, toolName)))
    return deny(actingReason(toolName, eff));
  if (shell.kind === "unreadable")
    return deny(
      `Penny couldn't read this ${toolName} call's command while a ${postureWord(eff.posture)} run for ${skill} is open, so it is blocked. ${nextStep(eff, "Pass the command as a plain string.")}`
    );
  if (shell.kind === "command") {
    for (let p of list.acting) {
      let bash = BASH_PATTERN.exec(p);
      if (bash && matchesCommandPattern(shell.text, bash[1])) return deny(actingReason(`The command "${bash[1]}"`, eff));
    }
    let hit = actingCommand(shell.text);
    return hit === UNREADABLE_COMMAND ? deny(
      `Penny couldn't read this command while a ${postureWord(eff.posture)} run for ${skill} is open, so it can't tell whether it acts. Rewrite it more simply (one command, plain quoting, no piping into a shell) and try again.`
    ) : hit ? deny(actingReason(`The command "${hit}"`, eff)) : { kind: "pass" };
  }
  if (isMcpTool(toolName) && defaultActingMcp(toolName)) return deny(actingReason(toolName, eff));
  if (BUILTIN_READING[host].has(toolName) || BUILTIN_LOCAL[host].has(toolName)) return { kind: "pass" };
  if (list.reading.some((p) => globMatch(p, toolName))) return { kind: "pass" };
  let unlisted = `${toolName} isn't on your reading or acting list, and a ${postureWord(eff.posture)} run for ${skill} is open.`, letThrough = `To let it through, the user can add "reading: ${toolName}" to the ${ACTING_TOOLS_BLOCK} profile block.`;
  return askReachesUser(host, permissionMode) ? { kind: "ask", reason: `${unlisted} In an unattended run that blocks it. ${letThrough}` } : deny(`${unlisted} There's no prompt to approve it here, so it is blocked. ${letThrough}`);
}
function effectivePosture(holds) {
  let chosen = holds.find((h) => h.posture === "read") ?? holds[0];
  return {
    posture: chosen.posture,
    skill: chosen.skillName,
    closed: holds.every((h) => h.closedAt !== void 0),
    unreadable: holds.some((h) => h.runId === UNREADABLE_RUN)
  };
}
function formatDecision(host, kind, reason, eff) {
  return JSON.stringify(host === "cursor" ? {
    permission: kind,
    user_message: `Penny: an open ${skillPhrase(eff.skill)} run is ${postureWord(eff.posture)}.`,
    agent_message: reason
  } : {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: kind,
      permissionDecisionReason: reason
    }
  });
}
var SILENT = Object.freeze({ kind: "silent" });
function runPostureGate(input, host, cachedList) {
  let p = asObject(input), sessionId = p ? hookSessionId(p) : null;
  if (!p || !sessionId) return SILENT;
  let read = readHolds(sessionId);
  if (read.kind === "none") return SILENT;
  try {
    let eff = effectivePosture(read.holds), toolName = typeof p.tool_name == "string" ? p.tool_name : "", loadList = () => mergeLists(read.holds, typeof cachedList == "function" ? cachedList() : cachedList), c = classify(host, toolName, inputObject(p.tool_input) ?? {}, p.permission_mode, eff, loadList);
    return c.kind === "pass" ? SILENT : { kind: "decision", stdout: formatDecision(host, c.kind, c.reason, eff) };
  } catch (err) {
    return recordDiag({
      event: "posture_gate",
      outcome: "fail",
      hook: "pre_tool_use",
      reason: "crash",
      tool: typeof p.tool_name == "string" ? p.tool_name.slice(0, 120) : void 0,
      detail: errorDetail(err)
    }), {
      kind: "block",
      stderr: "Penny couldn't check this call against an open skill run's posture, so this one call is blocked. Rewrite it more simply and try again."
    };
  }
}
function errorDetail(err) {
  let name = err instanceof Error ? err.name : typeof err, code = err?.code;
  return typeof code == "string" ? `${name}:${code}` : name;
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
function formatGuidanceUpdate(guidance) {
  let inner = renderBlocks(guidance);
  return inner.length === 0 ? "" : `<mypenny_subconscious_update>
${inner}</mypenny_subconscious_update>`;
}
function changedGuidance(previous, current) {
  if (!previous) return current;
  let changed = emptyGuidance(current.projectKey);
  for (let field of ["contract", "persona", "userFacts", "preferences", "subconscious", "codingGuidance", "memoryPolicy"])
    (current[field] !== previous[field] || field === "subconscious" && current.projectKey !== previous.projectKey) && (changed[field] = current[field] || "(removed)");
  return changed;
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
function cachedActingToolsForCwd(cwd) {
  return readGuidanceCache(deriveProjectKey(cwd), currentTokenTag())?.bundle.actingTools ?? null;
}
function currentTokenTag() {
  let token = readToken();
  return token ? tokenTag(token) : null;
}
function getCachedGuidanceForCwd(cwd) {
  let projectKey = deriveProjectKey(cwd), cached = readGuidanceCache(projectKey, currentTokenTag()), refreshStarted = isGuidanceStale(cached) ? spawnGuidanceRefresh(projectKey, cwd) : !1;
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
    recordDiag({ event: "watchdog", outcome: "fail", reason: "timeout" }), process.exit(exitCode);
  }, budgetMs);
  return timer.unref?.(), () => clearTimeout(timer);
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

// plugins/mypenny-core/lib/space-dialog.ts
import * as crypto5 from "node:crypto";
import * as fs9 from "node:fs";
import * as path8 from "node:path";
var DIALOG_MODES = /* @__PURE__ */ new Set(["default", "auto"]), MUTATING_VERBS = /* @__PURE__ */ new Set(["penny_write", "penny_edit", "penny_delete"]), DIALOG_VERBS = /* @__PURE__ */ new Set(["penny_write", "penny_edit"]), DIALOG_WINDOW_MS = 15 * 6e4, PRUNE_MS = 60 * 6e4;
function asObject2(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value) ? value : null;
}
function dialogDir(sessionId) {
  return path8.join(sessionsDir(), `${sessionId}.space-dialog`);
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  let obj = asObject2(value);
  return obj ? `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(",")}}` : JSON.stringify(value) ?? "null";
}
function inputDigest(toolInput) {
  return crypto5.createHash("sha256").update(stable(toolInput)).digest("hex").slice(0, 16);
}
function pennyChange(payload) {
  let p = asObject2(payload);
  if (!p) return null;
  let verb = pennyVerb(p.tool_name);
  if (!verb || !MUTATING_VERBS.has(verb)) return null;
  let sessionId = hookSessionId(p);
  if (!sessionId) return null;
  let input = asObject2(p.tool_input) ?? {}, namesSpace = DIALOG_VERBS.has(verb) && typeof input.workspaceId == "string" && input.workspaceId !== "";
  return { sessionId, digest: inputDigest(input), namesSpace };
}
function listRecords(dir) {
  let names;
  try {
    names = fs9.readdirSync(dir);
  } catch {
    return [];
  }
  let shown = new Set(names.filter((n) => n.endsWith(".shown")).map((n) => n.slice(0, -6))), recs = [];
  for (let name of names) {
    let m = /^(\d{15})-([0-9a-f]{16})-([0-9a-f]{8})\.(dialog|plain|used)$/.exec(name);
    if (!m) continue;
    let base = `${m[1]}-${m[2]}-${m[3]}`;
    recs.push({ base, at: Number(m[1]), digest: m[2], kind: m[4], shown: shown.has(base) });
  }
  return recs.sort((a, b) => b.at - a.at || (b.base < a.base ? -1 : 1));
}
function prune2(dir, now) {
  for (let rec of listRecords(dir))
    if (!(now - rec.at <= PRUNE_MS))
      for (let ext of [rec.kind, "shown"]) fs9.rmSync(path8.join(dir, `${rec.base}.${ext}`), { force: !0 });
}
function recordSpaceWrite(payload, now = Date.now()) {
  let write = pennyChange(payload);
  if (!write) return "none";
  let mode = asObject2(payload)?.permission_mode, dialog = write.namesSpace && typeof mode == "string" && DIALOG_MODES.has(mode), dir = dialogDir(write.sessionId);
  try {
    fs9.mkdirSync(dir, { recursive: !0, mode: 448 }), prune2(dir, now);
    let base = `${String(now).padStart(15, "0")}-${write.digest}-${crypto5.randomBytes(4).toString("hex")}`;
    fs9.writeFileSync(path8.join(dir, `${base}.${dialog ? "dialog" : "plain"}`), "", { mode: 384 });
  } catch {
  }
  return dialog ? "ask" : "noted";
}
function spaceAskDecision() {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Penny: this shares the content below with a Space that other people can read. Allow shares it now."
    }
  };
}

// plugins/mypenny-core/lib/profile-file.ts
import * as fs10 from "node:fs";
import * as path9 from "node:path";
import * as crypto6 from "node:crypto";
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
  let target = profilePath(sessionId), temp = `${target}.${crypto6.randomUUID()}.tmp`;
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
function readSnapshot(sessionId, part) {
  try {
    return JSON.parse(fs10.readFileSync(snapshotPath(sessionId, part), "utf8"));
  } catch {
    return null;
  }
}
function writeGuidanceSnapshot(sessionId, part, guidance) {
  fs10.mkdirSync(sessionsDir(), { recursive: !0 });
  let target = snapshotPath(sessionId, part), temp = `${target}.${crypto6.randomUUID()}.tmp`;
  try {
    fs10.writeFileSync(temp, JSON.stringify(guidance), { mode: 384 }), fs10.renameSync(temp, target);
  } finally {
    try {
      fs10.unlinkSync(temp);
    } catch {
    }
  }
}
function changedFallbackPart(sessionId, part, guidance) {
  let previous = readSnapshot(sessionId, part), changed = changedGuidance(previous, guidance), output = formatGuidanceParts(changed, "update")[part - 1];
  if (!previous || JSON.stringify(previous) !== JSON.stringify(guidance)) {
    if (!claimWindow(`claude-guidance:${sessionId}:${part}:${hashContent(JSON.stringify(guidance))}`, 1e4)) return "";
    writeGuidanceSnapshot(sessionId, part, guidance);
  }
  return output;
}

// plugins/mypenny-core/scripts/pretool_sync.ts
var DEBUG = process.env.MYPENNY_DEBUG === "1", debug = (...args) => {
  DEBUG && console.error("[mypenny:pretool]", ...args);
}, WATCHDOG_MS = 3e3, INJECT_CLAIM_MS = 1e4, partArg = process.argv.indexOf("--part"), PART = partArg >= 0 ? Number(process.argv[partArg + 1]) : null;
async function main() {
  let raw = await readHookInput(), host = postureHost(parseHost(process.argv.slice(2)));
  if (host === "claude-code" && (PART === 2 || PART === 3)) {
    if (process.env.MYPENNY_SUBCONSCIOUS === "off" || !readToken()) return;
    let hookInput2 = normalizeHookInput(raw);
    if (!hookInput2 || hasProfileMod(hookInput2.session_id)) return;
    let state2 = readState(hookInput2.session_id);
    if (!state2) return;
    let { guidance: guidance2, cacheHit: cacheHit2 } = getCachedGuidanceForCwd(hookInput2.cwd ?? state2.projectPath);
    if (!cacheHit2) return;
    let output2 = changedFallbackPart(hookInput2.session_id, PART, guidance2);
    output2 && console.log(JSON.stringify({ additionalContext: output2 }));
    return;
  }
  let gate = runPostureGate(
    raw,
    host,
    () => cachedActingToolsForCwd(typeof raw?.cwd == "string" ? raw.cwd : process.cwd())
  ), space = host === "claude-code" ? recordSpaceWrite(raw) : "none";
  switch (gate.kind) {
    case "decision":
      console.log(gate.stdout);
      return;
    case "block":
      process.stderr.write(`${gate.stderr}
`), process.exitCode = 2;
      return;
    case "silent":
      if (space === "ask") {
        console.log(JSON.stringify(spaceAskDecision()));
        return;
      }
      break;
  }
  if (host === "cursor") {
    console.log("{}");
    return;
  }
  if (process.env.MYPENNY_SUBCONSCIOUS === "off" || !readToken()) return;
  let disarm = armWatchdog(WATCHDOG_MS), hookInput = normalizeHookInput(raw);
  if (!hookInput) return;
  setDiagContext({ hook: "pre_tool_use", sessionId: hookInput.session_id });
  let state = readState(hookInput.session_id);
  if (!state) return;
  let cwd = hookInput.cwd ?? state.projectPath, { guidance, cacheHit, refreshStarted } = getCachedGuidanceForCwd(cwd);
  if (refreshStarted && debug("stale cache \u2014 refresh spawned"), !cacheHit) {
    debug("cold cache \u2014 nothing to inject");
    return;
  }
  if (host === "claude-code" && PART === 1 && !hasProfileMod(hookInput.session_id)) {
    let output2 = changedFallbackPart(hookInput.session_id, 1, guidance);
    disarm(), output2 && console.log(JSON.stringify({ additionalContext: output2 }));
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
  let modActive = host === "claude-code" && hasProfileMod(hookInput.session_id);
  if (modActive) {
    let profile = formatInjection(guidance, []);
    profile && writeProfile(hookInput.session_id, profile);
  }
  let output = modActive ? "" : formatGuidanceUpdate(guidance);
  output && console.log(
    JSON.stringify(
      host === "codex" ? { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: output } } : { additionalContext: output }
    )
  ), writeState({ ...state, guidanceHash: currentHash });
}
main().catch((err) => {
  DEBUG && console.error("[mypenny:pretool] error:", err), process.exit(parseHost(process.argv.slice(2)) === "cursor" ? 1 : 0);
});
