#!/usr/bin/env bash
# Porta de entrada da publicação automática (GitHub Actions). É o ÚNICO comando que a chave de deploy pode rodar:
# no authorized_keys do servidor ela fica presa a este script (command="...", sem shell, sem túnel). Ver docs/deploy-github.md.
# Uso pelo GitHub:  git archive ... | ssh servidor "receive <sha-de-40-hex>"
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/legalos}"
REL_DIR="${REL_DIR:-/opt/legalos-releases}"
cmd="${SSH_ORIGINAL_COMMAND:-}"
if [[ ! "$cmd" =~ ^receive\ ([0-9a-f]{40})$ ]]; then
  echo "comando recusado (esperado: receive <sha>)" >&2
  exit 2
fi
SHA="${BASH_REMATCH[1]}"
mkdir -p "$REL_DIR"; chmod 700 "$REL_DIR"
TAR="$REL_DIR/$SHA.tar.gz"
# limite de 200 MB para não encher o disco com lixo
head -c 209715200 > "$TAR.part"
mv "$TAR.part" "$TAR"
tar -tzf "$TAR" >/dev/null 2>&1 || { rm -f "$TAR"; echo "pacote inválido" >&2; exit 3; }
exec "$APP_DIR/scripts/server/deploy.sh" "$TAR" "$SHA"
