---
description: Capture a quick reminder into Apple Reminders from natural-language text.
---

# Capture

Quick capture: parse the user's free-form text and create an Apple
Reminder via `scripts/reminders.py`. Use this whenever the user types
`/capture <text>`.

## Constants

- **Time zone**: `Europe/Berlin`  (same as morning-briefing)

## Process

1. **Parse** the text into three fields:
   - **summary** — the action itself, with any date/list hints stripped
   - **due date** — resolve any relative date hint ("today", "tomorrow",
     "Friday", "next Monday", "in 3 days", "by 15 June") to a literal
     `YYYY-MM-DD` in `Europe/Berlin`. If no date is mentioned, omit
     `--due` entirely.
   - **list** — if the user named a list ("in Books list", "to Work
     list"), extract the name. Otherwise omit `--list` and let the
     script default to `Reminders` (or the first available list).

2. **Pre-flight** — if needed, install the helper deps once:

   ```bash
   pip install -q -r requirements.txt
   ```

3. **Run**:

   ```bash
   python3 scripts/reminders.py create \
       --summary "<parsed summary>" \
       [--due YYYY-MM-DD] \
       [--list "<list name>"] \
       --json
   ```

4. **Report** the JSON result to the user in one terse line:
   - `created: true`  →  `Created in <list>: "<summary>" due <date>.`
     (drop "due ..." if no date)
   - `existed: true`  →  `Already in <list>: "<summary>" due <date>.`
   - `ok: false`      →  `Failed: <error>.`

## Example interactions

- `/capture Buy groceries`
  → `Created in Reminders: "Buy groceries".`
- `/capture Email Bob about Q3 budget by Friday`
  → `Created in Reminders: "Email Bob about Q3 budget" due 2026-06-12.`
- `/capture Read "Designing Data-Intensive Applications" in Books list`
  → `Created in Books: "Read Designing Data-Intensive Applications".`

## Out of scope (v2.1)

- Completing or editing existing reminders (use the Reminders app)
- Recurring reminders (RRULE not yet supported by the script)
- Bulk capture from a list
