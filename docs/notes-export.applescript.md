# Apple Notes export — AppleScript outline

Textual outline of the script that pushes Apple Notes into the
Drive-synced `claude-notes-export/` folder. Save it at
`~/Library/Scripts/export-notes.applescript`. Adapt the output path
to wherever your Google Drive is mounted.

## AppleScript

```applescript
-- Export Notes modified in the last 7 days to a single markdown
-- snapshot inside the Drive-synced claude-notes-export folder.

set exportFolder to (POSIX path of (path to home folder)) & ¬
    "Library/CloudStorage/GoogleDrive-YOU@example.com/My Drive/claude-notes-export/"
set exportPath to exportFolder & "snapshot.md"
set sinceDate to (current date) - (7 * days)

set output to "# Apple Notes snapshot — " & ((current date) as string) & linefeed & linefeed

tell application "Notes"
    repeat with theNote in (notes whose modification date > sinceDate)
        set output to output & "## " & (name of theNote) & linefeed
        set output to output & "_modified: " & (modification date of theNote as string) & "_" & linefeed & linefeed
        set output to output & (plaintext of theNote) & linefeed & linefeed
        set output to output & "---" & linefeed & linefeed
    end repeat
end tell

do shell script "mkdir -p " & quoted form of exportFolder

set fh to open for access (POSIX file exportPath) with write permission
set eof of fh to 0
write output to fh as «class utf8»
close access fh
```

### Why a single concatenated file, not one per note

The cloud session only needs the current state of recent notes. A
single overwritten `snapshot.md` keeps the Drive folder clean and
gives the briefing skill one deterministic file to read. Daily
history lives in `briefings/` in this repo, not in Notes snapshots.

## launchd plist

Save at `~/Library/LaunchAgents/com.user.notes-export.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.user.notes-export</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/osascript</string>
    <string>/Users/YOU/Library/Scripts/export-notes.applescript</string>
  </array>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/YOU/Library/Logs/com.user.notes-export.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOU/Library/Logs/com.user.notes-export.log</string>
</dict>
</plist>
```

Replace `/Users/YOU` with your home directory path. Load with:

```bash
launchctl load ~/Library/LaunchAgents/com.user.notes-export.plist
```

`StartInterval` is in seconds — 1800 = every 30 minutes. Adjust to
taste; more frequent runs mean fresher snapshots but more disk churn.

## First-run permission prompt

The first time `osascript` runs the script, macOS will prompt for
Notes access. Grant it (System Settings → Privacy & Security →
Automation → osascript → Notes). Without this, the script returns an
empty document silently.
