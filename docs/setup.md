# Setup

One-time setup for the morning briefing. Three steps:

1. iCloud app-specific password (Apple Reminders)
2. Mac launchd job exporting Apple Notes to Google Drive
3. Scheduled trigger at code.claude.com

## 1. iCloud app-specific password (Apple Reminders)

Apple Reminders sync via CalDAV. The cloud session reads them with
`scripts/reminders.py` using your Apple ID and an app-specific password.

1. Go to https://appleid.apple.com → Sign-In and Security →
   App-Specific Passwords → Generate.
2. Label it `claude-code-briefing` and copy the password.
3. In the Claude Code on the web UI: Settings → Environments →
   your environment → Variables. Add two secret variables:
   - `ICLOUD_USERNAME` — your Apple ID email
   - `ICLOUD_APP_PASSWORD` — the app-specific password from step 2

Verify in a session:

```bash
pip install -r requirements.txt
python3 scripts/reminders.py list --due-through tomorrow --include-overdue \
    --tz Europe/Berlin --json
```

You should see JSON with a `reminders` array and `ok: true`.

To see your available Reminders list names (handy if you want to
pass `--list "<name>"` to `/capture`):

```bash
python3 scripts/reminders.py lists --json
```

## 2. Apple Notes → Google Drive (Mac-side)

There is no remote API for Apple Notes, so a small job on your Mac
exports your recent notes into a Google Drive folder. The cloud
session reads the latest snapshot from there.

### Prerequisites

- Google Drive for Mac installed and syncing, **or** `rclone`
  configured against your Drive account.
- A folder that ends up at the Drive root as `claude-notes-export/`.
  With Google Drive for Mac, that's typically
  `~/Library/CloudStorage/GoogleDrive-<you>/My Drive/claude-notes-export/`.

### Script

Save the AppleScript outlined in `docs/notes-export.applescript.md`
to `~/Library/Scripts/export-notes.applescript`. Adjust the output
path to your synced Drive folder.

### launchd

Save the plist (also outlined in `docs/notes-export.applescript.md`)
to `~/Library/LaunchAgents/com.user.notes-export.plist` and load it:

```bash
launchctl load ~/Library/LaunchAgents/com.user.notes-export.plist
```

Wait a few minutes and confirm `snapshot.md` appears in
`claude-notes-export/` on Drive.

## 3. Schedule the morning trigger

In the Claude Code on the web UI:

1. Open Settings → Sources → `speedysandy/new` → Schedules.
2. Create a new schedule:
   - **Cron**: `0 7 * * 1-5` for 7am weekdays (adjust freely).
     Use `0 7 * * *` if you want weekends too.
   - **Branch**: `main`
   - **Prompt**: `Run /briefing`
3. Save.

The schedule runs against the environment where `ICLOUD_USERNAME` and
`ICLOUD_APP_PASSWORD` are set, so make sure you set them on the same
environment the schedule uses.

## 4. Verification (do this before flipping the schedule on)

1. Open a fresh session in this repo at code.claude.com.
2. Confirm env vars are set:
   ```bash
   printenv ICLOUD_USERNAME
   ```
   Should print your Apple ID.
3. Confirm the Reminders helper works (see step 1 above).
4. Confirm Drive snapshot is fresh (modified within the last hour or so).
5. Run `/briefing`. Check:
   - A Gmail draft titled `Morning briefing — <today>` is in your
     drafts, with all sections populated.
   - `briefings/<today>.md` was committed to `main`.
6. Re-run `/briefing`. Confirm no second draft is created (the
   idempotency check skips it) and the archive file overwrites cleanly.
7. Test capture: `/capture Test reminder from Claude tomorrow` and
   confirm it shows up in Apple Reminders. Run the same `/capture`
   again — you should get `Already in <list>: ...` (idempotency
   check fired).

Only then enable the scheduled trigger.

## Time zone

The default time zone is `Europe/Berlin`. Change it in one place:
`.claude/skills/morning-briefing/SKILL.md` (the constant at the top,
and the `--tz` arg passed to `reminders.py`).

## Troubleshooting

- **`Reminders unavailable` in the briefing** — Check `ICLOUD_USERNAME`
  and `ICLOUD_APP_PASSWORD` are set and the password is app-specific
  (not the main Apple ID password).
- **Notes section says snapshot is stale** — Your Mac is asleep / off /
  offline, or the launchd job is failing. Check
  `~/Library/Logs/com.user.notes-export.log` if you added logging.
- **Briefing has no important emails** — Either there genuinely aren't
  any, or the search query is filtering too aggressively. Tweak the
  Gmail query in `SKILL.md` (A3).
- **Duplicate drafts on the same day** — The idempotency check matches
  by exact subject. If you've manually edited the subject, the check
  won't fire.
