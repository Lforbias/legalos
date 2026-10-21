#!/usr/bin/env bash
# Backup do LegalOS: banco (pg_dump) + arquivos de documentos (STORAGE_DIR), com manifesto de checksums,
# criptografia opcional (BACKUP_PASSPHRASE) e retenção (BACKUP_KEEP_DAYS, padrão 14).
# Uso: DATABASE_URL=... STORAGE_DIR=... BACKUP_DIR=... ./scripts/backup.sh
set -euo pipefail

: "${DATABASE_URL:?defina DATABASE_URL}"
: "${BACKUP_DIR:?defina BACKUP_DIR (pasta FORA do app, de preferência em outro disco/servidor)}"
STORAGE_DIR="${STORAGE_DIR:-./.storage}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/legalos-$STAMP"
mkdir -p "$BACKUP_DIR"
umask 077

echo "[backup] banco → $OUT.dump"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$OUT.dump"

if [ -d "$STORAGE_DIR" ]; then
  echo "[backup] arquivos → $OUT.files.tar.gz"
  tar -czf "$OUT.files.tar.gz" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"
else
  echo "[backup] AVISO: STORAGE_DIR '$STORAGE_DIR' não existe; só o banco foi salvo." >&2
fi

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  for f in "$OUT.dump" "$OUT.files.tar.gz"; do
    [ -f "$f" ] || continue
    openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$f" -out "$f.enc"
    rm -f "$f"
  done
  echo "[backup] arquivos criptografados (.enc). GUARDE a BACKUP_PASSPHRASE fora do servidor: sem ela o backup é irrecuperável."
fi

( cd "$BACKUP_DIR" && sha256sum "legalos-$STAMP".* > "legalos-$STAMP.sha256" 2>/dev/null || shasum -a 256 "legalos-$STAMP".* > "legalos-$STAMP.sha256" )

find "$BACKUP_DIR" -maxdepth 1 -name 'legalos-*' -type f -mtime "+$KEEP_DAYS" -delete
echo "[backup] concluído: legalos-$STAMP (retenção ${KEEP_DAYS} dias)"
