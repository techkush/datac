#!/usr/bin/env bash
# Restore a DataC Postgres backup produced by backup.sh.
#
# Usage:  ./scripts/restore.sh backups/datac_YYYYMMDD_HHMMSS.sql.gz
# WARNING: this overwrites the current database contents.
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 1
fi

CONTAINER="${DATAC_DB_CONTAINER:-datac-postgres}"
DB_USER="${POSTGRES_USER:-datac}"
DB_NAME="${POSTGRES_DB:-datac}"

read -r -p "This will OVERWRITE database '$DB_NAME'. Type 'yes' to continue: " ok
[[ "$ok" == "yes" ]] || { echo "Aborted."; exit 1; }

echo "Restoring $FILE -> $DB_NAME"
gunzip -c "$FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
echo "Restore complete."
