# CLAUDE.md

Project conventions for Claude Code sessions working in this repo.

## What this repo is

Two coexisting projects share this repo:

- **Personal OS** (this is the active focus): a morning-briefing skill
  + 7 slash commands wiring Gmail, Google Calendar, Granola, Google
  Drive, and Apple Reminders into a single daily workflow for
  `sandro88c@gmail.com`. Lives under `.claude/`, `scripts/`, `docs/`,
  `briefings/`.
- **Hotel AI Agent Readiness Test** (separate, on `main` already):
  the hotel-checker client-side app (`index.html`, `app.js`,
  `dashboard.html`, etc.). The two projects do not share code; do
  not edit hotel-checker files when working on Personal OS tasks
  and vice versa.

## Personal-OS conventions

### Constants (single source of truth)

- **User email**: `sandro88c@gmail.com`
- **Time zone**: `Europe/Berlin` — declared in
  `.claude/skills/morning-briefing/SKILL.md` and passed as `--tz`
  to `scripts/reminders.py`. Change in one place if needed.
- **Repo for archive commits**: `SpeedySandy/NEW` (redirects to
  `Hotel-AI-Agent-Readiness-Test`), branch `main`.
- **Idempotency window for briefings**: same calendar date in the
  user's TZ (`Morning briefing — YYYY-MM-DD` subject match).
- **Idempotency window for `/capture`**: same summary + same due
  date in the same Reminders list.

### Slash commands

| Command | File | What it does |
|---|---|---|
| `/briefing` | `.claude/commands/briefing.md` → `.claude/skills/morning-briefing/SKILL.md` | Morning briefing → Gmail draft + repo archive |
| `/capture <text>` | `.claude/commands/capture.md` | Create an Apple Reminder (NL dates + RRULE) |
| `/done <text>` | `.claude/commands/done.md` | Complete a reminder by exact summary |
| `/schedule <text>` | `.claude/commands/schedule.md` | Create a Google Calendar event |
| `/findtime <text>` | `.claude/commands/findtime.md` | Suggest meeting times (`suggest_time`) |
| `/reply <text>` | `.claude/commands/reply.md` | Draft a Gmail reply to a thread |
| `/note <text>` | `.claude/commands/note.md` | Capture into Apple Notes via Drive inbox |

### Scripts

- `scripts/reminders.py` — CalDAV CLI. Subcommands: `list`, `create`,
  `complete`, `edit`, `lists`. Reads `ICLOUD_USERNAME` and
  `ICLOUD_APP_PASSWORD` env vars. Emits JSON. Degrades gracefully
  (exit 2 + JSON error) when creds are missing.
- `scripts/md_to_html.py` — Markdown → styled HTML for Gmail's
  `htmlBody`. Reads stdin, writes stdout.

### Required env vars (cloud environment Variables)

- `ICLOUD_USERNAME` — Apple ID email
- `ICLOUD_APP_PASSWORD` — app-specific password from appleid.apple.com
  (NOT the main password)

These are set by the user in the Claude Code on the web UI under
Settings → Environments → Variables. Marked secret.

### Mac-side dependencies (one-way each)

Apple Notes has no remote API, so two Mac-side launchd jobs bridge it:

- **Export** (Mac → Drive → cloud): docs/notes-export.applescript.md
  pushes recent Notes to `claude-notes-export/snapshot.md` on Drive.
  Read by `/briefing`.
- **Import** (cloud → Drive → Mac): docs/notes-inbox.applescript.md
  pulls `claude-notes-inbox/inbox-*.md` from Drive into the
  "Claude Inbox" Notes folder. Sink for `/note`.

Both run on 30-minute launchd intervals.

### Behaviors

- **Read sources fail gracefully.** If iCloud creds are missing or
  the Notes snapshot is stale, the corresponding briefing section
  shows an inline notice — the briefing never aborts.
- **Writes are idempotent.** `/capture` checks summary + due + list;
  `/briefing` checks subject match in Drafts before creating a new
  one; archive commits overwrite the same dated file.
- **Drafts only, no sends.** `/reply` creates a draft. Nothing in
  this repo calls `send_message`.
- **Token budget caps** in `/briefing` Phase A: max 10 email threads
  scanned, top 5 surfaced; max 3 Granola transcripts; each transcript
  truncated to ~8k chars before synthesis.

## Session setup

A `SessionStart` hook (`.claude/hooks/session-start.sh`) auto-runs
`pip install -r requirements.txt` on every cloud session start. Local
sessions are skipped (checked via `$CLAUDE_CODE_REMOTE`). No manual
pip install needed.

## Scheduled trigger

Configured by the user in the Claude Code on the web UI:
- Source: `SpeedySandy/NEW`
- Branch: `main`
- Cron: `0 7 * * 1-5` (7am weekdays Europe/Berlin)
- Prompt: `Run /briefing`

## Adding new commands

1. New skill file at `.claude/skills/<name>/SKILL.md` with frontmatter
   (`name`, `description`).
2. New slash command at `.claude/commands/<name>.md` with frontmatter
   (`description`) that invokes the skill.
3. If it needs a Python helper, put it under `scripts/` and add deps
   to `requirements.txt`.
4. If it needs Mac-side support (writes to Apple Notes, etc.), add a
   doc under `docs/` with the AppleScript + launchd plist outline.
5. Update README.md commands table and CLAUDE.md slash-commands table.

## What NOT to do

- Don't auto-send emails. Drafts only.
- Don't auto-create reminders from briefing content unless the user
  opts in explicitly (the "Suggested captures" section is intentionally
  copy-pasteable, not auto-executed).
- Don't write to Apple Notes from the cloud session directly. Always
  go through the Drive inbox so the Mac is the single source of truth.
- Don't modify hotel-checker files when on a personal-OS task.
- Don't expand permissions in `.claude/settings.json` without
  explicit user authorization — settings.json is agent-loaded config.
