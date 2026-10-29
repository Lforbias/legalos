#!/usr/bin/env bash
# Instala os agendamentos do LegalOS em /etc/cron.d/legalos (como root). Pode rodar de novo sem problema.
#   a cada minuto  → entrega de webhooks
#   a cada 5 min   → fila de e-mails e SLA de resposta do Chat
#   Box retirado: sem captura judicial, peticionamento, autos ou robôs
#   03:00 (diário) → backup criptografado
#   domingo 04:00  → verificação (restauração de teste) do último backup
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "rode como root (sudo)"; exit 1; }
S="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$S"/*.sh
mkdir -p /var/backups/legalos && chmod 700 /var/backups/legalos
touch /var/log/legalos-cron.log /var/log/legalos-backup.log && chmod 600 /var/log/legalos-*.log
cat > /etc/cron.d/legalos <<CRON
# Gerado por scripts/server/install-cron.sh — não edite à mão (rode o script de novo)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * *    root $S/cron-call.sh webhooks
*/5 * * * *  root $S/cron-call.sh mail
17 * * * *   root $S/cron-call.sh billing
7 * * * *    root $S/cron-call.sh whatsapp-billing
*/5 * * * *  root $S/cron-call.sh chat-sla
* * * * *  root $S/cron-call.sh chat-extras
*/15 * * * * root $S/cron-call.sh push-due
0 3 * * *    root $S/backup-docker.sh >> /var/log/legalos-backup.log 2>&1
0 4 * * 0    root $S/verify-backup-docker.sh >> /var/log/legalos-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/legalos
cat > /etc/logrotate.d/legalos <<'LR'
/var/log/legalos-*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
}
LR
echo "Instalado. Conferir: cat /etc/cron.d/legalos"
echo "Teste agora:  $S/cron-call.sh webhooks && echo ok;  $S/backup-docker.sh;  $S/verify-backup-docker.sh"
