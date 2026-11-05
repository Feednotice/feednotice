# Shared by the backup scripts.
# shellcheck shell=sh
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required (e.g. s3:https://s3.example.com/bucket/feednotice)}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required: keep it outside this server, without it the backups cannot be read}"
export RESTIC_REPOSITORY RESTIC_PASSWORD
STATUS_DIR=/status
# Used by the scripts that source this file.
# shellcheck disable=SC2034
DATA=/data
# shellcheck disable=SC2034
HOST_TAG=feednotice

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Records an outcome as status/<name>.json, which the app reads for its daily report.
status() {
  name="$1"; ok="$2"; detail="$3"
  mkdir -p "$STATUS_DIR"
  printf '{"at":"%s","ok":%s,"detail":"%s"}\n' "$(now)" "$ok" "$(printf '%s' "$detail" | tr -d '"\\\n' | cut -c1-200)" > "$STATUS_DIR/$name.json.tmp"
  mv "$STATUS_DIR/$name.json.tmp" "$STATUS_DIR/$name.json"
}
