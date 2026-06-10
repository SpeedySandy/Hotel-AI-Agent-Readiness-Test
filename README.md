# Personal OS — Morning Briefing

The seed of a personal OS for sandro88c@gmail.com. Each morning a Claude
Code session pulls together important emails, calendar, reminders, and
notes, drafts a briefing into your inbox, and archives it here.

## How it runs

- **Scheduled briefing** — A scheduled source at code.claude.com fires
  daily, runs `/briefing`, and exits. See `docs/setup.md`.
- **On demand** — Open a session in this repo and run any of the
  commands below at any time.

## Commands

| Command | What it does |
|---|---|
| `/briefing` | Morning briefing → Gmail draft + repo archive |
| `/capture <text>` | Create an Apple Reminder (NL dates + recurrence) |
| `/done <text>` | Mark a reminder complete by exact summary |
| `/schedule <text>` | Create a Google Calendar event (NL) |
| `/findtime <text>` | Suggest meeting times across attendees |
| `/reply <text>` | Draft a Gmail reply to an existing thread |
| `/note <text>` | Capture a thought into the Apple Notes inbox (via Drive → Mac) |

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
  commands/briefing.md               /briefing
  commands/capture.md                /capture (Reminders write)
  commands/done.md                   /done (Reminders complete)
  commands/schedule.md               /schedule (Calendar event)
  commands/findtime.md               /findtime (suggest_time)
  commands/reply.md                  /reply (Gmail reply draft)
  commands/note.md                   /note (Notes inbox via Drive)
scripts/
  reminders.py                       CalDAV CLI: list / create / complete / edit / lists
  md_to_html.py                      markdown → styled HTML (for email htmlBody)
docs/
  setup.md                           one-time setup walkthrough
  notes-export.applescript.md        Mac → Drive (read side, for briefing)
  notes-inbox.applescript.md         Drive → Mac (write side, for /note)
briefings/                           daily archive lives here
requirements.txt                     caldav, icalendar, markdown
```

## Roadmap

### Shipped

- **v1** — Read-only briefing → Gmail draft + repo archive.
- **v2.1** — Apple Reminders write + `/capture`. Idempotent.
- **v2.2** — Personal-OS surface area expansion:
  - `/done` (complete reminders) and `reminders.py edit` (rename / due / rrule)
  - RRULE recurrence in `/capture` (NL → RFC 5545)
  - `/schedule` (Calendar event create) and `/findtime` (suggest_time)
  - `/reply` (Gmail reply draft against an existing thread)
  - `/note` (Notes inbox via Drive → Mac launchd reverse-sync)
  - Briefing now produces HTML-rendered Gmail body and a
    "Suggested captures" section (copy-pasteable `/capture` lines)

### Next up

- Auto-execute captures from briefing (opt-in, e.g. `/briefing --capture`)
- Edit / cancel existing calendar events
- Recurring calendar events via NL in `/schedule`
- `/done` fuzzy matching with confirmation
- Sources requiring new MCP servers: Slack, Linear, Notion
- Embedding-based meeting matching for Granola (replace title match)
- Multi-user support (currently single Apple ID + Gmail account)
- Inline action buttons in the briefing email body (mailto: links
  prefilled with `/done`, `/reply`, etc. on a future Claude Code
  email-handler URL scheme)
