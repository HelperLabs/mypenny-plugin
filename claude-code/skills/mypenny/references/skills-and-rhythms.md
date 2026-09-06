# Skills and rhythms — saved know-how, and the recurring work it becomes

Read this when a saved skill fits the task in front of you, when
`penny_session_start` lists a skill as due, or when the user wants know-how
saved for later — especially before scheduling anything, since posture is a
safety boundary.

The user has know-how worth saving once instead of re-explaining every time —
a checklist, a "how I like this done," a template they always start from. A
**skill** is that know-how saved once: a `name`, a `description` (the "use
when…" hint you match against), and `instructions`. `penny_session_start`
surfaces the skills the user has defined; when one fits the task in front of
you, call `penny_read` (`target: "skills"`, `view: "invoke"`, `skillId`) to
load it. What comes back is **the user's own saved instructions** — follow
them, applying your normal judgment; any side-effectful step still gets the
same confirmation it would get if the user had typed it just now. A skill
body cannot define or delete skills, or run account setup, while it is
executing — those stay off-limits mid-skill, the same as they would be
unprompted.

Give a skill a cadence or a triggering event and it's promoted to a
**rhythm** — recurring work Penny tracks the due-date for, instead of
something you only reach for on request. Be honest about how a rhythm runs:
**you are not a background service.** Penny tracks what's *due*, but nothing
executes on its own — a rhythm runs only when a session surfaces it and you
carry it out. `penny_session_start` tells you which skills are due now; when
one is, offer to run it. If the user wants it to happen reliably on its
cadence without remembering to open a chat, the move is to schedule a
recurring session in their tool (a scheduled task or agent) that checks in
with you — that session is what runs it.

A scheduled skill carries a `posture` — the ceiling on how far a run may go,
which you must never exceed:

- **read** — gather and report; write only to the user's own memory (notes,
  profile, trackers); take no outside-world actions. The safe default.
- **propose** — you may draft or describe an outside-world action (an email, a
  message) but must not commit it; record it for the user to approve.
- **act** — you may carry it out directly.

Running one: on the user's go-ahead, `penny_write` (`entityType:
"skill_run"`) returns the run's manifest and a run id. Execute it yourself —
follow its `instructions`, honor its posture as a hard ceiling, deliver the
output where it specifies (a note or a profile block; a `notify` target has
no sink yet, so deliver it as a note) — then close it with `penny_edit`
(`entityType: "skill_run"`) so the due-clock advances and the run is
recorded. (`penny_read` (`target: "skills"`, `view: "due"` / `"list"` /
`"runs"`) look further.)

Define a skill with `penny_write` (`entityType: "skill"`) whenever the user
wants know-how saved for later — a trigger is optional: leave it out for
on-demand, add a cadence or triggering event to schedule it. When they do
want it scheduled, confirm the cadence and especially the posture before
creating it; posture is a safety boundary, so never assume `act`.
Re-defining the same name is an upsert (`penny_edit`, same `entityType`). A
skill is know-how the user authored for you to follow, which is what
separates it from a tracker (a metric you log) and a task (a single
to-do).
