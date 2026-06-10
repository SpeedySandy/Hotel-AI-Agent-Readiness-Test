---
description: Capture a thought into the Apple Notes inbox (one-way, via Drive).
---

# Note

Quick-capture a thought into the Apple Notes inbox. A Mac-side launchd
job (see `docs/notes-inbox.applescript.md`) periodically imports each
captured section into Apple Notes and empties the inbox file.

## Caveats

- **One-way only.** The cloud session cannot write to Apple Notes
  directly. We write to a Drive-synced inbox file; your Mac processes
  it asynchronously.
- **Latency**: appears in Apple Notes within ~30 min (the launchd
  interval). If your Mac is asleep/off, captures pile up safely until
  it wakes.
- **No edits.** This is append-only capture. Edit the resulting Note in
  Apple Notes if you need to refine it.

## Constants

- **Time zone**: `Europe/Berlin`
- **Inbox folder on Drive**: `claude-notes-inbox/`
- **Inbox file name**: `inbox-<YYYY-MM-DD>.md` (one file per day)

## Process

1. Determine today's date in `Europe/Berlin` (file name).
2. Use Google Drive MCP `search_files` to find an existing
   `inbox-<today>.md` in `claude-notes-inbox/`. If the folder doesn't
   exist, create it via `create_file` with
   `mimeType: application/vnd.google-apps.folder`.
3. Read existing content with `read_file_content` if the file exists;
   otherwise start with empty content.
4. Build the appended section:

   ```
   ## <ISO 8601 timestamp Europe/Berlin> — <one-line title>

   <body of the note>

   ---
   ```

   - **title**: first line of the user's text (trimmed, max ~60 chars)
   - **body**: everything after the first line; if the user gave only
     one line, omit the body and just keep the title

5. Write the combined content back via `create_file` (or update the
   existing file if the MCP supports overwrite by id):
   - `title: inbox-<YYYY-MM-DD>.md`
   - `contentMimeType: text/markdown`
   - `textContent: <full content>`
   - `disableConversionToGoogleType: true`  (keep it as plain markdown)
   - `parentId: <claude-notes-inbox folder id>`

6. Report: `Captured to Notes inbox. Will appear in Apple Notes within ~30 min.`

## Examples

- `/note Random thought: should redesign the dashboard nav`
- `/note Book idea: detective in a hyper-surveillance city`

## Out of scope (v2.2)

- Reading existing Apple Notes from the cloud (use the read-only
  snapshot from `/briefing` — covered there)
- Editing or deleting existing Apple Notes
- Folder/tag assignment (everything lands in the "Claude Inbox" folder
  on the Mac; move manually if needed)
