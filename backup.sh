#!/usr/bin/env bash
# ============================================================
# Remedy — database backup
# Dumps the PostgreSQL database (running in the pharmacy_db container) to a
# timestamped, gzipped file under ./backups, and prunes dumps older than
# RETENTION_DAYS.
#
# Usage:
#   ./backup.sh                 # write a backup, prune old ones
#   RETENTION_DAYS=30 ./backup.sh
#
# Schedule daily via cron, e.g.:
#   0 2 * * *  cd /home/banoyah/pharmacy-management-system && ./backup.sh >> backups/backup.log 2>&1
# Restore with:
#   gunzip -c backups/remedy-YYYYMMDD-HHMMSS.sql.gz | docker exec -i pharmacy_db psql -U pharmacy_user -d pharmacy_db
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

CONTAINER="${DB_CONTAINER:-pharmacy_db}"
DB_USER="${DB_USER:-pharmacy_user}"
DB_NAME="${DB_NAME:-pharmacy_db}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
OUT_DIR="backups"

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/remedy-$STAMP.sql.gz"

echo "▶ Backing up $DB_NAME from container $CONTAINER → $FILE"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists | gzip > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "  ✓ wrote $FILE ($SIZE)"

echo "▶ Pruning backups older than ${RETENTION_DAYS} days"
find "$OUT_DIR" -name 'remedy-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete || true
echo "  ✓ done"
