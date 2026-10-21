# Segurança do servidor — passo a passo (bloco 1)

Tudo abaixo roda **no servidor, como root**, em `/opt/legalos`. Cada passo termina com uma conferência. Faça na ordem e **não cole chaves no chat**: elas aparecem uma vez na tela, vão para o gerenciador de senhas.

## 0. Levar a versão nova
Procedimento de atualização de sempre (empacotar no Mac, `scp`, descompactar, `docker compose build`). **Atenção:** o `docker compose build` NÃO reconstrói o serviço `migrate` (ele está num perfil à parte); sem reconstruí-lo, a migração diz "Banco já atualizado" e o app quebra com `column does not exist`. Sequência correta de toda atualização: `docker compose build && docker compose --profile tools build migrate && docker compose --profile tools run --rm migrate && docker compose up -d app`. Depois: `chmod +x /opt/legalos/scripts/server/*.sh`.

## 1. Fechar o cadastro
Edite o `.env.production` e acrescente:
```
REGISTRATION_MODE=code
REGISTRATION_CODE=(gere com: openssl rand -hex 12)
```
Reinicie: `docker compose up -d app`. Agora `/register` só aceita quem tem o código (ou um convite válido). Crie as contas da equipe e, quando todos já tiverem entrado, troque para `REGISTRATION_MODE=closed` (só convite). Conferência: abra `/register` numa janela anônima: deve pedir o código (modo `code`) ou mostrar "Cadastro fechado" (modo `closed`).

## 2. Agendamentos e backup
1. No `.env.production`, confira que existem `CRON_SECRET`, `APP_URL`, `POSTGRES_PASSWORD` e acrescente `BACKUP_PASSPHRASE=(openssl rand -hex 24)`. Opcional: `BACKUP_OFFSITE=usuario@outro-servidor:/pasta` (cópia por SSH para fora do servidor; a chave SSH do root precisa ter acesso a esse destino).
2. Instale: `/opt/legalos/scripts/server/install-cron.sh`
3. Teste cada um uma vez agora:
   - `/opt/legalos/scripts/server/cron-call.sh webhooks && echo ok`
   - `/opt/legalos/scripts/server/backup-docker.sh`
   - `/opt/legalos/scripts/server/verify-backup-docker.sh` (restaura num banco temporário e confere; **este é o teste de que o backup serve**)
4. Situação geral a qualquer momento: `/opt/legalos/scripts/server/status.sh`.

Rotina que passa a rodar sozinha: webhooks a cada minuto; DJEN e MNI a cada 30 min; backup às 03:00; verificação do backup aos domingos 04:00. Falhas de agendamento vão para `/var/log/legalos-cron.log` e as de backup para `/var/log/legalos-backup.log`.

**Restaurar (desastre):** `/opt/legalos/scripts/server/restore-docker.sh legalos-AAAAMMDD-HHMMSS --yes` (apaga o banco e os documentos atuais). Treine uma vez antes de precisar.

## 3. Trocar os segredos que já apareceram no chat
Qualquer chave que passou por conversa deve ser considerada vazada. Rode um de cada vez e confira entre eles:
```
/opt/legalos/scripts/server/rotate-secrets.sh cron
/opt/legalos/scripts/server/rotate-secrets.sh db
/opt/legalos/scripts/server/rotate-secrets.sh keys
/opt/legalos/scripts/server/rotate-secrets.sh backup-pass
```
`keys` troca as chaves de cifra **re-cifrando** o 2FA, os segredos de webhooks, os certificados e as conexões de tribunal (se qualquer item não abrir com a chave antiga, nada é gravado). Depois de `keys`, entre no sistema e confirme que o login com 2FA ainda funciona. Cada comando deixa uma cópia `.env.production.bak-…` com os segredos antigos: apague-a quando confirmar (`rm`). **Troque também a senha do root do servidor e a senha do painel do provedor/Hostinger se elas foram digitadas em algum lugar fora do seu computador.**

## 4. SSH só com chave (sem senha)
**Ordem importa; não feche a janela atual até testar a nova.**
1. No **Mac**, se ainda não tem chave: `ssh-keygen -t ed25519 -C "legalos-servidor"` (Enter nas perguntas, de preferência com uma senha na chave).
2. No **Mac**: `ssh-copy-id root@IP-DO-SERVIDOR` (usa a senha uma última vez).
3. Abra **outra** janela do Terminal e teste: `ssh root@IP-DO-SERVIDOR`. Tem que entrar **sem pedir a senha do servidor**.
4. Só então, no servidor (janela antiga):
```
cat > /etc/ssh/sshd_config.d/99-legalos.conf <<'C'
PasswordAuthentication no
PermitRootLogin prohibit-password
KbdInteractiveAuthentication no
C
sshd -t && systemctl reload ssh
```
5. Teste de novo numa janela nova. Se algo falhar, a janela antiga ainda está aberta para desfazer: `rm /etc/ssh/sshd_config.d/99-legalos.conf && systemctl reload ssh`.
6. Confirme o `fail2ban` (`systemctl is-active fail2ban`) e o firewall (`ufw status`: só 22, 80 e 443).

## 5. Conferência final
`/opt/legalos/scripts/server/status.sh` deve mostrar tudo `[ok]` (a cópia externa do backup é a única que depende de ter outro servidor/destino).

## O que isto NÃO resolve
Sem monitoramento externo (se o servidor cair, ninguém é avisado); sem e-mail real (convites e recuperação de senha precisam ser repassados à mão); o backup só sai do servidor se `BACKUP_OFFSITE` for configurado. Os scripts de servidor foram testados só nas partes que não dependem do Docker (leitura do `.env`, chamada autenticada dos agendamentos, sintaxe); **o primeiro backup e a primeira verificação reais são o seu teste de fumaça**.
