#!/usr/bin/env bash
# Dump the DataC Postgres database to a timestamped gzipped file.
#
# Usage:  ./scripts/backup.sh [output_dir]
# Cron:   0 2 * * *  cd /path/to/datac && ./scripts/backup.sh backups >> backups/backup.log 2>&1
set -euo pipefail

OUT_DIR="${1:-backups}"
CONTAINER="${DATAC_DB_CONTAINER:-datac-postgres}"
DB_USER="${POSTGRES_USER:-datac}"
DB_NAME="${POSTGRES_DB:-datac}"

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$OUT_DIR/datac_${STAMP}.sql.gz"

echo "Backing up $DB_NAME from container $CONTAINER -> $FILE"
docker exec -t "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$FILE"
echo "Done: $(du -h "$FILE" | cut -f1)"

# Retain the 14 most recent backups.
KEEP="${DATAC_BACKUP_KEEP:-14}"
ls -1t "$OUT_DIR"/datac_*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "Retention: keeping newest $KEEP backups."
