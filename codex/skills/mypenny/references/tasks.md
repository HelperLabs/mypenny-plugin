# Tasks — the user's to-dos

Read this when the user mentions something they need to do, asks what is on
their plate, or wants their areas, projects, and headings organized.

Penny has a full to-do system: Areas → Projects → Headings → Tasks, with
scheduling, owners, tags, recurrence, and dependencies. `penny_session_start`
returns a task digest (Today/Overdue counts and what's due now) — pass the
user's timezone so those dates are right.

- **Capture** with `penny_write` (`entityType: "task"`): create a to-do —
  title, tags, schedule, deadline, owner (me/agent), recurrence, dependencies.
  When the user mentions something they need to do, offer to capture it.
- **Update** with `penny_edit` (`entityType: "task"`, `taskId`): change status
  (open/in_progress/done/canceled — `"canceled"` is how you remove a task;
  tasks are never trashed), reschedule, or change any of the above.
- **Read** with `penny_read` (`target: "tasks"`): filter by bucket (today/upcoming/anytime/
  someday), project, area, tags, status, or owner; pass `taskId` for one task's
  full detail. Use this for "what's on my plate?" or "what's due?".
- **Read the structure** with `penny_read` (`target: "tasks"`, `organize`:
  `"area"`|`"project"`|`"heading"`): enumerate areas, projects, or headings to
  navigate the full tree. The digest is capped and omits headings, so reach
  for this when you need the complete structure or a project's headings.
- **Organize** with `penny_write` (`entityType: "area"`/`"project"`/`"heading"`)
  to create, or `penny_edit` (same `entityType`) to rename or archive, the
  areas, projects, and headings that hold tasks.
- A task is an actionable to-do; a note is durable knowledge. Capture an action
  item as a task, not a note — and don't double-store it as both.
