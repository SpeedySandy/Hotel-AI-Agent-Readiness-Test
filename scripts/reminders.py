#!/usr/bin/env python3
"""Apple Reminders via iCloud CalDAV.

Subcommands:
  list    Query reminders by due date.
  create  Create a new reminder (idempotent on summary + due + list).
  lists   Enumerate available Reminders lists.

Reads ICLOUD_USERNAME and ICLOUD_APP_PASSWORD from the environment.
The password must be an app-specific password generated at
https://appleid.apple.com — NOT the main Apple ID password.

Examples:
    python3 reminders.py list --due-through tomorrow --include-overdue \\
        --tz Europe/Berlin --json
    python3 reminders.py create --summary "Buy groceries" \\
        --due 2026-06-12 --list "Personal" --json
    python3 reminders.py lists --json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta
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

    lists = todo_lists(principal)
    if not lists:
        emit({"ok": False, "error": "no Reminders lists found on this account"})
        return 3

    target = None
    if args.list:
        for cal in lists:
            if (getattr(cal, "name", None) or "") == args.list:
                target = cal
                break
        if target is None:
            emit({
                "ok": False,
                "error": f"list not found: {args.list!r}",
                "available": [getattr(c, "name", None) or "Unnamed" for c in lists],
            })
            return 2
    else:
        # Prefer a list literally named "Reminders"; otherwise first available.
        for cal in lists:
            if (getattr(cal, "name", None) or "") == "Reminders":
                target = cal
                break
        target = target or lists[0]

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
            })
            return 0

    try:
        import vobject
    except ImportError:
        emit({"ok": False,
              "error": "vobject not installed; run: pip install -r requirements.txt"})
        return 4

    cal_obj = vobject.iCalendar()
    vtodo = cal_obj.add("vtodo")
    vtodo.add("summary").value = summary
    if due_date:
        vtodo.add("due").value = due_date

    try:
        target.save_todo(ical=cal_obj.serialize())
    except Exception as e:
        emit({"ok": False, "error": f"create failed: {e}"})
        return 3

    emit({
        "ok": True,
        "created": True,
        "list": target_name,
        "summary": summary,
        "due": due_date.isoformat() if due_date else None,
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
    p_list.add_argument("--include-overdue", action="store_true",
                        help="also include reminders past their due date")
    p_list.add_argument("--list", default=None,
                        help="restrict to one Reminders list by exact name")
    p_list.add_argument("--tz", default="UTC",
                        help="IANA timezone for 'today' computation")
    p_list.add_argument("--json", action="store_true", default=True)
    p_list.set_defaults(func=cmd_list)

    p_create = sp.add_parser("create", help="Create a new reminder.")
    p_create.add_argument("--summary", required=True,
                          help="reminder text")
    p_create.add_argument("--due", default=None,
                          help="due date as YYYY-MM-DD (optional)")
    p_create.add_argument("--list", default=None,
                          help="target list (default: 'Reminders' or first)")
    p_create.add_argument("--json", action="store_true", default=True)
    p_create.set_defaults(func=cmd_create)

    p_lists = sp.add_parser("lists", help="Enumerate available Reminders lists.")
    p_lists.add_argument("--json", action="store_true", default=True)
    p_lists.set_defaults(func=cmd_lists)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
