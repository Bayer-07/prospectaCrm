#!/usr/bin/env sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${BACKUP_DIR:-/var/backups/prospecta}/$timestamp"
mkdir -p "$backup_dir"

docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-prospecta}" -d "${POSTGRES_DB:-prospecta}" -Fc > "$backup_dir/prospecta.dump"
docker compose exec -T evolution-postgres pg_dump -U "${EVOLUTION_POSTGRES_USER:-evolution}" -d "${EVOLUTION_POSTGRES_DB:-evolution}" -Fc > "$backup_dir/evolution.dump"
docker run --rm --volumes-from prospecta-minio-1 -v "$backup_dir:/backup" alpine sh -c 'tar czf /backup/minio.tgz /data'

tar czf "$backup_dir.tar.gz" -C "$(dirname "$backup_dir")" "$timestamp"
rm -rf "$backup_dir"

if [ -n "${BACKUP_UPLOAD_COMMAND:-}" ]; then
  sh -c "$BACKUP_UPLOAD_COMMAND '$backup_dir.tar.gz'"
fi

find "$(dirname "$backup_dir")" -type f -name '*.tar.gz' -mtime +30 -delete
echo "Backup criado: $backup_dir.tar.gz"
