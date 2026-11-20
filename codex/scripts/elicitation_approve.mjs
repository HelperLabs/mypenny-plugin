
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

// plugins/mypenny-core/lib/confirm-approval.ts
import * as fs3 from "node:fs";
import * as path4 from "node:path";
var CONFIRM_DESCRIPTION_TRASH = "confirm moves it to Trash now; keep leaves everything as it is", CONFIRM_DESCRIPTION_ALWAYS_ASK = "confirm does it now; keep leaves everything as it is";
function isRecord2(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function decisionChoices(decision) {
  return Array.isArray(decision.oneOf) ? decision.oneOf.map((option) => isRecord2(option) ? option.const : void 0) : Array.isArray(decision.enum) ? decision.enum : null;
}
function itemsFieldOk(items) {
  return items === void 0 ? !0 : isRecord2(items) && items.type === "array" && isRecord2(items.items) && Array.isArray(items.items.anyOf);
}
function confirmFormKind(input) {
  if (!isRecord2(input) || input.hook_event_name !== "Elicitation" || input.mode !== "form" || typeof input.mcp_server_name != "string" || !PENNY_SERVERS.has(input.mcp_server_name) || typeof input.message != "string" || input.message.trim() === "") return null;
  let schema = input.requested_schema;
  if (!isRecord2(schema) || !isRecord2(schema.properties)) return null;
  let keys = Object.keys(schema.properties).sort();
  if (keys.join(",") !== "decision" && keys.join(",") !== "decision,items" || !itemsFieldOk(schema.properties.items)) return null;
  let decision = schema.properties.decision;
  if (!isRecord2(decision)) return null;
  let listed = decisionChoices(decision);
  if (!listed) return null;
  let choices = [...listed].sort();
  return choices.length !== 2 || choices[0] !== "confirm" || choices[1] !== "keep" ? null : decision.description === CONFIRM_DESCRIPTION_TRASH ? "trash" : decision.description === CONFIRM_DESCRIPTION_ALWAYS_ASK ? "always_ask" : null;
}
function confirmItemTitles(input) {
  if (!isRecord2(input) || !isRecord2(input.requested_schema)) return [];
  let properties = input.requested_schema.properties;
  if (!isRecord2(properties) || !isRecord2(properties.items) || !isRecord2(properties.items.items)) return [];
  let options = properties.items.items.anyOf;
  return Array.isArray(options) ? options.flatMap((option) => isRecord2(option) && typeof option.title == "string" ? [option.title] : []) : [];
}
var PROMPT_ITEMS_SHOWN = 8;
function confirmPromptMessage(input) {
  let message = isRecord2(input) && typeof input.message == "string" ? input.message : "", titles = confirmItemTitles(input);
  if (titles.length === 0) return message;
  let shown = titles.slice(0, PROMPT_ITEMS_SHOWN).map((title) => `\u2022 ${title}`);
  return titles.length > PROMPT_ITEMS_SHOWN && shown.push(`\u2026and ${titles.length - PROMPT_ITEMS_SHOWN} more`), `${message.replace(" Untick any you want to keep.", "")}

${shown.join(`
`)}`;
}
function confirmHookAnswer(choice) {
  return choice === "confirm" ? {
    hookSpecificOutput: {
      hookEventName: "Elicitation",
      action: "accept",
      content: { decision: "confirm" }
    }
  } : choice === "keep" ? { hookSpecificOutput: { hookEventName: "Elicitation", action: "decline" } } : null;
}
function parseConfirmPromptResult(stdout) {
  let out = stdout.trim();
  return out === "confirm" || out === "keep" ? out : "no_answer";
}
var CONFIRM_PROMPT_GIVE_UP_SECONDS = 100, MAX_MESSAGE_CHARS2 = 1200, CONFIRM_PROMPT_SCRIPT = [
  "on run argv",
  "set msg to item 1 of argv",
  "activate",
  "try",
  `set r to display dialog msg with title "Penny" buttons {"Keep", "Confirm"} cancel button "Keep" giving up after ${CONFIRM_PROMPT_GIVE_UP_SECONDS} with icon caution`,
  "on error number -128",
  'return "keep"',
  "end try",
  'if gave up of r then return "no_answer"',
  'if button returned of r is "Confirm" then return "confirm"',
  'return "keep"',
  "end run"
];
function confirmPromptArgs(message) {
  let text = message.length > MAX_MESSAGE_CHARS2 ? `${message.slice(0, MAX_MESSAGE_CHARS2 - 1)}\u2026` : message;
  return text.startsWith("-") && (text = ` ${text}`), [...CONFIRM_PROMPT_SCRIPT.flatMap((line) => ["-e", line]), text];
}
var BYPASS_MODE = "bypassPermissions", MODE_NOTE_WINDOW_MS = 2 * 6e4;
function modeNotePath(sessionId) {
  return path4.join(sessionsDir(), `${sessionId}.confirm-mode.json`);
}
function sessionInBypass(input, now = Date.now()) {
  if (!isRecord2(input)) return !1;
  if (typeof input.permission_mode == "string") return input.permission_mode === BYPASS_MODE;
  let sessionId = hookSessionId(input);
  if (!sessionId) return !1;
  try {
    let note = JSON.parse(fs3.readFileSync(modeNotePath(sessionId), "utf-8"));
    return !isRecord2(note) || typeof note.at != "number" || typeof note.mode != "string" || now - note.at > MODE_NOTE_WINDOW_MS || note.at > now ? !1 : note.mode === BYPASS_MODE;
  } catch {
    return !1;
  }
}
function confirmWithoutPrompt(kind, input, now = Date.now()) {
  return kind === "trash" && sessionInBypass(input, now);
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
function askConfirm(message) {
  return new Promise((resolve) => {
    execFile(
      "osascript",
      confirmPromptArgs(message),
      { timeout: (CONFIRM_PROMPT_GIVE_UP_SECONDS + 10) * 1e3 },
      (err, stdout) => resolve(err ? "no_answer" : parseConfirmPromptResult(String(stdout)))
    );
  });
}
async function answerConfirmation(input, kind) {
  if (confirmWithoutPrompt(kind, input)) {
    recordDiag({ event: "confirm_prompt", outcome: "ok", reason: "confirm_via_bypass" }), process.stdout.write(JSON.stringify(confirmHookAnswer("confirm")));
    return;
  }
  if (process.platform !== "darwin" || process.env.MYPENNY_SPACE_PROMPT === "off") return;
  let choice = await askConfirm(confirmPromptMessage(input));
  recordDiag({ event: "confirm_prompt", outcome: choice === "no_answer" ? "skip" : "ok", reason: `${kind}:${choice}` });
  let answer = confirmHookAnswer(choice);
  answer && process.stdout.write(JSON.stringify(answer));
}
async function main() {
  setDiagContext({ hook: "elicitation" });
  let input = await readHookInput(), confirmKind = confirmFormKind(input);
  if (confirmKind) {
    await answerConfirmation(input, confirmKind);
    return;
  }
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
