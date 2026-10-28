#!/usr/bin/env bash
# Chama uma rotina agendada do LegalOS: webhooks | djen | mni.  Uso: cron-call.sh djen
# Lê CRON_SECRET e APP_URL do .env.production (o segredo não fica escrito no crontab). Falhas vão para o log.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
job="${1:-}"
case "$job" in webhooks|djen|mni|mail|billing|whatsapp-billing|chat-sla|chat-extras|push-due|petition-queue|autos-queue|monitoring|robots) ;; *) die "uso: cron-call.sh webhooks|djen|mni|mail|billing|whatsapp-billing|chat-sla|chat-extras|push-due|petition-queue|autos-queue|monitoring|robots" ;; esac
secret="$(env_get CRON_SECRET)"; url="$(env_get APP_URL)"
[ -n "$secret" ] && [ -n "$url" ] || die "CRON_SECRET/APP_URL ausentes no $ENV_FILE"
# curl lê o cabeçalho de um arquivo temporário (o segredo não aparece na lista de processos)
hdr="$(mktemp)"; trap 'rm -f "$hdr"' EXIT
printf 'Authorization: Bearer %s\n' "$secret" > "$hdr"
request_timeout=120
[ "$job" = "autos-queue" ] && request_timeout=240
code="$(curl -sS -o /tmp/legalos-cron-$job.out -w '%{http_code}' --max-time "$request_timeout" -X POST -H @"$hdr" "${url%/}/api/cron/$job" 2>&1)" || code="curl-falhou"
if [ "$code" != "200" ]; then
  log "cron $job FALHOU (http=$code): $(head -c 200 /tmp/legalos-cron-$job.out 2>/dev/null)" >> /var/log/legalos-cron.log
  exit 1
fi
