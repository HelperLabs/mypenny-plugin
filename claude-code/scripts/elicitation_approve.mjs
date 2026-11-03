
// plugins/mypenny-core/scripts/elicitation_approve.ts
import { execFile } from "node:child_process";

// plugins/mypenny-core/lib/hook-input.ts
import * as readline from "node:readline";
function readHookInputFrom(stream) {
  return new Promise((resolve) => {
    let input = "", rl = readline.createInterface({ input: stream }), timer = setTimeout(() => rl.close(), 500);
    rl.on("line", (line) => {
      input += line + `
`;
    }), rl.on("close", () => {
      clearTimeout(timer);
      let trimmed = input.trim();
      if (!trimmed) return resolve(null);
      try {
        resolve(JSON.parse(trimmed));
      } catch {
        resolve(null);
      }
    });
  });
}
function readHookInput() {
  return readHookInputFrom(process.stdin);
}

// plugins/mypenny-core/lib/diag.ts
import * as fs from "node:fs";
import * as path2 from "node:path";

// plugins/mypenny-core/lib/paths.ts
import * as os from "node:os";
import * as path from "node:path";

// plugins/mypenny-core/lib/build-config.ts
function buildStateDir() {
  return ".mypenny";
}

// plugins/mypenny-core/lib/paths.ts
function mypennyDir() {
  return process.env.MYPENNY_HOME || path.join(os.homedir(), buildStateDir());
}
function sessionsDir() {
  return path.join(mypennyDir(), "sessions");
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

// plugins/mypenny-core/lib/space-approval.ts
var PENNY_SERVERS = /* @__PURE__ */ new Set([
  "plugin:mypenny-claude:MyPenny",
  "MyPenny",
  "claude.ai Penny",
  "claude.ai MyPenny"
]), MAX_MESSAGE_CHARS = 2e3, SHORTENED = "(Shortened here. The full change is under Pending approvals in Places.)";
function isRecord(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function isSpaceShareForm(input) {
  if (!isRecord(input) || input.hook_event_name !== "Elicitation" || input.mode !== "form" || typeof input.mcp_server_name != "string" || !PENNY_SERVERS.has(input.mcp_server_name) || typeof input.message != "string" || input.message.trim() === "") return !1;
  let schema = input.requested_schema;
  if (!isRecord(schema) || !isRecord(schema.properties)) return !1;
  let keys = Object.keys(schema.properties);
  if (keys.length !== 1 || keys[0] !== "decision") return !1;
  let decision = schema.properties.decision;
  if (!isRecord(decision) || !Array.isArray(decision.enum)) return !1;
  let choices = [...decision.enum].sort();
  return choices.length === 2 && choices[0] === "approve" && choices[1] === "reject";
}
function hookAnswer(choice) {
  return choice === "approve" ? {
    hookSpecificOutput: {
      hookEventName: "Elicitation",
      action: "accept",
      content: { decision: "approve" }
    }
  } : choice === "reject" ? { hookSpecificOutput: { hookEventName: "Elicitation", action: "decline" } } : null;
}
function parsePromptResult(stdout) {
  let out = stdout.trim();
  return out === "approve" || out === "reject" ? out : "no_answer";
}
var PROMPT_GIVE_UP_SECONDS = 100, PROMPT_SCRIPT = [
  "on run argv",
  "set msg to item 1 of argv",
  "activate",
  "try",
  `set r to display dialog msg with title "Penny" buttons {"Reject", "Approve"} cancel button "Reject" giving up after ${PROMPT_GIVE_UP_SECONDS} with icon note`,
  "on error number -128",
  'return "reject"',
  "end try",
  'if gave up of r then return "no_answer"',
  'if button returned of r is "Approve" then return "approve"',
  'return "reject"',
  "end run"
];
function fitMessage(message, max = MAX_MESSAGE_CHARS) {
  if (message.length <= max) return message;
  let lines = message.split(`
`), tail = lines.slice(-2), body = lines.slice(0, -2).filter((line) => line !== SHORTENED), budget = max - [SHORTENED, ...tail].join(`
`).length - 1, kept = [], used = 0;
  for (let line of body) {
    let cost = line.length + (kept.length > 0 ? 1 : 0);
    if (used + cost <= budget) {
      kept.push(line), used += cost;
      continue;
    }
    let room = budget - used - (kept.length > 0 ? 1 : 0);
    room > 1 && kept.push(`${line.slice(0, room - 1)}\u2026`);
    break;
  }
  return [...kept, SHORTENED, ...tail].join(`
`);
}
function promptArgs(message) {
  let text = fitMessage(message);
  return text.startsWith("-") && (text = ` ${text}`), [...PROMPT_SCRIPT.flatMap((line) => ["-e", line]), text];
}

// plugins/mypenny-core/lib/space-dialog.ts
import * as fs2 from "node:fs";
import * as path3 from "node:path";

// plugins/mypenny-core/lib/posture.ts
var SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/;
function nonEmpty(x) {
  return typeof x == "string" && x.length > 0 ? x : null;
}
function hookSessionId(payload) {
  let id = nonEmpty(payload.session_id) ?? nonEmpty(payload.conversation_id);
  return id !== null && SAFE_SESSION_ID.test(id) ? id : null;
}
var SILENT = Object.freeze({ kind: "silent" });

// plugins/mypenny-core/lib/space-dialog.ts
var DIALOG_WINDOW_MS = 15 * 6e4, PRUNE_MS = 60 * 6e4;
function dialogDir(sessionId) {
  return path3.join(sessionsDir(), `${sessionId}.space-dialog`);
}
function listRecords(dir) {
  let names;
  try {
    names = fs2.readdirSync(dir);
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
function consumeDialogApproval(sessionId, now = Date.now()) {
  if (!hookSessionId({ session_id: sessionId })) return !1;
  let dir = dialogDir(sessionId), oldest = null;
  for (let rec of listRecords(dir)) {
    if (now - rec.at > DIALOG_WINDOW_MS) break;
    if (rec.kind !== "used") {
      if (rec.kind === "plain" || !rec.shown) break;
      oldest = rec;
    }
  }
  if (!oldest) return !1;
  try {
    return fs2.renameSync(path3.join(dir, `${oldest.base}.dialog`), path3.join(dir, `${oldest.base}.used`)), !0;
  } catch {
    return !1;
  }
}

// plugins/mypenny-core/scripts/elicitation_approve.ts
function ask(message) {
  return new Promise((resolve) => {
    execFile(
      "osascript",
      promptArgs(message),
      { timeout: (PROMPT_GIVE_UP_SECONDS + 10) * 1e3 },
      (err, stdout) => resolve(err ? "no_answer" : parsePromptResult(String(stdout)))
    );
  });
}
async function main() {
  setDiagContext({ hook: "elicitation" });
  let input = await readHookInput();
  if (!isSpaceShareForm(input)) return;
  let sessionId = hookSessionId(input);
  if (sessionId && consumeDialogApproval(sessionId)) {
    recordDiag({ event: "space_share_prompt", outcome: "ok", reason: "approve_via_dialog" }), process.stdout.write(JSON.stringify(hookAnswer("approve")));
    return;
  }
  if (process.platform !== "darwin" || process.env.MYPENNY_SPACE_PROMPT === "off") return;
  let choice = await ask(input.message);
  recordDiag({ event: "space_share_prompt", outcome: choice === "no_answer" ? "skip" : "ok", reason: choice });
  let answer = hookAnswer(choice);
  answer && process.stdout.write(JSON.stringify(answer));
}
main().catch(() => {
});
