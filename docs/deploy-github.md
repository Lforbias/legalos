# Publicação automática (GitHub → servidor)

Fluxo: alguém (ou o Claude) envia a versão para um **ramo** do repositório e abre um *pull request* → o **CI** roda typecheck, lint, testes e E2E → você **aprova e faz o merge** no `main` → o workflow **"Publicar no servidor"** envia o código ao servidor → o servidor faz **backup, build, migração, sobe o app e confere `/api/ready`**. Se o app não subir, volta sozinho para a versão anterior.

Segurança do desenho:
- O servidor **não guarda nenhuma credencial do GitHub**. Quem envia é o GitHub, com uma chave própria de deploy.
- Essa chave, no `authorized_keys`, só consegue rodar **um comando**: `scripts/server/deploy-entry.sh` (sem shell, sem túnel). Se vazar, não abre o servidor.
- Senhas, chaves e o `.env.production` **nunca** vão para o repositório (`.gitignore`). Os segredos ficam em *Settings → Secrets* do GitHub, digitados por você na tela do GitHub, nunca no chat.
- O banco só é alterado depois de um backup criptografado. As migrações só andam para frente: a volta automática restaura o **código**, não desfaz migração (por isso toda migração deve ser compatível com a versão anterior do app).

## Configuração única (uns 20 minutos)

### 1. Repositório privado
No GitHub: *New repository* → nome `legalos` → **Private**, sem README. Anote `SEU-USUARIO/legalos`.

### 2. Primeiro envio (no Mac, pasta do projeto)
```bash
cd ~/Downloads/legalos
git init -b main
git add .
git status            # confira: NÃO pode aparecer .env, .env.production, .storage nem arquivos de chave
git status --short | grep -Ei "\.env|ssh|_entregas|_arquivos|\.tar\.gz|relatorio\.json"   # só pode sair ".env.example"
git commit -m "LegalOS: versão inicial no GitHub"
git remote add origin git@github.com:SEU-USUARIO/legalos.git
git push -u origin main
```
O `.gitignore` já bloqueia `.env*` (exceto `.env.example`), chaves, `_entregas/`, `_arquivos/`, `*.tar.gz` e backups. Se aparecer qualquer coisa suspeita no `git status`, **pare e não faça o commit**.

(Use a forma de login que você já usa no GitHub; ao usar HTTPS, o Git pede o acesso e o guarda no chaveiro do Mac.)

### 3. Chave de deploy (no Mac)
```bash
ssh-keygen -t ed25519 -N "" -C "legalos-deploy" -f ~/.ssh/legalos_deploy
cat ~/.ssh/legalos_deploy.pub     # esta é a chave PÚBLICA
```

### 4. Servidor: aceitar a chave só para publicar
Primeiro leve esta versão ao servidor **do jeito antigo** (scp + tar + docker compose), para que os arquivos `scripts/server/deploy.sh` e `deploy-entry.sh` existam lá. Depois, como root, no servidor:
```bash
chmod +x /opt/legalos/scripts/server/deploy*.sh
mkdir -p /root/.ssh && chmod 700 /root/.ssh
echo 'command="/opt/legalos/scripts/server/deploy-entry.sh",no-port-forwarding,no-agent-forwarding,no-pty,no-X11-forwarding COLE-AQUI-A-CHAVE-PUBLICA' >> /root/.ssh/authorized_keys
apt-get install -y rsync    # se ainda não tiver
```
Teste (no Mac): `ssh -i ~/.ssh/legalos_deploy root@187.127.59.92 "qualquer coisa"` deve responder **"comando recusado"**. Isso é o esperado.

### 5. Segredos no GitHub
*Repositório → Settings → Secrets and variables → Actions → New repository secret*:

| Nome | Valor |
|---|---|
| `DEPLOY_HOST` | `187.127.59.92` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | conteúdo do arquivo `~/.ssh/legalos_deploy` (a chave **privada**, inteira) |
| `DEPLOY_KNOWN_HOSTS` | saída de `ssh-keyscan -t ed25519 187.127.59.92` (rode no Mac) |

Depois apague a chave privada do Mac se quiser (`rm ~/.ssh/legalos_deploy`), pois ela já estará no GitHub.

### 6. Aprovação da publicação
- **Padrão (manual):** a publicação só acontece quando alguém clica em *Actions → Publicar no servidor → Run workflow*. O clique é a aprovação.
- **Automática (opcional):** crie a variável do repositório `AUTO_DEPLOY` = `true` (*Settings → Secrets and variables → Actions → Variables*). Aí, cada merge no `main` com o CI verde publica sozinho. Apague a variável para voltar ao manual.
- **Repositório privado em plano gratuito:** o GitHub não oferece *Required reviewers* nem regra de proteção de ramo. Em plano pago (Pro/Team), dá para exigir aprovação em *Settings → Environments → production* e proteger o `main`. Não torne o repositório público.

### 7. Deixar o Claude enviar as versões (opcional)
O Claude não tem acesso ao GitHub por padrão. Para ele enviar ramos e abrir pull requests: crie um *fine-grained personal access token* **só para este repositório**, com permissões **Contents: Read and write** e **Pull requests: Read and write**, validade de 90 dias, e coloque-o na variável de ambiente `GH_TOKEN` das configurações do ambiente da sessão (nunca no chat). Ele **não** tem como alterar segredos, ambientes nem proteção de ramo. Sem isso, você continua enviando com `git push` (ou o GitHub Desktop).

## Dia a dia
1. A versão chega num ramo (`entrega/2.0-f3`, por exemplo) e vira *pull request*.
2. O CI roda (uns 8 a 10 min). Verde = pode revisar.
3. Você faz o **merge**. (Se o ambiente `production` tiver revisores, clique em *Approve* na aba *Actions*.)
4. O servidor publica sozinho. Confira em *Actions* e em `https://legalossync.tech/api/ready`.
5. No servidor, o histórico fica em `/var/log/legalos-deploy.log` e a versão no ar em `/opt/legalos/.deployed-sha`.

Publicar à mão (por exemplo, em emergência): *Actions → Publicar no servidor → Run workflow*.

## Voltar atrás
- **Automático:** se `/api/ready` não responder em 90 s depois da troca, o servidor restaura o código anterior.
- **Manual:** reverta o commit no GitHub (botão *Revert* no pull request) e faça o merge: a versão antiga é publicada pelo mesmo caminho. Para restaurar o **banco** use os backups (`docs/backup-restore.md`); as cópias do código ficam em `/opt/legalos-releases/`.

## Limites
- Não testado no servidor real ainda: **na primeira vez, acompanhe**. Rode o workflow e, em paralelo no servidor, `tail -f /var/log/legalos-deploy.log`.
- O app fica fora do ar por alguns segundos na troca do contêiner (não há versão azul/verde).
- Um erro de migração interrompe antes de subir o app novo: o app antigo continua rodando e o código volta ao anterior.
