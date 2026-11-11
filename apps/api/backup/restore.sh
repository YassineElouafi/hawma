#!/bin/sh
# Usage: restore.sh <dump-file> <target DATABASE_URL>   (target should be an EMPTY database; existing objects are dropped)
set -eu
f="${1:?dump file}"; target="${2:?target database url}"
tmp="$(mktemp)"
case "$f" in
  *.enc) : "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required for encrypted dumps}"; openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$f" -out "$tmp" ;;
  *) cp "$f" "$tmp" ;;
esac
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$target" "$tmp"
rm -f "$tmp"; echo "restore complete"
