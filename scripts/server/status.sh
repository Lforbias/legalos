#!/usr/bin/env bash
# Situação do servidor LegalOS em uma tela (cole a saída para quem for ajudar). Somente leitura. Rode como root.
source "$(dirname "$0")/lib.sh"
ok() { printf '  [ok]    %s\n' "$*"; }; bad() { printf '  [FALTA] %s\n' "$*"; }
echo "== Aplicação"
curl -fsS --max-time 5 http://127.0.0.1:3000/api/ready >/dev/null 2>&1 && ok "app responde em /api/ready" || bad "app NÃO responde em /api/ready"
echo "== Cadastro"
m="$(env_get REGISTRATION_MODE)"; [ "$m" = closed ] || [ "$m" = code ] && ok "REGISTRATION_MODE=$m" || bad "cadastro ABERTO a qualquer visitante (defina REGISTRATION_MODE)"
echo "== Agendamentos e backup"
[ -f /etc/cron.d/legalos ] && ok "cron instalado (/etc/cron.d/legalos)" || bad "cron NÃO instalado (rode install-cron.sh)"
d="$(env_get BACKUP_DIR)"; d="${d:-/var/backups/legalos}"
last="$(ls -1t "$d"/legalos-*.sha256 2>/dev/null | head -1)"
if [ -n "$last" ]; then age=$(( ( $(date +%s) - $(stat -c %Y "$last") ) / 3600 )); [ "$age" -le 30 ] && ok "último backup há ${age} h ($(basename "$last" .sha256))" || bad "último backup há ${age} h (mais de 30 h)"; else bad "nenhum backup feito"; fi
[ -n "$(env_get BACKUP_PASSPHRASE)" ] && ok "BACKUP_PASSPHRASE definida" || bad "BACKUP_PASSPHRASE ausente"
[ -n "$(env_get BACKUP_OFFSITE)" ] && ok "cópia externa configurada" || bad "sem cópia externa (BACKUP_OFFSITE): backup só neste servidor"
[ -f /var/log/legalos-cron.log ] && [ -s /var/log/legalos-cron.log ] && bad "há falhas no /var/log/legalos-cron.log (tail -5 abaixo)" && tail -5 /var/log/legalos-cron.log || ok "sem falhas de agendamento registradas"
echo "== Segurança do servidor"
sshd -T 2>/dev/null | grep -qi '^passwordauthentication no' && ok "SSH: senha desligada" || bad "SSH aceita senha"
sshd -T 2>/dev/null | grep -qiE '^permitrootlogin (no|prohibit-password|without-password)' && ok "SSH: root sem senha" || bad "SSH: root pode entrar com senha"
ufw status 2>/dev/null | grep -q 'Status: active' && ok "firewall (ufw) ativo" || bad "firewall (ufw) inativo"
systemctl is-active --quiet fail2ban && ok "fail2ban ativo" || bad "fail2ban inativo"
ss -ltn 2>/dev/null | grep -q ':5432 ' && bad "PostgreSQL escutando em porta pública/local do host (deveria só a rede do Docker)" || ok "PostgreSQL não exposto"
echo "== País do IP (o DJEN exige BR): $(curl -s --max-time 5 https://ipinfo.io/country)"
