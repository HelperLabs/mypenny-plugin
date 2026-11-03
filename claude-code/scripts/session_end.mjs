
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
var SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/;
function postureDir(sessionId) {
  return path3.join(sessionsDir(), `${sessionId}.posture`);
}
function clearHolds(sessionId) {
  SAFE_SESSION_ID.test(sessionId) && fs2.rmSync(postureDir(sessionId), { recursive: !0, force: !0 });
}
var SILENT = Object.freeze({ kind: "silent" });
function errorDetail(err) {
  let name = err instanceof Error ? err.name : typeof err, code = err?.code;
  return typeof code == "string" ? `${name}:${code}` : name;
}

// plugins/mypenny-core/lib/profile-file.ts
import * as fs3 from "node:fs";
import * as path4 from "node:path";

// plugins/mypenny-core/lib/state.ts
var STALE_THRESHOLD_MS = 10080 * 60 * 1e3, OFF_RECORD_THRESHOLD_MS = 2160 * 60 * 60 * 1e3, CLEANUP_INTERVAL_MS = 1440 * 60 * 1e3;

// plugins/mypenny-core/lib/profile-file.ts
function profilePath(sessionId) {
  return path4.join(sessionsDir(), `${encodeURIComponent(sessionId)}.profile.txt`);
}
function markerPath(sessionId) {
  return path4.join(sessionsDir(), `${encodeURIComponent(sessionId)}.mod`);
}
function clearProfileFiles(sessionId) {
  for (let file of [markerPath(sessionId), profilePath(sessionId), ...[1, 2, 3].map((part) => snapshotPath(sessionId, part))])
    try {
      fs3.unlinkSync(file);
    } catch {
    }
}
function snapshotPath(sessionId, part) {
  return path4.join(sessionsDir(), `${encodeURIComponent(sessionId)}.guidance-part-${part}.json`);
}

// plugins/mypenny-core/scripts/session_end.ts
async function main() {
  let raw = await readHookInput();
  if (raw)
    for (let id of [raw.session_id, raw.conversation_id])
      typeof id == "string" && id.length > 0 && (clearHolds(id), clearProfileFiles(id));
}
main().catch((err) => {
  recordDiag({ event: "posture_clear", outcome: "fail", hook: "session_end", reason: "crash", detail: errorDetail(err) }), process.exit(0);
});
