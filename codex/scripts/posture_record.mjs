
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

// plugins/mypenny-core/lib/posture.ts
import * as fs2 from "node:fs";
import * as path3 from "node:path";
import * as crypto from "node:crypto";

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
import * as fs from "node:fs";
import * as path2 from "node:path";
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

// plugins/mypenny-core/lib/posture.ts
var UNKNOWN_RUN = "unknown";
var SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/, PENNY_VERBS = /* @__PURE__ */ new Set([
  "penny_session_start",
  "penny_read",
  "penny_write",
  "penny_edit",
  "penny_delete",
  "penny_get_skill",
  "penny_start_setup"
]);
function postureDir(sessionId) {
  return path3.join(sessionsDir(), `${sessionId}.posture`);
}
function holdPath(sessionId, runId) {
  let name = crypto.createHash("sha256").update(runId).digest("hex").slice(0, 16);
  return path3.join(postureDir(sessionId), `${name}.json`);
}
function isHold(x) {
  let h = x;
  return !!h && typeof h.runId == "string" && (h.posture === "read" || h.posture === "propose") && typeof h.skillName == "string" && typeof h.startedAt == "number" && (h.actingTools === void 0 || typeof h.actingTools == "string") && (h.closedAt === void 0 || typeof h.closedAt == "number");
}
function writeHold(sessionId, hold) {
  fs2.mkdirSync(postureDir(sessionId), { recursive: !0, mode: 448 });
  let target = holdPath(sessionId, hold.runId), tmp = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    fs2.writeFileSync(tmp, JSON.stringify(hold, null, 2), { mode: 384 }), fs2.renameSync(tmp, target);
  } catch (err) {
    throw fs2.rmSync(tmp, { force: !0 }), err;
  }
}
function readHoldFile(sessionId, runId) {
  try {
    let parsed = JSON.parse(fs2.readFileSync(holdPath(sessionId, runId), "utf-8"));
    return isHold(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function closeHold(sessionId, runId, now) {
  let hold = readHoldFile(sessionId, runId);
  hold && hold.closedAt === void 0 && writeHold(sessionId, { ...hold, closedAt: now });
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
function textBlocks(blocks, depth) {
  for (let b of blocks) {
    let block = asObject(b);
    if (block?.type === "text" && typeof block.text == "string") return parseToolResult(block.text, depth + 1);
  }
  return null;
}
function parseToolResult(raw, depth = 0) {
  if (depth > 3) return null;
  if (typeof raw == "string") {
    let v = tryJson(raw);
    return typeof v == "string" || asObject(v) || Array.isArray(v) ? parseToolResult(v, depth + 1) : null;
  }
  if (Array.isArray(raw)) return textBlocks(raw, depth);
  let obj = asObject(raw);
  if (!obj) return null;
  let structured = asObject(obj.structuredContent);
  return structured || (Array.isArray(obj.content) ? textBlocks(obj.content, depth) : obj);
}
function isErrorResult(raw) {
  return asObject(raw)?.isError === !0;
}
var RUN_ENTITIES = /* @__PURE__ */ new Set(["skill_run", "rhythm_run"]);
function applyPostToolUse(input, now = Date.now()) {
  let p = asObject(input);
  if (!p) return;
  let sessionId = hookSessionId(p);
  if (!sessionId) return;
  let verb = pennyVerb(p.tool_name);
  if (verb !== "penny_write" && verb !== "penny_edit") return;
  let args = inputObject(p.tool_input) ?? {};
  if (!RUN_ENTITIES.has(String(args.entityType))) return;
  let raw = p.tool_response ?? p.tool_output;
  if (isErrorResult(raw)) return;
  let result = parseToolResult(raw);
  if (verb === "penny_write") {
    if (result && result.runId === void 0 && result.error !== void 0) return;
    let runId2 = nonEmpty(result?.runId) ?? UNKNOWN_RUN, manifest = asObject(result?.manifest);
    if (manifest?.posture === "act") return;
    let posture = manifest?.posture === "propose" ? "propose" : "read", skillName = nonEmpty(manifest?.name) ?? nonEmpty(args.name) ?? "", actingTools = typeof result?.actingTools == "string" ? result.actingTools : void 0;
    writeHold(sessionId, {
      runId: runId2,
      posture,
      skillName,
      startedAt: now,
      ...actingTools !== void 0 ? { actingTools } : {}
    });
    return;
  }
  if (result && result.error !== void 0) return;
  let runId = nonEmpty(args.runId);
  runId && (closeHold(sessionId, runId, now), closeHold(sessionId, UNKNOWN_RUN, now));
}
var SILENT = Object.freeze({ kind: "silent" });
function errorDetail(err) {
  let name = err instanceof Error ? err.name : typeof err, code = err?.code;
  return typeof code == "string" ? `${name}:${code}` : name;
}

// plugins/mypenny-core/lib/off-record.ts
import * as fs4 from "node:fs";
import * as path5 from "node:path";
import * as crypto2 from "node:crypto";

// plugins/mypenny-core/lib/transcript-cursor.ts
import * as fs3 from "node:fs";
import * as path4 from "node:path";
function transcriptCursorPath(sessionId) {
  return path4.join(sessionsDir(), `${sessionId}.transcript.json`);
}
function isPendingBatch(value) {
  let p = value;
  return p !== null && typeof p == "object" && typeof p.batchId == "string" && p.batchId.length > 0 && typeof p.digest == "string" && p.ends !== null && typeof p.ends == "object" && Object.values(p.ends).every((n) => Number.isSafeInteger(n) && n >= 0);
}
function isFileCursor(value) {
  let c = value;
  return c !== null && typeof c == "object" && Number.isSafeInteger(c.offset) && c.offset >= 0 && typeof c.anchor == "string" && c.anchor.length > 0 && (c.lastUuid === void 0 || typeof c.lastUuid == "string") && (c.lastTimestamp === void 0 || Number.isFinite(c.lastTimestamp)) && (c.sourceClock === void 0 || c.sourceClock === null || Number.isFinite(c.sourceClock));
}
function readCursors(sessionId) {
  let raw;
  try {
    raw = fs3.readFileSync(transcriptCursorPath(sessionId), "utf-8");
  } catch (err) {
    let code = err.code;
    return code !== "ENOENT" && recordDiag({ event: "transcript_cursor", outcome: "fail", reason: "reset", detail: code ?? "read" }), { v: 1, files: {} };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return recordDiag({ event: "transcript_cursor", outcome: "fail", reason: "reset", detail: "parse" }), { v: 1, files: {} };
  }
  if (parsed?.v !== 1 || !parsed.files || typeof parsed.files != "object")
    return recordDiag({ event: "transcript_cursor", outcome: "fail", reason: "reset", detail: "shape" }), { v: 1, files: {} };
  let files = {}, dropped = 0;
  for (let [key, value] of Object.entries(parsed.files))
    isFileCursor(value) ? files[key] = value : dropped++;
  return dropped > 0 && recordDiag({ event: "transcript_cursor", outcome: "fail", reason: "reset", detail: "shape", count: dropped }), isPendingBatch(parsed.pending) ? { v: 1, files, pending: parsed.pending } : { v: 1, files };
}

// plugins/mypenny-core/lib/off-record.ts
var SAFE_SESSION_ID2 = /^[A-Za-z0-9._-]{1,200}$/;
function safeId(sessionId) {
  return typeof sessionId == "string" && SAFE_SESSION_ID2.test(sessionId);
}
function offRecordPath(sessionId) {
  return path5.join(sessionsDir(), `${sessionId}.offrecord.json`);
}
function readMarker(file) {
  try {
    let parsed = JSON.parse(fs4.readFileSync(file, "utf-8"));
    return typeof parsed.offRecordAt == "number" ? parsed : null;
  } catch {
    return null;
  }
}
function markOffRecord(sessionId, now = Date.now(), anchorUuid) {
  if (!safeId(sessionId)) return !1;
  let target = offRecordPath(sessionId), existing = readMarker(target), anchor = existing?.anchorUuid ?? anchorUuid ?? readCursors(sessionId).files.main?.lastUuid, marker = {
    offRecordAt: existing?.offRecordAt ?? now,
    ...anchor ? { anchorUuid: anchor } : {}
  };
  fs4.mkdirSync(sessionsDir(), { recursive: !0 });
  let tmp = `${target}.${crypto2.randomUUID()}.tmp`;
  try {
    fs4.writeFileSync(tmp, JSON.stringify(marker), { mode: 384 }), fs4.renameSync(tmp, target);
  } catch (err) {
    try {
      fs4.rmSync(tmp, { force: !0 });
    } catch {
    }
    throw err;
  }
  return !0;
}
var TAIL_BYTES = 256 * 1024;
function asObject2(x) {
  return x !== null && typeof x == "object" && !Array.isArray(x) ? x : null;
}
function inputObject2(x) {
  if (typeof x != "string") return asObject2(x);
  try {
    return asObject2(JSON.parse(x));
  } catch {
    return null;
  }
}
function tryMark(sessionId) {
  try {
    return markOffRecord(sessionId) ? { stopped: !0 } : { stopped: !1, detail: "unsafe_id" };
  } catch (err) {
    return { stopped: !1, detail: errorDetail(err) };
  }
}
function applyOffRecordPostToolUse(input) {
  let p = asObject2(input);
  if (!p || pennyVerb(p.tool_name) !== "penny_edit") return { kind: "none" };
  if (inputObject2(p.tool_input)?.entityType !== "session") return { kind: "none" };
  let result = parseToolResult(p.tool_response ?? p.tool_output);
  if (result?.offRecord !== !0 || typeof result.sessionId != "string") return { kind: "none" };
  let confirmed = result.sessionId, own = hookSessionId(p);
  return own === null ? { kind: "unverified", sessionId: confirmed, ...tryMark(confirmed) } : own !== confirmed ? { kind: "mismatch", realId: own, wrongId: confirmed, ...tryMark(own) } : { kind: "marked", sessionId: confirmed, ...tryMark(confirmed) };
}
var LIVE_WINDOW_MS = 7200 * 1e3;

// plugins/mypenny-core/scripts/posture_record.ts
async function main() {
  let raw = await readHookInput();
  if (!raw) {
    recordDiag({ event: "posture_record", outcome: "skip", hook: "post_tool_use", reason: "no_input" });
    return;
  }
  setDiagContext({
    hook: "post_tool_use",
    sessionId: typeof raw.session_id == "string" ? raw.session_id : void 0
  }), applyPostToolUse(raw), recordOffRecord(raw);
}
function recordOffRecord(raw) {
  let res = applyOffRecordPostToolUse(raw);
  if (res.kind === "none") return;
  let stillSent = "this machine's marker couldn't be written, so its transcript may still be sent from here, though the server drops anything sent for an off-the-record session";
  res.kind === "mismatch" && (recordDiag({ event: "off_record", outcome: "fail", hook: "post_tool_use", reason: "mismatch", detail: res.detail }), process.stderr.write(
    `Penny took session "${res.wrongId}" off the record, and that can't be undone, but it isn't this session. Tell the user which id was taken off the record by mistake. ` + (res.stopped ? "This session has stopped sending from this machine. " : `For this session, ${stillSent}. `) + `Call penny_edit again with entityType "session", record "off" and sessionId "${res.realId}" so Penny drops what it already has from this session.
`
  ), process.exit(2)), res.kind === "unverified" && (recordDiag({ event: "off_record", outcome: "fail", hook: "post_tool_use", reason: "unverified", detail: res.detail }), process.stderr.write(
    `Penny took session "${res.sessionId}" off the record, but Penny couldn't confirm that's this session (the host didn't say which session this is). If that id came from this session's <mypenny-session> line, nothing more is needed. Otherwise tell the user this session may still be captured, and to run \`npx mypenny-record off\` in this project.
`
  ), process.exit(2)), res.stopped || (recordDiag({ event: "off_record", outcome: "fail", hook: "post_tool_use", reason: "marker_write", detail: res.detail }), process.stderr.write(`The server has this session off the record, but ${stillSent}. Tell the user.
`), process.exit(2)), recordDiag({ event: "off_record", outcome: "ok", hook: "post_tool_use", reason: "marked" });
}
main().catch((err) => {
  recordDiag({
    event: "posture_record",
    outcome: "fail",
    hook: "post_tool_use",
    reason: "crash",
    detail: errorDetail(err)
  }), process.stderr.write(
    `Penny couldn't record this skill run's posture, so it is not being enforced. Treat the run as read-only, and close it with penny_edit when you're done.
`
  ), process.exit(2);
});
