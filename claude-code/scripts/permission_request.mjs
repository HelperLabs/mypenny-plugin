
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

// plugins/mypenny-core/lib/space-dialog.ts
import * as crypto from "node:crypto";
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

// plugins/mypenny-core/lib/diag.ts
var MAX_BYTES = 256 * 1024;

// plugins/mypenny-core/lib/posture.ts
var SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/, PENNY_VERBS = /* @__PURE__ */ new Set([
  "penny_session_start",
  "penny_read",
  "penny_write",
  "penny_edit",
  "penny_delete",
  "penny_get_skill",
  "penny_start_setup"
]);
function nonEmpty(x) {
  return typeof x == "string" && x.length > 0 ? x : null;
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
var SILENT = Object.freeze({ kind: "silent" });

// plugins/mypenny-core/lib/space-dialog.ts
var MUTATING_VERBS = /* @__PURE__ */ new Set(["penny_write", "penny_edit", "penny_delete"]), DIALOG_VERBS = /* @__PURE__ */ new Set(["penny_write", "penny_edit"]), DIALOG_WINDOW_MS = 15 * 6e4, PRUNE_MS = 60 * 6e4;
function asObject(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value) ? value : null;
}
function dialogDir(sessionId) {
  return path2.join(sessionsDir(), `${sessionId}.space-dialog`);
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  let obj = asObject(value);
  return obj ? `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(",")}}` : JSON.stringify(value) ?? "null";
}
function inputDigest(toolInput) {
  return crypto.createHash("sha256").update(stable(toolInput)).digest("hex").slice(0, 16);
}
function pennyChange(payload) {
  let p = asObject(payload);
  if (!p) return null;
  let verb = pennyVerb(p.tool_name);
  if (!verb || !MUTATING_VERBS.has(verb)) return null;
  let sessionId = hookSessionId(p);
  if (!sessionId) return null;
  let input = asObject(p.tool_input) ?? {}, namesSpace = DIALOG_VERBS.has(verb) && typeof input.workspaceId == "string" && input.workspaceId !== "";
  return { sessionId, digest: inputDigest(input), namesSpace };
}
function listRecords(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
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
function markDialogShown(payload, _now = Date.now()) {
  let write = pennyChange(payload);
  if (!write?.namesSpace) return !1;
  let dir = dialogDir(write.sessionId), rec = listRecords(dir).find((r) => r.kind === "dialog" && !r.shown && r.digest === write.digest);
  if (!rec) return !1;
  try {
    return fs.writeFileSync(path2.join(dir, `${rec.base}.shown`), "", { mode: 384 }), !0;
  } catch {
    return !1;
  }
}

// plugins/mypenny-core/scripts/permission_request.ts
async function main() {
  markDialogShown(await readHookInput());
}
main().catch(() => {
});
