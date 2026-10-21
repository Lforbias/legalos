#!/usr/bin/env bash
# Funções comuns dos scripts de servidor do LegalOS. Use com: source "$(dirname "$0")/lib.sh"
APP_DIR="${APP_DIR:-/opt/legalos}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.production}"

# Lê VALOR de uma chave do .env.production SEM executar o arquivo (aceita aspas simples/duplas).
env_get() {
  local v
  v="$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERRO: $*" >&2; exit 1; }

# O docker compose exige POSTGRES_PASSWORD para interpolar o arquivo (mesmo no exec).
compose() {
  [ -f "$ENV_FILE" ] || die "não achei $ENV_FILE"
  local pw
  pw="$(env_get POSTGRES_PASSWORD)"
  [ -n "$pw" ] || die "POSTGRES_PASSWORD não está no $ENV_FILE (adicione a linha POSTGRES_PASSWORD=...)."
  ( cd "$APP_DIR" && POSTGRES_PASSWORD="$pw" docker compose "$@" )
}
