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
[[ "$KEEP" =~ ^[0-9]+$ ]] && [ "$KEEP" -ge 1 ] && [ "$KEEP" -le 3650 ] || die "BACKUP_KEEP_DAYS deve ser um número de 1 a 3650."
OFFSITE="$(env_get BACKUP_OFFSITE)"
mkdir -p "$DIR"
# Impede dois dumps simultâneos e só publica o manifesto quando o conjunto está completo.
exec 9>"$DIR/.backup.lock"
flock -n 9 || die "outro backup está em execução"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
[ ! -e "$DIR/legalos-$STAMP.sha256" ] || die "já existe backup com este horário; aguarde um segundo"
TMP="$(mktemp -d "$DIR/.backup-XXXXXX")"; OUT="$TMP/legalos-$STAMP"
trap 'rm -rf "$TMP"' EXIT

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
( cd "$TMP" && sha256sum "legalos-$STAMP.dump.enc" "legalos-$STAMP.files.tar.gz.enc" > "legalos-$STAMP.sha256" )
mv "$OUT.dump.enc" "$OUT.files.tar.gz.enc" "$DIR/"
mv "$OUT.sha256" "$DIR/"
log "backup local concluído: legalos-$STAMP"

if [ -n "$OFFSITE" ]; then
  log "copiando backup criptografado para fora do servidor"
  # Lista explícita: arquivos temporários em texto puro nunca entram na cópia.
  rsync -a -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new" "$DIR/legalos-$STAMP.dump.enc" "$DIR/legalos-$STAMP.files.tar.gz.enc" "$OFFSITE"/ || die "cópia externa falhou; backup local preservado e retenção adiada"
  rsync -a -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new" "$DIR/legalos-$STAMP.sha256" "$OFFSITE"/ || die "cópia do manifesto falhou; backup local preservado e retenção adiada"
  log "cópia externa ok"
else
  log "AVISO: BACKUP_OFFSITE não definido; o backup só existe neste servidor."
fi
find "$DIR" -maxdepth 1 -name 'legalos-*' -type f -mtime "+$KEEP" -delete
log "retenção aplicada: ${KEEP} dias"
