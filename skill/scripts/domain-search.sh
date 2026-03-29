#!/bin/sh

SELF="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$0")"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$SELF")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"

exec node "$REPO_ROOT/bin/domain-search.js" "$@"
