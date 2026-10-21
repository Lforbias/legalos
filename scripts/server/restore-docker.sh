#!/usr/bin/env bash
# RESTAURA um backup no servidor Docker. DESTRUTIVO: apaga o banco atual e os documentos atuais.
# Uso: restore-docker.sh <prefixo> --yes     (ex.: restore-docker.sh legalos-20261020-030001 --yes)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
umask 077
P="${1:-}"; [ -n "$P" ] && [ "${2:-}" = "--yes" ] || die "uso: restore-docker.sh <prefixo> --yes   (DESTRUTIVO)"
PASS="$(env_get BACKUP_PASSPHRASE)"; [ -n "$PASS" ] || die "BACKUP_PASSPHRASE ausente no $ENV_FILE"
DIR="$(env_get BACKUP_DIR)"; DIR="${DIR:-/var/backups/legalos}"
( cd "$DIR" && sha256sum -c "$P.sha256" ) || die "checksum NÃO confere; recusando restaurar"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export BACKUP_PASSPHRASE="$PASS"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$DIR/$P.dump.enc" -out "$TMP/db.dump"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$DIR/$P.files.tar.gz.enc" -out "$TMP/files.tar.gz"
log "parando o app"; compose stop app
log "recriando o banco"
compose exec -T db psql -U legalos -d postgres -c "DROP DATABASE IF EXISTS legalos WITH (FORCE)" -c "CREATE DATABASE legalos OWNER legalos"
compose exec -T db pg_restore -U legalos --no-owner -d legalos < "$TMP/db.dump"
log "restaurando documentos"
compose run --rm --no-deps -T --user root --entrypoint sh app -c 'rm -rf /data/storage/* && tar xzf - -C /data && chown -R legalos:legalos /data/storage' < "$TMP/files.tar.gz"
log "subindo o app"; compose up -d app
log "restauração concluída. Confira: curl -s http://127.0.0.1:3000/api/ready"
