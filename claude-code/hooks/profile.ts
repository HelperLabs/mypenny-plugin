// Claude Code mod: moves the profile out of command-hook stdout and into a
// session-scoped system-prompt section. No Node imports run inside a mod.
import type { CoreEngineInterface, Register } from "claude-code";

const STATE_DIR = ".mypenny";
const SECTION_ID = "mypenny-claude:profile";
const FAILURE = "Penny's profile did not load this session. Call penny_session_start.";
const memo = new Map<string, { mtimeMs: number; size: number; text: string }>();

export const register: Register = (on) => {
  on("classic.SessionStart", async ($, e, next) => {
    try {
      const root = await stateRoot($);
      await $.fs.write(`${root}/sessions/${encodeURIComponent(e.session_id)}.mod`, "");
      memo.delete(e.session_id);
    } catch {
      // No marker means the command hook keeps the stdout fallback.
    }
    return next(e);
  });

  on("prompt.compose", async ($, e, next) => {
    const composed = await next(e);
    try {
      const id = await $.session.id();
      const root = await stateRoot($);
      const safeId = encodeURIComponent(id);
      if (!(await $.fs.exists(`${root}/sessions/${safeId}.mod`))) return composed;
      const file = `${root}/sessions/${safeId}.profile.txt`;
      let text = FAILURE;
      try {
        const stat = await $.fs.stat(file);
        const cached = memo.get(id);
        if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
          text = cached.text;
        } else {
          text = await $.fs.read(file);
          memo.set(id, { mtimeMs: stat.mtimeMs, size: stat.size, text });
        }
      } catch {
        memo.delete(id);
      }
      // An empty file means the hook ran and had nothing to add.
      if (text.length === 0) return composed;
      return { sections: [...composed.sections, { id: SECTION_ID, text, scope: "session" }] };
    } catch {
      return composed;
    }
  });
};

async function stateRoot($: CoreEngineInterface): Promise<string> {
  const override = await $.env.get("MYPENNY_HOME");
  if (override) return override.replace(/[\\/]$/, "");
  const home = (await $.env.get("HOME")) ?? (await $.env.get("USERPROFILE"));
  if (!home) throw new Error("home unavailable");
  return `${home.replace(/[\\/]$/, "")}/${STATE_DIR}`;
}
