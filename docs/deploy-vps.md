# Implantação no VPS (Ubuntu 24.04, Brasil)

Servidor: `187.127.59.92` · Domínio: `legalossync.tech`. Guia **não executado** por nós (sem acesso ao servidor); siga na ordem e confira cada passo. Comandos como `root`, a menos que indicado.

## 1. DNS (no painel onde comprou o domínio)
Crie registros **A**: `legalossync.tech` → `187.127.59.92` e `www` → `187.127.59.92`. Confira: `dig +short legalossync.tech` deve devolver o IP (pode levar minutos/horas).

## 2. Preparar o servidor
```
apt update && apt -y upgrade
apt -y install ufw fail2ban git curl ca-certificates unattended-upgrades
adduser --disabled-password --gecos "" legalos && usermod -aG sudo legalos
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw --force enable
curl -fsSL https://get.docker.com | sh && usermod -aG docker legalos
```
Recomendado: copie sua chave SSH para o usuário `legalos` (`ssh-copy-id legalos@187.127.59.92`), depois desative login por senha do root em `/etc/ssh/sshd_config` (`PermitRootLogin prohibit-password`, `PasswordAuthentication no`) e `systemctl reload ssh`. **Não desative antes de testar a chave**, ou você se tranca fora. O PostgreSQL **não** é exposto (só a rede interna do Docker).

## 3. Levar o código
Do seu Mac: `scp legalos.tar.gz legalos@187.127.59.92:~` (gere com `tar czf` excluindo `node_modules`, `.next`, `.env`, `.storage`). No servidor, como `legalos`: `mkdir app && tar xzf legalos.tar.gz -C app --strip-components=1 && cd app`.

## 4. Configurar o ambiente
```
cp .env.example .env.production
openssl rand -base64 32      # → MFA_ENCRYPTION_KEY
openssl rand -base64 32      # → CERT_ENCRYPTION_KEY (cofre de certificados)
openssl rand -hex 24         # → CRON_SECRET
openssl rand -hex 24         # → POSTGRES_PASSWORD
```
Em `.env.production`: `APP_URL=https://legalossync.tech`, `NODE_ENV=production`, as chaves acima, `BACKUP_DIR`, `BACKUP_PASSPHRASE`; opcionais `ANTHROPIC_API_KEY`, `DATAJUD_API_KEY`. **Guarde as chaves no gerenciador de senhas, fora do servidor**: perdê-las torna 2FA/certificados irrecuperáveis. `chmod 600 .env.production`. Rode `npm run check:prod` (via contêiner ou Node) e resolva os erros.

## 5. Subir
```
export POSTGRES_PASSWORD='(a mesma do .env)'
docker compose build
docker compose up -d db
docker compose --profile tools run --rm migrate
docker compose up -d app
curl -fsS http://127.0.0.1:3000/api/ready
```

## 6. HTTPS com Caddy (certificado automático)
```
apt -y install caddy
cat > /etc/caddy/Caddyfile <<'C'
legalossync.tech, www.legalossync.tech {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
C
systemctl reload caddy
```
Só funciona depois do DNS apontar. Abra `https://legalossync.tech`.

## 7. Primeira conta e administrador
Cadastre-se no site, ative o 2FA em Minha conta e, no servidor: `docker compose run --rm app npm run platform-admin -- grant seu@email.com` (se o comando não existir na imagem, rode a partir do código com Node). Painel em `/admin`.

## 8. Agendadores e backups
**Forma recomendada (Docker):** `chmod +x scripts/server/*.sh && sudo scripts/server/install-cron.sh` instala os agendadores (webhooks, DJEN, MNI), o backup diário e a verificação semanal. Passo a passo completo, troca de chaves e proteção do SSH em `docs/seguranca-servidor.md`. Verifique com `scripts/server/status.sh`.

Alternativa manual (usuário `legalos`; `crontab -e`):
```
CRON_SECRET=(valor)
* * * * *    curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://legalossync.tech/api/cron/webhooks >/dev/null
*/30 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://legalossync.tech/api/cron/djen >/dev/null
*/30 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://legalossync.tech/api/cron/mni >/dev/null
```
O servidor precisa ter **IP brasileiro** (o DJEN recusa IP de fora): confirme com `curl -s https://ipinfo.io/country` → `BR`.

## 9. Backups
Com Docker, `scripts/server/install-cron.sh` já agenda `backup-docker.sh` e `verify-backup-docker.sh`. Sem Docker, agende `scripts/backup.sh` diário e cópia **fora do servidor**; rode `scripts/verify-backup.sh` semanalmente e **teste a restauração** antes de usar dados reais. Detalhes em `docs/producao.md`.

## 10. Teste de fumaça
`/api/ready` 200; criar escritório; ativar 2FA e relogar; subir PDF e extrair texto; relatórios abrem; backup + verificação. Atualizar versão: backup → novo código → `docker compose build && docker compose --profile tools build migrate` → `docker compose --profile tools run --rm migrate` → `up -d app` (reconstruir o `migrate` é obrigatório: ele não entra no build padrão).

## Pendências conhecidas
E-mail real ainda não existe (convites e recuperação de senha não são entregues em produção — links só no log); limitador de taxa em memória (uma instância); sem monitoramento externo.
