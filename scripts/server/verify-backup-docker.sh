#!/usr/bin/env bash
# Prova que um backup restaura: confere checksum, descriptografa, restaura num banco TEMPORÁRIO e confere as tabelas.
# Não toca no banco de produção. Uso: verify-backup-docker.sh [prefixo]   (sem argumento, usa o mais recente)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
umask 077
PASS="$(env_get BACKUP_PASSPHRASE)"; [ -n "$PASS" ] || die "BACKUP_PASSPHRASE ausente no $ENV_FILE"
DIR="$(env_get BACKUP_DIR)"; DIR="${DIR:-/var/backups/legalos}"
exec 9>"$DIR/.backup.lock"
flock -n 9 || die "um backup ou uma verificação já está em execução"
P="${1:-}"
if [ -z "$P" ]; then
  LATEST=""
  for manifest in "$DIR"/legalos-*.sha256; do
    [ -f "$manifest" ] || continue
    if [ -z "$LATEST" ] || [ "$manifest" -nt "$LATEST" ]; then LATEST="$manifest"; fi
  done
  if [ -n "$LATEST" ]; then P="$(basename "${LATEST%.sha256}")"; fi
fi
[ -n "$P" ] || die "nenhum backup encontrado em $DIR"
[[ "$P" =~ ^legalos-[0-9]{8}-[0-9]{6}$ ]] || die "prefixo de backup inválido"
log "verificando $P"
# O manifesto deve conter exatamente os dois arquivos esperados, sem caminhos externos.
[ "$(wc -l < "$DIR/$P.sha256" | tr -d '[:space:]')" = 2 ] || die "manifesto inválido"
awk -v p="$P" 'NF != 2 || $1 !~ /^[a-fA-F0-9]+$/ || length($1) != 64 { exit 1 } $2 == p ".dump.enc" { db++ ; next } $2 == p ".files.tar.gz.enc" { files++; next } { exit 1 } END { if (db != 1 || files != 1) exit 1 }' "$DIR/$P.sha256" || die "manifesto contém arquivos inesperados"
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
migs="$(compose exec -T db psql -U legalos -d "$DB" -v ON_ERROR_STOP=1 -Atc "select count(*) from _legalos_migrations" | tr -d '[:space:]')"
users="$(compose exec -T db psql -U legalos -d "$DB" -Atc "select count(*) from users" | tr -d '[:space:]')"
[ "${tables:-0}" -gt 10 ] || die "banco restaurado com poucas tabelas ($tables)"
[ "${migs:-0}" -gt 0 ] || die "banco restaurado sem histórico de migrações"
log "OK: $P restaura. tabelas=$tables migrações=$migs usuários=$users"
