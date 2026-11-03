
// plugins/mypenny-core/lib/auth-store.ts
import * as fs2 from "node:fs";
import * as crypto2 from "node:crypto";

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
var RETRY_PENDING_HORIZON_MS = 720 * 1e3, REJECTED_BACKOFF_MS = 360 * 60 * 1e3, REJECTION_THRESHOLD = 2, REPAIR_EVIDENCE_HORIZON_MS = 1440 * 60 * 1e3;
function debugLog(message) {
  process.env.MYPENNY_DEBUG === "1" && console.error(message);
}
function asTime(value) {
  return typeof value == "number" && Number.isFinite(value) ? value : void 0;
}
function readAuthHealth() {
  try {
    let parsed = JSON.parse(fs.readFileSync(authHealthPath(), "utf-8"));
    if (parsed === null || typeof parsed != "object" || Array.isArray(parsed))
      return {};
    let raw = parsed, count = asTime(raw.rotateRejections);
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
    fs.mkdirSync(mypennyDir(), { recursive: !0 });
    let target = authHealthPath(), tmp = `${target}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(health) + `
`, { mode: 384 }), fs.renameSync(tmp, target);
  } catch (err) {
    debugLog(`[mypenny] auth-health write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function recordRotationRetryable(now = Date.now()) {
  writeAuthHealth({ ...readAuthHealth(), retryPendingAt: now });
}
function recordRotationRejected(now = Date.now()) {
  let health = readAuthHealth(), sameEpisode = health.lastRejectedAt !== void 0 && now - health.lastRejectedAt < REJECTED_BACKOFF_MS;
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
      fs.writeFileSync(authHealthPath(), `{}
`, { mode: 384 });
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
var DEFAULT_BASE_URL = buildBaseUrl();
function ensureDir() {
  fs2.mkdirSync(mypennyDir(), { recursive: !0 });
}
function atomicWrite(target, contents, mode) {
  ensureDir();
  let tmp = `${target}.${crypto2.randomUUID()}.tmp`;
  fs2.writeFileSync(tmp, contents, { mode }), fs2.renameSync(tmp, target), process.platform !== "win32" && fs2.chmodSync(target, mode);
}
function readToken() {
  let envToken = process.env.MYPENNY_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return fs2.readFileSync(tokenPath(), "utf-8").trim() || null;
  } catch {
    return null;
  }
}
function writeToken(token) {
  atomicWrite(tokenPath(), token.trim(), 384), clearAuthHealth();
}
function readConfig() {
  try {
    let raw = fs2.readFileSync(configPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return readEnvConfig();
  }
}
function writeConfig(cfg) {
  atomicWrite(configPath(), JSON.stringify(cfg, null, 2) + `
`, 420);
}
function writeTokenExpiry(expiresAt, issuedAt) {
  let cfg = readConfig();
  if (!cfg) return;
  let next = { ...cfg };
  expiresAt === void 0 ? delete next.tokenExpiresAt : next.tokenExpiresAt = expiresAt, issuedAt !== void 0 && (next.issuedAt = issuedAt), writeConfig(next);
}
function readEnvConfig() {
  if (!process.env.MYPENNY_TOKEN && !process.env.MYPENNY_BASE_URL && !process.env.MYPENNY_MEMORY_URL && !process.env.MYPENNY_MCP_URL && !process.env.MYPENNY_INGEST_URL)
    return null;
  let baseUrl = process.env.MYPENNY_BASE_URL?.trim() || DEFAULT_BASE_URL;
  return {
    memoryUrl: process.env.MYPENNY_MEMORY_URL?.trim() || process.env.MYPENNY_MCP_URL?.trim() || `${baseUrl}/mcp`,
    ingestUrl: process.env.MYPENNY_INGEST_URL?.trim() || `${baseUrl}/api/ingestTranscript`,
    userId: process.env.MYPENNY_USER_ID?.trim() || "env",
    issuedAt: 0
  };
}

// plugins/mypenny-core/lib/project-key.ts
import * as crypto3 from "node:crypto";
import * as fs3 from "node:fs";
import * as path2 from "node:path";
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
      if (configPath2 && fs3.existsSync(configPath2)) {
        let url = parseOriginUrl(fs3.readFileSync(configPath2, "utf-8"));
        if (url) {
          let repo = extractRepoPath(url);
          if (repo?.hostAndPath) return { hostAndPath: !0, path: repo.path };
          if (repo) return { hostAndPath: !1, key: sanitizeKey(repo.path) };
        }
      }
      return { hostAndPath: !1, key: sanitizeKey(path2.basename(gitRoot)) };
    }
  } catch {
  }
  return { hostAndPath: !1, key: sanitizeKey(path2.basename(cwd)) };
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
  return crypto3.createHash("sha256").update(hostAndPath.toLowerCase()).digest("hex").slice(0, 8);
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
import * as fs4 from "node:fs";
import * as path3 from "node:path";
import * as crypto4 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  let safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim", digest = crypto4.createHash("sha256").update(name).digest("hex").slice(0, 8);
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
var ROTATION_TIMEOUT_MS = 8e3, PROACTIVE_ROTATION_WINDOW_MS = 360 * 60 * 1e3, ROTATION_RETRY_WINDOW_MS = 120 * 1e3, RENEW_AFTER_FRACTION = 2 / 3, rotationAttempted = !1;
function tokenIsEnvPinned() {
  return !!process.env.MYPENNY_TOKEN?.trim();
}
function renewalIsDue(cfg, now) {
  if (!cfg) return !1;
  if (cfg.tokenExpiresAt === void 0) return !0;
  let issuedAt = cfg.issuedAt && cfg.issuedAt > 0 ? cfg.issuedAt : void 0;
  if (issuedAt === void 0)
    return now >= cfg.tokenExpiresAt - 2592e6 / 3;
  let lifetime = cfg.tokenExpiresAt - issuedAt;
  return lifetime <= 0 ? !0 : now - issuedAt >= lifetime * RENEW_AFTER_FRACTION;
}
function rotationUrl(memoryUrl) {
  try {
    return new URL("/api/auth/token/rotate", memoryUrl).toString();
  } catch {
    return null;
  }
}
async function rotateToken(timeoutMs = ROTATION_TIMEOUT_MS) {
  if (rotationAttempted || (rotationAttempted = !0, tokenIsEnvPinned())) return null;
  let token = readToken(), cfg = readConfig();
  if (!token || !cfg) return null;
  let url = rotationUrl(cfg.memoryUrl);
  if (!url || rotationKnownRejected(readAuthHealth(), Date.now())) return null;
  try {
    let controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs), response = await fetch(url, {
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
    if (clearTimeout(timer), !response.ok)
      return response.status === 400 || response.status === 401 || response.status === 403 ? recordRotationRejected() : response.status !== 429 && recordRotationRetryable(), null;
    let data = await response.json(), next = typeof data.access_token == "string" ? data.access_token.trim() : "";
    if (!next.startsWith("mpt_"))
      return recordRotationRetryable(), null;
    writeToken(next);
    let expiresIn = typeof data.expires_in == "number" && Number.isFinite(data.expires_in) ? data.expires_in : void 0;
    return writeTokenExpiry(
      expiresIn === void 0 ? void 0 : Date.now() + expiresIn * 1e3,
      // Refresh the issue time too (#1410): renewal timing measures "two
      // thirds of life" against issuedAt, so leaving the ORIGINAL pairing
      // time here made every install drift toward always-due — once the
      // recorded age passed two thirds of the recorded lifetime, renewal was
      // permanently due (~4 needless rotations/day, bounded by the 6h claim).
      Date.now()
    ), next;
  } catch {
    return recordRotationRetryable(), null;
  }
}
async function withTokenRotation(attempt, token, timeoutMs) {
  let active = token;
  if (!tokenIsEnvPinned() && renewalIsDue(readConfig(), Date.now()) && (claimWindow("token-rotate", PROACTIVE_ROTATION_WINDOW_MS) || rotationRetryPending(readAuthHealth(), Date.now()) && claimWindow("token-rotate-retry", ROTATION_RETRY_WINDOW_MS))) {
    let renewed = await rotateToken(timeoutMs);
    renewed && (active = renewed);
  }
  let first = await attempt(active);
  if (!first.unauthorized) return first.value;
  tokenIsEnvPinned() || recordRequestUnauthorized();
  let rotated = await rotateToken(timeoutMs);
  return rotated ? (await attempt(rotated)).value : first.value;
}

// plugins/mypenny-core/lib/guidance-cache.ts
import * as fs5 from "node:fs";
import * as path4 from "node:path";
import * as crypto5 from "node:crypto";
var GUIDANCE_TTL_MS = 600 * 1e3;
function tokenTag(token) {
  return crypto5.createHash("sha256").update(token).digest("hex").slice(0, 16);
}
function cacheFile(projectKey) {
  let safe = projectKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unknown", digest = crypto5.createHash("sha256").update(projectKey).digest("hex").slice(0, 8);
  return path4.join(guidanceDir(), `${safe}.${digest}.json`);
}
function readGuidanceCache(projectKey, expectedTokenTag) {
  if (expectedTokenTag === null) return null;
  try {
    let parsed = JSON.parse(fs5.readFileSync(cacheFile(projectKey), "utf-8"));
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
function writeGuidanceCache(projectKey, bundle, now = Date.now(), fetchedWithTokenTag) {
  try {
    fs5.mkdirSync(guidanceDir(), { recursive: !0 });
    let target = cacheFile(projectKey), tmp = `${target}.${crypto5.randomUUID()}.tmp`, payload = {
      bundle,
      fetchedAt: now,
      ...fetchedWithTokenTag ? { tokenTag: fetchedWithTokenTag } : {}
    };
    fs5.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 384 });
    try {
      fs5.renameSync(tmp, target), process.platform !== "win32" && fs5.chmodSync(target, 384);
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
var MAX_BYTES = 256 * 1024, diagContext = {};
function setDiagContext(context) {
  diagContext = { ...diagContext, ...context };
}
function diagEnabled() {
  return !(process.env.MYPENNY_SUBCONSCIOUS === "off" || process.env.MYPENNY_DIAG?.trim().toLowerCase() === "off");
}
function rotateIfNeeded(file) {
  try {
    fs6.statSync(file).size >= MAX_BYTES && fs6.renameSync(file, `${file}.1`);
  } catch {
  }
}
function recordDiag(record) {
  if (diagEnabled())
    try {
      let file = diagLogPath();
      fs6.mkdirSync(path5.dirname(file), { recursive: !0 }), rotateIfNeeded(file);
      let line = JSON.stringify({ at: Date.now(), ...diagContext, ...record }) + `
`;
      fs6.appendFileSync(file, line);
    } catch {
    }
}

// plugins/mypenny-core/lib/posture.ts
var ACTING_TOOLS_BLOCK = "acting_tools";
var SILENT = Object.freeze({ kind: "silent" });

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

// plugins/mypenny-core/lib/memory-client.ts
var TIMEOUT_MS = 6e3;
var PROFILE_TOOL = "penny_read", GUIDANCE_BLOCK_NAMES = [
  "user_facts",
  "persona",
  "preferences",
  "coding_guidance",
  "memory_policy",
  // Not injected: the posture gate reads it from the cache (lib/posture.ts).
  // Requesting it changes the #1516 revision, because the server folds the
  // requested block names into it, so no stale "unchanged" can hide it.
  ACTING_TOOLS_BLOCK
];
function debugEnabled() {
  let value = process.env.MYPENNY_DEBUG?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
function debugLog2(message) {
  debugEnabled() && console.error(message);
}
async function callTool(name, args, timeoutMs = TIMEOUT_MS, onCredential) {
  let token = readToken(), cfg = readConfig();
  return !token || !cfg ? (recordDiag({
    event: "memory_tool",
    outcome: "skip",
    tool: name,
    reason: token ? "no_config" : "no_auth"
  }), null) : withTokenRotation(
    (bearer) => (onCredential?.(tokenTag(bearer)), callToolOnce(name, args, bearer, cfg.memoryUrl, timeoutMs)),
    token,
    timeoutMs
  );
}
async function callToolOnce(name, args, token, memoryUrl, timeoutMs = TIMEOUT_MS) {
  try {
    let controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs), response = await fetch(memoryUrl, {
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
    if (clearTimeout(timer), !response.ok)
      return debugLog2(`[mypenny] MCP tool ${name} failed: HTTP ${response.status}`), recordDiag({
        event: "memory_tool",
        outcome: "fail",
        tool: name,
        reason: "http",
        status: response.status
      }), { unauthorized: response.status === 401, value: null };
    let data = await response.json();
    if (data.error)
      return debugLog2(`[mypenny] MCP tool ${name} failed: ${data.error.message}`), recordDiag({
        event: "memory_tool",
        outcome: "fail",
        tool: name,
        reason: "jsonrpc",
        status: data.error.code
      }), { unauthorized: !1, value: null };
    if (data.result?.isError === !0)
      return debugLog2(`[mypenny] MCP tool ${name} returned a tool error`), recordDiag({ event: "memory_tool", outcome: "fail", tool: name, reason: "tool_error" }), { unauthorized: !1, value: null };
    let text = data.result?.content?.find((c) => c.type === "text")?.text;
    return typeof text != "string" || text.length === 0 ? (recordDiag({ event: "memory_tool", outcome: "fail", tool: name, reason: "empty" }), { unauthorized: !1, value: null }) : { unauthorized: !1, value: text };
  } catch (err) {
    let reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
    return debugLog2(
      `[mypenny] MCP tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`
    ), recordDiag({ event: "memory_tool", outcome: "fail", tool: name, reason }), { unauthorized: !1, value: null };
  }
}
async function fetchCoreMemoryBlocks(projectKey, legacyProjectKey, timeoutMs, ifRevision, onCredential) {
  let raw = await callTool(
    PROFILE_TOOL,
    {
      target: "profile",
      projectKey,
      ...legacyProjectKey !== void 0 ? { legacyProjectKey } : {},
      blockNames: [
        ...GUIDANCE_BLOCK_NAMES,
        `subconscious:${projectKey}`,
        ...legacyProjectKey !== void 0 ? [`subconscious:${legacyProjectKey}`] : []
      ],
      ...ifRevision !== void 0 ? { ifRevision } : {}
    },
    timeoutMs,
    onCredential
  );
  if (raw === null) return { blocks: [], globalBlocks: [], contract: "", ok: !1, unchanged: !1 };
  try {
    let parsed = JSON.parse(raw);
    if (Object.hasOwn(parsed, "unchanged"))
      return parsed.unchanged !== !0 || ifRevision === void 0 || typeof parsed.revision != "string" || parsed.revision !== ifRevision ? { blocks: [], globalBlocks: [], contract: "", ok: !1, unchanged: !1 } : { blocks: [], globalBlocks: [], contract: "", ok: !0, unchanged: !0, revision: parsed.revision };
    let toBlocks = (group) => Array.isArray(group) ? group.filter((b) => typeof b?.blockName == "string").map((b) => ({ blockName: b.blockName, content: b.content || "" })) : [], globalBlocks = toBlocks(parsed.global), byName = /* @__PURE__ */ new Map();
    for (let b of [...globalBlocks, ...toBlocks(parsed.workspace)]) byName.set(b.blockName, b);
    let contract = typeof parsed.contract == "string" ? parsed.contract : "", revision = typeof parsed.revision == "string" ? parsed.revision : void 0;
    return { blocks: [...byName.values()], globalBlocks, contract, ok: !0, unchanged: !1, revision };
  } catch {
    return recordDiag({ event: "memory_tool", outcome: "fail", tool: PROFILE_TOOL, reason: "parse" }), { blocks: [], globalBlocks: [], contract: "", ok: !1, unchanged: !1 };
  }
}
async function fetchGuidance(cwd, timeoutMs, ifRevision) {
  let { projectKey, legacyProjectKey } = deriveProjectKeys(cwd), fetchedWith, { blocks, globalBlocks, contract, ok, unchanged, revision } = await fetchCoreMemoryBlocks(
    projectKey,
    legacyProjectKey,
    timeoutMs,
    ifRevision,
    (tag) => {
      fetchedWith = tag;
    }
  );
  if (!fetchedWith || fetchedWith !== currentTokenTag())
    return { guidance: emptyGuidance(projectKey), ok: !1, unchanged: !1, tokenTag: fetchedWith };
  if (unchanged)
    return {
      ok,
      unchanged: !0,
      tokenTag: fetchedWith,
      guidance: { ...emptyGuidance(projectKey), revision }
    };
  let block = (name) => blocks.find((b) => b.blockName === name)?.content ?? "", subconscious = block(`subconscious:${projectKey}`) || (legacyProjectKey !== void 0 ? block(`subconscious:${legacyProjectKey}`) : "");
  return {
    ok,
    unchanged: !1,
    tokenTag: fetchedWith,
    guidance: {
      userFacts: block("user_facts"),
      subconscious,
      codingGuidance: block("coding_guidance"),
      // memory_policy: how this user wants to be remembered (spec 2026-09-05).
      // Empty string when the user has not taught Penny anything yet — the
      // shipped guidance is the floor and this block holds only their deltas.
      memoryPolicy: block("memory_policy"),
      persona: block("persona"),
      preferences: block("preferences"),
      contract,
      // The user's own list only. A shared Space's block would otherwise win
      // the merge below, and any member of the Space can write it.
      actingTools: globalBlocks.find((b) => b.blockName === ACTING_TOOLS_BLOCK)?.content ?? "",
      projectKey,
      revision
    }
  };
}
async function refreshAndCache(cwd, timeoutMs) {
  let cached = readGuidanceCache(deriveProjectKey(cwd), currentTokenTag()), { guidance, ok, unchanged, tokenTag: fetchedWith } = await fetchGuidance(
    cwd,
    timeoutMs,
    cached?.bundle.revision
  );
  return !ok || !fetchedWith || fetchedWith !== currentTokenTag() ? { guidance: emptyGuidance(deriveProjectKey(cwd)), ok: !1, unchanged: !1 } : unchanged ? cached ? (writeGuidanceCache(cached.bundle.projectKey, cached.bundle, Date.now(), fetchedWith), { guidance: cached.bundle, ok: !0, unchanged: !0 }) : { guidance, ok: !1, unchanged: !1 } : (ok && writeGuidanceCache(guidance.projectKey, guidance, Date.now(), fetchedWith), { guidance, ok, unchanged: !1 });
}
function currentTokenTag() {
  let token = readToken();
  return token ? tokenTag(token) : null;
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

// plugins/mypenny-core/scripts/refresh_guidance.ts
var DEBUG = process.env.MYPENNY_DEBUG === "1", debug = (...args) => {
  DEBUG && console.error("[mypenny:refresh]", ...args);
}, WATCHDOG_MS = 2e4;
async function main() {
  if (process.env.MYPENNY_SUBCONSCIOUS === "off" || !readToken()) return;
  let cwd = process.argv[2];
  if (!cwd) {
    debug("no cwd argument; nothing to refresh");
    return;
  }
  setDiagContext({ hook: "refresh_guidance" }), armWatchdog(WATCHDOG_MS);
  let projectKey = deriveProjectKey(cwd), { guidance, ok, unchanged } = await refreshAndCache(cwd);
  if (!ok) {
    debug(`fetch failed for project=${projectKey}; leaving cache untouched`);
    return;
  }
  if (unchanged) {
    debug(`unchanged for project=${projectKey}; restamped cached bundle`);
    return;
  }
  debug(
    `cached project=${projectKey} user=${guidance.userFacts.length}b sub=${guidance.subconscious.length}b coding=${guidance.codingGuidance.length}b`
  );
}
main().catch((err) => {
  DEBUG && console.error("[mypenny:refresh] error:", err), process.exit(0);
});
