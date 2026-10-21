#!/usr/bin/env bash
# Prova que um backup restaura: confere checksum, descriptografa, restaura num banco TEMPORÁRIO e confere as tabelas.
# Não toca no banco de produção. Uso: verify-backup-docker.sh [prefixo]   (sem argumento, usa o mais recente)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
umask 077
PASS="$(env_get BACKUP_PASSPHRASE)"; [ -n "$PASS" ] || die "BACKUP_PASSPHRASE ausente no $ENV_FILE"
DIR="$(env_get BACKUP_DIR)"; DIR="${DIR:-/var/backups/legalos}"
P="${1:-$(ls -1t "$DIR"/legalos-*.sha256 2>/dev/null | head -1 | sed 's/\.sha256$//' | xargs -r basename)}"
[ -n "$P" ] || die "nenhum backup encontrado em $DIR"
log "verificando $P"
( cd "$DIR" && sha256sum -c "$P.sha256" ) || die "checksum NÃO confere: backup corrompido ou adulterado"
TMP="$(mktemp -d)"; DB="legalos_verify_$$"
cleanup() { compose exec -T db dropdb -U legalos --if-exists "$DB" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
export BACKUP_PASSPHRASE="$PASS"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$DIR/$P.dump.enc" -out "$TMP/db.dump" || die "não consegui descriptografar (passphrase errada?)"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$DIR/$P.files.tar.gz.enc" -out "$TMP/files.tar.gz" || die "não consegui descriptografar os documentos"
tar tzf "$TMP/files.tar.gz" >/dev/null || die "arquivo de documentos corrompido"
compose exec -T db createdb -U legalos "$DB"
compose exec -T db pg_restore -U legalos --no-owner -d "$DB" < "$TMP/db.dump" || die "pg_restore falhou"
tables="$(compose exec -T db psql -U legalos -d "$DB" -Atc "select count(*) from information_schema.tables where table_schema='public'" | tr -d '[:space:]')"
migs="$(compose exec -T db psql -U legalos -d "$DB" -Atc "select count(*) from schema_migrations" 2>/dev/null | tr -d '[:space:]' || echo "?")"
users="$(compose exec -T db psql -U legalos -d "$DB" -Atc "select count(*) from users" | tr -d '[:space:]')"
[ "${tables:-0}" -gt 10 ] || die "banco restaurado com poucas tabelas ($tables)"
log "OK: $P restaura. tabelas=$tables migrações=$migs usuários=$users"
