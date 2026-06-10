#!/usr/bin/env python3
"""Convert markdown on stdin to a styled HTML document on stdout.

Used by /briefing to produce the htmlBody for Gmail drafts. The
markdown body is also kept as the plain-text alternative.

Example:
    python3 scripts/md_to_html.py < briefing.md > briefing.html
"""

from __future__ import annotations

import sys


CSS = """
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
  line-height: 1.5;
  color: #222;
}
h1 { font-size: 1.4em; border-bottom: 1px solid #ddd; padding-bottom: 0.2em; }
h2 { font-size: 1.15em; color: #444; margin-top: 1.5em; }
h3 { font-size: 1.0em; color: #555; }
ul { padding-left: 1.2em; }
li { margin: 0.25em 0; }
code {
  background: #f4f4f4; padding: 1px 4px; border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.95em;
}
em { color: #666; }
hr { border: none; border-top: 1px solid #eee; margin: 1.5em 0; }
blockquote { border-left: 3px solid #ddd; margin: 0; padding-left: 12px; color: #555; }
"""


def main() -> int:
    try:
        import markdown
    except ImportError:
        print("ERROR: markdown not installed; run: pip install -r requirements.txt",
              file=sys.stderr)
        return 4

    src = sys.stdin.read()
    body_html = markdown.markdown(src, extensions=["extra", "sane_lists"])
    print(
        "<!DOCTYPE html>\n"
        '<html><head><meta charset="utf-8"><style>'
        f"{CSS}"
        "</style></head><body>\n"
        f"{body_html}\n"
        "</body></html>"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
