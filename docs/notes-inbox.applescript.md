# Apple Notes inbox import — Mac-side AppleScript outline

This is the **inverse** of `notes-export.applescript.md`: it imports
captures from the Drive-synced `claude-notes-inbox/` folder into Apple
Notes and empties the inbox file after import.

Required so that `/note` (which writes to Drive from the cloud session)
actually lands in your Notes app.

## AppleScript

Save to `~/Library/Scripts/import-notes-inbox.applescript`.

```applescript
-- Import claude-notes-inbox/inbox-YYYY-MM-DD.md sections into Apple Notes
-- and empty the file. Run on a launchd interval (~30 min).

set inboxFolder to (POSIX path of (path to home folder)) & ¬
    "Library/CloudStorage/GoogleDrive-YOU@example.com/My Drive/claude-notes-inbox/"

-- Ensure the Notes folder "Claude Inbox" exists
tell application "Notes"
    if not (exists folder "Claude Inbox") then
        make new folder with properties {name:"Claude Inbox"}
    end if
end tell

-- Find all inbox files (today's plus any from previous days that
-- weren't fully cleared because the Mac was off).
set fileList to paragraphs of (do shell script ¬
    "ls -1 " & quoted form of inboxFolder & "inbox-*.md 2>/dev/null || true")

repeat with filePath in fileList
    if filePath is not "" then
        set fileText to (do shell script "cat " & quoted form of filePath)
        -- Split on the "---" separator that /note writes between sections.
        set AppleScript's text item delimiters to (linefeed & "---" & linefeed)
        set sections to text items of fileText
        set AppleScript's text item delimiters to ""

        repeat with section in sections
            set sectionText to section as string
            if (length of sectionText) > 5 then
                -- First "## " line is the title; rest is body.
                set titleLine to ""
                set bodyText to ""
                set lines to paragraphs of sectionText
                repeat with ln in lines
                    if titleLine is "" and (ln starts with "## ") then
                        set titleLine to text 4 thru -1 of (ln as string)
                    else
                        set bodyText to bodyText & (ln as string) & linefeed
                    end if
                end repeat
                if titleLine is not "" then
                    tell application "Notes"
                        tell folder "Claude Inbox"
                            make new note with properties ¬
                                {name:titleLine, body:bodyText}
                        end tell
                    end tell
                end if
            end if
        end repeat

        -- Empty the file (don't delete — keeps the file name stable
        -- for the day, and /note will append fresh sections later)
        do shell script "true > " & quoted form of filePath
    end if
end repeat
```

## launchd plist

Save to `~/Library/LaunchAgents/com.user.notes-import.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.user.notes-import</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/osascript</string>
    <string>/Users/YOU/Library/Scripts/import-notes-inbox.applescript</string>
  </array>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/YOU/Library/Logs/com.user.notes-import.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOU/Library/Logs/com.user.notes-import.log</string>
</dict>
</plist>
```

Replace `/Users/YOU`. Load with:

```bash
launchctl load ~/Library/LaunchAgents/com.user.notes-import.plist
```

## Verification

1. From a cloud session, run `/note Test from Claude`.
2. Within ~30 min, a new note titled "Test from Claude" should appear
   in the **Claude Inbox** folder of Apple Notes on your Mac.
3. The Drive-side `inbox-<today>.md` should be emptied (file still
   exists, but contents are gone).

## Edge cases

- **Mac off / asleep**: captures pile up in the inbox file. Next time
  the launchd job runs (Mac wakes), all pending sections import in
  one batch.
- **Two captures in the same minute**: each becomes a separate note
  (they're separated by `---` blocks).
- **Drive sync lag**: if the inbox file hasn't synced down to the Mac
  yet, this run is a no-op; the next run picks it up.
- **Permission prompt**: first run of `osascript` will ask for Notes
  access. Grant it under System Settings → Privacy & Security →
  Automation → osascript → Notes.
