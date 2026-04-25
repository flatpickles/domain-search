#!/bin/sh

SELF="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$0")"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$SELF")" && pwd)"
SKILL_ROOT="$SCRIPT_DIR"

exec node "$SKILL_ROOT/cli/bin/domain-search.js" "$@"
