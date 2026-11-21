#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
HOME_DIR=${NARRATOR_HOME:-"$HOME/narrator_work/runtime"}
if [[ ! -x "$HOME_DIR/venv/bin/python" ]]; then
    echo "Run $HERE/setup.sh first" >&2
    exit 1
fi
export NARRATOR_HOME="$HOME_DIR"
exec "$HOME_DIR/venv/bin/python" "$HERE/render.py" "$@"
