---
description: Suggest meeting times that work for you and other attendees.
---

# Find time

Use the Google Calendar `suggest_time` tool to propose slots that
work for all attendees.

## Constants

- **Time zone**: `Europe/Berlin`
- **Default duration**: 30 minutes
- **Default window**: next 5 business days
- **Default work hours**: 09:00–17:00, weekdays only

## Process

1. Parse the user's text into:
   - **attendees** — list of email addresses. ALWAYS prepend `primary`
     so the user's own calendar is included.
   - **duration** — minutes (default 30)
   - **window start / window end** — ISO 8601 (e.g. "tomorrow afternoon"
     → tomorrow 12:00 → tomorrow 17:00; "this week" → today → Friday EOD)
   - **preferences** — `startHour`, `endHour`, `excludeWeekends` if
     implied by the request

2. Call Google Calendar MCP `suggest_time`:
   - `attendeeEmails: ["primary", ...]`
   - `startTime`, `endTime` (ISO 8601)
   - `durationMinutes`
   - `preferences: {startHour, endHour, excludeWeekends, pageSize: 5}`
   - `timeZone: "Europe/Berlin"`

3. Report up to 5 slots as a numbered list, formatted as:
   `1. Wed Jun 12, 14:00–14:30 Europe/Berlin`
   Offer: `Reply with the number and I'll /schedule it for you.`

## Examples

- `/findtime 30 min with jane@example.com this week`
- `/findtime 1 hour with bob@example.com and carol@example.com tomorrow afternoon`
- `/findtime 45 min next Monday morning, weekdays only`

## Default fallbacks

- No duration → 30 minutes
- No window → next 5 business days starting tomorrow morning
- No attendees other than self → query `primary` alone (shows your free slots)
