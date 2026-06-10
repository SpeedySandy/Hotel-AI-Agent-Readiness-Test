#!/usr/bin/env python3
"""Apple Reminders via iCloud CalDAV.

Subcommands:
  list      Query reminders by due date.
  create    Create a new reminder (idempotent on summary + due + list).
  complete  Mark a reminder complete by exact summary match.
  edit      Rename / change due / change rrule on an existing reminder.
  lists     Enumerate available Reminders lists.

Reads ICLOUD_USERNAME and ICLOUD_APP_PASSWORD from the environment.
The password must be an app-specific password generated at
https://appleid.apple.com — NOT the main Apple ID password.

Examples:
    python3 reminders.py list --due-through tomorrow --include-overdue \\
        --tz Europe/Berlin --json
    python3 reminders.py create --summary "Buy groceries" \\
        --due 2026-06-12 --list "Personal" --json
    python3 reminders.py create --summary "Standup" \\
        --rrule "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" --json
    python3 reminders.py complete --summary "Buy groceries" --json
    python3 reminders.py edit --summary "Standup" --new-summary "Daily standup" --json
    python3 reminders.py lists --json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ICLOUD_CALDAV_URL = "https://caldav.icloud.com/"


def parse_due_through(spec: str, today: date) -> date:
    if spec == "today":
        return today
    if spec == "tomorrow":
        return today + timedelta(days=1)
    if spec.startswith("+") and spec.endswith("d"):
        return today + timedelta(days=int(spec[1:-1]))
    raise ValueError(f"unrecognized --due-through value: {spec!r}")


def parse_iso_date(s: str) -> date:
    return date.fromisoformat(s)


def component_due_date(component) -> date | None:
    due = component.get("DUE")
    if due is None:
        return None
    val = due.dt
    if isinstance(val, datetime):
        return val.date()
    return val


def emit(payload: dict) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def connect():
    """Return (principal, None) on success or (None, error_str) on failure."""
    username = os.environ.get("ICLOUD_USERNAME")
    password = os.environ.get("ICLOUD_APP_PASSWORD")
    if not username or not password:
        return None, "Missing ICLOUD_USERNAME or ICLOUD_APP_PASSWORD env vars"
    try:
        import caldav  # local import so missing dep surfaces as a clean error
    except ImportError:
        return None, "caldav not installed; run: pip install -r requirements.txt"
    try:
        client = caldav.DAVClient(url=ICLOUD_CALDAV_URL,
                                  username=username, password=password)
        principal = client.principal()
        return principal, None
    except Exception as e:
        return None, f"CalDAV connection failed: {e}"


def todo_lists(principal) -> list:
    """Return only calendars that support VTODO (Reminders lists)."""
    result = []
    for cal in principal.calendars():
        try:
            cal.todos()  # probe
            result.append(cal)
        except Exception:
            continue
    return result


def find_target_list(principal, name: str | None):
    """Return (target_calendar, error_payload_or_None)."""
    lists = todo_lists(principal)
    if not lists:
        return None, {"ok": False, "error": "no Reminders lists found on this account"}
    if name:
        for cal in lists:
            if (getattr(cal, "name", None) or "") == name:
                return cal, None
        return None, {
            "ok": False,
            "error": f"list not found: {name!r}",
            "available": [getattr(c, "name", None) or "Unnamed" for c in lists],
        }
    # Prefer a list literally named "Reminders"; otherwise first available.
    for cal in lists:
        if (getattr(cal, "name", None) or "") == "Reminders":
            return cal, None
    return lists[0], None


def find_todos_by_summary(principal, summary: str, list_name: str | None):
    """Return list of (cal, todo, component) matching summary in non-completed state."""
    matches = []
    lists = todo_lists(principal)
    for cal in lists:
        cal_name = getattr(cal, "name", None) or "Unnamed"
        if list_name and cal_name != list_name:
            continue
        try:
            todos = cal.todos()
        except Exception:
            continue
        for todo in todos:
            try:
                comp = todo.icalendar_component
            except Exception:
                continue
            if str(comp.get("STATUS") or "").upper() == "COMPLETED":
                continue
            if str(comp.get("SUMMARY") or "").strip() == summary:
                matches.append((cal, todo, comp))
    return matches


def cmd_list(args) -> int:
    try:
        tz = ZoneInfo(args.tz)
    except ZoneInfoNotFoundError:
        emit({"ok": False, "error": f"unknown timezone: {args.tz}",
              "reminders": []})
        return 2
    today = datetime.now(tz).date()
    try:
        due_through = parse_due_through(args.due_through, today)
    except ValueError as e:
        emit({"ok": False, "error": str(e), "reminders": []})
        return 2

    principal, err = connect()
    if err:
        emit({"ok": False, "error": err, "reminders": []})
        return 2 if err.startswith("Missing") else 3

    results: list[dict] = []
    for cal in todo_lists(principal):
        list_name = getattr(cal, "name", None) or "Unnamed"
        if args.list and list_name != args.list:
            continue
        try:
            todos = cal.todos()
        except Exception:
            continue
        for todo in todos:
            try:
                component = todo.icalendar_component
            except Exception:
                continue
            status = str(component.get("STATUS") or "").upper()
            if status == "COMPLETED":
                continue
            summary = str(component.get("SUMMARY") or "(no title)")
            priority_raw = component.get("PRIORITY")
            due = component_due_date(component)
            overdue = due is not None and due < today

            include = False
            if overdue and args.include_overdue:
                include = True
            elif due is not None and due <= due_through:
                include = True
            if not include:
                continue

            try:
                priority = int(priority_raw) if priority_raw is not None else None
            except (TypeError, ValueError):
                priority = None

            results.append({
                "list": list_name,
                "summary": summary,
                "due": due.isoformat() if due else None,
                "overdue": overdue,
                "priority": priority,
            })

    # overdue first, then by due date, then by priority (lower = higher)
    results.sort(key=lambda r: (
        not r["overdue"],
        r["due"] or "9999-12-31",
        r["priority"] if r["priority"] is not None else 99,
    ))

    emit({
        "ok": True,
        "today": today.isoformat(),
        "due_through": due_through.isoformat(),
        "tz": args.tz,
        "count": len(results),
        "reminders": results,
    })
    return 0


def cmd_create(args) -> int:
    summary = (args.summary or "").strip()
    if not summary:
        emit({"ok": False, "error": "summary cannot be empty"})
        return 2

    due_date = None
    if args.due:
        try:
            due_date = parse_iso_date(args.due)
        except ValueError:
            emit({"ok": False,
                  "error": f"--due must be YYYY-MM-DD, got: {args.due!r}"})
            return 2

    principal, err = connect()
    if err:
        emit({"ok": False, "error": err})
        return 2 if err.startswith("Missing") else 3

    target, err_payload = find_target_list(principal, args.list)
    if err_payload:
        emit(err_payload)
        return 2 if "list not found" in err_payload["error"] else 3
    target_name = getattr(target, "name", None) or "Unnamed"

    # Idempotency check — same summary + same due date in this list → skip.
    try:
        existing_todos = target.todos()
    except Exception:
        existing_todos = []
    for existing in existing_todos:
        try:
            comp = existing.icalendar_component
        except Exception:
            continue
        if str(comp.get("STATUS") or "").upper() == "COMPLETED":
            continue
        if str(comp.get("SUMMARY") or "").strip() != summary:
            continue
        if component_due_date(comp) == due_date:
            emit({
                "ok": True,
                "existed": True,
                "list": target_name,
                "summary": summary,
                "due": due_date.isoformat() if due_date else None,
                "rrule": args.rrule,
            })
            return 0

    try:
        from icalendar import Calendar, Todo, vRecur
    except ImportError:
        emit({"ok": False,
              "error": "icalendar not installed; run: pip install -r requirements.txt"})
        return 4

    cal_obj = Calendar()
    cal_obj.add("prodid", "-//morning-briefing//personal-os//EN")
    cal_obj.add("version", "2.0")

    vtodo = Todo()
    vtodo.add("uid", f"{uuid.uuid4()}@personal-os")
    vtodo.add("dtstamp", datetime.now(timezone.utc))
    vtodo.add("summary", summary)
    if due_date:
        vtodo.add("due", due_date)
    if args.rrule:
        try:
            vtodo["rrule"] = vRecur(vRecur.from_ical(args.rrule))
        except Exception as e:
            emit({"ok": False, "error": f"invalid --rrule: {e}"})
            return 2

    cal_obj.add_component(vtodo)

    try:
        target.save_todo(ical=cal_obj.to_ical().decode("utf-8"))
    except Exception as e:
        emit({"ok": False, "error": f"create failed: {e}"})
        return 3

    emit({
        "ok": True,
        "created": True,
        "list": target_name,
        "summary": summary,
        "due": due_date.isoformat() if due_date else None,
        "rrule": args.rrule,
    })
    return 0


def cmd_complete(args) -> int:
    summary = (args.summary or "").strip()
    if not summary:
        emit({"ok": False, "error": "summary cannot be empty"})
        return 2

    principal, err = connect()
    if err:
        emit({"ok": False, "error": err})
        return 2 if err.startswith("Missing") else 3

    matches = find_todos_by_summary(principal, summary, args.list)
    if not matches:
        emit({"ok": False, "error": "no active reminder matches that summary",
              "summary": summary})
        return 1
    if len(matches) > 1 and not args.all:
        emit({
            "ok": False,
            "error": "multiple reminders match; pass --all to complete all, "
                     "or --list to disambiguate",
            "matches": [
                {
                    "list": getattr(cal, "name", None) or "Unnamed",
                    "due": (component_due_date(comp).isoformat()
                            if component_due_date(comp) else None),
                }
                for cal, _, comp in matches
            ],
        })
        return 1

    completed = []
    for cal, todo, _comp in matches:
        try:
            todo.complete()  # caldav 1.x convenience
        except Exception:
            # Fallback: manually set STATUS/COMPLETED
            try:
                ical = todo.icalendar_instance
                vt = next(c for c in ical.subcomponents if c.name == "VTODO")
                vt.pop("STATUS", None)
                vt.add("STATUS", "COMPLETED")
                vt.pop("COMPLETED", None)
                vt.add("COMPLETED", datetime.now(timezone.utc))
                vt.pop("PERCENT-COMPLETE", None)
                vt.add("PERCENT-COMPLETE", 100)
                todo.data = ical.to_ical().decode("utf-8")
                todo.save()
            except Exception as e:
                emit({"ok": False, "error": f"complete failed: {e}"})
                return 3
        completed.append({
            "list": getattr(cal, "name", None) or "Unnamed",
            "summary": summary,
        })

    emit({"ok": True, "completed": True, "count": len(completed),
          "items": completed})
    return 0


def cmd_edit(args) -> int:
    summary = (args.summary or "").strip()
    if not summary:
        emit({"ok": False, "error": "summary cannot be empty"})
        return 2
    if not any([args.new_summary, args.new_due, args.clear_due, args.new_rrule, args.clear_rrule]):
        emit({"ok": False,
              "error": "nothing to change; pass --new-summary / --new-due / --clear-due / --new-rrule / --clear-rrule"})
        return 2

    new_due = None
    if args.new_due:
        try:
            new_due = parse_iso_date(args.new_due)
        except ValueError:
            emit({"ok": False,
                  "error": f"--new-due must be YYYY-MM-DD, got: {args.new_due!r}"})
            return 2

    principal, err = connect()
    if err:
        emit({"ok": False, "error": err})
        return 2 if err.startswith("Missing") else 3

    matches = find_todos_by_summary(principal, summary, args.list)
    if not matches:
        emit({"ok": False, "error": "no active reminder matches that summary",
              "summary": summary})
        return 1
    if len(matches) > 1:
        emit({
            "ok": False,
            "error": "multiple reminders match; pass --list to disambiguate",
            "matches": [
                {"list": getattr(cal, "name", None) or "Unnamed"}
                for cal, _, _ in matches
            ],
        })
        return 1

    try:
        from icalendar import vRecur
    except ImportError:
        emit({"ok": False,
              "error": "icalendar not installed; run: pip install -r requirements.txt"})
        return 4

    cal, todo, _comp = matches[0]
    try:
        ical = todo.icalendar_instance
        vt = next(c for c in ical.subcomponents if c.name == "VTODO")
        if args.new_summary:
            vt.pop("SUMMARY", None)
            vt.add("SUMMARY", args.new_summary.strip())
        if args.clear_due:
            vt.pop("DUE", None)
        if new_due:
            vt.pop("DUE", None)
            vt.add("DUE", new_due)
        if args.clear_rrule:
            vt.pop("RRULE", None)
        if args.new_rrule:
            vt.pop("RRULE", None)
            try:
                vt["RRULE"] = vRecur(vRecur.from_ical(args.new_rrule))
            except Exception as e:
                emit({"ok": False, "error": f"invalid --new-rrule: {e}"})
                return 2
        todo.data = ical.to_ical().decode("utf-8")
        todo.save()
    except Exception as e:
        emit({"ok": False, "error": f"edit failed: {e}"})
        return 3

    emit({
        "ok": True,
        "edited": True,
        "list": getattr(cal, "name", None) or "Unnamed",
        "old_summary": summary,
        "new_summary": args.new_summary or summary,
        "due": (new_due.isoformat() if new_due
                else ("cleared" if args.clear_due else "unchanged")),
        "rrule": (args.new_rrule if args.new_rrule
                  else ("cleared" if args.clear_rrule else "unchanged")),
    })
    return 0


def cmd_lists(args) -> int:
    principal, err = connect()
    if err:
        emit({"ok": False, "error": err, "lists": []})
        return 2 if err.startswith("Missing") else 3
    names = [getattr(c, "name", None) or "Unnamed" for c in todo_lists(principal)]
    emit({"ok": True, "lists": names, "count": len(names)})
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sp = ap.add_subparsers(dest="cmd", required=True)

    p_list = sp.add_parser("list", help="Query reminders by due date.")
    p_list.add_argument("--due-through", default="today",
                        help="today | tomorrow | +Nd (default: today)")
    p_list.add_argument("--include-overdue", action="store_true")
    p_list.add_argument("--list", default=None)
    p_list.add_argument("--tz", default="UTC")
    p_list.add_argument("--json", action="store_true", default=True)
    p_list.set_defaults(func=cmd_list)

    p_create = sp.add_parser("create", help="Create a new reminder.")
    p_create.add_argument("--summary", required=True)
    p_create.add_argument("--due", default=None, help="YYYY-MM-DD (optional)")
    p_create.add_argument("--list", default=None)
    p_create.add_argument("--rrule", default=None,
                          help='RFC 5545 RRULE, e.g. "FREQ=WEEKLY;BYDAY=MO"')
    p_create.add_argument("--json", action="store_true", default=True)
    p_create.set_defaults(func=cmd_create)

    p_complete = sp.add_parser("complete", help="Complete a reminder by summary.")
    p_complete.add_argument("--summary", required=True,
                            help="exact summary text (case + whitespace sensitive)")
    p_complete.add_argument("--list", default=None,
                            help="restrict matching to this list")
    p_complete.add_argument("--all", action="store_true",
                            help="complete all matches if more than one")
    p_complete.add_argument("--json", action="store_true", default=True)
    p_complete.set_defaults(func=cmd_complete)

    p_edit = sp.add_parser("edit", help="Edit an existing reminder.")
    p_edit.add_argument("--summary", required=True, help="current exact summary")
    p_edit.add_argument("--list", default=None)
    p_edit.add_argument("--new-summary", default=None)
    p_edit.add_argument("--new-due", default=None, help="YYYY-MM-DD")
    p_edit.add_argument("--clear-due", action="store_true")
    p_edit.add_argument("--new-rrule", default=None)
    p_edit.add_argument("--clear-rrule", action="store_true")
    p_edit.add_argument("--json", action="store_true", default=True)
    p_edit.set_defaults(func=cmd_edit)

    p_lists = sp.add_parser("lists", help="Enumerate Reminders lists.")
    p_lists.add_argument("--json", action="store_true", default=True)
    p_lists.set_defaults(func=cmd_lists)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
