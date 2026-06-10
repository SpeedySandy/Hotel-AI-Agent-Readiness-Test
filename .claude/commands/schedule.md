---
description: Create a Google Calendar event from natural-language text.
---

# Schedule

## Constants

- **Time zone**: `Europe/Berlin`
- **Default duration**: 60 minutes if not specified
- **Default availability**: BUSY

## Process

1. Parse the user's text into:
   - **summary** — event title
   - **start** — full ISO 8601 local time in `Europe/Berlin`
     (e.g. `2026-06-12T15:00:00`)
   - **end** — start + duration (default 60 min, or whatever the user
     specified)
   - **attendees** — list of email addresses if mentioned (e.g.
     "with jane@example.com and bob@example.com")
   - **location** — if mentioned ("at the office", "Zoom")
   - **add Google Meet** — true if user says "with Meet", "video", or
     "remote"
   - **description** — optional, if user includes context

2. Call the Google Calendar MCP `create_event`:
   - `summary`, `startTime`, `endTime`
   - `timeZone: "Europe/Berlin"`
   - `attendees: [{email: "..."}, ...]` if any
   - `addGoogleMeetUrl: true` if requested
   - `location` if extracted

3. Report concisely:
   - Success → `Scheduled: "<summary>" <YYYY-MM-DD> <HH:MM>–<HH:MM>` +
     attendees + Meet link if created.
   - Failure → surface the error verbatim.

## Examples

- `/schedule Coffee with Jane tomorrow at 3pm`
  → 60-min event, no attendees added by email (just title says Jane)
- `/schedule Project sync next Tuesday 10am for 30 min with bob@example.com`
  → 30-min event, attendee bob@example.com
- `/schedule Q3 review Friday 2-4pm with meet`
  → 2-hour event with Google Meet link

## Out of scope (v2.2)

- Editing existing events (use Google Calendar directly)
- Recurring events (RRULE in /schedule — pass `recurrenceData` to the
  MCP manually for now; not exposed in NL parsing yet)
- Conflict detection / automatic rescheduling
- Calendars other than primary
