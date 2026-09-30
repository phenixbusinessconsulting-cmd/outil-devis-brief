#!/bin/bash
# Sauvegarde quotidienne : base SQLite (copie cohérente, service en marche)
# et captures. Rotation : les archives de plus de 30 jours sont supprimées.
#
# Variables (lues dans le .env de l'application si présentes) :
#   DATABASE_URL  file:/var/lib/outil-devis/data.db
#   UPLOAD_DIR    /var/lib/outil-devis/uploads
#   BACKUP_DIR    /var/backups/outil-devis
#   BACKUP_DAYS   30
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$APP_DIR/.env" ]; then
  # Uniquement les variables utiles, sans exécuter le fichier.
  while IFS='=' read -r key value; do
    case "$key" in
      DATABASE_URL|UPLOAD_DIR|BACKUP_DIR|BACKUP_DAYS)
        value="${value%\"}"; value="${value#\"}"
        export "$key=$value" ;;
    esac
  done < <(grep -E '^(DATABASE_URL|UPLOAD_DIR|BACKUP_DIR|BACKUP_DAYS)=' "$APP_DIR/.env")
fi

cd "$APP_DIR"
DB_FILE="$(realpath -m "${DATABASE_URL#file:}")"
UPLOAD_DIR="$(realpath -m "${UPLOAD_DIR:-/var/lib/outil-devis/uploads}")"
BACKUP_DIR="$(realpath -m "${BACKUP_DIR:-/var/backups/outil-devis}")"
BACKUP_DAYS="${BACKUP_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ -f "$DB_FILE" ] || { echo "✗ Base introuvable : $DB_FILE"; exit 1; }
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Copie cohérente même pendant une écriture, vérifiée ensuite.
node scripts/backup-db.js "$DB_FILE" "$WORK/data.db"

ARCHIVE="$BACKUP_DIR/outil-devis_$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK" data.db -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
chmod 600 "$ARCHIVE"

find "$BACKUP_DIR" -name 'outil-devis_*.tar.gz' -type f -mtime +"$((BACKUP_DAYS - 1))" -delete

echo "✓ Sauvegarde $(basename "$ARCHIVE") ($(du -h "$ARCHIVE" | cut -f1)), $(find "$BACKUP_DIR" -name 'outil-devis_*.tar.gz' | wc -l) archive(s) conservée(s)"
