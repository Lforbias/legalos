# Produção: guia e checklist

Servidor escolhido: VPS (`docs/deploy-vps.md`, passo a passo para `legalossync.tech`). Este guia é genérico (contêiner + PostgreSQL). O `Dockerfile` e o `docker-compose.yml` são um ponto de partida para servidor próprio/VPS e **não foram executados** no ambiente onde o código foi desenvolvido (sem Docker): faça o primeiro build e o teste de fumaça abaixo antes de confiar.

## Antes de subir
1. `cp .env.example .env.production` e preencha. Rode **`npm run check:prod`** (com as variáveis de produção): ele lista **erros** (bloqueiam) e **avisos** (revisar).
2. Variáveis obrigatórias: `DATABASE_URL` (com `?sslmode=require` se o banco for remoto), `APP_URL` (https), `MFA_ENCRYPTION_KEY` (`openssl rand -base64 32`), `STORAGE_DIR` num volume persistente, `BACKUP_DIR`. Opcionais: `ANTHROPIC_API_KEY`, `DATAJUD_API_KEY`, `OCR_*`.
3. Nunca use em produção: `RATE_LIMIT_MULTIPLIER`, `PRISMA_*_ENGINE=/bin/true`, a senha `legalos_dev`.

## Subir (Docker Compose)
```
export POSTGRES_PASSWORD='senha-longa-e-aleatoria'
docker compose build
docker compose up -d db
docker compose --profile tools run --rm migrate
docker compose up -d app
curl -fsS http://127.0.0.1:3000/api/ready     # {"status":"ready",...}
```
Coloque um proxy HTTPS (Caddy/Nginx/Traefik) na frente da porta 3000. **Não exponha o PostgreSQL.** Em nuvem gerenciada, use o banco e o armazenamento de arquivos do provedor (o adaptador de arquivos em disco local serve a uma única instância; para várias instâncias implemente o adaptador S3 — pendência).

## Endpoints de operação
- `GET /api/health` — o processo está vivo (e o banco responde).
- `GET /api/ready` — banco, migrações aplicadas e armazenamento gravável (só booleanos). Use no balanceador/orquestrador.

## Checklist de produção
| Item | Estado |
|---|---|
| HTTPS + HSTS (HSTS já enviado em produção) | você configura o proxy |
| Cookie de sessão `secure`/`httpOnly`/`sameSite=lax` | ✅ |
| CSP com nonce, X-Frame-Options, nosniff, Referrer-Policy | ✅ |
| 2FA opcional por usuário; **ative em todas as contas do escritório** | ✅ (exigência obrigatória: pendente) |
| Bloqueio de login após 5 falhas; limite por IP | ✅ (limite por IP em memória: 1 instância) |
| Backup diário + cópia externa + verificação semanal | scripts ✅, **agendamento é seu** |
| Restauração testada | **faça antes de usar com dados reais** |
| E-mail real (convites, recuperação de senha, confirmação) | ❌ **não implementado** — só driver `console`; em produção links não são entregues |
| Peticionamento em tribunal | ❌ só modo demonstração |
| Monitoramento/alertas, log centralizado | ❌ (logs JSON no stdout; ligue ao seu coletor) |
| Antivírus em uploads, expurgo LGPD, RLS no PostgreSQL | ❌ pendentes |
| Teste de carga | ❌ não feito |

## Agendador do DJEN
Defina `CRON_SECRET` (mín. 24 caracteres) e agende no servidor, por exemplo a cada 30 minutos:
`*/30 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/cron/djen`
O servidor precisa estar **no Brasil**: relatos indicam que o DJEN recusa IPs de fora.

## Agendadores do MNI e dos webhooks
Mesmo `CRON_SECRET`. MNI (sincronização automática): `POST /api/cron/mni`, por exemplo a cada 30 minutos. Webhooks: `POST /api/cron/webhooks`, **a cada minuto** (é ele que entrega e repete os avisos):
`* * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/cron/webhooks`

## Teste de fumaça pós-deploy
1. `/api/ready` retorna 200. 2. Criar conta/escritório. 3. Ativar 2FA e entrar de novo. 4. Subir um PDF e extrair o texto (confirma tesseract/poppler na imagem). 5. Rodar `backup.sh` e `verify-backup.sh`.

## Atualizar a versão
`git pull` → `docker compose build` → `docker compose --profile tools run --rm migrate` → `docker compose up -d app`. Faça um backup antes.

## Administração da plataforma
Crie o primeiro super-administrador no servidor (a conta precisa existir e ter 2FA ativo para entrar): `npm run platform-admin -- grant seu@email.com`. Liste com `npm run platform-admin -- list` e remova com `revoke`. O painel fica em `/admin`.

## Agendador do MNI

A rota `POST /api/cron/mni` (mesmo `CRON_SECRET`) sincroniza os avisos de todas as conexões PJe/MNI ligadas. Exemplo: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/cron/mni` a cada 30 min. Diferente do DJEN, o MNI **não** exige servidor no Brasil por regra nossa, mas alguns tribunais restringem por IP: confirme com o tribunal.

## Chave trocada ("Unsupported state or unable to authenticate data")

Esse erro vem da cifra (AES-GCM): o dado foi gravado com uma chave e está sendo aberto com outra. Acontece quando `MFA_ENCRYPTION_KEY` ou `CERT_ENCRYPTION_KEY` foi trocada, ou quando o ambiente do terminal (`export …`) tem um valor diferente do `.env`. Para descobrir o que está afetado: `npm run check-keys` (não mostra segredo).

- Se você ainda tem a chave antiga, volte com ela no `.env` e reinicie.
- Se a chave antiga foi perdida, **o dado cifrado com ela não tem recuperação**: refaça só o item afetado (2FA: desative pelo banco/peça ao super-admin e ative de novo; certificado: revogue e envie de novo; conexão MNI: apague e cadastre de novo).
- Nunca troque as chaves com dados já gravados sem antes exportá-los/recadastrá-los; guarde as chaves no gerenciador de senhas junto com o backup.
