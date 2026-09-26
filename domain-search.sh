#!/bin/sh

SELF="$(node -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$0")" || exit 1
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$SELF")" && pwd)"
SKILL_ROOT="$SCRIPT_DIR"

exec node "$SKILL_ROOT/cli/bin/domain-search.js" "$@"
