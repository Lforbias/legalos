# Modelo de dados (Fases 1–2)

Fonte da verdade: `prisma/schema.prisma` + `prisma/migrations`. Convenções: tabelas/colunas `snake_case`, IDs `uuid`, datas `timestamptz` (UTC; apresentação no fuso do usuário/escritório), valores financeiros em `Decimal` (`numeric(14,2)`).

| Tabela | Escopo | Observações |
|---|---|---|
| `users` | global | e-mail único, sempre minúsculo (CHECK no banco); `password_hash` scrypt |
| `sessions` | usuário | só o hash do token; `active_organization_id`, `expires_at`, `revoked_at` |
| `email_tokens` | usuário | verificação de e-mail / redefinição de senha; hash, expiração, uso único |
| `organizations` | — | `slug` único, fuso, moeda `BRL`, soft delete (`deleted_at`) |
| `roles` | `organization_id` | `permissions text[]`, `is_system`; único `(organization_id, key)` |
| `memberships` | `organization_id` | único `(organization_id, user_id)`; status `ACTIVE`/`SUSPENDED`; FK `role_id` com RESTRICT |
| `invitations` | `organization_id` | hash do token; **índice único parcial**: 1 convite pendente por e-mail/escritório |
| `plans` | global | dado de referência (Essencial / Profissional / Enterprise) com limites; sem cobrança real |
| `subscriptions` | `organization_id` (único) | `TRIALING` por 14 dias no plano Profissional; `provider_reference` nulo (sem provedor) |
| `audit_logs` | `organization_id` (opcional) | ação, recurso, resultado, IP, user-agent, correlation id, metadata (sem segredos) |

Exclusão: `Organization` não é apagada fisicamente (soft delete); `audit_logs` usam `ON DELETE SET NULL` para preservar a trilha. Índices: ver migration.

## Fase 2 — clientes e processos

| Tabela | Escopo | Observações |
|---|---|---|
| `clients` | `organization_id` | `PERSON`/`COMPANY`; `document` guardado **sem máscara** (CPF 11 dígitos; CNPJ 14, numérico ou alfanumérico); **índice único parcial** `(organization_id, document)` para ativos; e-mail minúsculo (CHECK); etiquetas `text[]`; exclusão lógica (`deleted_at`) |
| `client_contacts` | `organization_id` | pessoas de referência; um contato principal por cliente (garantido no serviço, em transação) |
| `cases` | `organization_id` | `number` no formato CNJ (CHECK de formato; dígito verificador validado na aplicação); único parcial por escritório; `claim_value numeric(14,2)`; `confidential`; exclusão lógica |
| `case_parties` | `organization_id` | partes do processo; `client_id` opcional (cliente do escritório → `is_our_client`); `ON DELETE RESTRICT` no cliente |
| `case_members` | `organization_id` | equipe do processo; **índice único parcial**: um `RESPONSIBLE` por processo; define quem vê processos sigilosos |
| `case_events` | `organization_id` | linha do tempo; `source` = `IMPORTED` (reservado às Fases 4/8) / `INTERNAL` (anotações humanas) / `AUTOMATIC` (sistema); imutável (sem edição) |
| `documents` | `organization_id` | metadados (nome, MIME definido pelo servidor, tamanho, SHA-256, chave de armazenamento); pertence a um processo **ou** cliente (CHECK); exclusão lógica; `external_key` (único por escritório) evita duplicar autos baixados do tribunal |

**Integridade multi-tenant no banco:** `clients` e `cases` têm `UNIQUE (id, organization_id)` e todas as tabelas filhas usam **chaves estrangeiras compostas** `(…_id, organization_id)`. Assim, mesmo um bug de aplicação não consegue ligar um registro de um escritório a outro (teste de integração tenta e o banco recusa). O Prisma declara as relações apenas por `id`; as FKs compostas existem só na migration SQL.

Dinheiro: `Decimal`/`numeric` (nunca `float`); o valor da causa é convertido de texto BRL para string decimal sem passar por `number`.

## Fase 3 — tarefas, prazos, agenda e notificações

| Tabela | Escopo | Observações |
|---|---|---|
| `tasks` | `organization_id` | situação/prioridade (enums); `due_date` é **data de calendário** (`date`, sem fuso); `assignee_id`/`created_by_id` → usuários (validado como membro ativo no serviço); vínculo opcional a processo/cliente por FK composta `RESTRICT`; exclusão lógica |
| `task_comments` | `organization_id` | comentários imutáveis; `ON DELETE CASCADE` na tarefa |
| `deadlines` | `organization_id` | sempre ligado a um processo; `status` DRAFT→VALIDATED→FULFILLED/CANCELED; `source` MANUAL (IMPORTED reservado à Fase 4); `due_date` e `internal_due_date` são datas de calendário (CHECK interno ≤ fatal); `validated_by_id/validated_at` (CHECK: obrigatórios em VALIDATED/FULFILLED); `calculation_note` guarda a memória do cálculo auxiliar |
| `agenda_events` | `organization_id` | `starts_at`/`ends_at` em `timestamptz` (UTC); a conversão de/para o fuso do escritório é feita na aplicação; CHECK término ≥ início; exclusão lógica |
| `notifications` | `organization_id` + `user_id` | `link` só caminho interno (CHECK); **índice único parcial** `(user_id, dedupe_key)` torna a geração idempotente; leitura só pelo dono |

Datas: prazos e vencimentos são "datas de calendário" (`YYYY-MM-DD`, comparadas com "hoje" no fuso do escritório); compromissos são instantes (`timestamptz`).

## Fase 4 — central de intimações

| Tabela | Escopo | Observações |
|---|---|---|
| `court_notices` | `organization_id` | `source` MANUAL/PASTED/FILE (IMPORTED reservado); `status` NEW→DISTRIBUTED→PROCESSED/DISCARDED (CHECK: descarte exige motivo); `case_number` com CHECK de formato CNJ (dígito verificador validado na aplicação); `content_hash` (SHA-256 do teor normalizado) com índice por escritório; `duplicate_of_id` (FK composta); `case_id` opcional (FK composta); exclusão lógica |
| `court_connections` | `organization_id` | conexão MNI por tribunal (`jtr` CHECK `N.NN`, `endpoint_url`, `auth_mode` CHECK, `certificate_id` FK, `secret_enc` AES-GCM com CPF/CNPJ+senha); `court_notices.external_key` único parcial (escritório, chave) para importações |
| `tasks.source_notice_id`, `deadlines.source_notice_id` | — | origem da providência; FK composta `(id, organization_id)` para `court_notices` |

## Fase 5 — versões, modelos e peticionamento

| Tabela | Escopo | Observações |
|---|---|---|
| `documents` (alterada) | `organization_id` | novas colunas `category`, `description`, `current_version`, `template_id`, `updated_at`; os campos de arquivo (`storage_key`, `sha256`…) espelham a **versão corrente** |
| `document_versions` | `organization_id` | uma linha por versão (`UNIQUE (document_id, version)`), arquivo próprio (`storage_key` único), `source` UPLOAD/TEMPLATE, nota e autor; FK composta para o documento; arquivos antigos nunca são sobrescritos |
| `document_templates` | `organization_id` | texto com `{{campos}}`; nome único por escritório (índice parcial, sem diferenciar caixa); exclusão lógica; `active` |
| `petition_filings` | `organization_id` | sempre ligada a um processo e a um documento (FKs compostas); `document_version` fixa a versão revisada; `status` DRAFT/IN_REVIEW/APPROVED/SUBMITTING/SUBMITTED/FAILED/CANCELED; `adapter`, `is_demo`, `protocol`, `receipt`; CHECK: SUBMITTED exige protocolo, data e adaptador |

## Fase 6 — CRM, automações e portal

| Tabela | Escopo | Observações |
|---|---|---|
| `leads` | `organization_id` | etapa NEW/CONTACTED/MEETING/PROPOSAL/WON/LOST; `estimated_value` Decimal; `client_id` preenchido só na conversão; `lost_reason`; exclusão lógica |
| `lead_activities` | `organization_id` | histórico de contatos, mudanças de etapa e propostas |
| `proposals` | `organization_id` | ligada ao lead (FK composta); `amount` Decimal; status DRAFT/SENT/ACCEPTED/REJECTED |
| `workflow_rules` | `organization_id` | gatilho, título/descrição/prazo/prioridade da tarefa, modo de responsável; exclusão lógica |
| `workflow_runs` | `organization_id` | `UNIQUE (rule_id, source_type, source_id)` garante idempotência; status CREATED/SKIPPED/FAILED |
| `portal_accounts` | `organization_id` | usuário ↔ cliente; `revoked_at` encerra o acesso |
| colunas novas | — | `cases.shared_with_portal`, `documents.shared_with_portal/shared_at`, `invitations.client_id` |

### Financeiro (Fase 7)
| Tabela | Escopo | Observações |
|---|---|---|
| `finance_accounts` | `organization_id` | nome único por escritório (sem diferenciar maiúsculas); `initial_balance`; desativar em vez de apagar |
| `finance_categories`, `cost_centers` | `organization_id` | nome único; cor `#RRGGBB` validada por CHECK |
| `finance_entries` | `organization_id` | tipo RECEIVABLE/PAYABLE; natureza FEE/EXPENSE/OTHER; `amount > 0`; `0 <= paid_amount <= amount`; situação consistente com o pago (CHECK); parcelas `installment_no/total`; FKs compostas para conta, categoria, centro, cliente e processo; cancelamento guarda motivo/autor |
| `finance_payments` | `organization_id` | baixa; estorno preenche `reversed_at/by/reason` (CHECK de consistência) e **nunca apaga**; FK `ON DELETE RESTRICT` |

### Segurança (Fase 9a)

`users.failed_login_count/locked_until`; `user_mfa` (segredo cifrado, `last_step`), `mfa_recovery_codes` (hash, uso único), `mfa_challenges` (token em hash, tentativas, expiração).

### DataJud (Fase 8c)

`organizations.datajud_enabled`, `cases.datajud_synced_at`, `case_events.external_key` (único por processo quando não nulo).

### Texto de documentos (Fase 8b)
| Tabela | Escopo | Observações |
|---|---|---|
| `document_texts` | `organization_id` | um registro por (documento, versão); FK composta (documento, escritório); `content` (texto), `search_text` (sem acento) com índice GIN `portuguese`; status EXTRACTED/EMPTY/UNAVAILABLE/FAILED, método, páginas, erro |

### IA (Fase 8a)
| Tabela | Escopo | Observações |
|---|---|---|
| `ai_usage` | `organization_id` | um registro por consulta: usuário, processo, recurso, provedor, modelo, tokens (sem conteúdo) |
| coluna nova | — | `organizations.ai_enabled` (padrão falso) |

### API pública
| Tabela | Escopo | Observações |
|---|---|---|
| `api_keys` | `organization_id` | `prefix` único (8 hex), `key_hash` (SHA-256 do segredo), `scopes text[]` (CHECK 1–10), criador, validade, último uso (atualizado no máximo a cada 5 min), revogação |
| `webhook_endpoints` | `organization_id` | nome, URL, segredo cifrado, eventos (CHECK 1–20), falhas seguidas, `UNIQUE (id, organization_id)` |
| `webhook_deliveries` | `organization_id` | FK composta para o endereço; `UNIQUE (endpoint_id, event_id)`; status PENDING/SUCCEEDED/FAILED, tentativas, próxima tentativa |

### Importação
| Tabela | Escopo | Observações |
|---|---|---|
| `import_map` | `organization_id` | `UNIQUE (organization_id, source, entity, external_id)` → `internal_id`; garante reimportação sem duplicar |

Entidades dos módulos seguintes (intimações, prazos, tarefas, documentos, financeiro, IA…) serão adicionadas incrementalmente, **sempre com `organization_id`**, conforme o roadmap.

| `djen_monitors` | `organization_id` | OAB monitorada (`oab_number` 1–7 dígitos, `oab_uf` CHECK), `last_window_end` (para retomar a janela), único por (escritório, UF, número) |
| `work_teams`, `work_team_members` | `organization_id` | equipes de trabalho da caixa de entrada; nome único por escritório (sem diferenciar maiúsculas); FK composta para o escritório |
| `notice_notes` | `organization_id` | notas internas da intimação (1–2000 caracteres) |
| `court_notices.team_id/assigned_by_id/snoozed_until/tags` | — | equipe responsável (exclusiva com `assignee_id`), quem encarregou, adormecida até, etiquetas (máx. 10) |
| `platform_admins` | — (global) | super-administradores da plataforma (só por script) |
| `organizations.suspended_at/suspended_reason` | — | suspensão pelo painel; CHECK: ambos preenchidos ou ambos vazios |
| `petition_attachments` | `organization_id` | anexos da petição: `document_version` travada na revisão, `classification` (CHECK), `position`; FK composta para a petição (cascata) e para o documento (restrict); único por (petição, documento) |
| `text_snippets` | `organization_id` | autotextos: `slug` (CHECK `[a-z0-9-]`, ≤60) único por escritório entre os não excluídos (índice parcial), exclusão lógica |
