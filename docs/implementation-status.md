# Status de implementação

**Fase atual:** 8 em partes — 8a (assistente de IA), 8b (OCR e busca no conteúdo) e 8c (consulta DataJud/CNJ) concluídas em 2026-10-17; Fase 9 concluída: 9a (segurança) ✅, 9b (backups e produção) ✅, 9c (relatórios/BI) ✅ e 9d (planos e limites) ✅. **Próxima tarefa:** campos personalizados e, quando houver conta num provedor, cobrança automática; Google Agenda/Gmail/e-mail seguem como pendência da Fase 8.

## Concluído e verificado

### Fase 1 — fundação
- Projeto Next.js 16 / TypeScript strict / Tailwind 4 / Prisma 6 / PostgreSQL; identidade visual dark/claro, sidebar filtrada por permissão, topbar, layout responsivo e acessível.
- Autenticação (cadastro, login, logout, recuperação/redefinição, verificação de e-mail, sessões revogáveis), organizações multiusuário, equipe e convites, perfis/permissões granulares com anti-escalonamento, auditoria, dashboard com dados reais, CI.

### Fase 2 — clientes e processos
- **Clientes:** pessoa física/jurídica; CPF e CNPJ validados pelos dígitos verificadores (inclui **CNPJ alfanumérico**, vigente desde jul/2026); documento único por escritório; contatos/pessoas de referência (um principal); etiquetas; situação (prospecto/ativo/inativo); endereço; lista com busca (nome, documento, e-mail, telefone), filtros e paginação; perfil com abas (resumo, contatos, processos, documentos); exclusão lógica bloqueada com processo em andamento.
- **Processos:** número CNJ validado (módulo 97) e único por escritório (processos sem número permitidos, ex.: consultivo); título, área, tribunal/vara/UF, assunto, valor da causa (Decimal), fase, distribuição; **sigilo** (só equipe do processo e administradores); partes (clientes do escritório e partes contrárias com advogado); equipe (um responsável + colaboradores); lista em **tabela** e **quadro por situação**, com busca por número/título/parte/cliente e filtros; detalhe com abas (resumo, partes, linha do tempo, documentos, equipe); exclusão lógica.
- **Linha do tempo:** eventos distinguem origem — *importado do tribunal* (reservado; ainda não há importação), *registro interno* (anotações) e *automático do sistema* (criação, mudança de situação, partes, equipe, documentos); filtro por origem; imutável.
- **Documentos básicos:** envio (PDF, imagens, Office/OpenDocument, TXT, CSV; até 8 MB), download autenticado, exclusão lógica; tipo por lista de permissão + assinatura do conteúdo; armazenamento privado em disco (`STORAGE_DIR`); tudo auditado.
- Busca global estendida (clientes e processos, respeitando permissão e sigilo); menu "Criar" com Novo cliente/processo; dashboard com clientes ativos e processos em andamento (reais); seed de demonstração com clientes/processos **fictícios**.
- Integridade multi-tenant **no banco**: FKs compostas `(id, organization_id)`.

### Fase 3 — tarefas, prazos, agenda e notificações
- **Tarefas** (`/tarefas`): título, descrição, situação (a fazer, em andamento, aguardando, concluída, cancelada), prioridade, vencimento (data de calendário), responsável, vínculo opcional a processo e cliente; **lista** e **quadro Kanban** (mudança de situação por seletor, sem arrastar-e-soltar — acessível); filtros (busca, situação, responsável, atrasadas); comentários; exclusão lógica; conclusão registra `completed_at` e evento na linha do tempo do processo.
- **Prazos** (`/prazos`): cadastro **manual** vinculado a processo; **todo prazo nasce como rascunho** ("aguardando validação") e só vira definitivo por **validação humana** (permissão `deadlines:validate`: Advogado, Controladoria, Administrador, Titular); ciclo rascunho → validado → cumprido (ou cancelado); alterar a data de um prazo validado **desfaz a validação**; prazo interno ≤ data fatal; transições protegidas contra concorrência; tudo na auditoria e na linha do tempo do processo.
- **Calculadora auxiliar** de prazos: dias úteis (exclui fins de semana, feriados nacionais, Sexta-feira Santa, Consciência Negra desde 2024, **recesso forense 20/12–20/01**) ou dias corridos (prorrogação para o próximo dia útil), com memória do cálculo. É **sugestão**: não considera feriados estaduais/municipais, suspensões, dobra de prazo nem regras específicas de cada tribunal — a UI deixa isso explícito.
- **Agenda** (`/agenda`): calendário mensal com compromissos (audiência, reunião, diligência, outro; dia inteiro ou com horário no **fuso do escritório**) e prazos em aberto (rascunhos destacados); lista do mês para telas pequenas/leitores de tela; criar/editar/excluir compromisso.
- **Notificações** (sino na barra superior + `/notificacoes`): atribuição de tarefa, comentário, prazo validado e avisos de prazos/tarefas que vencem em até 3 dias ou já venceram (gerados sob demanda, idempotentes por chave, no máximo 1×/min por usuário; sem worker externo). Não há envio por e-mail/push.
- **Equipe e produtividade** (`/equipe`): carga de trabalho por membro ativo (tarefas abertas/atrasadas, prazos abertos/próximos 7 dias/vencidos/sem validação, horas em 30 dias; tarefas e prazos sem responsável), respeitando o sigilo de processos; **registro de horas** pessoal (data, duração em `1:30`/`1,5`/`45min`, atividade, processo opcional; cada pessoa registra e exclui só as próprias). Requer `productivity:read` para a visão da equipe e `tasks:write` para lançar horas. Migration `20261020000100_time_entries`. Sem faturamento por hora, metas ou relatórios exportáveis (Fases 7/9).
- Abas **Prazos** e **Tarefas** no processo; KPIs reais no painel (prazos em aberto/vencidos/aguardando validação, minhas tarefas); menu "Criar → Nova tarefa" habilitado.
- **Segurança:** todas as consultas filtram por escritório; tarefas/prazos/compromissos vinculados a **processo sigiloso** só aparecem a quem vê o processo; responsável de outro escritório é recusado; permissões por perfil (Financeiro não vê tarefas; Assistente vê prazos mas não os cadastra/valida).
- Migration `20261019000000_tasks_deadlines_agenda` (tabelas `tasks`, `task_comments`, `deadlines`, `agenda_events`, `notifications`, com FKs compostas e CHECKs).

### Fase 4 — central de intimações (caixa de entrada jurídica)
- **Registro** (`/caixa-de-entrada`): manual ou por **texto colado** (inclui carregar `.txt`/`.csv` até 500 KB). A análise do texto sugere número CNJ (validado pelo dígito verificador, com ou sem máscara), data de publicação, tipo (citação, sentença, decisão, despacho, intimação), órgão e prazo mencionado — **tudo como sugestão, nada é gravado sem conferência**.
- **Vínculo automático ao processo** pelo número CNJ (somente processos do escritório visíveis ao usuário); vínculo manual opcional; evento na linha do tempo do processo.
- **Duplicidade:** hash do teor normalizado (sem acento/caixa/espaços) detecta a mesma intimação recebida duas vezes no escritório; aviso, filtro "possíveis duplicatas" e descarte com motivo.
- **Distribuição** a um membro com acesso à caixa (notifica o responsável), situações Nova → Distribuída → Tratada/Descartada, reabertura, exclusão lógica; encerramento com checagem de estado atômica (concorrência).
- **Providências:** a partir da intimação cria-se **tarefa** e **prazo (sempre rascunho, com validação humana)**, com a origem registrada (`source_notice_id`) e prazo/data sugeridos pré-preenchidos; intimação com providências não pode ser descartada/excluída.
- Aba **Intimações** no processo; KPIs no painel (novas, para mim); auditoria completa. Perfis com acesso: Titular, Administrador, Advogado e Controladoria (Assistente e Financeiro não veem a caixa).
- **Limites honestos:** sem importação automática de tribunais/diários (depende de integrações — Fase 8; `source = IMPORTED` reservado), **sem OCR** nem leitura de PDF (copie e cole o texto), sem anexo de arquivo à intimação (documentos exigem processo/cliente; anexar pelo processo), sem regras de classificação configuráveis, sem alerta por e-mail.

### Fase 5 — documentos, modelos, versões e peticionamento
- **Repositório** (`/documentos`): lista geral com busca por nome, categoria e origem (processo/cliente). Documentos de processo sigiloso só aparecem para quem vê o processo; documentos de cliente exigem `clients:read`. O envio continua sendo feito dentro do processo/cliente.
- **Versões** (`/documentos/[id]`): cada envio gera uma versão (a v1 dos documentos existentes foi criada pela migração, sem copiar arquivos); histórico com nota, autor, tamanho e SHA-256; download de qualquer versão (auditado); nova versão concorrente → uma vence e a outra recebe conflito (checagem atômica de `current_version`). Metadados editáveis (nome, categoria, descrição).
- **Modelos** (`/documentos/modelos`): texto com campos `{{cliente.nome}}`, `{{processo.numero}}`, `{{advogado.nome}}`, `{{data.hoje_extenso}}` etc. (17 campos), validados no servidor (campo desconhecido é recusado); permissão `templates:manage` (Titular, Administrador, Advogado); modelos desativados somem para quem só usa.
- **Geração de .docx** (`/documentos/gerar`): preenche o modelo com dados do processo/cliente **que o usuário pode ver**; dado ausente vira `[PREENCHER: campo]` e o sistema avisa quais campos faltaram — nada é inventado. O documento nasce como versão 1 (origem "modelo"), com evento na linha do tempo e auditoria.
- **Peticionamento** (`/peticoes`): fluxo Rascunho → Em revisão → Aprovada → Enviada (+ Falha/Cancelada). A versão do documento é fixada ao enviar para revisão; **nova versão do documento devolve a petição ao rascunho**; aprovar/enviar com versão desatualizada é recusado. Revisores (`petitions:approve`) são notificados; devolução exige motivo. Envio com reserva atômica (sem envio duplo) e retomada de envio preso há mais de 10 min; falha deixa a petição reenviável.
- **Adaptador de demonstração:** o único adaptador existente (`PETITIONING_ADAPTER=demo`) **não se comunica com nenhum tribunal**; gera protocolo `DEMO-…` e recibo "NENHUM PROTOCOLO REAL FOI REALIZADO"; a interface mostra aviso permanente e a petição/linha do tempo ficam marcadas como demonstração. A interface `PetitioningAdapter` está pronta para adaptadores reais (PJe/e-SAJ/eproc exigem certificado digital — Fase 8).
- Aba **Petições** no processo; navegação "Documentos" e "Peticionamento" ativas; migration `20261021000000_documents_templates_petitions` (tabelas `document_versions`, `document_templates`, `petition_filings`; colunas novas em `documents`; permissões `templates:manage` e petições para Assistente/Controladoria aplicadas aos perfis de sistema já existentes).
- **Limites honestos:** modelo é texto simples (sem formatação rica, tabelas ou imagens — o .docx gerado é editável no Word); sem edição online nem pré-visualização de PDF/DOCX; **sem OCR** nem busca no conteúdo dos arquivos (só pelo nome); sem assinatura digital; sem protocolo real em tribunal; um documento por petição (sem anexos múltiplos); sem aprovação por dois revisores (o autor com `petitions:approve` pode aprovar a própria petição).

### Fase 6 — CRM, automações e portal do cliente
- **CRM** (`/crm`): funil de leads Novo → Contato feito → Reunião → Proposta (movimentação manual), **Ganho** somente por conversão em cliente e **Perdido** somente com motivo (reabrir volta a "Novo"). Histórico de contatos/etapas por lead, responsável, valor estimado (Decimal), próximo contato. Permissões `crm:read` / `crm:write`; converter exige também `clients:write`.
- **Conversão em cliente:** uma única transação (cliente ativo + lead GANHO vinculado + histórico + auditoria); CPF/CNPJ opcional, validado e único por escritório; conversão concorrente cria só um cliente; lead convertido não pode ser excluído.
- **Propostas:** Rascunho → Enviada → Aceita/Recusada, com transições atômicas; só rascunho é editável. "Marcar como enviada" **apenas registra o status** (o sistema não envia a proposta ao lead) e move o lead para "Proposta".
- **Automações** (`/automacoes`, permissão `workflows:manage`: Titular, Administrador, Controladoria): regras "quando X acontecer → criar tarefa". Gatilhos: processo cadastrado, prazo validado, intimação registrada, lead ganho. Executam em melhor esforço **depois** da ação original (falha nunca desfaz o cadastro), são idempotentes (única por regra+origem) e ficam registradas em "execuções recentes". Em processo sigiloso, o responsável sem acesso não recebe a tarefa (fica sem responsável).
- **Portal do cliente** (`/portal`): perfil `CLIENT` (`portal:access`) + conta do portal amarrada a **um cliente**, criada ao aceitar um convite emitido na ficha do cliente (aba Portal; exige `clients:write` e `members:invite`). O cliente só vê o **resumo** de processos em que é parte **e** que a equipe marcou como compartilhados, e documentos marcados como compartilhados (somente a versão atual; download auditado em `/api/portal/documents/[id]`). Descompartilhar ou revogar o acesso vale imediatamente; usuários `CLIENT` são redirecionados para o portal e não acessam nenhuma tela/serviço da equipe. Compartilhar processo sigiloso é um ato explícito de quem tem acesso a ele.
- Convite ao portal: como o e-mail real não está configurado (driver `console`), o link é exibido uma única vez para cópia e a interface avisa isso.
- Migration `20261022000000_crm_workflows_portal` (tabelas `leads`, `lead_activities`, `proposals`, `workflow_rules`, `workflow_runs`, `portal_accounts`; colunas `cases.shared_with_portal`, `documents.shared_with_portal/shared_at`, `invitations.client_id`; permissões aplicadas aos perfis existentes).
- **Limites honestos:** sem envio real de proposta/e-mail/WhatsApp; sem funil personalizável nem pontuação de leads; automações só criam tarefas (sem condições, e-mail ou múltiplas ações); sem mensagens, pagamentos ou assinatura no portal; portal sem notificação por e-mail e sem histórico de andamentos (só resumo); cliente com acesso a vários clientes vê a soma dos compartilhados; automações dependem de o gatilho ocorrer pela interface/serviços (importação futura de tribunal precisará chamar `runWorkflows`).

### Importador do Astrea (extra da Fase 6)
- `npm run import:astrea` importa o backup CSV do Astrea para um escritório: clientes, processos (com partes e responsáveis), prazos, tarefas, audiências/eventos e publicações (→ intimações). Modo `--dry-run`, relatório de contagens e **reimportação idempotente** (tabela `import_map`). Guia completo: `docs/importacao-astrea.md`.
- Regras de segurança do produto preservadas: prazo pendente entra como **rascunho**; CPF/CNPJ inválido ou repetido nunca vira documento; dados vão só para o escritório escolhido; nada é enviado a terceiros.
- Testado com planilhas **fictícias** (11 unitários + 5 de integração, incluindo idempotência, simulação sem gravação, fuso horário e isolamento) e com 49,5 mil registros sintéticos (~40 s). **Não foi rodado contra o backup real** (os dados ficam no seu computador): rode primeiro com `--dry-run`.
- **Financeiro (Fase 7):** `--only financeiro` (também incluído por padrão) importa contas (com saldo inicial), categorias (pai › filho), centros de custo e **Entradas** como lançamentos: Entrada→a receber, Saída→a pagar; Honorário→honorários, Despesa→despesa, demais→outro; "Feito"→pago integralmente com uma baixa na data de pagamento, "Aberto"→em aberto; descrição "n-m" vira parcela n/m. Usa o valor efetivo (`Valores`) e avisa quando difere do original. Não importa faturas (agrupadores), linhas "Valor inicial" (o saldo vem da conta) nem valores zerados; Honorários/Despesas espelham as Entradas. Vínculos de cliente/processo só se já importados (rode clientes/processos antes). Testado com planilhas fictícias (3 de integração + 2 unitários); contas/categorias/centros com o mesmo nome já existente são vinculados, não duplicados.
- **Limites:** sem documentos (só links no backup), sem andamentos; papel de parte (autor/réu) segue a qualificação do Astrea e pode precisar de ajuste manual; responsáveis só são vinculados se o e-mail de login existir como membro do escritório.

### Motor de tribunais — Etapa 0: cofre de certificados A1 (concluída)

- **O que faz:** tela `/certificados` (permissão `certificates:manage`, OWNER/ADMIN): envio de certificado A1 (.pfx/.p12) por advogado titular, validação real (senha, chave privada, correspondência chave↔certificado, vigência), armazenamento **cifrado (AES-256-GCM, `CERT_ENCRYPTION_KEY`)**, listagem sem nenhum segredo, revogação que **apaga** o material, registro de cada uso (`certificate_usage` + auditoria) e alerta de vencimento (30 e 7 dias, idempotente) por notificação.
- **Regras de segurança:** enviar/revogar exige **2FA ativo**; uso interno (`getCertificateMaterial`) só pelo titular ou administrador, recusa revogado/vencido, e o material decifrado existe só em memória do worker; nenhuma rota ou tela devolve arquivo ou senha; CPF/CNPJ do titular só mascarado.
- **Migração:** `20261029000000_certificates`. **Dependência nova:** `node-forge` (rode `npm install`). **Nova variável:** `CERT_ENCRYPTION_KEY`.
- **Testes:** 6 de integração (permissões, validação, cifra, uso, revogação, alerta), 3 unitários (inclui .pfx do OpenSSL moderno e legado) + 1 E2E; `check:prod` ganhou 3 regras.
- **Limites honestos:** **ainda não há motor**: nenhum tribunal é consultado nem recebe petição; só A1 (A3/nuvem não); a chave de cifra fica no ambiente do servidor (sem HSM/KMS); o alerta de vencimento roda ao abrir a tela (agende uma chamada periódica quando houver worker); testado só com certificados sintéticos, **não com um ICP-Brasil real** — teste com o seu antes de confiar.

### Fase 9b — Backups e produção (concluída)

- **Backup/restauração:** `scripts/backup.sh`, `verify-backup.sh`, `restore.sh` (banco + documentos, checksum, criptografia opcional, retenção) — **testados de verdade** com PostgreSQL: backup, verificação por restauração em banco temporário, restauração completa, passphrase errada e arquivo adulterado. Guia em `docs/backup-restore.md`.
- **Operação:** `GET /api/ready` (banco + migrações + armazenamento), `npm run check:prod` (valida o ambiente; 3 testes), `Dockerfile` (multi-estágio, usuário não-root, tesseract/poppler) + `docker-compose.yml` + `docs/producao.md` (guia e checklist).
- **Testes:** 3 unitários (check:prod) + 1 E2E (health/ready).
- **Limites honestos:** **Dockerfile/Compose não foram executados** (sem Docker no ambiente de desenvolvimento); backup é lógico completo (sem incremental/PITR) e **não envia para fora do servidor nem agenda sozinho**; **e-mail real não existe** (convites/recuperação de senha não são entregues em produção); armazenamento só em disco local (uma instância); sem monitoramento/alertas.

### Fase 9a — Segurança (concluída)

- **Verificação em duas etapas (TOTP, RFC 6238):** ativação em Minha conta (QR code + chave manual), 10 códigos de recuperação de uso único (guardados só como hash), login em duas etapas com desafio de 5 min e **máx. 5 tentativas**, anti-replay do código, desativar/regerar exige a senha. Segredo cifrado com AES-256-GCM (`MFA_ENCRYPTION_KEY`); sem a chave o recurso fica indisponível e avisa.
- **Bloqueio de conta:** 5 senhas erradas seguidas bloqueiam o login por 15 min (persistido no banco, vale com várias instâncias); mensagem sempre genérica; auditoria `auth.account_locked`.
- **CSP com nonce** no proxy (sem scripts de terceiros, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`); o app passou a ser renderizado dinamicamente (necessário para o nonce).
- **Migração:** `20261028000000_security_mfa`. **Dependência nova:** `qrcode` (rode `npm install`).
- **Testes:** 4 unitários (RFC 6238) + 8 de integração + 1 E2E.
- **Limites honestos:** 2FA é opcional por usuário (ainda não há política "exigir 2FA no escritório"); o limitador de taxa por IP continua em memória (uma instância); sem notificação por e-mail de login novo/bloqueio (e-mail real ainda é só `console`); sem WebAuthn/chaves de segurança; **RLS no PostgreSQL não foi implementada** (isolamento segue por `organization_id` na aplicação, com testes).

### Fase 8c — Consulta DataJud/CNJ (concluída)

- **O que faz:** botão "Consultar DataJud" no processo (precisa de número CNJ, `cases:write`) busca na API pública do CNJ e importa os andamentos novos na linha do tempo (`source = IMPORTED`, tipo "Andamento (DataJud/CNJ)"), sem duplicar (índice único por `case_id + external_key`). Cobre Justiça Estadual, Federal, do Trabalho, Eleitoral, STJ e TST.
- **Desligado por padrão:** exige `DATAJUD_API_KEY` no servidor (chave pública do CNJ) **e** opt-in do escritório em `/integracoes` (`integrations:manage`). Sem isso, o botão nem aparece e nada é simulado.
- **Privacidade:** só o número do processo vai ao CNJ; **processos sigilosos nunca são consultados**; auditoria `datajud.sync` (sem conteúdo).
- **Migração:** `20261027000000_datajud` (`organizations.datajud_enabled`, `cases.datajud_synced_at`, `case_events.external_key`).
- **Testes:** 2 unitários + 4 de integração (HTTP simulado só nos testes) + 1 E2E.
- **Limites honestos:** **não foi testado contra a API real** (precisa da sua chave); consulta manual, sem sincronização automática; o DataJud não traz o teor das decisões nem garante todos os andamentos; não cria prazos (isso segue exigindo validação humana).

### Fase 8b — OCR local e busca no conteúdo dos documentos (concluída)
- **Extração de texto** da versão atual de cada documento, **sem serviço externo**: PDF com texto (poppler `pdftotext`), PDF digitalizado e imagens PNG/JPG (OCR com **Tesseract**, páginas renderizadas por `pdftoppm`), DOCX e ODT (XML), TXT/CSV. Planilhas XLSX, PPTX e Word antigo (.doc/.xls) ainda não têm extração e ficam marcados como "indisponível".
- **Como usar:** página do documento → "Texto do documento" → *Extrair texto (OCR)* (mostra método, páginas e prévia); em *Documentos* → "Extrair texto dos pendentes" (10 por vez) e a caixa **"Buscar dentro dos documentos"**: sem acento e com radical em português ("audiencia" acha "audiência"), só versão atual, com trecho. Nova versão invalida o texto até extrair de novo.
- **Segurança:** extração exige `documents:write` e acesso ao processo/cliente do documento; busca exige `documents:read` e respeita sigilo e escritório (processo sigiloso sem acesso = não aparece); programas externos rodam **sem shell**, em pasta temporária, com tempo limite; texto limitado a 500 mil caracteres e OCR a 30 páginas (`OCR_MAX_PAGES`); falhas viram mensagens claras (corrompido, protegido, demorou demais, OCR não instalado); auditoria `document.extract_text` (sem conteúdo).
- **IA:** a Fase 8a agora inclui o **início do texto extraído de até 5 documentos do processo** (1.500 caracteres cada), com **CPF, CNPJ e e-mails ocultados**.
- Migration `20261026000000_document_texts` (tabela `document_texts` com índice de busca em texto integral).
- **Instalar no seu Mac:** `brew install tesseract tesseract-lang poppler`. Sem eles o sistema avisa na tela e continua lendo DOCX, ODT e TXT (PDF e imagens precisam dos programas).
- **Testes:** 6 de integração (imagem, PDF digitalizado, PDF com texto, DOCX, TXT; formatos sem extrator e arquivo corrompido; busca sem acento, versão atual, sigilo, outro escritório; permissões; lote; IA com dados ocultados), 4 unitários e 1 E2E (envio de imagem → extração → busca → prévia → isolamento). O OCR dos testes é **real** (Tesseract) sobre imagens de exemplo em inglês.
- **Limites honestos:** **a qualidade do OCR em português depende do pacote de idioma `por` instalado** (no ambiente de teste só havia inglês; verifique no seu Mac); documentos manuscritos, tabelas complexas e fotos ruins perdem qualidade; extração é manual (botão/lote), não automática no upload; trabalho síncrono na requisição (arquivos grandes demoram; limite de 8 MB por arquivo continua); sem busca por frase exata com acento obrigatório, sem destaque do termo; PDFs protegidos por senha falham; busca não cobre versões antigas.

### Fase 8a — Assistente de IA (concluída)
- **Tela `/ia`** (menu "Inteligência artificial" e botão "Perguntar à IA" no processo): pergunta sobre UM processo; a resposta cita fontes `[n]` com links (processo, partes, andamentos, prazos, tarefas, intimações, nomes de documentos). Só aparecem as fontes realmente citadas.
- **Provedor:** Claude (Anthropic) via `ANTHROPIC_API_KEY` (`AI_MODEL`, padrão `claude-sonnet-4-5`; confira o nome do modelo no seu painel). **Sem chave, o recurso fica desligado e avisa — nunca há resposta simulada.** Adaptador trocável (`src/lib/ai/provider.ts`).
- **Consentimento e custo:** IA vem **desligada** em cada escritório; quem tem `integrations:manage` liga em `/ia`. Limite mensal de tokens por escritório (`AI_MONTHLY_TOKEN_LIMIT`, padrão 500 mil) e painel de consumo.
- **Segurança:** o contexto é montado no servidor só com o que o usuário já pode ver (processo visível/sigilo, e cada módulo exige sua permissão); CPF/CNPJ e conteúdo de arquivos não são enviados; texto do processo entra marcado como DADO (defesa contra instruções embutidas); pergunta e resposta **não são gravadas** (só consumo e auditoria `ai.ask_case`); erros do provedor viram mensagens seguras sem chave nem corpo.
- Migration `20261025000000_ai` (`organizations.ai_enabled`, `ai_usage`).
- **Testes:** 8 de integração (permissões, desligada/sem chave, contexto sem CPF, fontes, consumo, sigilo e outro escritório sem chamar o provedor, falha do provedor sem cobrar, limite mensal, isolamento), 3 unitários (provedor com `fetch` simulado) e 1 E2E (sem chave). O provedor simulado existe **só nos testes**.
- **Limites honestos:** **não foi testado contra a API real** (precisa da sua chave); perguntas de um turno, sem histórico de conversa; só processo (não cliente/financeiro); lê só trechos de documentos já extraídos (8b); cota verificada antes da chamada (pico simultâneo pode passar um pouco do limite); sem redação de nomes de partes; resposta é apoio e exige revisão de advogado.

### Fase 7 — Financeiro (concluída)
- **Telas** (`/financeiro`): visão geral (a receber/pagar em aberto e vencidos, recebido/pago no mês, saldo por conta, fluxo de caixa realizado × previsto, próximos vencimentos), **lançamentos** (filtros por tipo, situação, categoria, vencimento, busca e paginação; totais), **novo/editar** (parcelas mensais de 1 a 60 com centavos distribuídos), **detalhe** (baixa parcial ou total, **estorno com motivo**, cancelamento com motivo, histórico) e **cadastros** (contas, categorias, centros de custo; desativar, nunca apagar).
- **Regras:** dinheiro sempre em `numeric(14,2)` e centavos inteiros (BigInt), nunca ponto flutuante; baixa nunca ultrapassa o saldo (UPDATE condicional atômico, seguro sob concorrência); situação (Aberto/Parcial/Pago/Cancelado) validada também por CHECK no banco; lançamentos nunca são apagados; estorno mantém a baixa no histórico; só cancela sem baixas ativas; valor não pode ficar abaixo do já baixado; processo sigiloso aparece como "Processo restrito" a quem não o vê; tudo auditado.
- **Permissões:** `finance:read` (consultar), `finance:write` (lançar, editar, baixar), novo `finance:manage` (cadastros, cancelar, estornar) — aplicado por migration a Titular, Administrador e Financeiro. Advogado/Assistente não acessam o módulo por padrão.
- Migration `20261024000000_finance` (`finance_accounts`, `finance_categories`, `cost_centers`, `finance_entries`, `finance_payments`, FKs compostas por escritório).
- **Limites honestos:** sem boletos/PIX/cobrança real nem conciliação bancária; sem transferência entre contas, recorrência automática, rateio, impostos, comissões, nem relatório de rentabilidade por cliente/processo (Fase 9); baixa em lote não existe; lançamentos pagos importados do Astrea entram com **uma** baixa pelo valor total; saldo inicial negativo não é suportado; sem exportação (Fase 9); o portal do cliente ainda não mostra cobranças; sem totais financeiros nas fichas de cliente/processo (o serviço `entryTotalsFor` está pronto, falta só a tela).

### 2.0-F13 — Painel do developer (concluído e verificado)
- Rota `/admin/developer` (menu "Developer" da administração). Acesso: só super-admin ativo COM 2FA; qualquer outro recebe 404. Mesmas regras do painel da plataforma: nunca mostra conteúdo de escritório, chaves, segredos, e-mail/assunto de mensagens, caminho de URL de webhook nem metadados de auditoria.
- Migração `20261121000000_painel_developer`: `job_runs` (rotina, origem agendador/manual, situação, duração, só contagens) e `app_errors` (origem, mensagem mascarada de até 240 caracteres, referência). Retenção de 30 dias.
- Instrumentação: as 6 rotas `/api/cron/*` usam `withJobRun`; `runAction` grava erros inesperados. Registro nunca derruba a rotina.
- Abas: Saúde e rotinas (sistema, 6 rotinas com situação em dia/atrasada/falhou/nunca rodou, histórico, "Rodar agora" para webhooks, e-mail, DJEN e MNI — cobrança e lembretes de WhatsApp NÃO têm disparo manual); API, chaves e webhooks (contagens, webhooks instáveis, entregas e e-mails com falha com reenvio); Auditoria e erros; Integrações e interruptores (testes de banco, arquivos, SMTP sem enviar, Asaas, DataJud, DJEN — limite de 1 teste a cada 5 s por integração, tudo auditado; matriz de interruptores por escritório com parada de emergência que só DESLIGA).
- Aba *Novidades e andamento*: lista as entregas feitas, as fases da 2.0.0 e 3.0.0 e as pendências da equipe. Os dados ficam em `src/lib/updates.ts` — REGRA: a cada entrega, atualizar `RELEASES`, o status em `PHASES_2/PHASES_3` e `TEAM_TODO`.
- Ações auditadas: `platform.job_run`, `platform.integration_test`, `platform.webhook_retry`, `platform.mail_retry`, `platform.switch_off`.
- Verificação: tsc, eslint, 551 testes Vitest (9 novos em `developer-panel.test.ts`), `next build`, 36 E2E (2 novos em `developer.spec.ts`).
- Não validado em produção: testes Asaas/DataJud/DJEN/SMTP dependem das chaves reais do servidor.

### Extra — Site público do produto /produto (concluído e verificado)
- Páginas públicas (sem login; `/produto` está em `PUBLIC_PREFIXES` do `proxy.ts`): Início, Recursos, Segurança, Sobre, Contato. Layout em `src/app/(public)/produto/`, conteúdo em `src/config/showcase.ts` (fatos e módulos) e `src/lib/updates.ts` (entregas e fases — NUNCA colocar `TEAM_TODO` em página pública).
- Regras: só fatos verificados; sem depoimentos, clientes, preços ou concorrentes inventados; telas reais com dados fictícios. Números de `FACTS` conferidos em 2026-10-21 (atualizar a cada entrega).
- Contato: `PUBLIC_CONTACT_WHATSAPP` (só dígitos com DDI+DDD) e `PUBLIC_CONTACT_EMAIL` no `.env.production`. Sem eles o botão leva ao login e a página de contato avisa "Contato em breve".
- Capturas: `scripts/demo-seed.ts` cria um escritório fictício (recusa rodar fora de banco terminado em `_demo`); `scripts/demo-shots.mjs` gera `public/produto/*.webp`.
- Testes: `src/tests/e2e/produto.spec.ts` (3 testes).
- Pendências: textos legais (termos e privacidade) a serem redigidos e revisados pela Dra. Talita antes de publicar; formulário "pedir demonstração" e página de planos/preços dependem de decisão.

## Testes executados (2026-10-17, PostgreSQL 16)

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | sem erros |
| `eslint .` | sem erros nem avisos |
| Suíte vitest completa (unitários + integração, 2026-10-19) | **441 testes ok em 60 arquivos** (inclui cobrança Asaas simulado: 16; fila de e-mails com SMTP real local: 6; Asaas/e-mail unitários: 5; cadastro: 3; troca de chaves: 3; API v1: 12; webhooks: 7; relatórios: 12; Box/Func: 6; planos: 11; protocolo MNI: 10) |
| Unitários (vitest, contagem antiga por fase) | 94 testes ok (inclui **extração de texto/OCR: 4**; inclui **provedor de IA: 3**; inclui **dinheiro em centavos/parcelas: 3** e **conversões financeiras do Astrea: 2**) (inclui **leitor de CSV e conversões do Astrea: 11**; inclui **motor de modelos e adaptador de demonstração**) — inclui CPF, CNPJ numérico/alfanumérico, CNJ, dinheiro BRL, schemas, **calculadora de prazos (feriados, Páscoa, recesso, prorrogação)** e conversão de fuso |
| Integração (vitest, banco real) | 161 testes ok (inclui **Fase 8b (texto dos documentos): 6**; inclui **Fase 8a (IA): 8**; inclui **Fase 7: 14 — permissões, validação, parcelas sem perder centavos, processo sigiloso, baixa parcial/total, baixas concorrentes, conta inativa, estorno (inclusive concorrente), cancelamento, edição, CHECK do banco, resumo/saldos/fluxo, listagem, isolamento entre escritórios**; **Importador financeiro: 3**; inclui **Importador: 5**; **Fase 6: 23 — ciclo do lead, conversão (atômica e concorrente), propostas, regras e idempotência, sigilo nas automações, falha sem desfazer a ação, convite→conta do portal, visibilidade só do compartilhado/do próprio cliente, revogação, cliente barrado nos serviços da equipe, isolamento entre escritórios**; inclui **Fase 5: 16 — versões (inclusive concorrentes), sigilo, isolamento entre escritórios, modelos e geração, fluxo de petição, envio duplo, versão desatualizada, permissões**; inclui **Fase 4: 10 — vínculo automático por CNJ, duplicidade, distribuição, origem de tarefas/prazos, concorrência, isolamento, sigilo, permissões**) — Fase 1 (23) + Fase 2 (25) + **Fase 3 (22 + 5 de equipe/horas: ciclo de vida e validação humana de prazos, revalidação ao mudar data, concorrência, fuso/UTC na agenda, notificações idempotentes, isolamento e sigilo, permissões)**. Fases 1–2: CRUD, duplicidade, **isolamento entre escritórios (IDOR)** em clientes/contatos/processos/partes/equipe/eventos/documentos, FK composta recusando referência cruzada, permissões por perfil, exclusão lógica, **processos sigilosos**, linha do tempo por origem, validação de upload (tipo, assinatura, tamanho) |
| E2E (Playwright/Chromium, 2026-10-19) | **31 testes ok** (inclui chaves de API, webhooks, Box/Func, planos e PWA) |
| E2E (contagem antiga por fase) | 14 testes ok (inclui **OCR: imagem → extração → busca → prévia → isolamento**; inclui **IA sem chave: avisa, não simula, menu e botão no processo**; inclui **Fase 7: conta → 3 parcelas → baixa parcial → excesso recusado → estorno → cancelamento → visão geral → isolamento**; inclui **Fase 6: automação → lead → proposta → conversão → tarefa automática → compartilhar processo/documento → convite → cliente vê só o compartilhado, baixa o PDF, é barrado na área da equipe → descompartilhar e revogar**; inclui **Fase 5: modelo → geração .docx → nova versão → petição revisada/aprovada/enviada em demonstração + isolamento**; inclui caixa de entrada: texto colado → vínculo → duplicata → prazo pré-preenchido → tratada → isolamento) — fluxo da Fase 1 (3) + **tarefas/prazos/agenda/notificações (2: criação, quadro, calculadora, validação humana, agenda, sino, isolamento)** + clientes/processos: validação de CPF e CNJ, duplicidade, vínculo cliente↔processo, sigilo, anotação, mudança de situação, filtro de origem, upload/rejeição/download com cabeçalhos seguros, quadro, busca, isolamento (404 em outro escritório) |
| `next build` | ok |

## Pendências e problemas conhecidos

- **Peticionamento (demonstração):** o aviso verde "Envio SIMULADO concluído" é transitório (some quando a página atualiza); o teste E2E agora confere o protocolo `DEMO-` e o recibo, que ficam gravados.

- **Migrations:** `prisma migrate` não roda no sandbox (binário bloqueado); usamos runner próprio com SQL manual (`npm run db:migrate`). Risco de divergência SQL × `schema.prisma` (as FKs compostas existem só no SQL). Verificar com `prisma migrate diff` em ambiente com acesso.
- **Prisma `queryCompiler`/`driverAdapters`:** o Prisma 6.19 avisa que estão obsoletos como *preview features* (funcionam sem declarar); remover do `schema.prisma` após validar em ambiente com acesso aos binários.
- **Documentos:** armazenamento em disco local único; sem antivírus; arquivos de documentos excluídos permanecem em disco; sem OCR/pré-visualização/busca no conteúdo (Fase 8); versões e modelos na Fase 5; limite de 8 MB por arquivo (proxy do Next bufferiza até 10 MB).
- **Linha do tempo:** só registros internos e automáticos; andamentos de tribunais dependem das Fases 4/8. Anotações não podem ser editadas/excluídas (decisão de integridade).
- **Processos:** quadro sem arrastar-e-soltar (mudança de situação por seletor); sem tipos de ação/classes/assuntos tabelados do CNJ; sem histórico de alteração por campo além dos eventos e da auditoria; números fora do padrão CNJ vão no campo "número antigo".
- **Clientes:** sem importação/exportação em lote, sem mesclagem de duplicados, sem busca fonética; busca por `ILIKE` (sem índice trigram) — adequada ao volume atual, a otimizar com `pg_trgm` se necessário.
- **Seletor de cliente** é por busca (autocompletar); não há criação de cliente "inline" no formulário de processo.
- **E-mail real não configurado** (driver `console`); sem MFA, CSP, RLS no PostgreSQL, rate limit distribuído (limiter em memória), i18n além de pt-BR, convite reenviável, exclusão/transferência de escritório, teste automatizado de acessibilidade.
- Dependências instaladas com `--legacy-peer-deps`; sem `npm audit` formal.
- **Prazos:** só cadastro manual (importação de intimações na Fase 4); calculadora sem feriados locais/suspensões; sem regras por tribunal versionadas; sem alerta por e-mail/WhatsApp (só no sistema).
- **Tarefas:** sem subtarefas, recorrência, checklists, horas registradas nem automações (workflows na Fase 6); Kanban sem arrastar-e-soltar; "Equipe e produtividade" segue como módulo planejado.
- **Agenda:** sem visão semanal/diária, sem recorrência, sem sincronização com Google/Outlook (Fase 8); quem só tem leitura vê os compromissos mas não abre o detalhe (edição exige escrita).
- **Notificações:** geradas ao navegar (sem job agendado): quem não acessa o sistema não recebe aviso até voltar; sem preferências de canal.
- Seletores de processo nos formulários listam os 200 processos mais recentes visíveis (sem busca) — ok para o volume atual.
- Constantes iniciais de formulário (`EMPTY_*`) de tarefas/prazos/agenda ficam em `schemas.ts` (módulo compartilhado) porque exports não-componentes de arquivos `"use client"` não podem ser usados em páginas de servidor; `EMPTY_CASE` (Fase 2) ainda vem do arquivo de formulário e funciona, mas deve migrar para o mesmo padrão.

## Variáveis de ambiente novas (Fase 8c)

`DATAJUD_API_KEY` (obrigatória para ligar), `DATAJUD_BASE_URL` (opcional).

## Variáveis de ambiente novas (Fase 8b)
- `OCR_LANGS` (padrão `por+eng`), `OCR_MAX_PAGES` (padrão 30). Programas: `tesseract` e `poppler` (`pdftotext`, `pdftoppm`, `pdfinfo`).

## Variáveis de ambiente novas (Fase 8a)
- `ANTHROPIC_API_KEY` (opcional; sem ela a IA fica desligada), `AI_MODEL` (padrão `claude-sonnet-4-5`), `AI_MONTHLY_TOKEN_LIMIT` (padrão 500000).

## Variáveis de ambiente (Fases 6–7)
- Nenhuma nova.

## Variáveis de ambiente novas (Fase 5)
- `PETITIONING_ADAPTER` — `demo` (padrão; **não protocola em tribunal**) ou `mni` (protocolo real pelo PJe/MNI; **não validado em tribunal real**, ver seção da Etapa 5).

## Variáveis de ambiente (Fases 2–3)
Nenhuma na Fase 3. (Fase 2: `STORAGE_DIR`, `RATE_LIMIT_MULTIPLIER`.)

## Variáveis de ambiente (Fase 2)
- `STORAGE_DIR` — diretório privado e persistente dos arquivos enviados (padrão `./.storage`; incluir em backup).
- `RATE_LIMIT_MULTIPLIER` — só para E2E (padrão 1).

## Integrações pendentes
Todas (ver `integrations.md`). Nenhuma ativa.

### Motor de tribunais — Etapa 1: conector PJe/MNI (concluída no código; não validada em tribunal real)
- **Banco:** migration `20261030000000_mni` (`court_connections`, `court_notices.external_key` único por escritório).
- **Código:** `src/lib/mni/{tribunals,xml,transport}.ts`, `src/server/services/mni.service.ts`, `src/modules/mni/{actions.ts,mni-ui.tsx}`, tela em Integrações e botão no processo. O uso do certificado agora chama `getCertificateMaterial`.
- **Testes:** unitários do parser/envelopes/SSRF, integração contra tribunal simulado local (cadastro, 2FA, avisos, deduplicação, isolamento, consulta, Fault, modo certificado) e 1 E2E. Resultado: tsc/eslint limpos, vitest 300 passando, 19 E2E passando, build ok.
- **Pendências:** validar com um tribunal real (endereço, autenticação, homologação); tabela TPU; sincronização automática (Etapa 2).

### Motor de tribunais — Etapa 2a: captura do DJEN por OAB (concluída no código; não validada no serviço real)
- **Banco:** migration `20261031000000_djen` (`djen_monitors`).
- **Código:** `src/lib/djen/client.ts`, `src/server/services/djen.service.ts`, `src/app/api/cron/djen/route.ts`, `src/modules/djen/*`, card em Integrações.
- **Testes:** unitários (parser, paginação, repetição, 403, formato), integração (cadastro, importação, vínculo, cancelada, deduplicação, janela, falha, execução automática, isolamento, rota do agendador) e 1 E2E. tsc/eslint limpos, vitest 311 passando, E2E passando, build ok.
- **Pendências:** validar com o serviço real a partir de um servidor no Brasil; hospedagem ainda indefinida; DJe do STF; caixas (Entrada/Usuário/Geral/Acervo), equipes, notas, adormecer e etiquetas (próxima etapa).

### Caixa de entrada — caixas de trabalho (concluída)
- **Banco:** migration `20261101000000_inbox_workflow` (`work_teams`, `work_team_members`, `notice_notes`; em `court_notices`: `team_id`, `assigned_by_id`, `snoozed_until`, `tags`; CHECK: responsável individual **ou** equipe, nunca os dois; até 10 etiquetas).
- **Caixas:** Entrada (sem responsável), Minhas, Geral, uma por equipe, Acervo (tratadas), Adormecidas, Descartadas; "Em aberto" continua como visão padrão e os links antigos (`?status=`, `?responsavel=eu`) seguem funcionando. Contagens respeitam o sigilo dos processos.
- **Fluxo:** distribuir a pessoa ou a equipe (notifica), devolver a quem encarregou (só o responsável ou alguém da equipe; sem a pessoa, volta à Entrada), enviar à Entrada (também reabre as tratadas), adormecer até uma data futura (máx. 1 ano; some das caixas e reaparece no dia), etiquetas (minúsculas, até 30 caracteres) com filtro, notas internas (apaga o autor ou o proprietário).
- **Equipes:** tela em Caixa de entrada → Equipes (exige `members:manage`); só entram membros ativos com acesso à caixa; excluir a equipe devolve as intimações dela à Entrada.
- **Código:** `src/server/services/inbox-flow.service.ts`, `src/modules/inbox/{flow-actions.ts,flow-controls.tsx}`, páginas da caixa, da intimação e `/caixa-de-entrada/equipes`.
- **Testes:** 6 de integração do fluxo (equipes, caixas, devolver, adormecer, etiquetas, notas, isolamento) e 1 E2E.
- **Diferenças em relação ao Legal Mail (honestas):** o Acervo aqui é "tratada" e não zera o prazo; etiquetas são texto livre por intimação (sem catálogo com cores); não há caixa por usuário de outras pessoas além da visão Geral; adormecer não manda aviso no dia (a intimação só reaparece).

### Painel de administração da plataforma (concluído)
- **Para quem:** o dono do sistema, acima dos escritórios. Rota `/admin` (visão geral, escritórios, usuários, auditoria, saúde e integrações).
- **Acesso:** tabela `platform_admins`, concedida **só por script** (`npm run platform-admin -- grant|revoke <email>`, `list`), nunca pela interface; exige conta ativa **com 2FA ativo** (sem 2FA o acesso vai para Minha conta). Quem não é super-admin recebe 404, e a verificação se repete em cada função do serviço.
- **Privacidade (princípio de projeto):** o painel só mostra contagens, datas, estados e a identificação de escritórios e usuários. Nunca mostra processos, clientes, documentos, teor de intimações nem os metadados internos da auditoria; não existe "entrar como" outro usuário; chaves de ambiente aparecem só como "configurada/ausente".
- **Gestão:** suspender/reativar escritório (motivo obrigatório; bloqueia login no escritório, lista de escritórios, rotinas automáticas e envia o usuário a `/suspenso`; dados preservados), desativar/reativar usuário (encerra todas as sessões; não vale para si mesmo nem para super-admins) e desbloquear conta. Tudo auditado (`platform.*`).
- **Migration:** `20261102000000_platform_admin` (`platform_admins`; `organizations.suspended_at/suspended_reason` com CHECK de consistência).
- **Código:** `src/server/services/platform.service.ts`, `src/server/platform.ts`, `src/app/admin/*`, `src/modules/platform/*`, `scripts/platform-admin.ts`, `src/app/suspenso`.
- **Testes:** 5 de integração (acesso, contagens sem conteúdo, suspensão em todas as camadas, usuários, auditoria e saúde sem segredos) e 2 E2E (404 para comum; fluxo completo com 2FA, suspensão e reativação).
- **Pendências:** painel por escritório; armazenamento por escritório; estado dos backups; envio de aviso ao escritório quando suspenso (sem e-mail real); gráficos de tendência (hoje só números do momento).

### Motor de tribunais — Etapa 2b (sync automática do MNI) e Etapa 4 via MNI (autos) (concluídas no código; não validadas em tribunal real)
- **2b:** `runMniAll` em `mni.service.ts` + rota `POST /api/cron/mni` (mesmo `CRON_SECRET`); só conexões ligadas de escritórios ativos; contexto de quem criou; falha de acesso é gravada na conexão; nunca abre teor.
- **4:** `importAutosMni` (duas fases, lotes de 5, até 25 documentos por clique, sem duplicar por `documents.external_key`, pula sigilosos/tipos não suportados/>8 MB), botão "Baixar autos (MNI)" no processo; `buildConsultarProcesso` aceita lista de documentos; `parseConsultarProcesso` devolve `documentos`.
- **Migration:** `20261103000000_court_documents` (`documents.external_key` + índice único por escritório).
- **Testes:** `integration/mni.test.ts` (execução automática; autos com sigiloso, HTML, falso PDF, documento vinculado, repetição, permissões, outro escritório), `integration/mni-cron.test.ts`.
- **Limites honestos:** só testado com tribunal simulado; depende de o tribunal listar documentos sem conteúdo e devolver o conteúdo por id (padrão do MNI 2.2.x); sem OCR automático dos autos; sem robôs de navegador (Etapa 3).

### Peticionamento: anexos classificados e autotextos (concluídos)
- **Anexos da petição:** a petição passa a ter até 20 anexos (documentos do mesmo processo, diferentes do principal, sem repetição), cada um com classificação (procuração, documento pessoal, comprovante de residência, prova documental, contrato, decisão/despacho, outros) e ordem (subir/descer). Só em rascunho. A versão de cada anexo é **travada no envio para revisão**; nova versão ou remoção de um anexo derruba a aprovação/envio (mensagem clara, devolve-se ao rascunho). Documento que é anexo de petição em revisão/aprovada/enviada não pode ser excluído. O adaptador de peticionamento recebe a lista (nome, tipo, tamanho, SHA-256, classificação) na ordem; o recibo de demonstração lista os anexos. Tela: card "Anexos" na petição.
- **Autotextos:** trechos reutilizáveis (`/documentos/autotextos`, permissão `templates:manage` para criar/editar; todos com acesso a documentos leem os ativos). No modelo, `{{autotexto.codigo}}`; ao gerar o documento o trecho entra e os campos dele ({{cliente.nome}}…) são mesclados com os mesmos avisos `[PREENCHER: …]`. O modelo só salva se o autotexto existir e estiver ativo; autotexto não pode usar outro autotexto; depois de desativado/excluído, o documento gerado mostra `[AUTOTEXTO NÃO ENCONTRADO: codigo]` (nunca inventa). Código único por escritório (reutilizável após excluir).
- **Migration:** `20261104000000_petition_attachments_snippets` (`petition_attachments` com FKs compostas e CHECK de classificação; `text_snippets` com índice único parcial por escritório).
- **Testes:** integração (anexos: validações, ordem, versão travada, envio com lista, exclusão protegida, limite de 20, anexo removido; autotextos: permissões, validações, unicidade, isolamento, geração com conteúdo conferido no .docx) e 1 E2E (autotexto → modelo → documentos → petição com anexo classificado → envio de demonstração com recibo).
- **Limites honestos:** o adaptador de demonstração continua sendo o único; a tradução da classificação para os "tipos de documento" de cada tribunal será feita no adaptador real (cada tribunal tem sua tabela); sem editor online da petição (o texto vem do documento anexado); autotexto é texto simples (sem formatação rica).

### API pública v1 e chaves de API (concluída)
- **Chaves de API:** card "API do LegalOS" em Integrações (permissão `integrations:manage` + 2FA para criar/revogar). Token `lgos_<prefixo>_<segredo>` mostrado uma única vez; só o hash SHA-256 fica no banco; escopos `cases:read`, `clients:read`, `deadlines:read`, `notices:read`, `notices:write`; validade opcional; limite de 20 ativas; auditoria `apikey.create|revoke`. A chave **age como o criador** (mesmas permissões e sigilo) e cai se ele sair/for suspenso ou se o escritório for suspenso.
- **Rotas** `/api/v1`: `me`, `cases` (+id), `clients` (+id), `deadlines`, `notices` (+id, POST idempotente por `externalId`). Paginação por cursor, DTOs estáveis (sem anotações internas), erros padronizados, 120 req/min por chave. Documentação em `docs/api.md`.
- **Correção importante do proxy:** `src/proxy.ts` mandaria para o login qualquer requisição sem cookie a `/api/cron/*` (agendadores do DJEN e do MNI) em produção. `/api/cron` e `/api/v1` agora são prefixos públicos (cada um se autentica sozinho: `CRON_SECRET` e chave de API).
- **Migration:** `20261105000000_api_keys` (`api_keys`, `prefix` único, CHECK de 1 a 10 escopos).
- **Testes:** integração `api-v1.test.ts` (criação e validações, token fora do banco, 401/403, isolamento entre escritórios, sigilo, paginação sem repetir, POST idempotente e validações, revogação/expiração/criador suspenso/escritório suspenso, auditoria) e E2E `api-chaves.spec.ts` (2FA exigido, chamada HTTP sem cookie, token só uma vez, revogação, rota de cron não redirecionada).
- **Limites honestos:** limitador em memória (por processo); a chave herda o perfil do criador (não há "usuário de serviço" separado); sem OAuth; somente leitura exceto intimações; webhooks na entrega seguinte (abaixo).

### Webhooks (concluídos)
- **Cadastro** em Integrações (permissão `integrations:manage`; 2FA para criar/remover; até 10 por escritório): nome, endereço `https://` e eventos `notice.created`, `case.created`, `deadline.created`. Segredo `whsec_…` mostrado uma vez e guardado cifrado (AES-GCM com `MFA_ENCRYPTION_KEY`; sem ela, o recurso fica indisponível e avisa). Botão "Enviar teste" (ping imediato), ligar/desligar, remover (cancela pendentes), histórico das últimas entregas com "Reenviar".
- **Carga mínima** (só identificadores) assinada com HMAC-SHA256 (`X-LegalOS-Signature: t=…,v1=…`), cabeçalhos de evento/entrega; formato e exemplo de verificação em `docs/api.md`.
- **Fila e reenvio:** evento vira uma entrega por webhook assinante (único por webhook+evento); `POST /api/cron/webhooks` (agendador a cada minuto, `CRON_SECRET`) entrega com reserva de 5 min (`FOR UPDATE SKIP LOCKED`, sem duplicar entre instâncias); 6 tentativas (1 min, 5 min, 30 min, 2 h, 6 h), depois "Falhou" com reenvio manual; 30 falhas seguidas desligam o webhook; histórico apagado após 30 dias; escritório suspenso não recebe.
- **Segurança do envio:** só https com domínio público (IP/localhost/.internal recusados), DNS revalidado a cada conexão contra rede interna, sem seguir redirecionamentos, TLS verificado, limite de 10 s e de leitura da resposta.
- **Eventos emitidos em:** `createNotice` (não em duplicatas), `createCase`, `createDeadline` — depois de confirmada a gravação; falha na fila nunca derruba a operação de origem.
- **Migration:** `20261106000000_webhooks` (`webhook_endpoints`, `webhook_deliveries` com FK composta e CHECKs).
- **Testes:** integração `webhooks.test.ts` (7: criação/validações/segredo cifrado, assinatura e cabeçalhos conferidos num servidor receptor real, só assinantes e só o próprio escritório, carga sem conteúdo, repetição com espera e esgotamento, reenvio manual, desligamento após 30 falhas, remoção, suspensão, validação de endereço em modo produção) e E2E `webhooks.spec.ts`.
- **Limites honestos:** depende de agendador externo (sem ele, nada é entregue); ordem não garantida e pode haver entrega repetida (deduplicar por `id`); só 3 tipos de evento (andamentos, mudanças de status, financeiro e documentos ainda não geram aviso); o limitador e o histórico não têm painel de métricas; nunca testado contra receptores reais de terceiros (Zapier, n8n etc.), só contra servidor local de teste.

### Relatórios e BI — Fase 9c (concluída)
- **Tela** `/relatorios` com 5 abas — Prazos, Intimações, Processos, Equipe, Financeiro — e período (padrão 90 dias, máx. 366), tudo calculado do banco real, sem dados de exemplo. Gráficos simples em SVG/HTML (barras e rankings) acessíveis, com tabela.
- **Prazos:** cumpridos no prazo × com atraso, vencidos em aberto, por responsável e por mês. **Intimações:** recebidas × tratadas, tempo médio de tratamento, paradas há mais de 3 dias, por tipo/origem/tribunal. **Processos:** carteira por situação, área e tribunal; novos por mês. **Equipe:** tarefas concluídas/abertas/atrasadas, horas registradas, prazos cumpridos por membro. **Financeiro:** recebido, pago, saldo, a receber em aberto e vencido por faixa de atraso, receitas por categoria, maiores clientes (estornos ignorados).
- **Permissões:** cada aba exige `reports:read` **e** a permissão do módulo (ex.: financeiro exige `finance:read`); abas sem permissão nem aparecem. **Sigilo:** processos sigilosos (e prazos, intimações e lançamentos ligados a eles) só entram para quem tem acesso ao processo. Isolamento por escritório.
- **Exportação CSV** (`GET /api/reports/export`, separador `;`, UTF-8 com BOM, proteção contra injeção de fórmula em planilha), 20/min por usuário, auditada como `report.export`.
- **Fuso do escritório** nos limites de período; sem migration nova e sem variáveis de ambiente novas.
- **Testes:** integração `reports.test.ts` (10), unitário `csv.test.ts` (2), E2E `relatorios.spec.ts`. Suíte completa: 362 testes vitest em 45 arquivos.
- **Limites honestos:** teto de leitura de 50.000 registros por relatório (aparece aviso de "incompleto"); sem relatório personalizado/salvo, sem PDF, sem envio agendado por e-mail; indicadores de equipe são apoio, não avaliação de desempenho; lançamentos ligados a processo sigiloso que o usuário não vê ficam fora do financeiro dele.

### Implantação (guia pronto, não executado)
VPS `187.127.59.92` e domínio `legalossync.tech` informados; `docs/deploy-vps.md` traz o passo a passo (DNS, Docker, Caddy/HTTPS, chaves, migrações, cron, backups). Nenhum acesso ao servidor foi feito por nós.

### Página pública do escritório (concluída)
- Visitante sem cookie em `/` vê a vitrine (`/inicio`, reescrita no `proxy.ts`; a URL continua `/`): áreas de atuação, como trabalhamos, portal do cliente, botão **Entrar**, aviso de caráter informativo (sem promessa de resultado) e nota de LGPD. Quem já tem sessão continua indo ao painel. Indexável por buscadores (o resto do sistema segue `noindex`).
- **Nada inventado:** telefone/WhatsApp, e-mail, endereço e número da OAB só aparecem se definidos no ambiente: `PUBLIC_CONTACT_WHATSAPP` (só dígitos com DDI+DDD, ex. 5571999999999), `PUBLIC_CONTACT_EMAIL`, `PUBLIC_CONTACT_ADDRESS`, `PUBLIC_OAB`, `PUBLIC_FIRM_NAME`. Textos das áreas em `src/config/site.ts`.
- **Limites honestos:** a OAB (Provimento 205/2021) restringe publicidade; **revise os textos antes de divulgar**. O cadastro de novos escritórios (`/register`) continua aberto a qualquer visitante: em produção, avalie fechá-lo.
- E2E `fundacao.spec.ts` atualizado (vitrine na raiz, `/clientes` vai ao login, botão Entrar).

### LegalOS Func e LegalOS Box — dois lados, dois painéis (concluído)
- **Func** (gestão do escritório, estilo Astrea/Advbox): visão geral, processos, clientes, prazos, tarefas, agenda, documentos, financeiro, CRM, relatórios, equipe, automações, IA. **Box** (estilo LegalMail): caixa de entrada de intimações (e equipes), peticionamento, certificados digitais e integrações (capturas DJEN/MNI, chaves de API, webhooks).
- Cada lado tem **menu, painel, cor e identidade próprios** (Box em verde-água, selo "Box"/"Func" na marca). O lado é decidido pelo caminho (`spaceOfPath` em `src/config/navigation.ts`: `/box`, `/caixa-de-entrada`, `/peticoes`, `/certificados`, `/integracoes` são Box); `data-space` no shell aplica a cor. Configurações aparece nos dois.
- **Alternador** Func | Box no topo do menu; no Box aparece o número de intimações novas (respeita sigilo e permissão).
- **Painel do Box** (`/box`, `getBoxDashboard` em `src/server/services/box.service.ts`): caixa de entrada (novas, para mim, paradas há mais de 3 dias, 14 dias de recebimento), capturas (última execução de cada monitor DJEN/MNI), certificados (vencidos e que vencem em 30 dias), petições por situação e saúde de chaves/webhooks. **Cada bloco só aparece para quem tem a permissão do módulo**; tudo vem do banco, por escritório.
- O painel do Func deixou de listar intimações; tem um cartão "LegalOS Box" com a contagem e atalho. Atalhos nos dois sentidos: Box → processo (Func), aba Intimações do processo → caixa de entrada (Box), "Ir para o LegalOS Func" no painel do Box.
- Sem migração de banco e sem variável de ambiente nova.
- **Testes:** unitários `spaces.test.ts` (3), integração `box.test.ts` (3: números do banco e isolamento, blocos por permissão, sigilo), E2E `box-func.spec.ts` (alternador, menus separados, painéis, atalhos); 3 E2E antigos ajustados para passar pelo alternador.
- **Limite:** o item "Visão geral do Box" usa a permissão `inbox:read`; quem só gerencia certificados/integrações entra pelo menu direto, sem o painel no menu.
- **Correção junto desta entrega:** a aba Financeiro dos Relatórios quebrava ao abrir (funções passadas do servidor para o gráfico). Agora os gráficos recebem `unit="money"`; o E2E de relatórios abre todas as abas.

### Planos, limites e assinatura — Fase 9d (concluída; cobrança automática NÃO existe)
- **Regras aplicadas de verdade** (`src/server/services/plan.service.ts`): armazenamento do plano (upload e nova versão recusam o que passa da cota, com a mensagem dizendo uso e limite; excluir libera), IA (o menor entre o limite do plano e `AI_MONTHLY_TOKEN_LIMIT`; plano com 0 não inclui IA), usuários (membros + convites pendentes, já existia).
- **Situação da assinatura:** teste vencido ou cancelada → só o que **aumenta o uso** é pausado (enviar arquivo, nova versão, IA, convidar). Consulta, download, exclusão e todo o resto continuam: dados jurídicos nunca ficam presos. Teste nos últimos 3 dias e pagamento em atraso apenas avisam (faixa no topo do painel).
- **Configurações → "Plano e uso":** plano, situação, datas e barras de uso (usuários, armazenamento, IA no mês).
- **Administração da plataforma:** coluna Plano em Escritórios, com botão "Plano…" para trocar plano, situação, prorrogar teste ou definir o fim do período pago, com observação; tudo na auditoria (`platform.subscription_update`). Reduzir o plano abaixo do uso atual é permitido e não apaga nada.
- **Limites honestos:** **sem cobrança automática** (nenhum Asaas/Stripe/PIX/boleto integrado: o pagamento é combinado fora e registrado pela administração); a lista de recursos do plano (`features`) ainda não esconde módulos; os limites dos planos se alteram no banco (não há tela para editar planos); não há e-mail automático de aviso de vencimento (o e-mail real ainda é só `console`).
- **Testes:** `plan.test.ts` (11: estados da assinatura, cota de armazenamento e liberação, escritório isolado, pausa sem bloquear leitura/download, cancelada/atraso, IA por plano, usuários, administração e auditoria) e E2E de administração estendido (cancelar → faixa e card no escritório).
- Sem migração nova e sem variável de ambiente nova.

### Motor de tribunais — Etapa 5: protocolo de petição pelo MNI (concluída no código; DESLIGADA por padrão; não validada em tribunal real)
- **Como liga:** `PETITIONING_ADAPTER=mni` no ambiente (sem isso, continua o modo demonstração). Usa a conexão PJe/MNI do escritório para o tribunal do número CNJ do processo.
- **Código:** `buildEntregarManifestacao`/`parseEntregarManifestacao` em `src/lib/mni/xml.ts`; adaptador `mniAdapter` em `src/server/services/mni-petition.service.ts`; migration `20261107000000_court_petition_types` (coluna `court_connections.petition_types`); editor dos códigos em Integrações (por conexão).
- **Proteções:** (1) o usuário precisa **digitar o número do processo** para confirmar (ato irreversível); (2) exige 2FA; (3) **sem o código de tipo de documento do tribunal** (peça e cada classificação de anexo usada) o envio é recusado **antes** de reservar, e a petição segue aprovada; (4) só vira "Protocolada" se o tribunal devolver um **número de protocolo**; (5) queda/timeout/resposta sem protocolo = **resultado incerto**: a petição vai para "Falha no envio" com aviso em destaque para **conferir no tribunal antes de reenviar**; recusa clara do tribunal (Fault, acesso negado) é falha definitiva e pode ser reenviada; (6) o envio usa a versão aprovada e nunca duplica (reserva atômica já existente); (7) conjunto limitado a 25 MB.
- **Testes:** `integration/mni-petition.test.ts` (8: configuração dos códigos e permissões, recusa antes de reservar, confirmação digitada, protocolo/recibo/anexos/tipos no envelope, Fault, incerto × definitivo, anexo sem código, isolamento entre escritórios, parser) e `unit/petition-types.test.ts` (2). Só contra tribunal **simulado**.
- **Limites honestos (leia antes de usar com cliente real):** **não assina digitalmente** os documentos (vários tribunais exigem assinatura em cada arquivo); os códigos de tipo de documento e os campos do envelope variam por tribunal e **não foram confirmados em nenhum tribunal real**; o recibo é guardado como texto quando o tribunal o devolve assim (PDF binário não é salvo); não há consulta posterior para conferir o protocolo. Valide em **homologação** (TRT5 ou outro) antes de ligar em produção.
- **DJe do STF:** não implementado. Não encontrei uma interface pública que eu pudesse confirmar; sem uma fonte verificada não vou escrever o conector por suposição. O DJEN nacional (já feito) é a captura em uso.

## Bloco 1 — segurança e operação do servidor (2026-10-19)
- **Política de cadastro:** `REGISTRATION_MODE` = `open` (padrão) | `code` (exige `REGISTRATION_CODE` com 12+ caracteres; sem isso cai em fechado) | `closed`. Convite válido para o e-mail sempre permite cadastrar. Tela `/register` mostra aviso quando fechado e campo "Código de acesso" no modo código. `check:prod` avisa se estiver aberto e erra com código fraco.
- **Troca de chaves sem perder dados:** `npm run rotate-keys` (env `NEW_MFA_ENCRYPTION_KEY`/`NEW_CERT_ENCRYPTION_KEY`; `--apply` grava, sem ele só simula). Tudo ou nada em uma transação: se algum segredo não abrir com a chave antiga, nada é gravado.
- **Scripts do servidor (Docker)** em `scripts/server/`: `install-cron.sh` (webhooks/min, DJEN e MNI a cada 30 min, backup 03:00, verificação dominical, logrotate), `cron-call.sh`, `backup-docker.sh` (criptografado, retenção, cópia externa opcional), `verify-backup-docker.sh` (restaura em banco temporário), `restore-docker.sh`, `status.sh` (checklist somente leitura), `rotate-secrets.sh cron|db|keys|backup-pass`.
- **Guia:** `docs/seguranca-servidor.md` (atualizar, fechar cadastro, agendar, trocar segredos, SSH só com chave, conferência final).
- **Variáveis novas:** `REGISTRATION_MODE`, `REGISTRATION_CODE`, `BACKUP_PASSPHRASE`, `BACKUP_DIR`, `BACKUP_KEEP_DAYS`, `BACKUP_OFFSITE`.
- **Testes:** unitário `registration.test.ts` (3), integração `rotate-keys.test.ts` (3). `cron-call.sh` foi exercitado contra servidor HTTP falso (200, 401, job inválido).
- **Limites honestos:** as partes dos scripts que dependem de Docker (backup, restauração, troca de segredos) **não foram executadas aqui** (sem Docker no ambiente); rode `status.sh` e teste a restauração na primeira vez. Chaves já mostradas em conversa devem ser trocadas com `rotate-secrets.sh`.

## E-mail real com fila + cobrança automática Asaas (2026-10-19)
- **Migração** `20261108000000_billing_mail`: `plans.price_cents`; colunas de cobrança em `subscriptions` (provedor, cliente, assinatura, cancelamento pedido, nome/CPF-CNPJ/e-mail de cobrança); tabelas `billing_invoices`, `billing_events` (idempotência do webhook) e `mail_outbox`.
- **E-mail:** layout HTML+texto (`src/lib/mail/layout.ts`, tudo escapado), fila com reenvio (`mail-outbox.service.ts`: espera crescente, 6 tentativas, deduplicação, limpeza em 30/90 dias; só entrega com driver SMTP real; e-mails com token continuam sendo enviados na hora e fora da fila). Rota `/api/cron/mail`.
- **Cobrança:** `src/lib/billing/asaas.ts` (cliente da API v3), `billing.service.ts` (dados de cobrança, contratar com reserva atômica anti-duplicidade, trocar plano, cancelar, "atualizar situação", webhook que confirma o estado na API e processa cada evento uma só vez, rotina horária `/api/cron/billing`: cancelamento no fim do período, conferência de avisos perdidos, lembretes de fim de teste). Webhook `/api/billing/asaas/webhook` (token `asaas-access-token`). Telas: Configurações → "Assinatura e faturas" (só `billing:manage`, exige 2FA para contratar/cancelar) e `/admin/planos` (preço e limites dos planos; fecha a "tela de editar plano").
- **Variáveis:** `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` (24+), `ASAAS_ENV` (sandbox padrão|production), `ASAAS_API_URL` (só testes); e-mail: `MAIL_DRIVER=smtp`, `SMTP_*`, `MAIL_FROM`. `check:prod` avisa/erra conforme.
- **Guia:** `docs/cobranca-e-email.md`. Agendadores novos em `install-cron.sh` (mail a cada 5 min, billing de hora em hora).
- **Testes:** `billing.test.ts` (16, contra simulador do Asaas em `fake-asaas.ts`), `mail-outbox.test.ts` (6), `asaas.test.ts` (5); E2E de admin estendido (cobrança desligada + edição de preço). Correções: `mail.test.ts` (tipos e assunto codificado) e `prod-check.test.ts`.
- **Limites honestos:** o Asaas **real** nunca foi chamado (só simulador) — validar na sandbox antes de produção; sem nota fiscal, cupom, proporcional, ciclo anual ou reembolso pela tela; os recursos do plano (`features`) ainda não escondem módulos; SMTP de provedor real ainda não testado.

## Lição de implantação (2026-10-19)
O serviço `migrate` está no perfil `tools`; `docker compose build` não o reconstrói. Sem `docker compose --profile tools build migrate`, a migração roda com imagem antiga ("Banco já atualizado") e o app falha com `column does not exist` (P2022). Documentado em `docs/seguranca-servidor.md` e `docs/deploy-vps.md`.

## Lista para depois (adicionada em 2026-10-19)
- Revisar a lista de usuários da plataforma em produção (`/admin/usuarios` ou consulta de leitura no banco) e desativar contas desconhecidas; fechar o cadastro (`REGISTRATION_MODE`).
- **Migração completa do Astrea → LegalOS:** rodar o importador existente (`npm run import:astrea`, ver `docs/importacao-astrea.md`) em simulação e depois de verdade (backup do banco antes; equipe convidada antes com os mesmos e-mails; conferência por amostragem de ~20 processos e ~20 clientes; prazos "em progresso" entram como rascunho e precisam de validação humana). Pendentes: gerar o backup completo no Astrea; decidir entre desligar o Astrea ou conviver por um período; construir importação de **andamentos, documentos (arquivos) e links via API do Astrea** (lacuna do importador por CSV; viabilidade dos arquivos a testar).

## Servidor: situação em 2026-10-19 (executado com o usuário)
- Feito em produção: cadastro em modo `code` (código trocado depois de aparecer no chat), cron instalado, primeiro backup criptografado **e restauração verificada** (61 tabelas, 3 usuários — todos conhecidos, nenhuma conta a desativar), SSH **só com chave** e sem senha (`/etc/ssh/sshd_config.d/00-legalos.conf`).
- **Lição:** o arquivo de configuração do SSH precisa vir **antes** de `50-cloud-init.conf` (que liga a senha); o SSH usa o primeiro valor lido. Por isso o arquivo é `00-…`. Prove a chave com `ssh -o PasswordAuthentication=no` **a partir do Mac** antes de bloquear; `status.sh` confere.
- **Pendente no servidor:** `rotate-secrets.sh cron|db|keys|backup-pass` (chaves já passaram pelo chat), cópia externa do backup (`BACKUP_OFFSITE`), trocar a senha do root se foi digitada fora do computador.
- **Teste PJe/TRT5 adiado:** o usuário não tem o login do PJe no momento. Não foi encontrada fonte oficial pública para o endereço do MNI do TRT5 nem para o modo de autenticação do MNI após a entrada do PDPJ-Br (login web de usuário externo é só via PDPJ-Br desde 01/04/2025). Retomar com o login em mãos e a página oficial de integração do TRT5.

## PWA — app instalável (2026-10-19)
- **O que é:** o LegalOS pode ser instalado como aplicativo (Android/Chrome/Edge: botão "Instalar app" na barra superior; iPhone/iPad: instruções "Adicionar à Tela de Início"). Abre em janela própria, com ícone e atalhos para **Prazos, Agenda, Intimações (caixa de entrada) e Tarefas**.
- **Código:** `src/lib/pwa/manifest.ts` + `src/app/manifest.ts`; `public/sw.js`; `public/offline.html`; ícones em `public/pwa/` (gerados por `node scripts/gen-pwa-icons.mjs` a partir de `src/app/icon.svg`); `src/components/pwa/{pwa-register,install-app-button}.tsx`; CSP ganhou `worker-src 'self'` e `manifest-src 'self'`; `/sw.js` sai com `no-cache`; o proxy não intercepta manifesto, `sw.js`, `offline.html` e `/pwa/`.
- **Segurança (decisão de projeto):** o service worker **nunca guarda páginas nem respostas da API** — só arquivos estáticos versionados. Sem internet aparece uma tela genérica "Sem conexão", sem nenhum dado de cliente ou processo no aparelho. Registro só em produção.
- **Testes:** `unit/pwa.test.ts` (5) e `e2e/pwa.spec.ts` (3, incluindo registro real do service worker e tela offline em Chromium).
- **Limites honestos:** **não há modo offline de dados** (por segurança) e a **notificação push** (2.0-F14, seção abaixo) só funciona depois de configurar as chaves VAPID no servidor; instalação não foi testada em iPhone/Android reais, só no Chromium; HTTPS é obrigatório (produção já usa).
- **Próxima etapa do app:** notificações push (prazos do dia, intimação nova) com `web-push`, preferências por usuário e inscrição por aparelho.

## Migração do Astrea — preparação (2026-10-19)
- **Levantamento no Astrea (somente leitura, via conector):** 2.503 processos/casos (2.235 processos + 268 casos; 590 ativos e 1.913 arquivados) e 4.682 contatos (1.759 clientes, 2.900 contatos, 23 usuários). O conector e o `Usuário.csv` trazem 677 "usuários", mas só **23 são equipe** (Tipo "Usuário": 15 ativos e 8 inativos); os outros 654 são **clientes com acesso ao portal do Astrea**. Convidar só os 15 ativos da equipe. No Astrea quase todos são Administrador/Coordenador; definir os papéis no LegalOS à mão.
- **Backup completo recebido (pasta `BACKUP_TOTAL_…_2026-10-17`, 126 MB):** `Históricos.csv` (~81 MB, ~359 mil linhas) **contém os andamentos**, que o importador atual ignora — dá para importá-los do CSV, sem ~2.500 chamadas à API. `Documentos.csv` (~7,3 mil linhas) traz só links. Como o Astrea continua ligado, **reimportar perto da virada** (o importador pula o que já entrou).
- **Novo:** `scripts/server/import-astrea-docker.sh <pasta> <e-mail> (--dry-run | --yes) [--only ...] [--org ...]` — roda o importador dentro da imagem `migrate`; com `--yes` faz backup criptografado antes e aborta se ele falhar; recusa chamada sem `--dry-run`/`--yes`. Testado só com Docker simulado (argumentos, recusas e ordem); o primeiro uso real é o teste de fumaça.
- **Guia:** seção "No servidor de produção (Docker)" em `docs/importacao-astrea.md`.
- **Pendente:** gerar o backup completo no Astrea (usuário); decidir convivência × desligamento; convidar a equipe com os mesmos e-mails do Astrea antes da importação real; simulação e importação reais; importação de **andamentos/documentos/links via API** (andamentos: preferir importar do `Históricos.csv` do backup; links de documentos do `Documentos.csv`).

## Equipe do Astrea para demonstração (2026-10-20)
- **Novo:** `src/server/import/astrea-team.ts` + `scripts/seed-team-astrea.ts` (`npm run seed:team-astrea`) + `scripts/server/seed-team-docker.sh`: cadastra a **equipe ativa** do `Usuário.csv` num escritório; contas inexistentes são criadas **sem senha utilizável**; contas existentes só ganham vínculo; idempotente; simula por padrão (`--apply` grava). Papéis sugeridos por regra, ajustáveis (`--roles`, `--owners`).
- **Testes:** `integration/astrea-team.test.ts` (4: leitura/papéis, simulação sem gravar, criação sem senha + idempotência + dono preservado, isolamento). Total: 437 testes em 58 arquivos.
- **Limites honestos:** as contas sem senha são contas reais no banco; quando o e-mail de produção for configurado, a pessoa dona do e-mail poderia reivindicá-la por "Esqueci a senha" e passaria a ver os dados do escritório de demonstração — desativar ou remover antes disso se não for desejado. Os 8 inativos do Astrea **não** são cadastrados (itens deles ficam com o dono). Os papéis são uma suposição para a demonstração.

## Andamentos do Astrea (2026-10-20)
- **Novo:** entidade `andamentos` no importador (`--only andamentos`; roda junto no import completo): lê `Históricos.csv` **em fluxo** (`iterCsv` em `src/lib/import/csv.ts`) e grava em lotes de 2.000 em `case_events` (origem "Importado", tipo `ANDAMENTO` ou `NOTE`), com autor quando o responsável casa por e-mail, hora no fuso do escritório, idempotência por `import_map` (entity `history`). Só "Andamento" e "Manual" entram; tarefa realizada, publicação, prazo, evento, audiência e atividade excluída são ignorados (já existem em outros módulos). A linha do tempo mostra os 300 mais recentes.
- **Teste de carga:** 200 mil linhas (111 MB): 183.333 andamentos em ~99 s, pico ~820 MB de memória; segunda rodada pula tudo em ~4 s. (A primeira versão, que lia o arquivo inteiro, foi morta por falta de memória — por isso o fluxo.)
- **Testes novos:** `integration/astrea-import-history.test.ts` (2), `unit/csv-stream.test.ts` (2). Total: 441 testes em 60 arquivos.
- **Limites honestos:** comentários avulsos, anexos/links de documentos e etiquetas do histórico não entram; a linha do tempo importada não distingue andamento de tribunal e anotação interna além do rótulo; conferir por amostragem contra o Astrea.

## WhatsApp — Fase 1 (2026-10-20)
- **Pronto:** caixa de atendimento `/atendimento` e configurações `/atendimento/configuracoes`, webhook assinado (`/api/whatsapp/webhook`), envio de texto/arquivo/modelo, notas, atribuição, vínculo com cliente por telefone, ausência, respostas rápidas, janela de 24 h, token cifrado (entra no `rotate-keys`), `check:prod`, `.env.example`, permissões `whatsapp:read|write|manage` (migração atualiza perfis existentes). Detalhes e limites: `docs/whatsapp.md`.
- **Verificado:** tsc, eslint, vitest completo (470 testes em 62 arquivos), Playwright completo (33 E2E, incluindo 2 do WhatsApp em servidor próprio na porta 3101) e build, tudo contra um simulador da Graph API. **Nunca testado com a Meta real.**
- **Não verificado:** versão vigente da Graph API, coexistência app+API, preços, revisão de app da Meta.
- **Variáveis:** `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (16+), `WHATSAPP_API_VERSION` (padrão v21.0), `WHATSAPP_API_URL` e `WHATSAPP_ALLOW_LOCAL` (só testes).
- **Próximas fases:** tarefa/processo a partir da mensagem, resumo por IA, triagem por menu, avisos a clientes existentes, fluxo visual.

## LegalOS Chat — lugar próprio (2026-10-20)
- O atendimento por WhatsApp deixou o menu do Func e virou o terceiro lugar do LegalOS, **LegalOS Chat** (alternador Func | Box | Chat; cada lugar só aparece para quem tem permissão). Itens: Conversas (`/atendimento`) e Configurar o Chat (`/atendimento/configuracoes`). O alternador mostra o total de mensagens não lidas (atualiza ao navegar; a lista e a conversa se atualizam sozinhas a cada 3 s com a aba visível). URLs não mudaram.
- Testes: `spaces.test.ts` (Chat), E2E do alternador/menu do Chat em `whatsapp.spec.ts`. Próximos passos do Chat (a definir com o Luiz): vários números, triagem por menu, tarefa/processo a partir da mensagem, resumo por IA.

## LegalOS Chat — Fase 1: interligação (2026-10-20)
- **Conversa ligada ao sistema:** a conversa liga a cliente, **processo** e **lead** (migração `20261111000000_chat_interligacao`: `case_id`, `lead_id`). Dentro da conversa: vincular processo (busca entre os do cliente e por número/título, só os visíveis pelo sigilo; liga o cliente sozinho se o processo tiver um único cliente), **criar tarefa**, **marcar compromisso** na Agenda, **cadastrar prazo** (nasce RASCUNHO; exige processo; validação humana mantida) e **criar lead** no CRM (origem WhatsApp). Por mensagem: "Criar tarefa" (cita a mensagem e o link da conversa) e "Guardar no processo/cliente" (arquivo recebido vai para Documentos).
- Cada ação respeita a permissão do módulo de destino, grava auditoria, deixa **nota interna** na conversa e, havendo processo, evento na linha do tempo. Converter lead em cliente passa as conversas ao novo cliente.
- **Caminho de volta:** card "Conversas de WhatsApp" nas fichas de cliente, processo e lead.
- Código: `chat-links.service.ts`, `modules/whatsapp/{links-panel,conversations-card}.tsx`. Testes: integração `chat-links` (7), E2E (tarefa + lead + card no lead).
- **Ainda não feito (próximas fases):** filas/distribuição automática, etiquetas e campos, gatilhos/menu/chatbot, cobrança de honorários, vários números, relatórios do Chat.

## WhatsApp por QR-Code (opção avançada) — CONSTRUÍDO, testado só com driver FALSO (2026-10-20)
- **Decisão do Luiz:** "as duas": Meta oficial continua padrão; conexão por QR-Code (não oficial, estilo ChatGuru) é opção avançada, isolada e com aviso de risco.
- **O que existe:** `provider` META|QR por escritório (um número); conectar por QR exige 2FA + cofre + confirmação dos riscos (gravada com data e autor); QR aparece na tela e se renova; estado CONNECTED/QR/CONNECTING/DISCONNECTED; reconexão automática com espera crescente; se o aparelho sai (loggedOut) apaga as chaves e pede novo QR; desligar/religar/remover/trocar para Meta param a sessão; sessão religa ao subir o servidor (`src/instrumentation.ts`, só contas já pareadas); estado de autenticação do Baileys cifrado no banco (`whatsapp_qr_auth`, entra na troca de chave `rotate-keys`); envios em fila com intervalo mínimo (1,5 s); recebe mensagens, mídia, mensagens enviadas pelo próprio celular (viram "enviadas") e contatos sem telefone visível (`lid:`); grupos/status/canais são ignorados; no QR não há janela de 24 h nem modelos; o "eco" do envio não duplica mensagem.
- **Honestidade:** o driver real (Baileys 7.0.0-rc14, versão candidata) **nunca falou com o WhatsApp de verdade** aqui; foi testado só com driver falso (`WHATSAPP_QR_FAKE=1`, que `check:prod` recusa em produção). O primeiro teste real será do Luiz, com um número descartável. A conexão viola os termos do WhatsApp: risco de banimento e de queda. Só uma instância do sistema pode manter a sessão (várias derrubam uma à outra). Um número por escritório (o ChatGuru deles tem 3: multi-número fica para depois).
- **Testes:** unit `whatsapp-qr-lib` (4), integração `whatsapp-qr` (12), E2E (1: risco, 2FA, QR, conectar, desconectar).
- **Variáveis:** `WHATSAPP_QR_FAKE` (só teste), `WHATSAPP_QR_FAKE_SCAN_MS`, `WHATSAPP_QR_MIN_GAP_MS` (padrão 1500), `WHATSAPP_QR_DISABLE_RESUME=1` (não religa sessões ao subir). Migração `20261110000000_whatsapp_qr`.

## LegalOS Chat — Fase 2: filas, equipes e distribuição automática (2026-10-20)
- Filas de atendimento (`whatsapp_queues`) reaproveitam as **equipes do Box** (`WorkTeam`): a fila pode ser restrita a uma equipe ou aberta a todos os atendentes. Migração `20261112000000_chat_filas`.
- Formas de distribuir: **rodízio** (quem recebeu há mais tempo), **menor carga** (menos conversas abertas) e **manual** (fica esperando até alguém pegar).
- Quem pode receber: membro ativo, não desativado, com permissão `whatsapp:write` e **disponível**. Cada atendente tem o botão "Disponível / Em pausa" no topo do Chat; ao voltar, assume o que estava esperando.
- Distribuição automática na chegada da mensagem (conversa nova, reaberta ou sem responsável). Mantém o atendente atual se ele segue disponível; nunca sobrescreve uma atribuição manual feita no meio do caminho.
- Transferência de fila dentro da conversa (redistribui pela regra da fila nova, deixa nota na conversa); filtro por fila na lista, com contagem de "na espera"; fila padrão única; excluir fila não apaga conversas.
- Configuração em Configurações do Chat → "Filas e distribuição" (inclui "Distribuir as que estão esperando"). Notificação `chat.assigned` ao atendente escolhido.
- Testes: `chat-queue.test.ts` (rodízio, carga, manual/pausa/volta, manter atendente, transferência, validação/permissão, isolamento, drenar espera, ingestão) + trecho no E2E do WhatsApp.
- Limites conhecidos: sem horário de expediente por atendente nem limite máximo de conversas simultâneas (próximas fases, se necessário); a distribuição só acontece quando chega mensagem, o atendente volta de pausa, ou o gerente clica em distribuir (não há relógio redistribuindo conversas paradas).

## LegalOS Chat — Fase 3: etiquetas e campos personalizados (2026-10-20)
- **Etiquetas** (`whatsapp_labels`, `whatsapp_conversation_labels`): nome único por escritório (sem diferenciar maiúsculas), uma de 8 cores. Quem tem `whatsapp:manage` cria/edita/exclui (Configurações do Chat → Etiquetas); quem atende (`whatsapp:write`) liga/desliga na conversa com um clique. Cada mudança deixa nota interna na conversa e auditoria. Aparecem na lista, e a lista filtra por etiqueta. Excluir a etiqueta a tira das conversas; as conversas ficam.
- **Campos personalizados** (`whatsapp_fields`, `whatsapp_field_values`): tipos texto, número, data e lista de opções (2 a 30). Valores validados por tipo (número aceita vírgula; data válida; opção da lista). Valor vazio apaga. Campo desativado some da conversa mas mantém os valores; não dá para trocar o tipo de campo que já tem valores; excluir apaga os valores.
- **Busca da lista** também acha pelo valor de campo (ex.: número do benefício).
- Migração `20261113000000_chat_etiquetas`. Código: `chat-meta.service.ts`, `modules/whatsapp/{meta-panel,label-style}`, painéis em `settings-ui.tsx`. Testes: `chat-meta.test.ts` (3) + trecho no E2E do WhatsApp.
- Limites: etiquetas e campos só existem em conversas (ainda não aparecem nas fichas de cliente/processo/lead nem entram em relatórios; as automações da Fase 4 poderão usá-las como condição/ação).

## LegalOS Chat — Fase 4: automações do Chat (2026-10-20)
- **Motor próprio do Chat** (o motor de Automações do Func só cria tarefa a partir de 4 eventos; não serviu para conversa). Tabelas `whatsapp_automations` e `whatsapp_automation_runs`, migração `20261114000000_chat_automacoes`. Gestão exige `whatsapp:manage` (Configurações do Chat → "Automações do Chat").
- **Gatilhos:** conversa nova; palavra-chave (várias, sem diferenciar acento/maiúscula); mensagem fora do expediente (usa o expediente das configurações); etiqueta colocada na conversa por uma pessoa.
- **Ações (até 5 por automação, na ordem):** colocar etiqueta; mandar para uma fila (redistribui pela regra da fila); atribuir a um atendente; criar tarefa (título com `{{contato}}`/`{{mensagem}}`, prazo em dias, responsável fixo ou o da conversa, ligada ao cliente/processo da conversa); responder ao cliente (texto com `{{contato}}`; marcada como automática); avisar um membro (notificação).
- **Proteções:** idempotência por (automação, conversa, evento) — por padrão roda uma vez por conversa; automação não aciona outra (etiqueta colocada por automação não dispara "etiqueta colocada"); resposta automática com teto de 3 por conversa a cada 10 min; só 1 resposta por automação e nunca em "etiqueta colocada" (janela de 24 h da Meta); ação que falha não derruba as outras (execução fica "parcial" com o motivo). Cada execução deixa nota interna na conversa e aparece em "Últimas execuções".
- Roda como o sistema, sem exigir permissão de quem escreveu; nunca atrapalha o recebimento da mensagem.
- Testes: `chat-automation.test.ts` (6, com a Meta simulada) + trecho no E2E do WhatsApp.
- Limites: "etiqueta colocada" repete só se a automação estiver com "rodar só uma vez" desligado; sem condições combinadas (E/OU), sem esperas/atrasos ("se não responder em 1 h…"), sem editar a ordem das automações; não há automação para "conversa encerrada" nem "sem resposta" (ficam para depois, junto com follow-ups).

## LegalOS Chat — Fase 5: menu de triagem (chatbot) e pré-atendimento (2026-10-20)
- **Menu fixo, escrito pelo escritório — sem IA.** Tabelas `whatsapp_bots` (um por escritório) e `whatsapp_bot_sessions`, migração `20261115000000_chat_bot`. Configuração: Configurações do Chat → "Menu de triagem (chatbot)" (`whatsapp:manage`), com botão "Usar modelo para escritório de advocacia" (3 opções; o usuário revisa antes de salvar).
- **Fluxo:** conversa nova (ou reaberta depois de encerrada) recebe boas-vindas + opções numeradas + "0 - Falar com um atendente". O cliente responde o número (ou o texto da opção). Cada opção pode: etiquetar, mandar para fila, atribuir, criar tarefa, avisar alguém, responder um texto e fazer até 5 PERGUNTAS (pré-atendimento). Respostas vão para uma nota interna "Triagem concluída…" e, se a pergunta apontar um campo personalizado, para o campo (validado por tipo: data inválida repete a pergunta). Ao final: encaminha para atendente (distribuição normal das filas) e avisa o cliente.
- **Quando o robô se cala:** uma pessoa respondeu na conversa; sessão parada há mais de 24 h; triagem concluída; cliente pediu atendente ("0"/"atendente"); 3 opções inválidas seguidas passam para uma pessoa.
- **Proteções:** teto de 40 mensagens automáticas por conversa em 24 h; reserva de vez (duas mensagens simultâneas não geram duas respostas); nunca responde a mensagem enviada pelo próprio aparelho; falha de envio não derruba a recepção.
- Convive com a mensagem de ausência e com as automações do Chat (todas podem responder; se não quiser duas respostas na mesma chegada, desligue uma delas).
- Testes: `chat-bot.test.ts` (6, Meta simulada) + trecho no E2E do WhatsApp.
- Limites: um único menu por escritório (sem submenus nem horários diferentes); só texto (não lê áudio/imagem como resposta); a conversa já é distribuída a um atendente na chegada (o menu pode redirecionar de fila depois); sem relatório de uso do menu (vem com os relatórios do Chat, Fase 8).

## LegalOS Chat — Fase 6: cobrança de honorários pelo WhatsApp (2026-10-20)
- **Lembretes automáticos de parcela** (só lançamentos a receber do tipo honorários, em aberto/parcial, com cliente e telefone válido). Momentos configuráveis (7/3/1 dia antes, no dia, 1/3/7/15/30 dias de atraso; padrão -3, 0, +3), hora do envio no fuso do escritório, sem fins de semana (a segunda recupera sábado/domingo), limite de dias de atraso. Cada (parcela, momento) é enviado uma única vez (índice único parcial + `skipDuplicates`). Pagou ou cancelou: para sozinho.
- **Textos** configuráveis (antes / vence hoje / atraso) com `{{nome}} {{valor}} {{vencimento}} {{parcela}} {{descricao}}`, dados de pagamento opcionais e rodapé fixo "responda PARAR". Dentro da janela de 24 h vai texto; fora dela, só com modelo aprovado da Meta (até 5 variáveis, nessa ordem); sem modelo a cobrança fica registrada como "não enviada". Conexão QR não tem janela.
- **PARAR:** cliente que responde PARAR/PARE/SAIR a uma cobrança dos últimos 14 dias sai da lista (`whatsapp_billing_optouts`), recebe confirmação e a conversa não reabre nem aciona robô/automações. Gestor pode "Voltar a cobrar".
- **Botão "Cobrar pelo WhatsApp"** na tela da parcela (finance:write + whatsapp:write), com tom escolhido pela situação, intervalo de 24 h entre cobranças manuais, motivos claros quando bloqueado e histórico de envios. Auditoria `whatsapp.billing_manual`.
- **Convivência:** a conversa de cobrança nasce encerrada (não entra na fila); resposta do cliente a uma cobrança recente (3 dias) vai direto para uma pessoa, sem o menu de triagem. Falhas são repetidas até 3 vezes com 30 min de intervalo.
- Migração `20261116000000_chat_cobranca`. Cron novo `whatsapp-billing` (de hora em hora; `scripts/server/install-cron.sh` + `cron-call.sh`, rota `/api/cron/whatsapp-billing`, exige `CRON_SECRET`). Código: `chat-billing.service.ts`, `modules/whatsapp/{billing-schema,billing-ui}`. Testes: `chat-billing.test.ts` (8) + trecho no E2E do WhatsApp.
- Limites: não cria cobrança nova nem gera boleto/PIX (usa os dados de pagamento em texto); sem histórico de cobrança na ficha do cliente; opt-out vale por número de WhatsApp.

## LegalOS Chat — Painel lateral da conversa (2026-10-20)
- **Coluna à direita da conversa** (botão "Ocultar informações"/"Informações"; empilha em tela estreita), com 5 abas: **Contato** (cliente com CPF/CNPJ, e-mail, situação; lead com etapa/interesse/valor; números do atendimento — primeiro contato, última mensagem do cliente, recebidas/enviadas, notas, tempo até a 1ª resposta humana; outras conversas do mesmo cliente; etiquetas e campos personalizados), **Processo** (situação, área, tribunal, fase, valor da causa e 5 últimos andamentos), **Agenda** (tarefas em aberto, prazos em aberto do processo, próximos compromissos; contador de itens na aba), **Financeiro** (em aberto, vencido e as parcelas a receber do cliente, com link para o lançamento e a dica do "Cobrar pelo WhatsApp"; contador de vencidas), **Histórico** (responsável/fila/vínculos/etiquetas/campos alterados, automações executadas, cobranças enviadas, menu de triagem). Embaixo, "Ações rápidas" (vincular processo, criar tarefa/compromisso/prazo/lead), que antes ficavam no topo da conversa.
- **Dados reais, sem tabela nova:** `chat-panel.service.ts` (`conversationPanel`) lê cliente, lead, processo, tarefas, prazos, agenda, financeiro, auditoria, automações e cobranças. Cada bloco só aparece com a permissão do módulo (clientes, CRM, processos, tarefas, prazos/agenda, financeiro); processo sigiloso que o usuário não vê não aparece nem pelas tarefas, prazos e compromissos dele; outro escritório recebe "não encontrada".
- Testes: `chat-panel.test.ts` (4) + trecho no E2E do WhatsApp. Sem migração nem variável nova.
- Limites: o painel é de leitura (editar cliente/processo continua nas telas deles; só etiquetas, campos e ações rápidas editam); "Histórico" mostra só as ações já auditadas (não inclui mudança de status encerrar/reabrir); "outras conversas" só aparecem quando o mesmo cliente tem mais de um número.

## LegalOS Chat — Liga e desliga das automações (2026-10-20)
- **Pedido da Dra. Talita:** nada que envia mensagem a cliente pode acontecer sem autorização; toda automação precisa de botão para ligar e desligar.
- **Novo cartão "Liga e desliga das automações"** (Configurações do Chat, no topo): cobrança de honorários, menu de triagem, mensagem de ausência, automações do Chat (ligar/desligar todas; cada uma mantém o seu botão) e distribuição automática de conversas (nova coluna `whatsapp_accounts.auto_assign_enabled`, padrão ligada; migração `20261117000000_chat_interruptores`). Cada linha mostra Ligada/Desligada.
- **Ligar exige confirmação** (aviso do que vai acontecer; na cobrança, mostra a prévia "enviaria N mensagens para M clientes" sem enviar nada). **Desligar é imediato.** Botão vermelho "Desligar tudo o que envia mensagem sozinho" (cobrança, triagem, ausência e automações). Cada clique grava `whatsapp.switch_on/off` na auditoria (quem e quando).
- **Cobrança:** nasce desligada; **salvar a configuração nunca liga** (o campo "ligada" saiu do formulário); a rotina confere se continua ligada antes de cada envio (desligou no meio, para na hora). O botão manual "Cobrar pelo WhatsApp" continua sendo um clique humano por parcela.
- **Automação nova nasce desligada** na tela (é preciso marcar "Ligada").
- Menu de triagem e ausência só ligam depois de configurados.
- Testes: `chat-switches.test.ts` (6) e ajustes no `chat-billing.test.ts` e no E2E. Fora do Chat, as "Automações do Func" (módulo próprio) têm os seus botões na tela delas.

## 2.0-F2 — Indicadores e central de alertas (2026-10-21)
- Sem migração: `insights.service.ts` (`getIndicators`, `alertCounts`, `alertItems`, `availableAlertTabs`) calcula tudo na hora; só leitura.
- Páginas `/indicadores` e `/alertas?aba=` (menu "Indicadores" e "Central de alertas" no Func). Abas: publicações, andamentos, processos, tarefas, prazos, agenda, financeiro, integrações. Até 50 itens por aba, com contador total.
- Regras: bloco só com a permissão de leitura do módulo; processos confidenciais só para quem participa (ou administra); isolado por escritório; "atrasado" = vencido e em aberto (tarefa/prazo/parcela não paga ou cancelada). Processo "parado" = ativo, criado há mais de 60 dias e sem andamento nos últimos 60.
- Fora desta fase: aba do Portal (não há evento de alerta no portal). O push no celular foi entregue na 2.0-F14.
- Testes: `insights.test.ts` (6) + `indicadores.spec.ts` (1 E2E).

## LegalOS Chat — SLA de resposta e triagem por área (2026-10-21)
- Origem: fluxo n8n + ChatGuru do escritório (`docs/migracao-n8n-chatguru.md`). Etapa 1: sem IA, sem mensagem ao cliente.
- **SLA de resposta**: `whatsapp_sla_settings` (nasce desligado; 15 min; avisar responsável, e-mail, pessoa de escalonamento) e `whatsapp_sla_alerts` (único por conversa + mensagem do cliente). `chat-sla.service.ts` (`getSla`, `saveSla`, `runSlaCheck`); rota `/api/cron/chat-sla` (cron `*/5`, `CRON_SECRET`); registrada em `JOBS` e com "Rodar agora" no painel developer. Regras: só conversa ABERTA; última mensagem do cliente entre X min e 24 h; sem resposta humana depois (resposta do robô não vale); sem responsável e ainda no menu automático não conta; sem destinatário não alerta; aviso interno (`chat.sla`) + e-mail na fila (`chat_sla`, só com driver que entrega).
- **Triagem por área (modelo)**: `chat-triage.service.ts` cria automações KEYWORD "Triagem: <área>" (fila e/ou atendente), sempre desligadas; não duplica; exige fila ou atendente.
- Telas: Configurações do Chat → "SLA de resposta" e "Triagem por área (modelo)". Código: `modules/whatsapp/{sla-schema,sla-ui,triage-schema,triage-ui}`. Migração `20261122000000_chat_sla`.
- Testes: `chat-sla.test.ts` (8) + trecho no E2E do WhatsApp.
- Ainda não feito (F10): IA classificadora/rascunho com aprovação humana, leitura de áudio/imagem/documento, consulta de andamento explicada ao cliente.

## Chat — novo visual (estilo ChatGuru)

- Tela cheia em `/atendimento` (3 colunas): lista de conversas com avatar, chip "EM ATENDIMENTO"/"Encerrada", círculo vermelho de não lidas, hora (HH:mm / Ontem / dd/mm no fuso do escritório), responsável/fila/etiquetas; filtros recolhíveis; contador "Exibindo N conversas".
- Conversa com papel de parede, balões verdes (enviadas) com remetente em negrito, separadores de data, tiques de status, "Mensagem automática", menu por mensagem (Criar tarefa, Guardar no processo/cliente).
- Cabeçalho com status, Encerrar/Reabrir e botão para ocultar/mostrar o painel; compositor com emoji, respostas rápidas, anexo, texto que cresce, Enter envia, Shift+Enter quebra linha, nota interna.
- Painel lateral com abas por ícone (Contato, Processo, Agenda, Financeiro, Histórico) e bloco "Atribuição" (responsável e fila) no topo.
- Celular: a lista e a conversa alternam, com botão de voltar.
- Verificado: tsc, eslint, 536 testes, next build, E2E (31 chromium + 3 whatsapp).

## O que falta terminar (lista mestre — atualizada em 2026-10-21)

### A. Ações suas (servidor e contas) — nada de código
1. Instalar o pacote `legalos-chat-ux` no servidor (scp, backup, extrair, build, migrate, up, cron, `/api/ready`).
2. Manter a cobrança pelo WhatsApp DESLIGADA até a Dra. Talita autorizar; ligar só pelo botão em Configurações do Chat.
3. Religar o 2FA da conta lforbiano e guardar os códigos de recuperação.
4. Trocar os segredos que apareceram no chat (`scripts/server/rotate-secrets.sh`).
5. Configurar BACKUP_OFFSITE (cópia do backup fora do servidor).
6. Configurar SMTP e rodar `mail-test`.
7. Fazer um ciclo completo no Asaas sandbox (cobrança, pagamento, baixa).
8. Importar andamentos do Astrea: `--only andamentos --dry-run`, conferir, depois `--yes` (escritório a9a312af-3ad5-4cd2-9954-72c57a244e3f).

### B. Chat (WhatsApp) — próximas fases
7. Vários números no mesmo chat.
8. Relatórios do Chat (volume, tempo de resposta, por atendente/fila).
9. Resumo de conversa por IA (Claude), com botão ligar/desligar.
10. Follow-ups e mensagens agendadas (cada automação com botão ligar/desligar).
11. Pesquisa de satisfação (NPS).
12. Exportação de conversas.
13. Formulários dentro do chat.

### C. Novas frentes pedidas (ordem sugerida)
14. Assinatura eletrônica por integração (ZapSign, Autentique, D4Sign ou Clicksign — escolher uma).
15. Consulta processual para o cliente: autenticada (número + código por WhatsApp), andamentos em linguagem simples, aprovados pela equipe antes de aparecer; reaproveita o portal do cliente.
16. E-mail profissional dentro do app: cliente IMAP/SMTP e Gmail/Outlook por login seguro, e-mail vinculado a cliente/processo; sem servidor de e-mail próprio.
17. Documentos e produtividade: editor Word/Excel embutido (OnlyOffice ou Collabora) e integração com Google Drive/OneDrive.

### D. Decidido NÃO fazer
CRMs externos, construtor visual de fluxos, monitoramento ao vivo de atendentes, servidor de e-mail próprio, reconstruir Word/Excel do zero.

### Regras que valem para tudo
Nada de dado, integração ou IA falsos; nada enviado ao cliente sem autorização; toda automação com botão ligar/desligar; nada é dado como pronto com erro de tsc, lint, build ou teste.

## Comparação com o Astrea (feita em 2026-10-21, leitura no sistema real)

Lacunas encontradas (o que o Astrea tem e o LegalOS ainda não):
- E1. Tratamento de publicações com sugestão de IA (prazo sugerido, tratar/descartar, contadores do dia, aviso de nome não monitorado, quem recebe cada publicação).
- E2. Quadro Kanban de gestão (colunas, filtros por mês/responsável, cartões).
- E3. Workflows prontos do escritório (contrato novo, encerramento com acordo, encerramento por condenação).
- E4. Central de alertas com abas (publicações, andamentos, processos, tarefas, agenda, financeiro, portal, integração).
- E5. Painel de indicadores (atrasados por tipo, movimentação 7/30/60/90 dias, evolução da carteira, processos por cliente, pessoais).
- E6. Jurisprudência por IA (precedentes, comparação entre tribunais, jurimetria).
- E7. Geração de peças por IA.
- E8. Processo mais rico: honorário no processo, apensos, recursos por grau, valores/provisão corrigidos, histórico consolidado.
- E9. Financeiro: saldo do dia, parcelas, várias contas, boleto no fluxo, fluxo de caixa anual (realizado e previsto por categoria), faturas a faturar/emitidas.
- E10. Aniversariantes, timesheet com relatório, equipes (ex.: Previdência), 2FA obrigatório por escritório.
- E11. Exportação geral para Excel/Planilhas.
- E12. Botão "enviar por WhatsApp" dentro do processo e do financeiro.
- E13. Modelos de documento do escritório (procuração PF/PJ, hipossuficiência, contratos de honorários) — conferir se já foram importados como modelos no LegalOS.
- E14. Certificado digital cadastrado (já temos o módulo; falta migrar o certificado da Dra. Talita, válido até 03/09/2027).

Pontos de segurança no Astrea (não repetir os valores): senhas anotadas em texto livre em tarefas e atendimentos; 15 usuários ativos como Coordenador com permissão de administrador. No LegalOS: cofre para credenciais de clientes e perfis com o mínimo de acesso.

Não vistos por falta de acesso: criação de peça (créditos do Astrea acabaram), página Argo, Plano de uso.

## 2.0-F1 — Publicações (entregue)

- Contadores do dia na Caixa de entrada (`noticeDayCounts`, fuso do escritório, respeita sigilo): não tratadas de hoje, não tratadas (todas), tratadas hoje, descartadas hoje. Testids `inbox-day-counts`, `day-*`.
- Aviso de captura (`monitorProblems`): monitoramento ligado que falhou na última vez, nunca foi verificado (após 2 h) ou está há mais de 36 h sem verificar. Quem vê a caixa de entrada vê o aviso; link para Integrações só para quem administra. Testid `inbox-monitor-alert`.
- Quem recebe (`setMonitorRecipients`): por monitoramento, um membro ativo com acesso à caixa OU uma equipe; vazio = Entrada. Distribui só publicação nova; se falhar (membro sem acesso), a publicação fica na Entrada e a importação segue. Constraint no banco impede membro e equipe juntos.
- Sugestão por IA (`suggestForNotice`): só com `ai:use`, IA ligada no escritório, chave do provedor e cota; CPF/CNPJ mascarados; texto da publicação tratado como dado (anti-injeção); devolve resumo, providência (PRAZO/TAREFA/NENHUMA/REVISAR), título, dias e contagem quando o texto diz. NÃO cria nada: abre o formulário de tarefa ou de prazo já preenchido; o prazo continua rascunho até validação humana. Auditoria registra o uso, nunca o conteúdo. Sem chave ou com IA desligada, a tela explica o motivo (testid `suggest-off`).
- Testes: `notice-desk.test.ts` (6) e E2E da Caixa de entrada ampliado. Total: 542 testes, 34 E2E.


## Versão 4.0.0 (implementada, fase F11 pendente)
Plano em `docs/roadmap-4.0.0.md`. Migração `20261216000000_chat_4_0`. Estado: F1–F10 feitas; F11 (telas do ChatGuru ainda não vistas) a fazer. Lista em `PHASES_4` (`src/lib/updates.ts`).
- **Serviços:** `chat-tools.service.ts` (etiquetas prontas, menção, encaminhar, biblioteca, checklists, status, arquivamento), `chat-dialogs.service.ts` (diálogos TIMER/BIRTHDAY/HEARING/HOURS, entrega ao responsável, intenções por pontuação), `chat-campaigns.service.ts` (rascunho → aprovação → lote de 20/min), `chat-transcribe.service.ts` + `lib/ai/gemini.ts` (Gemini, 2 créditos por áudio, cache por mensagem), `chat-report.service.ts` (`chatReportExtra`, resumo agendado por e-mail), `org-security.service.ts` (IP permitido, inatividade, sessões, módulos por plano).
- **Rotina:** tudo dentro de `runChatExtras` (cada parte isolada: falha numa não derruba as outras). Sem job novo.
- **Segurança:** `loadTenant` aplica IP/inatividade (`accessBlocked`); `/acesso-bloqueado`; ligar a restrição de IP exige o IP de quem configura na lista; módulos por plano via `Plan.features` com prefixo `mod:` (sem nenhum `mod:` = tudo liberado).
- **Testes:** `f4-chat-40.test.ts` (13).
- **Não verificado / limites:** Gemini só contra simulador (modelo padrão `gemini-2.5-flash` não conferido na conta real); status de campanha muda no envio, não pelo recibo; lista de conversas não exibe o status de chat; relatório por dia em UTC; resumo por e-mail sem anexo (a fila de e-mail não suporta anexos).


## 2.0-F14 — Avisos no celular (push)
- **Banco:** migration `20261123000000_push` (`push_settings`, `push_subscriptions` com endpoint único, `push_preferences` por escritório+pessoa, `push_deliveries` única por pessoa+item).
- **Código:** `src/server/services/push.service.ts` (`runPushDue`, `sendTest`, `subscribe`, `savePrefs`, `saveOrgPush`), `src/modules/push/{push-schema,actions,push-card}`, cartão em `/conta`, rota `src/app/api/cron/push-due/route.ts`, JOBS `push-due` (15 min, manual), `public/sw.js` v2 com `push` e `notificationclick`.
- **Regras:** nasce desligado por escritório (`organization:manage`, auditoria `push.enable/disable`); cada pessoa ativa no aparelho (máx. 5; `push.subscribe/unsubscribe/test` na auditoria); texto só com contagens (nunca nome de cliente/processo); envia só 7h–20h no fuso do escritório; um aviso por item e etapa (a vencer/hoje/atrasado), atrasados há mais de 3 dias ignorados; aparelhos recusados (404/410) são removidos; endpoints só de Google FCM, Mozilla, Apple e Windows; teste limitado a 1 a cada 20 s e funciona mesmo com o escritório desligado.
- **Servidor:** exige `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; sem elas a tela avisa a TI e trava o ligar/ativar. Passo a passo em `docs/push.md`; rotina via `install-cron.sh`.
- **Testes:** `push.test.ts` (7, com `web-push` simulado) e `push.spec.ts` (E2E da tela). **Não testado em aparelho real** (precisa HTTPS, chaves e celular): o teste de ponta a ponta é o botão "Enviar notificação de teste".


## 2.0-F15 — Comunicados do developer
- **Banco:** migration `20261124000000_comunicados` (tabela `announcements`; coluna `push_preferences.announcements`, padrão ligada).
- **Código:** `src/server/services/announcement.service.ts` (`previewAnnouncement`, `sendAnnouncement`, `listAnnouncements`), `src/modules/platform/{announcement-schema,announcement-form}`, ações em `developer-actions.ts`, aba **Comunicados** em `/admin/developer`. Preferência "Receber comunicados da plataforma" no cartão de avisos de Minha conta.
- **Regras:** só super-admin com 2FA; públicos: todos / um escritório / uma pessoa (e-mail); cada pessoa uma vez (no primeiro escritório ativo dela); suspensos e desativados ficam de fora; o envio só vale confirmando o número de destinatários mostrado na conferência; máx. 5 por hora por developer; mesmo título + público em 10 min é barrado; push só para quem não desligou comunicados; texto fora da auditoria (`platform.announcement_send` guarda público, tipo e contagens). A tela alerta para não colocar dados de clientes (o texto passa pelo serviço de push).
- **Fora desta entrega:** agendamento de comunicados.
- **Testes:** `announcements.test.ts` (6, `web-push` simulado) e passo novo em `developer.spec.ts`.
- **Roadmap 5.0:** `docs/roadmap-5.0.0.md` registra as ideias de futuro (lista `PHASES_5`).


## 2.0-F6 — Pequenos itens
- Migração `20261125000000_pequenos_itens` (`organizations.require_mfa`). Sem novas tabelas.
- **Aniversariantes:** aba na Central de alertas (clientes PERSON ativos, hoje a +7 dias, fuso do escritório); não entra no total "pedindo atenção"; botão de parabéns por WhatsApp com texto editável.
- **2FA obrigatório:** `setRequireMfa` (organization:manage; exige 2FA do próprio dono); `Tenant.mfaBlocked` em `loadTenant`; `requireTenant` redireciona para `/exigir-2fa`, `getTenant` das rotas de API devolve vazio (401); a tela de bloqueio só segue depois de o usuário guardar os códigos; `disableMfa` recusa enquanto algum escritório exige. Só perfis não-CLIENT.
- **Exportação:** `/api/export?tipo=clientes|processos|tarefas|lancamentos&formato=xlsx|csv`, XLSX próprio via JSZip (texto, sem fórmulas), limite 5.000, 10/min, processos confidenciais respeitados; relatórios aceitam `formato=xlsx`.
- **WhatsApp:** `sendToClient` (revisado por pessoa; Meta fora de 24 h → recusa; QR sem janela); botão no processo e no cliente; auditoria sem o texto.
- Limites: sem agendamento de parabéns automáticos (próxima versão); XLSX sem formatação rica.
- Testes: unit 5 + integração 6 + e2e 2 novos; totais 589 unit/integração e 43 e2e.

## 6.0.0 — RUTE (só plano)
- `docs/roadmap-6.0.0.md` (9 fases: MCP somente leitura, conexão das IAs, propostas com confirmação, aba própria de IA, assistente embutido, IA nas telas, biblioteca, governança, ações de maior risco). Nada implementado.
- Página `/produto` mostra o RUTE como **"Em planejamento"**, com logotipo (preto, branco e vermelho) e aviso de que ainda não está disponível. Painel do developer lista as fases 6.0.

## Infra — publicação automática (GitHub → servidor)
- `.github/workflows/deploy.yml` (após o CI verde no `main`, ambiente `production` com aprovação opcional), `scripts/server/deploy-entry.sh` (comando único permitido à chave de deploy) e `scripts/server/deploy.sh` (trava, backup, cópia para voltar, rsync, build, migração, `up`, espera `/api/ready`, rollback do código, install-cron). Guia em `docs/deploy-github.md`.
- Limites: scripts validados só com `bash -n`; **nunca rodaram no servidor real** (acompanhar a primeira vez). O CI do GitHub também ainda não rodou lá. Rollback restaura código, não migração.

## 3.0-F1 — Partes únicas, campos personalizados, acervo e notas (entregue)
- **Migração** `20261126000000_legalmail_f1`: `party_registry`, `custom_field_defs`, `case_notes`; colunas `cases.archived_at`, `cases.custom_fields`, `case_parties.registry_id`.
- **Código:** serviços `party-registry`, `custom-field`, `case-note` (+ `setCaseAcervo` e filtro `acervo` em `case.service`); telas `/partes`, `/configuracoes/campos`, `/processos/nota-em-lote`, aba *Notas* e cartão *Campos personalizados* no processo, seletor do cadastro no formulário de parte.
- **Regras:** leitura = `cases:read`; escrita = `cases:write`; definir campos = `organization:manage`. Nota em lote: máx. 50, tudo ou nada, sigilo e escritório respeitados. Exclusão de parte do cadastro é lógica (processos mantêm a cópia).
- **Testes:** `legalmail-f1.test.ts` (11) + `legalmail-f1.spec.ts` (1 E2E). Total: tsc/eslint limpos, 600 testes, 44 E2E, build ok.
- **Fora desta fase:** anexos e histórico das notas (vão com 3.0-F2).

## 3.0-F3 — Timbrados, variáveis novas e prévia em PDF (entregue)
- **Migração** `20261127000000_legalmail_f3` (`letterheads`, um padrão por escritório por índice único parcial). Dependência nova: `pdf-lib`.
- **Código:** `lib/templates/{letterhead,docx,pdf}.ts`, `letterhead.service.ts`, `template.service.ts` (`previewTemplatePdf`), rota `/api/templates/preview`, tela `/documentos/timbrados`, seletor de timbrado e botão de prévia em `/documentos/gerar`.
- **Regras:** ler = `documents:read`; criar/editar/excluir = `templates:manage`; gerar/prévia = `documents:write`. Logo conferido pelos bytes (PNG/JPEG), até 300 KB. Prévia respeita sigilo e escritório.
- **Fora:** prévia de .docx anexado a petição (sem conversor no servidor).
- **Google Drive/Docs** virou a fase 3.0-F3b. Desenho decidido: opcional e por escritório — cada escritório cola o próprio Client ID/Secret OAuth em Configurações → Integrações (secret criptografado, liga/desliga), escopo `drive.file`; nada de chave global no servidor.

## 3.0-F4 — Importação de processos em lote (entregue)
- **Migração** `20261128000000_legalmail_f4` (`case_import_batches`, `case_import_items`).
- **Código:** `lib/case-import.ts` (leitura dos números), `case-import.service.ts` (`createImportBatch`, `processBatchStep`, `getImportBatch`), telas `/processos/importar` e `/processos/importar/[id]`, botão em Processos.
- **Regras:** `cases:write` (autos exigem também `documents:write`); máx. 200 números por lote; cada item falha sozinho; DataJud: 5 por passo; autos: 2 por passo (MNI, até 25 documentos por processo e por passo); sem progresso, o item encerra para não repetir sem fim. Sigilosos nunca vão a serviços externos.
- **Limite honesto:** o MNI e o DataJud só foram exercitados com simuladores nos testes; o teste real depende da conexão e da chave do escritório.


## 3.0-F2 — Tarefas 2.0 (entregue)
- **Migração** `20261129000000_legalmail_f2` (`task_types`, `task_labels`, `task_label_links`, `task_events`, `task_attachments`, `tasks.type_id`, `task_comments.mentioned_ids`).
- **Código:** `task-extras.service.ts` (tipos, etiquetas, classificação, histórico, anexos, `pointsReport`), `task-event.ts`, ganchos de histórico e menções em `task.service.ts`, `modules/tasks/{extras-schemas,extras-actions,extras-ui,mentions}`, tela `/configuracoes/tarefas`, cartões na tarefa, filtros/pontuação em `/tarefas`, rota `/api/tasks/attachments/[id]`, script `verify:fast`.
- **Regras:** tipos/etiquetas: criar/editar/excluir = `organization:manage`, ler = `tasks:read`; classificar/anexar/comentar = `tasks:write`. Menção só a membros ativos do escritório, pelo nome completo; quem se menciona não é avisado. Pontos contam tarefas concluídas no mês com tipo. Anexos: lista de tipos dos documentos, 8 MB, sigilo do processo respeitado.
- **Testes:** `legalmail-f2.test.ts` (6), `task-mentions.test.ts` (3), `legalmail-f2.spec.ts` (1 E2E). Total: 626 testes, 48 E2E.
- **Fora:** anexos e histórico das notas de processo.

## 3.0-F5 a F8, F6b, F9, F10, F3b e notas (entregues, testadas só com simuladores)
- **F5** fila de protocolos, recibo, agendamento (`20261130000000`). **F9** certificado com usuários autorizados + webhooks `petition.submitted/failed` (`20261201000000`). **F10** créditos (`20261202000000`; `credit.service.ts`, `/configuracoes/creditos`, controle na plataforma). **F6b** credenciais por tribunal/usuário (`20261203000000`; `court-credential.service.ts`). **Notas** com edição/anexos/histórico (`20261204000000`). **F3b** Google Drive opcional por escritório (`20261205000000`; `google-drive.service.ts`, `src/lib/google/drive.ts`, rotas `/api/integrations/google/{start,callback}`). **F8** classificação por IA (`20261206000000`; `doc-classify.service.ts`, `/documentos/classificar`).
- **F7** `monitoring.service.ts` (`getMonitoringOverview`, `runMonitoringCheck`), página `/monitoramento`, rota `/api/cron/monitoring` (job `monitoring`, a cada 30 min; **reinstalar `install-cron.sh`**). Fonte parada = ligada e sem execução há mais de 36 h. Alerta `MONITORING_ALERT` deduplicado por fonte+última execução.
- **F6** `court_system_maps` (`20261207000000`), `src/lib/connectors/registry.ts`, `court-system-map.service.ts`, página `/configuracoes/tribunais`. `assertConnectorFor` recusa petição em tribunal mapeado para sistema sem conector; sem mapa, nada muda.
- **Não validado em ambiente real:** protocolo MNI em tribunal, Google (credenciais do escritório), IA (chave), monitoramento em produção. **F11** aguarda as telas do LegalMail.

## 2.0.0 — fechamento (2026-10-21)
- Verificado: 732 testes de integração/unidade passando, `tsc`, `eslint` e `next build` limpos. Não rodei os E2E (Playwright) desta entrega.
- Fases F3, F4, F5, F7, F8, F9, F10, F11 e F12 concluídas (ver `docs/roadmap-2.0.0.md` e `CHANGELOG.md`). Migrações: `20261208000000_f3_kanban` até `20261215000000_f11_cofre`.
- Só com simulador (confirmar em produção): índices do Banco Central (o sandbox bloqueia o acesso), IA (chave do provedor), números por QR-Code, mensagens agendadas e envio pela Meta.
- Limites honestos: IA não consulta base de jurisprudência (gera mapa de pesquisa e remove números de processo); anexos de documentos do Astrea não existem no backup (só link); relatório "por dia" usa UTC.
- `rotate-keys` passou a cobrir credenciais de tribunais e cofre de clientes (lacuna da 3.0 corrigida).
