#!/usr/bin/env bash
# Troca segredos do servidor. Uso (como root):  rotate-secrets.sh cron | db | keys | backup-pass
#   cron         novo CRON_SECRET (os agendamentos leem do arquivo; nada mais a fazer)
#   db           nova senha do PostgreSQL (altera no banco, no .env.production e reinicia o app)
#   keys         novas MFA_ENCRYPTION_KEY e CERT_ENCRYPTION_KEY, RE-CIFRANDO os dados (2FA, webhooks, certificados, conexões)
#   backup-pass  nova BACKUP_PASSPHRASE (vale para os backups NOVOS; os antigos continuam precisando da senha antiga)
# Os valores novos aparecem UMA vez na tela: salve no gerenciador de senhas e NÃO cole no chat.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
umask 077
[ "$(id -u)" = 0 ] || die "rode como root"
what="${1:-}"
cp -p "$ENV_FILE" "$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
setenv() { # setenv CHAVE VALOR  (troca a linha ou acrescenta)
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"; fi
}
case "$what" in
  cron)
    n="$(openssl rand -hex 24)"; setenv CRON_SECRET "$n"
    compose up -d app >/dev/null
    log "CRON_SECRET trocado e app reiniciado. Teste: $(dirname "$0")/cron-call.sh webhooks && echo ok"
    echo "NOVO CRON_SECRET (salve): $n" ;;
  db)
    n="$(openssl rand -hex 24)"
    compose exec -T db psql -U legalos -d postgres -c "ALTER USER legalos PASSWORD '$n'" >/dev/null
    setenv POSTGRES_PASSWORD "$n"
    compose up -d app >/dev/null
    log "senha do banco trocada, .env.production atualizado e app reiniciado."
    echo "NOVA POSTGRES_PASSWORD (salve): $n"
    echo "Lembrete: em novos terminais, use  export POSTGRES_PASSWORD=<a nova>  antes de rodar docker compose à mão." ;;
  keys)
    newm="$(openssl rand -base64 32)"; newc="$(openssl rand -base64 32)"
    run() { compose --profile tools run --rm -e NEW_MFA_ENCRYPTION_KEY="$newm" -e NEW_CERT_ENCRYPTION_KEY="$newc" migrate npx tsx scripts/rotate-keys.ts "$@"; }
    log "simulação (não grava)"; run
    log "gravando"; run --apply
    setenv MFA_ENCRYPTION_KEY "$newm"; setenv CERT_ENCRYPTION_KEY "$newc"
    compose up -d app >/dev/null
    log "chaves trocadas, dados re-cifrados e app reiniciado. Confira: entre no sistema e abra Minha conta."
    echo "NOVA MFA_ENCRYPTION_KEY (salve): $newm"; echo "NOVA CERT_ENCRYPTION_KEY (salve): $newc" ;;
  backup-pass)
    n="$(openssl rand -hex 24)"; setenv BACKUP_PASSPHRASE "$n"
    log "BACKUP_PASSPHRASE trocada. Rode agora um backup e a verificação: $(dirname "$0")/backup-docker.sh && $(dirname "$0")/verify-backup-docker.sh"
    echo "NOVA BACKUP_PASSPHRASE (salve): $n"
    echo "Os backups ANTERIORES continuam exigindo a senha antiga; guarde-a enquanto eles existirem." ;;
  *) die "uso: rotate-secrets.sh cron | db | keys | backup-pass" ;;
esac
echo "Cópia do .env anterior: $(ls -1t "$ENV_FILE".bak-* | head -1)  (contém os segredos ANTIGOS: apague depois de confirmar que tudo funciona: rm <arquivo>)"
