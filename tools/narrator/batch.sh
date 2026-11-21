#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
HOME_DIR=${NARRATOR_HOME:-"$HOME/narrator_work/runtime"}
mkdir -p "$HOME_DIR"
exec 8>"$HOME_DIR/batch.lock"
flock -n 8 || { echo 'A narrator batch is already running' >&2; exit 1; }
if (($# == 0)); then set -- intro monument outro; fi
for clip in "$@"; do
    printf '\nBATCH_START %s %s\n' "$clip" "$(date -Is)"
    "$HERE/render.sh" "$clip" --enhancer gfpgan
    printf 'BATCH_DONE %s %s\n' "$clip" "$(date -Is)"
done
