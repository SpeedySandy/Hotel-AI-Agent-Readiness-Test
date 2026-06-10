---
description: Mark an Apple Reminder as complete by exact summary match.
---

# Done

Mark a reminder complete via natural-language summary.

## Process

1. Pre-flight: `pip install -q -r requirements.txt`
2. Parse the user's text:
   - **summary** — the exact reminder text. Be precise; the script
     matches case + whitespace EXACTLY to avoid completing the wrong
     reminder.
   - **list** — if user said "in <list>", extract; otherwise omit.
3. Run:

   ```bash
   python3 scripts/reminders.py complete \
       --summary "<summary>" \
       [--list "<list>"] \
       --json
   ```

4. Report:
   - `completed: true` → `Done: "<summary>" in <list>.`
   - error `"no active reminder matches"` →
     `No matching reminder. Run /briefing to see active reminders and try again with the exact summary.`
   - error `"multiple reminders match"` →
     list the matches inline and ask which list to disambiguate, or
     re-run with `--all` if the user confirms.

## Examples

- `/done Buy groceries`
- `/done Email Bob about Q3 budget in Work list`

## Out of scope (v2.2)

- Fuzzy / partial matching (intentional — exact match prevents
  accidental completion). Use the Reminders app for fuzzy edits.
