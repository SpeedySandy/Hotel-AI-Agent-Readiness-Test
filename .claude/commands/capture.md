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

1. **Parse** the text into four fields:
   - **summary** — the action itself, with any date/list/recurrence
     hints stripped
   - **due date** — resolve any relative date hint ("today", "tomorrow",
     "Friday", "next Monday", "in 3 days", "by 15 June") to a literal
     `YYYY-MM-DD` in `Europe/Berlin`. If no date is mentioned, omit
     `--due` entirely.
   - **list** — if the user named a list ("in Books list", "to Work
     list"), extract the name. Otherwise omit `--list`.
   - **rrule** — if the user mentioned recurrence ("every Monday",
     "daily", "weekly", "every 2 weeks", "monthly on the 15th"),
     translate to an RFC 5545 RRULE string. Common patterns:
       - "daily" → `FREQ=DAILY`
       - "every weekday" → `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`
       - "every Monday" → `FREQ=WEEKLY;BYDAY=MO`
       - "weekly" → `FREQ=WEEKLY`
       - "every 2 weeks" → `FREQ=WEEKLY;INTERVAL=2`
       - "monthly" → `FREQ=MONTHLY`
       - "monthly on the 15th" → `FREQ=MONTHLY;BYMONTHDAY=15`
       - "yearly on Jan 1" → `FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1`
     If no recurrence is mentioned, omit `--rrule` entirely.

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
       [--rrule "<RRULE string>"] \
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
- `/capture Daily standup every weekday`
  → `Created in Reminders: "Daily standup" (FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR).`

## Out of scope (v2.2)

- Bulk capture from a list (one per `/capture` invocation)
- Sub-reminders / subtasks
