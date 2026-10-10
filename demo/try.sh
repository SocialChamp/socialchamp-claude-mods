#!/usr/bin/env bash
# Opens the calendar pane on made-up demo data (a café called Harbor Cafe). No Social Champ account is used:
# Claude Code starts with only the demo connector, and the mod runs from this folder with its own local store.
# Usage: ./demo/try.sh [week|month|day|issues|drafts]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
config="$(python3 -c 'import json, sys; print(json.dumps({"mcpServers": {"SocialChamp": {"command": sys.executable, "args": [sys.argv[1]]}}}))' "$here/demo_sc.py")"
exec claude --strict-mcp-config --mcp-config "$config" --plugin-dir "$here/.." "/socialchamp-calendar ${1:-week}"
