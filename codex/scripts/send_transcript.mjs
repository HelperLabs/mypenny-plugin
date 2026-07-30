
// plugins/mypenny-core/scripts/send_transcript.ts
import * as fs5 from "node:fs";

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

// plugins/mypenny-core/lib/claim.ts
import * as fs3 from "node:fs";
import * as path2 from "node:path";
import * as crypto3 from "node:crypto";
var KEEP_WINDOWS = 2;
function claimStem(name) {
  const safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "claim";
  const digest = crypto3.createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${safe}.${digest}`;
}
function prune(dir, stem, currentWindow) {
  try {
    for (const file of fs3.readdirSync(dir)) {
      if (!file.startsWith(`${stem}.`)) continue;
      const w = Number(file.slice(stem.length + 1));
      if (!Number.isFinite(w) || w > currentWindow - KEEP_WINDOWS) continue;
      try {
        fs3.unlinkSync(path2.join(dir, file));
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
  const target = path2.join(dir, `${stem}.${window}`);
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

// plugins/mypenny-core/lib/transcript-client.ts
var TIMEOUT_MS = 3e4;
function debugEnabled() {
  const value = process.env.MYPENNY_DEBUG?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
function debugLog(message) {
  if (debugEnabled()) console.error(message);
}
async function sendTranscript(sessionId, projectKey, messages) {
  if (messages.length === 0) return true;
  const token = readToken();
  const cfg = readConfig();
  if (!token || !cfg) return false;
  return withTokenRotation(
    (bearer) => ingestOnce(bearer, cfg.ingestUrl, sessionId, projectKey, messages),
    token
  );
}
async function ingestOnce(token, ingestUrl, sessionId, projectKey, messages) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        sessionId,
        projectKey,
        messages
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {
        detail = "";
      }
      debugLog(
        `[mypenny] transcript ingest failed: HTTP ${response.status}${detail ? ` ${detail}` : ""}`
      );
    }
    return { unauthorized: response.status === 401, value: response.ok };
  } catch (err) {
    debugLog(
      `[mypenny] transcript ingest failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { unauthorized: false, value: false };
  }
}

// plugins/mypenny-core/lib/project-key.ts
import * as fs4 from "node:fs";
import * as path3 from "node:path";
function deriveProjectKey(cwd) {
  try {
    const gitRoot = findGitRoot(cwd);
    if (gitRoot) {
      const configPath2 = resolveGitConfigPath(gitRoot);
      if (configPath2 && fs4.existsSync(configPath2)) {
        const remote = parseOriginRemote(fs4.readFileSync(configPath2, "utf-8"));
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
    if (fs4.existsSync(gitPath)) return dir;
    const parent = path3.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
function resolveGitConfigPath(gitRoot) {
  const gitPath = path3.join(gitRoot, ".git");
  try {
    const stat = fs4.statSync(gitPath);
    if (stat.isDirectory()) {
      return path3.join(gitPath, "config");
    }
    if (stat.isFile()) {
      const contents = fs4.readFileSync(gitPath, "utf-8");
      const match = contents.match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      const gitdir = path3.resolve(gitRoot, match[1].trim());
      const commondirPath = path3.join(gitdir, "commondir");
      if (fs4.existsSync(commondirPath)) {
        const commondir = path3.resolve(
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

// plugins/mypenny-core/scripts/send_transcript.ts
var DEBUG = process.env.MYPENNY_DEBUG === "1";
var MAX_MESSAGE_LENGTH = 2e3;
var WATCHDOG_MS = 11e4;
var debug = (...args) => {
  if (DEBUG) console.error("[mypenny:send]", ...args);
};
function extractMessage(line) {
  const role = line.type || line.role || line.message?.role;
  if (!role) return null;
  if (role !== "user" && role !== "assistant") return null;
  let content;
  if (line.message?.content) {
    if (typeof line.message.content === "string") {
      content = line.message.content;
    } else if (Array.isArray(line.message.content)) {
      const textParts = line.message.content.filter((c) => c.type === "text" && c.text).map((c) => c.text);
      if (textParts.length > 0) content = textParts.join("\n");
    }
  }
  if (!content || content.trim().length === 0) return null;
  return { role, content };
}
async function main() {
  if (process.env.MYPENNY_SUBCONSCIOUS === "off") return;
  if (!readToken()) return;
  const disarm = armWatchdog(WATCHDOG_MS, 1);
  const raw = await readHookInput();
  const hookInput = normalizeHookInput(raw);
  if (!hookInput) return;
  if (hookInput.stop_hook_active) return;
  if (!hookInput.transcript_path || !fs5.existsSync(hookInput.transcript_path)) {
    debug("no transcript file");
    return;
  }
  const state = readState(hookInput.session_id);
  const lastSentLine = state?.lastSentLine || 0;
  const fileContent = fs5.readFileSync(hookInput.transcript_path, "utf-8");
  const allLines = fileContent.split("\n").filter((l) => l.trim());
  const newLines = allLines.slice(lastSentLine);
  if (newLines.length === 0) {
    debug("no new lines");
    return;
  }
  debug(`processing ${newLines.length} new lines from line ${lastSentLine}`);
  const messages = [];
  for (const raw2 of newLines) {
    try {
      const parsed = JSON.parse(raw2);
      const extracted = extractMessage(parsed);
      if (!extracted) continue;
      let content = scrubCredentials(extracted.content);
      if (content.length > MAX_MESSAGE_LENGTH) {
        content = content.slice(0, MAX_MESSAGE_LENGTH) + "... [truncated]";
      }
      messages.push({ role: extracted.role, content, timestamp: Date.now() });
    } catch {
    }
  }
  debug(`extracted ${messages.length} messages`);
  if (messages.length === 0) {
    if (state) writeState({ ...state, lastSentLine: allLines.length });
    return;
  }
  const projectKey = deriveProjectKey(hookInput.cwd);
  const success = await sendTranscript(hookInput.session_id, projectKey, messages);
  if (success) {
    debug("sent successfully");
    if (state) writeState({ ...state, lastSentLine: allLines.length });
    disarm();
  } else {
    debug("send failed \u2014 will retry next Stop hook");
    process.exit(1);
  }
}
main().catch((err) => {
  if (DEBUG) console.error("[mypenny:send] error:", err);
  process.exit(1);
});
