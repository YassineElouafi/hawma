#!/bin/sh
# Hawma Postgres backups: custom-format dumps every BACKUP_INTERVAL_S seconds, verified, optionally encrypted, pruned.
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"; KEEP="${BACKUP_KEEP:-56}"; INTERVAL="${BACKUP_INTERVAL_S:-21600}"
mkdir -p "$BACKUP_DIR"

backup_once() {
  ts="$(date -u +%Y%m%dT%H%M%SZ)"; out="$BACKUP_DIR/hawma-$ts.dump"
  pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" -f "$out.tmp"
  pg_restore --list "$out.tmp" > /dev/null                       # a dump that cannot be read back is not a backup
  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then                        # dumps contain personal data: encrypt when a passphrase is configured
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$out.tmp" -out "$out.enc.tmp"
    rm -f "$out.tmp"; mv "$out.enc.tmp" "$out.enc"; out="$out.enc"
  else mv "$out.tmp" "$out"; fi
  echo "backup ok: $out ($(du -h "$out" | cut -f1))"
  ls -1t "$BACKUP_DIR"/hawma-*.dump* 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
}

if [ "${1:-loop}" = "once" ]; then backup_once; exit 0; fi
while true; do
  backup_once || echo "BACKUP FAILED at $(date -u +%FT%TZ)" >&2
  sleep "$INTERVAL"
done
