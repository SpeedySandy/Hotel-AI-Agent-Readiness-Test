#!/usr/bin/env python3
"""Read Apple Reminders via iCloud CalDAV and emit JSON.

Reads ICLOUD_USERNAME and ICLOUD_APP_PASSWORD from the environment.
The password must be an app-specific password generated at
https://appleid.apple.com — NOT the main Apple ID password.

Usage:
    python3 reminders.py --due-through tomorrow --include-overdue \\
        --tz Europe/Berlin --json
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


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--due-through", default="today",
                    help="today | tomorrow | +Nd (default: today)")
    ap.add_argument("--include-overdue", action="store_true",
                    help="also include reminders past their due date")
    ap.add_argument("--list", default=None,
                    help="restrict to one Reminders list by exact name")
    ap.add_argument("--tz", default="UTC",
                    help="IANA timezone for 'today' computation")
    ap.add_argument("--json", action="store_true", default=True,
                    help="(default) emit JSON to stdout")
    args = ap.parse_args()

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

    username = os.environ.get("ICLOUD_USERNAME")
    password = os.environ.get("ICLOUD_APP_PASSWORD")
    if not username or not password:
        emit({"ok": False,
              "error": "Missing ICLOUD_USERNAME or ICLOUD_APP_PASSWORD env vars",
              "reminders": []})
        return 2

    try:
        import caldav  # local import so missing dep surfaces as a clean error
    except ImportError:
        emit({"ok": False,
              "error": "caldav not installed; run: pip install -r requirements.txt",
              "reminders": []})
        return 4

    try:
        client = caldav.DAVClient(url=ICLOUD_CALDAV_URL,
                                  username=username, password=password)
        principal = client.principal()
        calendars = principal.calendars()
    except Exception as e:
        emit({"ok": False,
              "error": f"CalDAV connection failed: {e}",
              "reminders": []})
        return 3

    results: list[dict] = []
    for cal in calendars:
        try:
            todos = cal.todos()  # incomplete only by default
        except Exception:
            continue  # this calendar doesn't support VTODO (it's a VEVENT cal)

        list_name = getattr(cal, "name", None) or "Unnamed"
        if args.list and list_name != args.list:
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


if __name__ == "__main__":
    sys.exit(main())
