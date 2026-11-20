# Diagnóstico completo do LegalOS — 19/11/2026

**Versão analisada:** `main` do GitHub (`Lforbias/legalos`), commit `c65c499` — "Apresentação: protocolo nos tribunais como funcionalidade principal (#69)".
A análise foi feita numa cópia separada do `main`, sem tocar nas suas alterações locais. As referências `arquivo:linha` apontam para o `main`.

**Como foi feito:** leitura do código pasta por pasta, dividida em 5 frentes (núcleo/segurança, jurídico/tribunais, comunicação/IA, financeiro/gestão/interface, dados/testes/documentação), mais checagens automáticas (TypeScript, lint, testes, auditoria de dependências). Os achados mais graves foram conferidos diretamente no código.

---

## 1. Resumo executivo

**O LegalOS é um produto grande, bem construído na base e com boa disciplina de segurança — mas está com a direção do módulo judicial confusa, algumas peças quebradas por essa confusão, e integrações críticas que nunca foram testadas contra o serviço real.**

| Indicador | Valor |
|---|---|
| Código TypeScript em `src/` | ~94 mil linhas (285 arquivos em `app`, 343 em `modules`, 208 em `server`, 166 em `lib`, 34 em `components`) |
| Tabelas no banco (models Prisma) | 207 models, 97 migrações |
| Módulos de produto (`src/modules`) | 58 |
| Rotas de API | ~70 |
| Testes | 87 arquivos unitários (544 casos), 129 de integração (950 casos), 56 E2E (87 casos) |
| Lint (ESLint) | ✅ limpo, 0 problemas |
| Testes unitários rodados agora | ✅ 555 passaram; 4 arquivos não rodaram porque precisam de banco (estão classificados como "unitários" mas dependem de `DATABASE_URL`) |
| TypeScript | ✅ só falhou por `livekit-client` não estar instalado na sua máquina (o `main` exige, seu `node_modules` local ainda não tem) — não é erro de código |
| Dependências com vulnerabilidade | 5 altas + 1 baixa (`node-forge`, `prisma`/`@prisma/config` e dependências, `fast-xml-parser`) |
| Ritmo | 233 commits no `main` desde 21/10/2026 (PRs #44→#69 em ~1 mês); 71 branches remotas |

### Nota por área

| Área | Situação | Nota |
|---|---|---|
| Segurança, login, permissões, isolamento entre escritórios | Muito boa, com alguns furos nas bordas | 8/10 |
| Processos, clientes, partes | Sólido | 8,5/10 |
| Prazos, tarefas, agenda, kanban | Bom, mas **tabela de prazos CLT/JEC está errada** | 6,5/10 |
| Cálculos | Boa engenharia, **metodologia trabalhista questionável** | 6/10 |
| Documentos, modelos, OCR | Funciona, limitado (8 MB, só disco local, modelos só texto) | 7/10 |
| Módulo judicial (Box, intimações, robôs, certificados) | **Retirado pela metade — quebrou outras funções** | 3/10 |
| Importação Astrea | Muito boa, mas publicações importadas ficam invisíveis | 7/10 |
| Financeiro | Núcleo excelente com dinheiro; pontas novas com riscos | 7,5/10 |
| Gestão, relatórios, timesheet, metas | Funciona, básico | 6,5/10 |
| Automações | Seguras, mas só sabem "criar tarefa" | 5,5/10 |
| WhatsApp e Atendimento | Muito completo no código, **nunca testado com o WhatsApp real** | 5,5/10 |
| IA (RUTE, Copiloto) | Bem protegida; custo e "modo ações" precisam de política | 7/10 |
| Portal do cliente | Bom e seguro, pequenos bugs | 7,5/10 |
| Cowork | Funciona; vídeo e agentes desligados | 7/10 |
| Áreas públicas / comercial | Bem feitas; **site promete o que o código desligou** | 6/10 |
| Interface | Consistente, mas **sem telas de carregando/erro/404** e navegação lenta | 6/10 |
| Infraestrutura e deploy | Bom (backup cifrado, rollback, CI); falta monitoramento | 7/10 |
| Testes | Muitos e bons; alguns escondem bugs reais | 7/10 |
| Documentação | Extensa, mas desatualizada e contraditória | 5/10 |

---

## 2. Os problemas mais graves (resolver primeiro)

Estes foram conferidos pessoalmente no código.

### 🔴 2.1 Cofre de senhas dos clientes e configuração do Google Drive estão quebrados em produção
- `src/server/services/client-vault.service.ts:8` importa `requireMfa` de `certificate.service`.
- Esse `requireMfa` chama `assertBoxSurface("legacy")` → `assertBoxAvailable()`, que **sempre falha** porque o Box foi desligado (`src/lib/box-retirement.ts:4`, `BOX_AVAILABLE = false`).
- Resultado: salvar e revelar credenciais no cofre (`client-vault.service.ts:52, 88`) dá erro "módulo removido". O mesmo acontece na configuração do Google Drive (`google-drive.service.ts:9, 46, 72, 83, 118`) e no botão "Remover" monitoramento DJEN (`djen.service.ts:114`).
- **Por que os testes não pegaram:** `src/tests/integration/setup-env.ts:12-13` força `BOX_AVAILABLE: true` em todos os testes de integração. Os testes rodam num mundo que não existe em produção.
- **Correção:** criar uma checagem de 2FA própria (sem relação com o Box) e usá-la no cofre, Drive e DJEN; rodar os testes de integração com o comportamento real.

### 🔴 2.2 Tabela de prazos conta CLT e Juizado em dias corridos
- `src/lib/calc/prazos.ts:20-26`: recurso ordinário, recurso de revista, embargos e agravo trabalhistas, e recurso inominado/contrarrazões/embargos do JEC estão como `CALENDAR` (dias corridos).
- Desde a Reforma Trabalhista (art. 775 CLT) e a Lei 13.728/2018 (art. 12-A da Lei 9.099), contam-se **dias úteis**. O teste `calc-engines.test.ts:85-87` confirma o resultado errado como se fosse o certo.
- **Risco:** o sistema mostra vencimento **antes** do real (menos grave que depois, mas induz erro e destrói confiança no produto). Corrigir e revisar a tabela inteira com uma advogada.

### 🔴 2.3 Atualização trabalhista com metodologia questionável
- `src/lib/calc/trabalhista.ts:44-59`: aplica juros de 1% a.m. na fase pré-judicial, usa TR até 03/2015 e ignora ADC 58/59 e a Lei 14.905/2024 (IPCA-E + SELIC / IPCA + taxa legal a partir de 30/08/2024).
- **Precisa de revisão por especialista** antes de qualquer cliente usar.

### 🔴 2.4 Módulo judicial: o site promete, o código desliga, os dados foram apagados, e o trabalho continua
Este é o maior problema de **direção do produto**:
- `README.md:5` diz que captura judicial, certificados e protocolo **foram retirados**.
- A migração `20270111000000_purge_removed_box_data` **apaga** ~30 tabelas (intimações, petições, certificados, credenciais, monitoramentos DJEN, robôs, LegalMail) — sem volta.
- Ao mesmo tempo, a página pública `/apresentacao` (`src/app/(public)/apresentacao/page.tsx:149-160`) anuncia **"Do processo ao tribunal, sem sair do LegalOS"** com protocolo "Disponível no lançamento".
- E o piloto de certificado A1 + robô (eproc/PJe) **continua vivo**: `scripts/server/deploy.sh:123-125` liga ele automaticamente quando existe `CERT_ENCRYPTION_KEY`, para qualquer escritório com `integrations:manage`, guardando certificado, senha e semente do 2FA do advogado.
- O seu branch local (`claude/eproc-certificado-diagnostico`) segue desenvolvendo o robô do TJMG.
- ~9 a 11 mil linhas de código judicial seguem no repositório sem rota acessível; 5 módulos não são importados por ninguém (`box-v3`, `court-credentials`, `court-systems`, `pje`, `portal-access`).
- A migração de limpeza também apaga dados de funções que **continuam vivas** (DJEN público, Central Judicial, piloto TJMG).

**Decisão necessária (sua):** ou o módulo judicial volta oficialmente (e aí: remover o "retirado" do README, reescrever a migração de limpeza, controlar o piloto por escritório), ou ele sai de verdade (e aí: tirar a promessa do site, desligar o piloto, apagar o código morto e seus ~30 testes).

### 🔴 2.5 WhatsApp nunca falou com o WhatsApp de verdade
- API oficial da Meta: `docs/whatsapp.md:5` admite que "nunca falou com a Meta de verdade".
- Conexão por QR-Code usa `@whiskeysockets/baileys 7.0.0-rc14` (versão de teste, biblioteca não oficial), testada só com simulador.
- **Campanhas em massa pelo QR-Code** permitem até 10.000 destinatários com texto livre (`chat-campaigns.service.ts:18,186`) — o próprio doc diz que o QR "contraria os termos do WhatsApp". Risco alto de **banimento do número do escritório**.

### 🟠 2.6 Tela de autorização OAuth/MCP pode ser usada para golpe
- Qualquer pessoa registra um "aplicativo" com qualquer nome (ex.: "Claude") e endereço de retorno próprio (`api/oauth/register/route.ts`, `mcp-auth.service.ts:58-79`). A tela mostra só o nome, não o destino (`app/oauth/authorize/page.tsx:58`), e diz "só consulta e propõe" mesmo quando pede `mcp:execute` (que grava dados).
- Um advogado enganado a clicar "Permitir" entrega leitura de processos e clientes.

### 🟠 2.7 Outros furos de segurança médios
- **Administrador do escritório A vê e derruba sessões do mesmo usuário no escritório B** (inclusive IP e navegador): `org-security.service.ts:97,106` filtra por "usuário é membro de A", não por sessão de A. *(Conferido.)*
- **Chaves de API e conexões MCP ignoram o bloqueio por IP e o 2FA obrigatório** do escritório (`checkOrgAccess` só roda em `session.ts:98`).
- **Qualquer um consegue travar a conta de um advogado**: 5 senhas erradas de qualquer origem bloqueiam por 15 min (`auth.service.ts:97-103`), repetível indefinidamente.

---

## 3. Diagnóstico por área e por pasta

### 3.1 Núcleo, segurança e infraestrutura
**Pastas:** `src/app/(auth)`, `src/modules/auth`, `src/lib/auth`, `src/lib/security`, `src/lib/permissions`, `src/proxy.ts`, `src/server/session.ts`, `src/server/context.ts`, `src/modules/organizations|team|account`, `src/app/admin`, `src/modules/platform`, `src/modules/billing`, `src/app/api/v1|mcp|oauth|cron`, `Dockerfile`, `.github/workflows`, `scripts/server`.

**✅ Pontos positivos**
- Senhas com scrypt em parâmetros OWASP; hash falso quando o e-mail não existe (não denuncia contas) — `src/lib/security/password.ts:7-10`.
- Cookie de sessão `__Host-`, httpOnly, Secure, SameSite; no banco só o hash do token.
- 2FA (TOTP) com códigos de recuperação, anti-reuso atômico, 5 tentativas por desafio; redefinir senha derruba todas as sessões.
- `src/proxy.ts` está correto para o Next 16 (substitui o antigo middleware), com CSP com nonce, HSTS, X-Frame-Options DENY.
- **Proteção CSRF em 100% das rotas que alteram dados** (`isSameOrigin`).
- **Isolamento entre escritórios bem feito**: o ID do escritório nunca vem do navegador; amostradas ~20 gravações sensíveis, todas conferem dono antes; há teste dedicado `tenant-isolation.test.ts`.
- Ninguém consegue dar a outro mais permissão do que tem; último titular não pode ser removido.
- `/admin` exige super-admin com 2FA e responde 404 aos demais; cada página checa por conta própria.
- Webhook do Asaas não confia no aviso — reconsulta o pagamento antes de aplicar.
- API: chaves guardadas só em hash, escopos cruzados com as permissões **atuais** do criador.
- OAuth do MCP no padrão moderno (PKCE S256, código de uso único, rotação de refresh).
- Webhooks de saída com forte proteção contra SSRF.
- Docker multi-estágio sem root; app só em 127.0.0.1; deploy com backup antes, espera `/api/ready` e volta a versão se falhar; backup cifrado AES-256; logs mascaram CPF/CNPJ/senhas.

**❌ Falhas**
| Sev. | Falha | Onde |
|---|---|---|
| Média | Tela OAuth pode ser usada para golpe (ver 2.6) | `app/oauth/authorize/page.tsx:58` |
| Média | API/MCP ignoram bloqueio por IP e 2FA obrigatório | `session.ts:98` |
| Média | Sessões de outros escritórios visíveis/revogáveis | `org-security.service.ts:97,106` |
| Média | Travamento de conta por terceiros | `auth.service.ts:97-103` |
| Média | Limite de tentativas só na memória do processo (reinício zera; 2 instâncias = limite dobrado) | `src/lib/security/rate-limit.ts:1-4` |
| Média | Sem Row-Level Security no Postgres — isolamento depende só do código | `docs/security.md:34` |
| Média | Sem monitoramento de erros/uptime (Sentry, alerta) | `docs/deploy-vps.md` |
| Média | Docker usa `npm install` em vez de `npm ci` (build não reprodutível); sem Dependabot/`npm audit` na CI | `Dockerfile:8` |
| Média | Backup para fora do servidor é opcional | `backup-docker.sh` |
| Média (negócio) | Teste vencido, cancelado ou inadimplente continua usando quase tudo; `PAST_DUE` não bloqueia nada | `plan.service.ts:18,50` |
| Baixa | Cadastro revela se e-mail já existe | `auth.service.ts:60` |
| Baixa | Desativar 2FA pede só a senha | `mfa.service.ts:102-103` |
| Baixa | Checagem de IP/inatividade libera se o banco falhar | `org-security.service.ts:87-88` |
| Baixa | Sessões, desafios e tokens vencidos nunca são apagados | — |
| Baixa | IP do visitante vem do 1º valor de `x-forwarded-for` (frágil se puser Cloudflare na frente) | `session.ts:18` |
| Baixa | Dockerfile liga `LEGALOS_BOX3_PREVIEW=1`; deploy usa `root` se `DEPLOY_USER` faltar | `Dockerfile:35`, `deploy.yml` |
| Baixa | Escritório sem assinatura cadastrada fica sem limite nenhum | `plan.service.ts:31-32` |

### 3.2 Processos, clientes e partes
**Pastas:** `src/app/(dashboard)/processos|clientes|partes`, `src/modules/cases|clients`, `case.service.ts`, `client.service.ts`.
- ✅ Validação de número CNJ (módulo 97), CPF/CNPJ sem duplicidade por escritório, sigilo aplicado em toda leitura (`case.service.ts:30-44`), exclusão "suave", partes, membros, linha do tempo.
- ❌ Nenhuma falha relevante. Única ressalva: `processos/[id]/page.tsx` tem 670 linhas / 41 KB — difícil de manter.

### 3.3 Prazos, tarefas, kanban, agenda, alertas
**Pastas:** `src/modules/deadlines|tasks|kanban|agenda|activities`, `src/lib/deadlines`, `src/lib/dates`.
- ✅ Todo prazo nasce como rascunho e exige validação humana; alterar a data desfaz a validação; proteção contra edição simultânea; sigilo em tudo; alertas no sistema e push.
- ✅ Calendário forense com fins de semana, feriados nacionais, Sexta-Feira Santa, Consciência Negra e recesso 20/12–20/01.
- ❌ **Alta:** tabela CLT/JEC em dias corridos (ver 2.2).
- ❌ Calendário **não** considera Carnaval, Corpus Christi, feriados estaduais/municipais, suspensões de expediente dos tribunais, feriados da Justiça Federal (Lei 5.010).
- ❌ Baixa: não distingue disponibilização × publicação no DJEN (art. 224 §§2º-3º CPC) — risco de 1 dia; agenda corta em 500 itens sem aviso (`agenda.service.ts:37`); `updateDeadline` sem proteção contra edição simultânea.
- ⏳ Falta: lembrete de prazo por e-mail (hoje só push e aviso interno).

### 3.4 Cálculos
**Pastas:** `src/modules/calculos`, `src/lib/calc`, `src/app/api/calculos`.
- ✅ TJSP (tabela, SELIC, híbrido Lei 14.905), trabalhista, Justiça Federal, prazos; aritmética de precisão fixa; recálculo no servidor; exporta XLSX/CSV/memorial; avisa quando falta índice em vez de inventar.
- ❌ **Alta:** metodologia trabalhista (ver 2.3).
- ❌ **Média:** a lista geral de cálculos não aplica sigilo — quem não tem acesso vê título (com nº do processo) e valor de cálculos de processos sigilosos (`calculation.service.ts:84-92`).
- ❌ Baixa: tabelas embutidas desatualizadas (TJSP até 07/2026, INSS até 2025, `bundled-tables.ts`); SELIC pura sem o piso de juros zero do art. 406 §3º.

### 3.5 Documentos, modelos, OCR, petições
**Pastas:** `src/modules/documents|templates|petitions|snippets|vault`, `src/lib/storage|ocr|templates|petitioning`.
- ✅ Upload confere o conteúdo real contra a extensão; versões com SHA-256; armazenamento protegido contra acesso a outras pastas; OCR (tesseract/poppler) na imagem Docker; modelos com variáveis que viram "[PREENCHER]" em vez de inventar; DOCX/PDF com timbrado.
- ❌ Média: limite de **8 MB** é baixo para autos (`document.service.ts:14`); **só disco local** (sem S3) → impede ter mais de uma instância; modelos só texto (sem negrito/listas, sem usar um .docx do escritório como base).
- ❌ **Alta:** cofre de senhas quebrado (ver 2.1).

### 3.6 Módulo judicial: intimações, DJEN, DataJud, robôs, certificados
**Pastas:** `src/modules/box|box-v3|inbox|petitions|mni|pje|djen|legalmail|certificates|court-*|judicial`, `src/lib/box-v3|judicial|robots|djen|datajud|mni|pje|notices`, `src/server/judicial|robots`, `scripts/robot-worker.ts`, `extensions/legalos-pje`.
- ✅ Bloqueio central bem feito (`box-retirement.ts`, `proxy.ts:47-50` devolve 404/410).
- ✅ Piloto de certificado: só apresenta o certificado a domínios `.jus.br` de lista fixa; segredos cifrados; fila com `SKIP LOCKED`; robô para em senha errada/captcha.
- ✅ DataJud traz andamentos sem duplicar e nunca consulta processo sigiloso.
- ❌ Ver 2.1 e 2.4.
- ❌ **Alta:** publicações importadas do Astrea **ficam invisíveis** — gravadas com `source: "IMPORTED"` sem `sourceSystem`/`originKind` (`astrea-import.ts:467-480`), mas as telas filtram por `sourceSystem: "djen"` (`public-judicial.service.ts:8-12`).
- ❌ Média: DJEN — o código diz que não depende do Box, mas `/api/cron/djen` está bloqueado e fora do agendador; a tela promete verificação automática (`integracoes/page.tsx:121`), que não acontece.
- ❌ Média: robô só faz **teste de login**; não captura intimações nem protocola — mas a tela fala em "Login, consulta e protocolo".
- ❌ Média: DataJud sem acompanhamento automático (só clique a clique).
- ❌ Baixa: Chromium com `--no-sandbox` (`robot-worker.ts:21`); e-SAJ e Projudi sem endpoints ("ADAPTER_WIP").

### 3.7 Importação (Astrea, CSV, lote CNJ)
**Pastas:** `src/modules/case-import`, `src/server/import`, `src/lib/import`.
- ✅ Excelente: ZIP até 48 MB com proteção contra "bomba de descompressão", trava por escritório, transação, simulação, repetível sem duplicar; lote por CNJ com pré-validação; boa documentação.
- ❌ Publicações invisíveis (acima); doc promete "Central de intimações" removida; importação inteira em uma transação de até 240 s pode estourar em backups grandes.

### 3.8 Financeiro
**Pastas:** `src/app/(dashboard)/financeiro`, `src/modules/finance`, `src/lib/finance`, `finance.service.ts`, `fee-*.service.ts`, `bank-reconciliation.service.ts`.
- ✅ **Dinheiro tratado corretamente**: `Decimal(14,2)` no banco e contas em centavos inteiros; parcelas fecham a soma; baixa protegida contra dois usuários ao mesmo tempo; correção monetária não calcula se faltar índice; Asaas (Pix/boleto) desligado por padrão, chave cifrada, aviso verificado e idempotente.
- ✅ Contas a pagar/receber, parcelamento até 60x, baixa parcial, estorno, centros de custo, fluxo de caixa, faturas de honorários, contratos de êxito.

| Sev. | Falha | Onde |
|---|---|---|
| Média | **Conciliação bancária publicada sem nenhum teste** e sem chave liga/desliga — e registra baixas reais; o próprio doc diz que ainda precisa de revisão | `finance-nav.tsx:8`, `docs/financeiro-expansao-prioridades.md:36-38` |
| Média | Duas faturas emitidas ao mesmo tempo podem incluir o mesmo honorário (falta `invoiceId: null` no update) | `fee-invoice.service.ts:58` |
| Média | Dá para gerar 2ª cobrança Pix/boleto se a 1ª estiver vencida mas ativa no Asaas (trava só olha `PENDING`) | `fee-charge.service.ts:92` |
| Média | Estorno avisado pelo Asaas não desfaz a baixa — saldo fica errado | `fee-charge.service.ts:162-169` |
| Média | Sigilo inconsistente: lista e resumo mostram descrição/valor de lançamentos de processos sigilosos; exportação esconde | `finance.service.ts:284,378` × `export.service.ts:69` |
| Baixa | Contratos de êxito só carregam 500 clientes | `financeiro/exito/page.tsx:17` |

- ⏳ Falta: lançamento recorrente (mensalidade), NFS-e, extrato OFX, DRE por competência, plano de contas, exportação para contador.

### 3.9 Gestão: timesheet, metas, indicadores, relatórios, exportação
- ✅ Relatórios com limite de período e de linhas, CSV protegido contra fórmulas maliciosas, permissões e auditoria em cada exportação.
- ❌ Média: **exportação cortada em 5.000 linhas sem aviso visível** (só num cabeçalho técnico) — `export.service.ts:25`.
- ❌ Baixa: meta pode duplicar com dois cliques (`goals.service.ts:48`).
- ⏳ Timesheet básico: sem hora faturável, valor/hora, vínculo a cliente, edição, cronômetro, aprovação — e **horas não viram cobrança**.

### 3.10 Automações
- ✅ 5 gatilhos (processo criado, prazo validado, lead ganho, tarefa concluída, documento enviado), sem execução duplicada, falha não desfaz a ação original, respeita sigilo; crons protegidos por `CRON_SECRET`.
- ⏳ **Única ação possível: criar tarefa.** Faltam e-mail/WhatsApp, lançamento financeiro, gatilhos por data ("3 dias antes do prazo"). Máx. 20 regras por evento sem aviso.
- ❌ `docs/producao.md:43-61` manda agendar crons DJEN/MNI que estão desligados.

### 3.11 WhatsApp, Atendimento, E-mail
**Pastas:** `src/lib/whatsapp`, `src/modules/whatsapp|inbox|crm`, `src/app/api/whatsapp|webhooks`, `src/lib/mail`.
- ✅ Muito completo: filas, etiquetas, notas internas, macros, campanhas com aprovação humana e opt-out, SLA, bot de triagem, transcrição de áudio, copiloto que nunca envia sozinho, e-mail IMAP/SMTP.
- ✅ Webhook da Meta com assinatura verificada; mídia de terceiros aberta em modo isolado; e-mail recusa servidores de rede interna.
- ❌ Ver 2.5 (nunca testado de verdade; campanhas em massa por QR).
- ❌ Média: QR-Code só funciona com **uma** cópia do servidor (sessão em memória — `qr/live.ts:3-6`).
- ❌ Média: telas atualizam por consulta repetida a cada poucos segundos (não é tempo real) — pesa com muitos atendentes.
- ❌ Baixa: modelo da Meta preenchido com "-" nas variáveis ("Olá João, seu processo -"); quem lê WhatsApp vê todas as conversas, sem restrição por fila.
- ⏳ Sem push de mensagem nova do WhatsApp.

### 3.12 IA — RUTE, Copiloto, IA geral
- ✅ Claude, Gemini e OpenAI chamados diretamente; chave de cada escritório cifrada; cada ferramenta confere permissão e sigilo; CPF/CNPJ/e-mail mascarados antes de sair; limites em 3 níveis, parada de emergência, relatório LGPD; ações perigosas (envio externo, protocolo, pagamento, exclusão) fora do alcance da IA.
- ❌ Média: **"modo ações" grava dados sem aprovação humana** (`rute-action-tools.ts:37`) — mensagem de cliente lida pela IA pode induzi-la a alterar dados (injeção de instrução).
- ❌ Média: escritório sem chave própria usa a **chave do servidor** (o LegalOS paga), limite de 500 mil tokens/mês sem conversão em reais; transcrição de áudio sempre na chave do servidor e fora do teto.
- ❌ Baixa: sem cache de prompt (cada passo reenvia todo o histórico → mais caro).
- ❌ Baixa: modelos padrão desatualizados (`claude-sonnet-4-5`, `gemini-2.5-flash`, `gpt-4.1-mini` em `rute-settings.service.ts:13`).
- ⏳ RUTE e MCP desligados sem `LEGALOS_RUTE_ENABLED`/`LEGALOS_MCP_ENABLED`; `/api/rute/skill` e `/api/rute/lgpd` respondem 410 mas a doc diz que estão prontos.
- ⏳ Ferramentas da RUTE que gravam dados **não têm teste**.

### 3.13 Portal do cliente
- ✅ Cliente só vê processos compartilhados em que é parte; download só de documentos compartilhados; membro da equipe não vira cliente; limite de mensagens.
- ❌ Baixa: cliente excluído continua acessível (`portal-plus.service.ts:116-120`); quem tem 2 cadastros (PF e PJ) sempre fala pelo primeiro.
- ❌ Média (operação): e-mail em modo "console" por padrão — **se `MAIL_DRIVER=smtp` não estiver em produção, nenhum convite chega** (`mailer.ts:70`).
- ⏳ Cliente não pode enviar arquivo; sem push para cliente.

### 3.14 Cowork
- ✅ Canais, conversas, anexos, tempo real (SSE + LISTEN/NOTIFY); vídeo com tokens assinados e webhook verificado.
- ⏳ Vídeo desligado até haver servidor LiveKit; agentes de IA não implementados.

### 3.15 Comercial, prospecção e áreas públicas
**Pastas:** `src/app/comercial`, `src/modules/comercial|launch`, `src/app/(public)`, `src/app/(audience)`, `src/server/audience`.
- ✅ Área comercial toda protegida por `requireComercial`; formulário de interesse com campo-armadilha anti-robô, limite por IP e consentimento LGPD versionado; blog com JSON-LD seguro; comunidade só mostra aprovado.
- ❌ **Alta:** `/apresentacao` promete protocolo nos tribunais (ver 2.4).
- ⏳ Editorial e marketing com IA dependem de chaves; Contato mostra "em breve" sem canais configurados.

### 3.16 Google e conectores
- ✅ Drive com permissão mínima `drive.file`, segredos cifrados, retorno do login assinado.
- ❌ Configuração do Drive quebrada (ver 2.1).
- ⏳ **Não existe Google Agenda nem Gmail.**

### 3.17 Onboarding, ajuda, lançamento, Evolution, protótipos, desktop
- ✅ Assistente de boas-vindas em 3 passos com progresso salvo; checklist de ativação automático; contagem regressiva para 05/01/2027; ajuda esconde guias do Box.
- ✅ "Evolution" é a interface oficial (menu `EvolutionSidebar`), não experimento. Protótipos corretamente atrás de `LEGALOS_PROTOTYPES=1`.
- ❌ Baixa: telas duplicadas (`/dashboard` × `/evolution`, `/financeiro` × `/evolution/financeiro`); guias do Box mortos no código.

### 3.18 Interface (`src/components`, layouts, `globals.css`)
- ✅ `pt-BR`, respeita "reduzir animação", `aria-current`, foco visível, componentes reutilizados, tela padrão "sem acesso".
- ❌ **Alta:** **não existe nenhum `loading.tsx`, `error.tsx`, `not-found.tsx` nem `<Suspense>`** em todo o app (conferido: 0). O usuário não vê "carregando" ao trocar de página; qualquer erro mostra a tela genérica do Next; 404 sem a marca.
- ❌ Média: o layout do painel faz 5-6 consultas **em sequência** antes de qualquer página (incluindo uma gravação no banco) — `(dashboard)/layout.tsx:28-36`. Navegação parece lenta.
- ❌ Média: arquivos gigantes — `whatsapp/tools-ui.tsx` (45 KB), `cowork/workspace.tsx` (45 KB), `welcome-wizard.tsx` (43 KB), `processos/[id]/page.tsx` (41 KB), `config/pricing-features.ts` (1.738 linhas), `help/extended-guides.ts` (56 KB); linhas de até 1.974 caracteres.

### 3.19 Modelo de dados (`prisma/`)
- ✅ Nenhum dinheiro em `Float`; quase nenhum model órfão; `AuditLog` usado em 123 serviços; sistema de migração próprio sólido (checksum, transação, trava).
- ❌ Alta: migração de limpeza destrutiva e irreversível (ver 2.4).
- ❌ Média: `schema.prisma` não descreve o banco real — índices e chaves estrangeiras compostas só existem no SQL; `prisma migrate diff` não roda na CI.
- ❌ Média: **20 migrações com data de 2027** (`20270111`…`20270119`) — qualquer migração nova criada com a data de hoje fica ordenada **antes** delas; num banco novo roda em ordem diferente da produção.
- ❌ Baixa: índice duplicado em `whatsapp_conversations(client_id)`; só 31 `deletedAt` em 207 tabelas, 188 `Cascade`; dinheiro em dois padrões (Decimal em reais e Int em centavos).

### 3.20 Testes (`src/tests`)
- ✅ 151 de 166 serviços cobertos; testes de isolamento, permissões, idempotência; CI roda typecheck, lint, testes, build e E2E.
- ❌ **Alta:** `setup-env.ts` força `BOX_AVAILABLE: true` e esconde o bug do cofre (ver 2.1).
- ❌ Média: sem teste — conciliação bancária, ferramentas da RUTE que gravam, `whatsapp-transport`, `whatsapp-auth`, `task-dependency`, `tool-api`, `jurisprudence-search`, `court-catalog`.
- ❌ Média: ~30 arquivos de integração testam código retirado (suíte lenta e cara).
- ❌ Baixa: 4 arquivos "unitários" precisam de banco; E2E fino (87 casos); um teste valida o prazo CLT errado.

### 3.21 Dependências
- 5 vulnerabilidades altas: `node-forge` (usado em certificados — atualizar já, correção disponível), `prisma`/`@prisma/config`/`effect`/`deepmerge-ts` (correção exige Prisma 7, mudança grande), `fast-xml-parser` (baixa, correção disponível).
- `@whiskeysockets/baileys 7.0.0-rc14` (versão de teste, não oficial).
- `playwright-core` em produção só para os robôs.
- `@types/pg` nas dependências de produção (deveria ser dev).

### 3.22 Documentação (`docs/`, README, CHANGELOG)
- ✅ `implementation-status.md` é honesto ao separar "pronto no código" de "validado em tribunal real"; há docs de segurança, backup, deploy.
- ❌ `roadmap.md` marca Fases 4 e 5 (intimações, peticionamento) como concluídas — foram retiradas; cita `/api/v1` como "ideia" — existe.
- ❌ `implementation-status.md` e `docs/security.md` dizem "sem MFA/CSP" — existem.
- ❌ `roadmap-7.0.0.md` diz "nada construído" — voz da RUTE e busca única já existem.
- ❌ `docs/whatsapp.md` diz que campanhas "não fazem parte" — existem.
- ❌ `CHANGELOG.md` parou em 27/10/2026; `package.json` diz versão `2.0.0` enquanto roadmaps falam em 4.0–7.0.

---

## 4. Sua máquina local × GitHub

- Você está no branch `claude/eproc-certificado-diagnostico`: **6 commits à frente** e **19 atrás** do `main`, com **~121 arquivos modificados não commitados** (inclusive `prisma/schema.prisma`, `package.json`, WhatsApp, financeiro, documentos).
- Esse branch continua o robô eproc/TJMG — que o `main` oficialmente "retirou".
- O seu `node_modules` está desatualizado em relação ao `main` (falta `livekit-client`). Rode `npm install` depois de trazer o `main`.
- Trabalho aberto fora do `main` (estimativa): `codex/homologacao-atendimento` (8 commits), `codex/func-visual-crm` (7), `codex/evolution-department-workflows` (6), `codex/judicial-core-completion` (5), `codex/box-portal-capture`, `codex/box-off-20261110`, e ~20 `feature/evolution-*` antigos para limpar.

---

## 5. Plano de ação

### Agora (bugs que já afetam usuário ou dados)
1. Consertar o 2FA do cofre de senhas, Google Drive e DJEN (separar de `certificate.service`) e tirar o `BOX_AVAILABLE: true` global dos testes.
2. Corrigir a tabela de prazos (CLT e JEC em dias úteis) e o teste que valida o erro; revisar a tabela inteira com uma advogada.
3. Colocar a atualização trabalhista em revisão por especialista (ou esconder até lá).
4. Aplicar sigilo na lista de cálculos e unificar sigilo no Financeiro.
5. Corrigir fatura duplicada (`invoiceId: null`), cobrança duplicada (olhar também vencidas ativas) e estorno do Asaas.
6. Restringir sessões ao escritório ativo; aplicar `checkOrgAccess` em API e MCP.
7. Atualizar `node-forge` e `fast-xml-parser`.

### Antes do lançamento (05/01/2027)
8. **Decidir o destino do módulo judicial** e alinhar site, README, migração de limpeza, piloto do deploy e branches.
9. Testar WhatsApp Meta com número de teste real; testar Baileys com número descartável; bloquear/limitar campanhas pelo QR.
10. Endurecer a tela OAuth (mostrar o domínio, alertar app desconhecido, texto correto para `mcp:execute`).
11. Criar `loading.tsx`, `error.tsx`, `not-found.tsx` (global e do painel) e paralelizar as consultas do layout.
12. Pôr a conciliação bancária atrás de chave até ter testes com extratos reais.
13. Configurar produção: `MAIL_DRIVER=smtp`, `REGISTRATION_MODE`, `CRON_SECRET`, backup externo obrigatório, monitoramento (Sentry + uptime em `/api/ready`).
14. Definir política de inadimplência/teste vencido e de custo da IA (chave do servidor, transcrição).
15. Exigir confirmação humana no "modo ações" da RUTE quando ela tiver lido dados externos.
16. Tornar visíveis as publicações importadas do Astrea.
17. Proteger o login contra travamento por terceiros e "password spraying".

### Depois (evolução)
18. Rate-limit e sessão do QR em armazenamento compartilhado (Redis) e documentos em S3 → permite mais de uma instância.
19. Row-Level Security no Postgres.
20. Feriados estaduais/municipais e suspensões no calendário; lembrete de prazo por e-mail; DataJud automático.
21. Automações com mais ações (e-mail, WhatsApp, financeiro) e gatilhos por data.
22. Timesheet faturável ligado a faturas; lançamentos recorrentes; NFS-e; OFX; DRE.
23. Google Agenda; modelos .docx com formatação; limite de upload maior; push de WhatsApp.
24. Limpeza: remover código morto, dividir arquivos gigantes, corrigir datas das migrações de 2027, `prisma migrate diff` na CI, `npm ci` + Dependabot, atualizar docs/CHANGELOG/versão, apagar branches já incorporados.

---

## 6. Conclusão

A base técnica é **acima da média** para um SaaS nesse estágio: segurança pensada, dinheiro tratado com precisão, isolamento entre escritórios cuidadoso, testes numerosos, deploy com rollback e backup cifrado. Os problemas não estão no "esqueleto", e sim em três lugares:

1. **Direção do módulo judicial** — retirado no código, prometido no site, vivo no piloto e no seu branch. Essa indecisão já quebrou o cofre de senhas e o Google Drive.
2. **Correção jurídica dos cálculos** — prazos CLT/JEC e atualização trabalhista precisam de revisão antes de qualquer cliente confiar neles.
3. **Validação no mundo real** — WhatsApp, Asaas, conciliação e tribunais funcionam em simulador; nenhum foi provado com o serviço de verdade.

Resolvendo os 7 itens de "Agora" e os de "Antes do lançamento", o produto fica em condição sólida para 05/01/2027.
