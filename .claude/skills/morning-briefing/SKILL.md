---
name: morning-briefing
description: Synthesize today's important emails, calendar, reminders, and notes into a Gmail draft and archive it under briefings/.
---

# Morning Briefing

You produce a single, well-scoped morning briefing and deliver it as a
Gmail draft to the user. You also archive the same briefing to
`briefings/YYYY-MM-DD.md`.

## Constants

- **User email**: `sandro88c@gmail.com`
- **Time zone**: `Europe/Berlin`  (change in one place if needed)
- **Today's date**: derive from current time in the user's TZ
- **Repo for archive**: `speedysandy/new`, branch `main`

## Pre-flight

Install the Python deps for the Reminders helper:

```bash
pip install -q -r requirements.txt
```

If pip fails or times out, continue anyway — the Reminders section will
be marked unavailable but the rest of the briefing still runs.

## Phase A — Gather

Run independent steps in parallel (A1, A3, A4, A5 can all start at
once; A2 depends on A1).

### A1. Calendar
Use the Google Calendar MCP server.
- `list_calendars` once if you don't yet know the primary calendar id.
- `list_events` on the primary calendar from `now` through `now + 48h`,
  in `Europe/Berlin`.
- Cap at the first 25 events.

### A2. Granola prep (depends on A1)
For each upcoming event today:
- Use the Granola MCP server's `query_granola_meetings` to find prior
  instances by matching title (or matching attendee set for one-offs).
- Fetch the most recent matching meeting's transcript via
  `get_meeting_transcript`.
- Truncate each transcript to roughly 8 000 characters (~2k tokens)
  before passing to synthesis.
- Cap at the top 3 meetings overall — pick those with highest stakes
  (first of the day, recurring 1:1s, external attendees, large groups).

### A3. Email triage
Use the Gmail MCP server.
- `search_threads` with query:
  `in:inbox newer_than:1d is:unread -category:promotions -category:social -category:updates`
- Cap at 10 threads fetched.
- `get_thread` for each to read the latest message body.
- Rank by importance (sender relationship, urgency cues, action
  required, deadlines mentioned). Keep top 3–5.

### A4. Reminders
Run:

```bash
python3 scripts/reminders.py --due-through tomorrow --include-overdue --tz Europe/Berlin --json
```

Parse stdout as JSON. If `ok: false`, the Reminders section must show
exactly: `_Reminders unavailable — <error>._`  Do not abort the
briefing.

### A5. Notes
Use the Google Drive MCP server.
- `search_files` for files whose name contains `snapshot.md` inside
  the `claude-notes-export/` folder (or top-level if no folder filter
  is available — match by name).
- Pick the file with the newest `modifiedTime`.
- If `modifiedTime` is older than 36h, flag the Notes section as
  potentially stale with: `_Snapshot may be stale — last updated <ts>._`
- `read_file_content` and skim. Distill 3–5 high-signal bullets
  (recent thoughts, captures, things to revisit).

## Phase B — Synthesize

Produce a markdown briefing with these sections, in this order:

```markdown
# Morning briefing — <YYYY-MM-DD>

## Top of mind
<2–3 sentences orienting the day. Highest-stakes item up top.>

## Important emails
- **<Sender>** — <Subject> — *Suggested action: <one line>*
…

## Today's calendar
- HH:MM–HH:MM  **<Title>**  (with <attendees>)
  - Prep: <from Granola, if available>
…

## Tomorrow at a glance
- HH:MM  <Title>
…

## Reminders
**Overdue**
- <summary> (due <date>, list: <name>)

**Due today**
- <summary> (list: <name>)

## Notes highlights
- <distilled bullet>
…

## Suggested plan
- 09:00–09:30  Triage inbox: <X> and <Y>
- 09:30–10:30  Deep work: <thing>
- 11:00–12:00  <calendar event>
…
```

Style: terse, scannable, no filler. All times in the user's TZ. If a
section is empty (e.g. no overdue reminders), write `_None._` rather
than omitting the heading.

The **Suggested plan** must honor real calendar events as fixed blocks
and propose work blocks for top emails and reminders around them.

## Phase C — Deliver

1. **Idempotency check** — use the Gmail MCP `search_threads` with:
   `in:drafts subject:"Morning briefing — <YYYY-MM-DD>"`
   If a matching draft exists, **skip** draft creation (do not create
   a second one) and proceed to Phase D.
2. Otherwise, Gmail MCP `create_draft`:
   - `to`: `sandro88c@gmail.com`
   - `subject`: `Morning briefing — <YYYY-MM-DD>`
   - `body`: the markdown from Phase B as a plain-text body

## Phase D — Archive

Use the GitHub MCP server's `create_or_update_file`:
- repo: `speedysandy/new`
- path: `briefings/<YYYY-MM-DD>.md`
- branch: `main`
- content: the markdown from Phase B
- commit message: `briefing: <YYYY-MM-DD>`

Naturally idempotent by date — re-runs overwrite cleanly. If the call
fails due to a SHA conflict (race with another session), re-fetch the
file once and retry.

## Failure handling

- Any single data source failing must NOT abort the briefing. Render a
  clear inline notice in that section and proceed.
- iCloud credentials missing → Reminders section shows
  `_Reminders unavailable — set ICLOUD_USERNAME and ICLOUD_APP_PASSWORD._`
- Notes snapshot missing → Notes section shows
  `_No snapshot found in claude-notes-export/._`
- Notes snapshot stale (>36h) → flag inline, still show content.
- Granola unavailable → omit Prep sub-bullets silently.

## Out of scope (do not do these here)

- Creating, completing, or editing reminders
- Drafting reply emails
- Modifying notes
- Creating or modifying calendar events
- Any action beyond the briefing draft and the archive commit

Those live in `README.md` under "v2 candidates."
