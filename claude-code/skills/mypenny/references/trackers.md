# Trackers — structured logging over time

Read this when the user wants to log something repeatedly, asks about a trend,
or needs a logged measurement corrected.

When the user wants to log something repeatedly (mood, exercise, learning progress, sleep, weight, a habit, a
metric), use a tracker, not notes — entries are a separate, queryable store.

- `penny_session_start` already lists the user's trackers; `penny_read`
  (`target: "tracker"`, `view: "list"`) gives the full set. If a fitting
  tracker exists, log with `penny_write` (`entityType: "tracker_entry"`).
- If none fits, **propose `penny_write` (`entityType: "tracker"`) before
  logging** — a tracker definition is structural, so confirm it rather than
  creating silently.
- Use `penny_read` (`target: "tracker_summary"`) for stats and trends, or
  `penny_read` (`target: "tracker"`, `view: "entries"`) for the raw log, when
  the user asks about them.

To correct a logged measurement, read the entry and use `penny_edit`
(`entityType: "tracker_entry"`, `trackerId`, `entryId`, `expectedUpdatedAt`, full
`payload`; optional `agentNote` and `recordedAt`). This keeps the original entry
and its Project links. On a version conflict, reread and reconcile the correction.
