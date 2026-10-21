#!/usr/bin/env bash
# Backup do LegalOS rodando em Docker: banco (pg_dump) + documentos (volume do app), criptografado, com checksum e retenção.
# Uso (como root, no servidor):  /opt/legalos/scripts/server/backup-docker.sh
# Lê do .env.production: BACKUP_PASSPHRASE (OBRIGATÓRIA), BACKUP_DIR (padrão /var/backups/legalos), BACKUP_KEEP_DAYS (14),
# BACKUP_OFFSITE (opcional, destino rsync por SSH, ex.: usuario@outro-servidor:/backups/legalos).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
umask 077
PASS="$(env_get BACKUP_PASSPHRASE)"; [ -n "$PASS" ] || die "defina BACKUP_PASSPHRASE no $ENV_FILE (o backup contém dados sigilosos e só é gravado criptografado)."
DIR="$(env_get BACKUP_DIR)"; DIR="${DIR:-/var/backups/legalos}"
KEEP="$(env_get BACKUP_KEEP_DAYS)"; KEEP="${KEEP:-14}"
OFFSITE="$(env_get BACKUP_OFFSITE)"
STAMP="$(date -u +%Y%m%d-%H%M%S)"; OUT="$DIR/legalos-$STAMP"
mkdir -p "$DIR"
trap 'rm -f "$OUT.dump" "$OUT.files.tar.gz"' EXIT

log "banco → $OUT.dump.enc"
compose exec -T db pg_dump -U legalos --format=custom --no-owner legalos > "$OUT.dump"
[ -s "$OUT.dump" ] || die "pg_dump gerou arquivo vazio"
log "documentos → $OUT.files.tar.gz.enc"
compose exec -T app tar czf - -C /data storage > "$OUT.files.tar.gz"
[ -s "$OUT.files.tar.gz" ] || die "tar dos documentos gerou arquivo vazio"

export BACKUP_PASSPHRASE="$PASS"
for f in "$OUT.dump" "$OUT.files.tar.gz"; do
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$f" -out "$f.enc"
done
( cd "$DIR" && sha256sum "legalos-$STAMP".*.enc > "legalos-$STAMP.sha256" )
find "$DIR" -maxdepth 1 -name 'legalos-*' -type f -mtime "+$KEEP" -delete
log "backup concluído: legalos-$STAMP (retenção ${KEEP} dias)"

if [ -n "$OFFSITE" ]; then
  log "copiando para fora do servidor: $OFFSITE"
  rsync -a -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new" "$DIR"/legalos-"$STAMP".* "$OFFSITE"/ && log "cópia externa ok" || log "AVISO: a cópia externa FALHOU (o backup local está ok)"
else
  log "AVISO: BACKUP_OFFSITE não definido; o backup só existe neste servidor."
fi
