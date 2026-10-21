#!/usr/bin/env bash
# Importa o backup do Astrea para o LegalOS rodando em Docker (usa a imagem "migrate", que já tem o importador).
# Uso (como root, no servidor):
#   import-astrea-docker.sh <pasta-do-backup> <e-mail-no-legalos> --dry-run              # simulação (não grava nada)
#   import-astrea-docker.sh <pasta-do-backup> <e-mail-no-legalos> --yes                  # importação de verdade
# Opções extras repassadas ao importador: --only clientes,processos,prazos,tarefas,agenda,intimacoes,financeiro  --org <id>
# A importação de verdade faz um BACKUP criptografado antes e só segue se ele der certo.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

DIR="${1:-}"; EMAIL="${2:-}"; shift 2 2>/dev/null || true
[ -n "$DIR" ] && [ -n "$EMAIL" ] || die "uso: $0 <pasta-do-backup> <e-mail> (--dry-run | --yes) [--only ...] [--org ...]"
[ -d "$DIR" ] || die "pasta não encontrada: $DIR"
DIR="$(realpath "$DIR")"

DRY=0; YES=0; EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --yes) YES=1 ;;
    --only|--org) [ $# -ge 2 ] || die "$1 precisa de um valor"; EXTRA+=("$1" "$2"); shift ;;
    *) die "opção desconhecida: $1" ;;
  esac
  shift
done
[ "$DRY" = 1 ] && [ "$YES" = 1 ] && die "use --dry-run OU --yes, não os dois."
[ "$DRY" = 1 ] || [ "$YES" = 1 ] || die "informe --dry-run (simula) ou --yes (grava de verdade)."

log "atualizando a imagem do importador (pode demorar na primeira vez)"
compose --profile tools build migrate

if [ "$YES" = 1 ]; then
  log "backup de segurança antes de gravar"
  "$(dirname "$0")/backup-docker.sh" || die "backup falhou; nada foi importado."
fi

ARGS=(--dir /import --email "$EMAIL")
[ "$DRY" = 1 ] && ARGS+=(--dry-run)
[ "${#EXTRA[@]}" -gt 0 ] && ARGS+=("${EXTRA[@]}")

log "rodando o importador ($([ "$DRY" = 1 ] && echo simulação || echo 'GRAVANDO'))"
compose --profile tools run --rm -T -v "$DIR:/import:ro" migrate npx tsx scripts/import-astrea.ts "${ARGS[@]}"
log "concluído. O backup do Astrea contém dados sigilosos: apague a pasta quando terminar ($DIR)."
