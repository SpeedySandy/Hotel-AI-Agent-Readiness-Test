# Personal OS — Morning Briefing

The seed of a personal OS for sandro88c@gmail.com. Each morning a Claude
Code session pulls together important emails, calendar, reminders, and
notes, drafts a briefing into your inbox, and archives it here.

## How it runs

- **Scheduled** — A scheduled source at code.claude.com fires daily,
  runs `/briefing`, and exits. See `docs/setup.md`.
- **On demand** — Open a session in this repo and run `/briefing` at
  any time.

## What it does

1. Pulls recent unread emails (Gmail MCP) and ranks the most important.
2. Pulls today + next 48h of events (Calendar MCP).
3. For recurring meetings, fetches prior-instance notes (Granola MCP).
4. Pulls reminders due today + overdue from iCloud via CalDAV.
5. Reads the latest Apple Notes snapshot from Google Drive.
6. Synthesizes a markdown briefing with a suggested time-blocked plan.
7. Creates a Gmail draft to you with the briefing.
8. Commits the briefing to `briefings/YYYY-MM-DD.md` for history.

## Setup

See `docs/setup.md`. You need:

- `ICLOUD_USERNAME` and `ICLOUD_APP_PASSWORD` env vars (Apple Reminders)
- A Mac-side launchd job pushing Notes to Drive (Apple Notes)
- A scheduled source configured at code.claude.com (for automation)

## Layout

```
.claude/
  skills/morning-briefing/SKILL.md   the brain — gather, synthesize, deliver, archive
  commands/briefing.md               /briefing slash command
scripts/
  reminders.py                       CalDAV helper, JSON stdout
docs/
  setup.md                           one-time setup walkthrough
  notes-export.applescript.md        Mac-side AppleScript outline
briefings/                           daily archive lives here
requirements.txt                     caldav, vobject
```

## v2 candidates

- Create / complete / edit reminders from the briefing
- Draft reply emails for the surfaced inbox items
- Write back to Apple Notes
- Create or modify calendar events
- Meeting-time suggestions and scheduling logic
- Sources beyond the five above (Slack, Linear, Notion, …)
- HTML-rendered email body
- Embedding-based meeting matching for Granola
- Multi-user support
