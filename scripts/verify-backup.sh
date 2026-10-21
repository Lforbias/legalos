#!/usr/bin/env bash
# Prova que um backup é restaurável: restaura num banco TEMPORÁRIO, confere tabelas/linhas e apaga o temporário.
# Uso: DATABASE_URL=<qualquer banco do mesmo servidor> BACKUP_DIR=... ./scripts/verify-backup.sh legalos-AAAAMMDD-HHMMSS
set -euo pipefail

: "${DATABASE_URL:?defina DATABASE_URL (só para localizar o servidor; nada nele é alterado)}"
: "${BACKUP_DIR:?defina BACKUP_DIR}"
PREFIX="${1:?informe o prefixo do backup}"
BASE="$BACKUP_DIR/$PREFIX"
TMPDB="legalos_verify_$(date +%s)"
ADMIN_URL="$(echo "$DATABASE_URL" | sed -E 's#(/)[^/?]+(\?|$)#\1postgres\2#')"
TMP_URL="$(echo "$DATABASE_URL" | sed -E "s#(/)[^/?]+(\?|\$)#\1$TMPDB\2#")"

( cd "$BACKUP_DIR" && { sha256sum -c "$PREFIX.sha256" >/dev/null 2>&1 || shasum -a 256 -c "$PREFIX.sha256" >/dev/null; } ) || { echo "FALHA: checksum não confere."; exit 1; }

DUMP="$BASE.dump"; CLEAN=""
if [ ! -f "$DUMP" ] && [ -f "$DUMP.enc" ]; then
  : "${BACKUP_PASSPHRASE:?backup criptografado: defina BACKUP_PASSPHRASE}"
  DUMP="$(mktemp)"; CLEAN="$DUMP"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$BASE.dump.enc" -out "$DUMP"
fi
cleanup() { psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS $TMPDB" >/dev/null 2>&1 || true; [ -z "$CLEAN" ] || rm -f "$CLEAN"; }
trap cleanup EXIT

psql "$ADMIN_URL" -qc "CREATE DATABASE $TMPDB"
pg_restore --no-owner --dbname="$TMP_URL" "$DUMP"
TABLES="$(psql "$TMP_URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
MIGS="$(psql "$TMP_URL" -Atc "SELECT count(*) FROM _legalos_migrations")"
ORGS="$(psql "$TMP_URL" -Atc "SELECT count(*) FROM organizations")"
USERS="$(psql "$TMP_URL" -Atc "SELECT count(*) FROM users")"
[ "$TABLES" -gt 20 ] && [ "$MIGS" -gt 0 ] || { echo "FALHA: restauração incompleta (tabelas=$TABLES, migrações=$MIGS)."; exit 1; }
echo "OK: backup restaurável — tabelas=$TABLES migrações=$MIGS escritórios=$ORGS usuários=$USERS"
if [ -f "$BASE.files.tar.gz" ] || [ -f "$BASE.files.tar.gz.enc" ]; then echo "OK: arquivos de documentos presentes no backup."; else echo "AVISO: backup sem arquivos de documentos."; fi
