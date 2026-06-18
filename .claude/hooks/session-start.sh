#!/bin/bash
# SessionStart hook — install Python deps so /briefing's reminders.py
# helper and /briefing's HTML conversion are ready without manual pip.
#
# Only runs in Claude Code on the web (cloud sessions) where each
# container is fresh. Local sessions on the user's machine usually
# already have these deps installed.
#
# Idempotent: pip will no-op if deps are already satisfied.

set -euo pipefail

# Skip on local / non-remote sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REQ="${CLAUDE_PROJECT_DIR:-.}/requirements.txt"
if [ ! -f "$REQ" ]; then
  exit 0
fi

pip install --quiet --disable-pip-version-check -r "$REQ" >/dev/null 2>&1 || true
