# LegalOS

Plataforma SaaS jurídica multiempresa para escritórios de advocacia brasileiros (nome provisório — altere em `src/config/product.ts`).

**Status:** Fases 1 a 7, 8a (assistente de IA), 8b (OCR e busca no conteúdo) 8c (consulta DataJud/CNJ) 9a (segurança: 2FA, bloqueio, CSP) 9b (backups e guia de produção) concluídas e o motor de tribunais iniciado (etapa 0: cofre de certificados; etapa 1: conector PJe/MNI; etapa 2a: captura de publicações do DJEN; caixas de trabalho (equipes, devolver, adormecer, notas, etiquetas); painel de administração da plataforma (/admin); ambos ainda não validados contra serviços reais) (fundação, clientes e processos, tarefas/prazos/agenda, intimações, documentos/modelos/peticionamento em modo demonstração, CRM/automações/portal do cliente, financeiro). Veja [`docs/implementation-status.md`](docs/implementation-status.md) para o que é operacional e o que ainda é pendente, e [`docs/roadmap.md`](docs/roadmap.md) para as próximas fases.

## Requisitos

- Node.js ≥ 20.19 (testado com 22)
- PostgreSQL ≥ 14 (testado com 16)
- Para OCR e leitura de PDF (opcional, mas necessário para ler documentos digitalizados): `brew install tesseract tesseract-lang poppler` (macOS) ou `apt install tesseract-ocr tesseract-ocr-por poppler-utils` (Ubuntu)

## Executar localmente

```bash
npm install --legacy-peer-deps      # gera também o Prisma Client (postinstall)
cp .env.example .env                # ajuste DATABASE_URL se necessário

# crie os bancos (uma vez)
createdb legalos && createdb legalos_test   # ou use psql/CREATE DATABASE

npm run db:migrate                  # aplica prisma/migrations/*
npm run db:seed                     # OPCIONAL: dados de demonstração FICTÍCIOS (dev apenas)
npm run dev                         # http://localhost:3000
```

Login de demonstração (somente após `db:seed`): `demo@legalos.local` / `DemoSenha123`.
Sem seed: acesse `/register`, crie a conta e o escritório.

> **Sandboxes sem acesso a `binaries.prisma.sh`:** defina `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true` e `PRISMA_QUERY_ENGINE_LIBRARY=/bin/true` (veja `.env.example`). O LegalOS não usa engines Rust em runtime (Prisma `engineType = "client"` + adapter `pg`).

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Conexão PostgreSQL da aplicação |
| `TEST_DATABASE_URL` | para testes | Banco de testes; **é apagado e recriado** (o nome deve conter `test`) |
| `APP_URL` | sim em produção | URL pública, usada em links de convite e recuperação de senha |
| `LOG_LEVEL` | não | `debug` \| `info` \| `warn` \| `error` |
| `BUILD_STANDALONE` | não | `1` gera build standalone (Docker) |

Nenhum segredo é versionado; `.env` está no `.gitignore`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:migrate` | Aplica migrations SQL versionadas |
| `npm run db:reset` | Recria o banco (recusa rodar em produção) |
| `npm run db:seed` | Dados de demonstração (recusa rodar em produção) |
| `npm run typecheck` / `lint` | TypeScript strict / ESLint |
| `npm test` | Unitários + integração (exige PostgreSQL de teste) |
| `npm run import:astrea` | Importa o backup CSV do Astrea (veja `docs/importacao-astrea.md`) |
| `npm run test:e2e` | Playwright (exige `npm run build` antes) |
| `npm run check` | typecheck + lint + testes |

## Documentação

[`docs/architecture.md`](docs/architecture.md) · [`docs/data-model.md`](docs/data-model.md) · [`docs/security.md`](docs/security.md) · [`docs/integrations.md`](docs/integrations.md) · [`docs/roadmap.md`](docs/roadmap.md) · [`docs/implementation-status.md`](docs/implementation-status.md)
