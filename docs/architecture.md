# Arquitetura

Monólito modular em **Next.js 16 (App Router) + TypeScript strict + PostgreSQL + Prisma 6**. Sem microsserviços.

## Camadas

```
src/app/            Rotas, layouts e páginas (Server Components) — só orquestram
src/modules/<mod>/  schemas Zod (compartilhados cliente/servidor), Server Actions, componentes do módulo
src/server/
  services/         Regras de negócio. Recebem TenantContext; NÃO importam next/*
  session.ts        Integração com Next (cookies/headers/redirect) → produz TenantContext
  action-helpers.ts Tradução de erros de domínio para respostas de formulário
src/lib/            Infra pura: db, security, permissions, logging, mail, validation, dates
src/components/     UI (ui/, layout/, dashboard/, forms/)
prisma/             schema.prisma + migrations SQL + seed explícito
```

Fluxo de uma mutação: formulário (React Hook Form + Zod) → Server Action (revalida com o mesmo schema) → `requireTenant()` (sessão + vínculo verificados no banco) → serviço (checa permissão e filtra por `organizationId`) → Prisma → auditoria.

## Decisões técnicas (ADRs resumidos)

1. **Autenticação própria com sessões em banco, em vez de Auth.js.** Auth.js v5 ainda é beta e sua estratégia de credenciais usa JWT, que não permite revogação de sessão (requisito: "revogação de sessões"). Implementamos tokens opacos (256 bits) guardados como SHA-256, cookie `httpOnly` + `SameSite=Lax` (+ `Secure` e prefixo `__Host-` em produção), senhas com scrypt (N=2^15). Troca futura por um IdP/SSO é possível atrás de `auth.service`.
2. **Isolamento multiempresa na camada de serviço.** O `TenantContext` só é construído no servidor a partir da sessão e de um `Membership` ativo; todo serviço filtra por `organizationId` e nunca confia em IDs do navegador (recursos de outro escritório respondem "não encontrado"). **RLS do PostgreSQL foi avaliada e adiada** (ver `security.md`): exigiria `SET LOCAL app.org_id` por transação via cliente Prisma estendido e um papel de banco sem `BYPASSRLS`/não-dono das tabelas; é uma defesa em profundidade planejada para a Fase 9.
3. **Prisma com `engineType = "client"` + `@prisma/adapter-pg`.** Sem binários Rust em runtime. Motivo imediato: o ambiente de desenvolvimento bloqueia `binaries.prisma.sh`. Os recursos `queryCompiler`/`driverAdapters` são *preview features* no Prisma 6.19 — reavaliar ao subir de versão.
4. **Migrations como SQL versionado + runner próprio (`src/lib/db/migrate.ts`).** O `prisma migrate` precisa do binário schema-engine (bloqueado no sandbox). Os arquivos seguem o formato do Prisma Migrate (`prisma/migrations/<ts>_<nome>/migration.sql`); o runner registra checksum em `_legalos_migrations` e recusa migrations alteradas após aplicadas. **Risco conhecido:** o SQL é escrito à mão e pode divergir de `schema.prisma`; mitigação atual: testes de integração exercitam todas as tabelas, e em ambiente com acesso ao Prisma deve-se rodar `prisma migrate diff --from-migrations … --to-schema-datamodel … --exit-code` no CI. **Não misture** `prisma migrate deploy` e este runner no mesmo banco.
5. **Servidor trata erros de domínio com classes tipadas** (`ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`, `UnauthorizedError`); erros inesperados são logados com correlation id e mascarados para o usuário.
6. **UI com Tailwind 4 + tokens CSS** (dark por padrão, claro via `data-theme`). Componentes próprios no estilo shadcn (sem Radix) para reduzir dependências; menus e busca implementam Esc/clique fora/foco. Gráficos com Recharts em série única + tabela alternativa.
7. **Next 16:** `src/proxy.ts` (antigo middleware) apenas gera `x-request-id` e redireciona visitantes sem cookie; **não autentica**.
8. **`output: "standalone"` só com `BUILD_STANDALONE=1`.**

## Multi-tenancy

- `Organization` ← `Membership` → `User`; `Role` (perfis) pertence ao escritório; permissões são strings `recurso:ação` em `Role.permissions`.
- Perfis de sistema (Proprietário, Administrador, Advogado, Controladoria, Financeiro, Assistente, Cliente externo) são criados por escritório; perfis personalizados são editáveis.
- Regras anti-escalonamento: só se concede o que se possui; só o Proprietário atua sobre Proprietários; o último Proprietário não pode ser rebaixado/suspenso/removido.
- Sessão guarda `activeOrganizationId` (definido no servidor, revalidado contra o vínculo a cada requisição).

## Ambiente de execução

Node ≥ 20.19, PostgreSQL ≥ 14. Sem Redis ainda: o rate limiter é em memória (por processo).
