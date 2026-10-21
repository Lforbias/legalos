#!/usr/bin/env bash
# Publica uma versão do LegalOS no servidor (roda como root; chamado por deploy-entry.sh ou à mão).
# Uso:  deploy.sh <pacote.tar.gz> <sha>
# Passos: trava contra duas publicações ao mesmo tempo → backup criptografado → guarda cópia da versão atual (para voltar)
#         → troca o código → build → migração → sobe o app → confere /api/ready → atualiza o agendador.
# Se o app não ficar de pé, volta sozinho para a versão anterior (as migrações já aplicadas NÃO voltam: são só para frente).
set -euo pipefail
# o script troca os próprios arquivos durante a publicação: roda a partir de uma cópia
if [ -z "${DEPLOY_SELF:-}" ]; then
  T="$(mktemp /tmp/legalos-deploy.XXXXXX)"; cp "$0" "$T"
  DEPLOY_SELF=1 DEPLOY_LIBDIR="$(cd "$(dirname "$0")" && pwd)" exec bash "$T" "$@"
fi
source "$DEPLOY_LIBDIR/lib.sh"
TAR="${1:?pacote}"; SHA="${2:?sha}"
REL_DIR="${REL_DIR:-/opt/legalos-releases}"
LOG="/var/log/legalos-deploy.log"
exec > >(tee -a "$LOG") 2>&1
[ "$(id -u)" = 0 ] || die "rode como root"
exec 9>/var/lock/legalos-deploy.lock
flock -n 9 || die "já existe uma publicação em andamento"

# modo rápido: o pacote traz .deploy-meta com os nomes das imagens já construídas no GitHub (e um token que só vale durante a publicação)
FAST=0; APP_IMAGE=""; MIGRATE_IMAGE=""
if tar -xzf "$TAR" -O .deploy-meta >/tmp/.dm.$$ 2>/dev/null && [ -s /tmp/.dm.$$ ]; then
  APP_IMAGE="$(grep '^APP_IMAGE=' /tmp/.dm.$$ | cut -d= -f2-)"; MIGRATE_IMAGE="$(grep '^MIGRATE_IMAGE=' /tmp/.dm.$$ | cut -d= -f2-)"
  GHCR_USER="$(grep '^GHCR_USER=' /tmp/.dm.$$ | cut -d= -f2-)"; GHCR_TOKEN="$(grep '^GHCR_TOKEN=' /tmp/.dm.$$ | cut -d= -f2-)"
  [ -n "$APP_IMAGE" ] && [ -n "$MIGRATE_IMAGE" ] && FAST=1
fi
rm -f /tmp/.dm.$$ "$APP_DIR/.deploy-meta"
PREV_IMAGES="$(cat "$APP_DIR/.deployed-image" 2>/dev/null || true)"

PREV="$(cat "$APP_DIR/.deployed-sha" 2>/dev/null || echo desconhecida)"
log "publicando $SHA (anterior: $PREV)"

EXCLUDES=(--exclude='.deploy-meta' --exclude='.deployed-image' --exclude='.env' --exclude='.env.*' --exclude='.storage' --exclude='node_modules' --exclude='*.tar.gz' --exclude='*.log' --exclude='docker-compose.override.yml' --exclude='.deployed-sha' --exclude='/_arquivos' --exclude='/_entregas' --exclude='/relatorio.json' --exclude='/ssh-copy-id*' --exclude='/Claude outputs' --exclude='/BACKUP*' --exclude='._*' --exclude='.git')

install_tree() { # $1 = pacote
  local tmp; tmp="$(mktemp -d)"
  tar -xzf "$1" -C "$tmp"
  if command -v rsync >/dev/null 2>&1; then rsync -a --delete "${EXCLUDES[@]}" "$tmp"/ "$APP_DIR"/
  else cp -a "$tmp"/. "$APP_DIR"/; fi
  rm -rf "$tmp"
}
rebuild_and_up() {
  if [ -n "$PREV_IMAGES" ]; then # volta com a imagem anterior, sem reconstruir nada
    ( eval "export $PREV_IMAGES"; compose up -d --no-build app )
  else
    unset APP_IMAGE MIGRATE_IMAGE # sem imagem anterior registrada: constrói a versão antiga aqui mesmo
    compose build
    compose up -d app
  fi
}
wait_ready() {
  local i
  for i in $(seq 1 45); do
    if curl -fsS --max-time 4 http://127.0.0.1:3000/api/ready >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

# 1) backup antes de mexer (se falhar, não publica)
log "backup antes da publicação"
"$APP_DIR/scripts/server/backup-docker.sh" || die "backup falhou; nada foi alterado"

# 2) cópia da versão atual, para voltar se algo der errado
mkdir -p "$REL_DIR"
SNAP="$REL_DIR/antes-$SHA.tar.gz"
tar -czf "$SNAP" -C "$APP_DIR" --exclude='./.env' --exclude='./.env.*' --exclude='./.storage' --exclude='./node_modules' --exclude='*.tar.gz' --exclude='*.log' .

diagnose() {
  log "diagnóstico da falha (etapa: ${STAGE:-desconhecida})"
  curl -sS --max-time 4 http://127.0.0.1:3000/api/ready 2>&1 | head -c 400 || true
  echo
  compose ps 2>&1 | tail -8 || true
  compose logs --tail 60 app 2>&1 | tail -60 || true
}

rollback() {
  diagnose
  log "ERRO na publicação: voltando para a versão anterior ($PREV)"
  install_tree "$SNAP" || true
  if rebuild_and_up && wait_ready; then log "voltou para a versão anterior e está de pé"; else log "ATENÇÃO: a versão anterior também não subiu. Verifique: docker compose logs app"; fi
  exit 1
}

# 3) troca o código, baixa/constrói a imagem e migra
STAGE="copiar código"; install_tree "$TAR" || rollback
chmod +x "$APP_DIR"/scripts/server/*.sh
if [ "$FAST" = 1 ]; then
  STAGE="baixar imagens"; log "baixando as imagens prontas"
  export APP_IMAGE MIGRATE_IMAGE
  { printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null; } || rollback
  ( compose pull app && compose --profile tools pull migrate ) || rollback
  docker logout ghcr.io >/dev/null 2>&1 || true
  unset GHCR_TOKEN
  BUILD_FLAG="--no-build"
else
  log "build (neste servidor)"
  STAGE="build"
  ( compose build && compose --profile tools build migrate ) || rollback
  BUILD_FLAG=""
fi
log "migração"
STAGE="migração"
compose --profile tools run --rm migrate || rollback
log "subindo o app"
STAGE="subir o app"
compose up -d $BUILD_FLAG app || rollback
STAGE="esperar /api/ready (90 s)"; wait_ready || rollback

if [ "$FAST" = 1 ]; then printf 'APP_IMAGE=%s MIGRATE_IMAGE=%s\n' "$APP_IMAGE" "$MIGRATE_IMAGE" > "$APP_DIR/.deployed-image"; fi
echo "$SHA" > "$APP_DIR/.deployed-sha"
"$APP_DIR/scripts/server/install-cron.sh" >/dev/null || log "aviso: install-cron.sh falhou (rode à mão)"
# guarda só as 6 últimas versões
ls -1t "$REL_DIR"/*.tar.gz 2>/dev/null | tail -n +13 | xargs -r rm -f
docker image prune -f >/dev/null 2>&1 || true
log "PUBLICADO: $SHA está no ar"
