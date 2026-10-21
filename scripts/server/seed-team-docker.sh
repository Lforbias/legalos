#!/usr/bin/env bash
# Cadastra a equipe do Astrea (Usuário.csv do backup) em UM escritório do LegalOS rodando em Docker.
# Contas que não existem são criadas SEM senha utilizável (servem para aparecerem como responsáveis).
# Uso (como root, no servidor):
#   seed-team-docker.sh <pasta-do-backup> <e-mail-do-dono> "<nome do escritório>" [--owners e1,e2] [--roles email=ADMIN,...]            # simula
#   seed-team-docker.sh <pasta-do-backup> <e-mail-do-dono> "<nome do escritório>" --apply [--owners ...] [--roles ...]                   # grava
set -euo pipefail
source "$(dirname "$0")/lib.sh"
DIR="${1:-}"; OWNER="${2:-}"; ORGNAME="${3:-}"; shift 3 2>/dev/null || true
[ -n "$DIR" ] && [ -n "$OWNER" ] && [ -n "$ORGNAME" ] || die "uso: $0 <pasta-do-backup> <e-mail-do-dono> \"<nome do escritório>\" [--apply] [--owners e1,e2] [--roles email=ADMIN,...]"
[ -d "$DIR" ] || die "pasta não encontrada: $DIR"
DIR="$(realpath "$DIR")"
ARGS=(--dir /import --owner "$OWNER" --org-name "$ORGNAME")
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) ARGS+=(--apply) ;;
    --owners|--roles|--org) [ $# -ge 2 ] || die "$1 precisa de um valor"; ARGS+=("$1" "$2"); shift ;;
    *) die "opção desconhecida: $1" ;;
  esac
  shift
done
log "atualizando a imagem (pode demorar)"
compose --profile tools build migrate
compose --profile tools run --rm -T -v "$DIR:/import:ro" migrate npx tsx scripts/seed-team-astrea.ts "${ARGS[@]}"
