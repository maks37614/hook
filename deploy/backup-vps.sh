#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077
compose=(docker compose -p hook2 -f compose.yaml -f compose.vps.yaml)
mkdir -p backups
container_id="$("${compose[@]}" ps -q hook2)"
if [[ -z "$container_id" ]]; then
  printf '%s\n' 'hook2 must be running before a backup; no data was changed.' >&2
  exit 1
fi
backup_directory="$(pwd)/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$backup_directory"
# A stopped single writer gives a consistent snapshot of all JSON stores.
trap '"${compose[@]}" start hook2 >/dev/null' EXIT
"${compose[@]}" stop -t 30 hook2
docker cp "$container_id:/data/." "$backup_directory/"
chmod -R go-rwx "$backup_directory"
printf 'Saved backup: %s\n' "$backup_directory"
