#!/usr/bin/env bash
# Restaura um backup do LegalOS. DESTRUTIVO: substitui o conteúdo do banco de DATABASE_URL.
# Uso: ./scripts/restore.sh legalos-AAAAMMDD-HHMMSS --yes
#   (o argumento é o prefixo dos arquivos em BACKUP_DIR; se criptografado, defina BACKUP_PASSPHRASE)
set -euo pipefail

: "${DATABASE_URL:?defina DATABASE_URL (banco de DESTINO)}"
: "${BACKUP_DIR:?defina BACKUP_DIR}"
PREFIX="${1:?informe o prefixo do backup, ex.: legalos-20261017-030000}"
[ "${2:-}" = "--yes" ] || { echo "Isto substitui o banco de destino. Confirme repetindo com --yes."; exit 2; }
STORAGE_DIR="${STORAGE_DIR:-./.storage}"
BASE="$BACKUP_DIR/$PREFIX"

( cd "$BACKUP_DIR" && { sha256sum -c "$PREFIX.sha256" 2>/dev/null || shasum -a 256 -c "$PREFIX.sha256"; } ) || { echo "Checksum não confere: backup corrompido ou incompleto."; exit 1; }

plain() { # $1 = caminho base sem .enc → imprime caminho do arquivo legível
  if [ -f "$1" ]; then echo "$1"; return; fi
  if [ -f "$1.enc" ]; then
    : "${BACKUP_PASSPHRASE:?backup criptografado: defina BACKUP_PASSPHRASE}"
    local tmp; tmp="$(mktemp)"
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$1.enc" -out "$tmp"
    echo "$tmp"; return
  fi
  return 1
}

DUMP="$(plain "$BASE.dump")" || { echo "dump não encontrado"; exit 1; }
echo "[restore] banco → DATABASE_URL"
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$DUMP"
[ "$DUMP" = "$BASE.dump" ] || rm -f "$DUMP"

if FILES="$(plain "$BASE.files.tar.gz")"; then
  echo "[restore] arquivos → $STORAGE_DIR"
  mkdir -p "$(dirname "$STORAGE_DIR")"
  tar -xzf "$FILES" -C "$(dirname "$STORAGE_DIR")"
  [ "$FILES" = "$BASE.files.tar.gz" ] || rm -f "$FILES"
else
  echo "[restore] AVISO: backup sem arquivos de documentos."
fi
echo "[restore] concluído. Rode 'npm run db:migrate' se a versão do app for mais nova que o backup."
