# Segurança, LGPD e auditoria

> O software oferece recursos de segurança, mas **não é "certificado" nem automaticamente conforme à LGPD**. Conformidade depende também de processos, contratos e do uso pelo escritório (controlador). Responsabilidades devem ser formalizadas (contrato SaaS / DPA) antes de produção.

## Implementado na Fase 1

| Controle | Detalhe |
|---|---|
| Isolamento por organização | `TenantContext` só no servidor; serviços filtram por `organizationId`; testes de integração tentam IDOR entre escritórios (`tenant-isolation.test.ts`) e falham de forma segura (404/403) |
| Autorização no servidor | Permissões `recurso:ação` verificadas em cada serviço (`assertCan`); UI apenas esconde |
| Anti-escalonamento | Só concede o que possui; Proprietário protegido; último Proprietário protegido |
| Senhas | scrypt N=2^15, salt por senha, comparação em tempo constante, política mínima (10 caracteres, letras+números) |
| Sessões | Token opaco 256 bits, só o hash no banco; revogação individual/em massa; revogadas ao redefinir senha; expiração absoluta de 14 dias; cookie httpOnly/SameSite=Lax/Secure+`__Host-` em produção |
| Anti-enumeração | Login com mensagem única e timing igualado; recuperação de senha com resposta idêntica. *Exceção consciente:* o cadastro informa e-mail já existente (UX) e é limitado por taxa |
| Convites | Token de uso único, 7 dias, atrelado ao e-mail, consumo atômico (testado com concorrência), respeita limite de usuários do plano |
| Limitação de taxa | Login, cadastro, recuperação, convites, busca — **em memória, por processo** (trocar por Redis ao escalar horizontalmente) |
| CSRF | Server Actions do Next verificam `Origin`; cookie `SameSite=Lax` |
| XSS/Injeção | React escapa por padrão; Prisma parametriza; sem `dangerouslySetInnerHTML` além do script de tema (conteúdo constante) |
| Open redirect | `safeNext` aceita só caminhos internos (testado) |
| Cabeçalhos | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS em produção |
| Processos sigilosos | `caseVisibility()` aplicado a toda leitura de processo e de filhos (partes, equipe, linha do tempo, documentos, listas, busca, dashboard): só equipe do processo e quem tem `organization:manage`. Quem cadastra mantém acesso; ninguém se remove de processo sigiloso sem ser administrador (testado) |
| Documentos | Armazenados fora de `public/`; download só por rota autenticada que revalida escritório, permissões e sigilo; `Content-Disposition: attachment`, `nosniff`, `no-store`; tipo por **lista de permissão de extensões + conferência da assinatura do conteúdo**; MIME definido pelo servidor; nome sanitizado; limite de 8 MB; upload e download auditados; POST confere `Origin` e tem limite de taxa |
| Prazos e tarefas (Fase 3) | Prazos só viram definitivos com validação humana por permissão dedicada (`deadlines:validate`); transições com checagem de estado atômica; tarefas/prazos/compromissos de processos sigilosos seguem a visibilidade do processo; notificações só para o dono e com link interno validado (CHECK no banco e no serviço) |
| Intimações (Fase 4) | Visíveis a quem tem `inbox:read`; as vinculadas a processo sigiloso seguem a visibilidade do processo; texto colado nunca é executado (renderizado como texto); análise de texto é só sugestão; vínculo automático só com processos visíveis ao usuário; origem de tarefa/prazo validada no escritório; distribuição restrita a membros com acesso à caixa |
| Integridade multi-tenant | FKs compostas `(id, organization_id)` no banco (ver `data-model.md`) |
| Logs | JSON estruturado, correlation id (`x-request-id`), mascaramento por nome de chave (senha/token/cpf/…); e-mail em produção **não** registra corpo/links |
| Auditoria | `audit_logs`: login/falhas, cadastro, redefinição de senha, convites, alterações de perfis/membros/escritório, com usuário, IP, user-agent, correlation id e resultado |

## Lacunas conhecidas (não declarar como prontas)

- **MFA** não implementado. **Verificação de e-mail** existe mas não bloqueia o uso (convite aceito comprova controle do e-mail).
- **Envio de e-mail real** não configurado: o driver `console` não entrega; a UI avisa e mostra o link do convite para cópia.
- **CSP** não definida (requer nonces com o script de tema/Next); planejada na Fase 9.
- **RLS PostgreSQL:** avaliada, não implementada. Requisitos: papel de aplicação sem `BYPASSRLS` e não-dono das tabelas, `FORCE ROW LEVEL SECURITY`, `set_config('app.org_id', …, true)` por transação (extensão do Prisma Client) e funções `SECURITY DEFINER` para fluxos entre escritórios (login, aceite de convite). Planejada como defesa em profundidade.
- **Uploads:** sem antivírus/antimalware; armazenamento em disco local (adaptador único) — para produção multi-instância usar object storage privado com URLs assinadas e varredura de malware (Fase 5/9). Arquivos de documentos excluídos permanecem em disco (retenção) até uma política de expurgo (Fase 9). Conferência por assinatura não impede arquivos maliciosos bem formados (ex.: PDF com script).
- Rate limit distribuído: Fase 9.
- Backups, retenção/anonimização (LGPD), gestão de incidentes, lista de suboperadores: Fase 9 (documentar antes de produção).
- Segredos: nenhum no repositório; `DATABASE_URL` por ambiente. Quando houver provedores (IA, e-mail, storage), usar `IntegrationCredentialReference` e cofre/variáveis do ambiente — nunca no frontend.

## Fase 5 — documentos, modelos e peticionamento

- **Versões:** cada versão é um arquivo novo com chave aleatória; nada é sobrescrito. Download de qualquer versão exige `documents:read`, escritório e sigilo do processo (404 para outro escritório) e é auditado com o número da versão.
- **Modelos:** campos limitados a um catálogo fixo (sem execução de código nem expressões); valores inseridos não são reinterpretados (sem injeção de campos); a geração só lê processo/cliente visíveis ao usuário; criar/editar exige `templates:manage`.
- **Peticionamento:** transições de estado atômicas (`updateMany` com estado esperado); a versão aprovada é a única enviada; aprovação e envio exigem `petitions:approve`; reserva `SUBMITTING` impede envio duplo; todas as etapas geram evento na linha do tempo e auditoria. O adaptador de demonstração é explicitamente marcado e **não faz chamadas externas**.
- **Pendências:** sem antivírus, sem URL assinada/object storage, sem política de expurgo; sem dupla aprovação obrigatória; credenciais/certificados de tribunal (Fase 8) exigirão cofre de segredos próprio.

## Cofre de certificados (motor de tribunais, etapa 0)

- A1 cifrado com AES-256-GCM (chave `CERT_ENCRYPTION_KEY`, distinta da do MFA); só hash/metadados na listagem; revogar apaga o material; envio/revogação exigem 2FA; uso registrado e auditado (sem segredos nos logs); senha trafega só no envio por HTTPS.
- Pendências: HSM/KMS, rotação da chave de cifra, worker isolado em rede própria, aprovação dupla para protocolar.

## Fase 9a — MFA, bloqueio e CSP

- 2FA TOTP com segredo cifrado (AES-256-GCM), recuperação em hash, desafio de login de 5 min com 5 tentativas e anti-replay; `login()` simples **recusa** contas com 2FA (não há atalho). Bloqueio de 15 min após 5 falhas, no banco. CSP com nonce por requisição.
- Pendências: política de 2FA obrigatório por escritório, WebAuthn, alertas por e-mail, limitador de taxa compartilhado (Redis), RLS no PostgreSQL.

## Fase 8c — DataJud

- Opt-in por escritório (`integrations:manage`) e chave só no servidor; a chave nunca é registrada. Só o número CNJ é enviado; processos sigilosos são recusados antes de qualquer chamada; escrita exige `cases:write` e visibilidade do processo; importação idempotente; auditoria `datajud.*`.

## Fase 8b — OCR e busca no conteúdo

- Tudo local: nenhum arquivo sai do servidor para extrair texto. `tesseract`/`pdftotext`/`pdftoppm` são chamados com `execFile` (sem shell), argumentos fixos, arquivos temporários em pasta privada apagada ao final, tempo limite e teto de memória.
- O formato é decidido pelo tipo já validado no upload (assinatura do arquivo), não pelo nome informado pelo usuário no momento da extração.
- Busca e leitura passam pelas mesmas regras de visibilidade dos documentos (escritório, sigilo, permissão do dono do documento). O texto extraído é dado sensível: fica no mesmo banco do escritório e entra nos backups.
- **Pendências:** sem antivírus; PDF malicioso depende da robustez do poppler/tesseract do servidor (mantenha atualizados); sem limite de taxa específico para extração; texto de documentos excluídos permanece até expurgo (exclusão lógica).

## Fase 8a — IA

- **Opt-in** por escritório (`organizations.ai_enabled`, só `integrations:manage` altera, auditado) e chave apenas no servidor (`ANTHROPIC_API_KEY`), nunca exposta ao navegador nem registrada em log.
- **Minimização:** contexto montado no servidor com as mesmas regras de visibilidade das telas (sigilo, permissões por módulo, isolamento por escritório); sem CPF/CNPJ, sem conteúdo de arquivos; tamanhos limitados.
- **Prompt injection:** conteúdo de processos/intimações vai dentro de `<contexto>` declarado como dado; o modelo é instruído a citar fontes e a não inventar; a resposta nunca aciona ações no sistema (somente texto).
- **Privacidade:** pergunta e resposta não são persistidas; auditoria e `ai_usage` guardam só quem, quando, processo e tokens. O envio ao provedor deve constar na política de privacidade do escritório (LGPD).
- **Pendências:** sem redação/pseudonimização de nomes, sem DPA/contrato com provedor no produto, cota não é estritamente atômica.

## Fase 7 — Financeiro

- **Autorização no servidor:** `finance:read` consulta; `finance:write` lança, edita e dá baixa; `finance:manage` cria cadastros, cancela e estorna (ações destrutivas exigem motivo escrito). A interface esconde o que a pessoa não pode fazer, mas a checagem real está nos serviços.
- **Integridade do dinheiro:** `numeric(14,2)` + aritmética em centavos (BigInt); baixa por UPDATE condicional atômico (`paid_amount + x <= amount`) — duas baixas simultâneas não passam do valor; situação e valores protegidos também por CHECK no banco; sem DELETE de lançamentos/baixas (estorno e cancelamento preservam histórico); toda mutação é auditada.
- **Isolamento:** todas as consultas filtram por `organization_id`; referências (conta, categoria, cliente, processo) são validadas dentro do escritório e FKs compostas recusam referência cruzada; título de processo sigiloso é ocultado de quem não tem acesso a ele.
- **Pendências:** sem dupla aprovação para estornos/cancelamentos, sem trava de período fechado, sem exportação auditada (Fase 9).

## Fase 6 — CRM, automações e portal do cliente

- **Portal:** acesso exige permissão `portal:access` **e** conta ativa em `portal_accounts` ligada a um cliente do mesmo escritório; toda consulta filtra por `organization_id`, por compartilhamento explícito (`shared_with_portal`) e por o cliente ser parte do processo. Itens não compartilhados, de outros clientes ou de outros escritórios respondem 404. Download pela rota `/api/portal/documents/[id]` (só a versão atual, `attachment`, `nosniff`, auditado).
- **Convites do portal** ficam amarrados ao cliente (`client_id`), expiram em 7 dias, são de uso único e não podem ser criados pelo fluxo comum de equipe com o perfil CLIENT; e-mail de membro da equipe não pode virar conta de cliente.
- **Automações:** executam com o contexto de quem disparou a ação, em melhor esforço; criam tarefas sem exigir `tasks:write` de quem disparou (a regra foi criada por quem tem `workflows:manage`); responsável sem acesso a processo sigiloso é descartado.
- **Pendências:** sem MFA para contas de cliente; sem política de expiração de sessão específica do portal; links de convite exibidos na tela enquanto não houver e-mail real.

## Motor de tribunais — conector MNI
- Conexões só com `integrations:manage`; cadastrar e remover exigem 2FA; senha cifrada com a chave do cofre e nunca devolvida.
- SSRF: https obrigatório, apenas nomes de domínio, bloqueio de IPs privados/loopback na resolução de DNS, limite de 20 MB e 60 s por chamada.
- Não abre teor de intimação (evita ciência e início de prazo sem decisão humana); processos sigilosos nunca consultados.
- Pendência: sem validação em tribunal real; certificado em memória do processo durante a chamada.

## Captura do DJEN
- Rotas `/api/cron/djen` e `/api/cron/mni`: desligadas sem `CRON_SECRET`; exige segredo de no mínimo 24 caracteres com comparação em tempo constante; resposta só traz contagens.
- Cada execução automática usa o contexto de quem criou o monitoramento e é recusada se essa pessoa perdeu acesso.
- Cliente HTTP: https obrigatório (http só em teste), sem redirecionamentos, limite de 20 MB e 30 s.

## Caixas de trabalho
- Devolver exige ser o responsável ou membro da equipe responsável; notas só são apagadas pelo autor ou pelo proprietário; equipes só aceitam membros ativos do escritório com acesso à caixa; todas as operações são auditadas e respeitam a visibilidade (sigilo) do processo.

## Painel da plataforma (`/admin`)
- Super-administradores existem só na tabela `platform_admins`, criada por script; sem 2FA ativo não há acesso. Não-admin recebe 404. Cada função do serviço revalida (defesa em profundidade).
- Sem acesso a conteúdo: apenas contagens/estados; auditoria sem `metadata`; sem personificação de usuários; chaves só como configurada/ausente.
- Suspensão de escritório é aplicada na resolução do contexto de tenant, na lista de escritórios, no login e nas rotinas automáticas; desativar usuário revoga todas as sessões.
- Ações de administração são auditadas (`platform.org_suspend|org_reactivate|user_disable|user_enable|user_unlock|admin_grant|admin_revoke`).
- Pendência: o painel não tem rate limit próprio além do geral; não há alerta automático para novas concessões de super-admin.

## API pública e chaves de API
- Token de 256 bits aleatórios; só o hash SHA-256 é guardado (comparação em tempo constante, inclusive quando o prefixo não existe); mostrado uma única vez; nunca vai para logs nem para a auditoria.
- Criar e revogar exige `integrations:manage` e 2FA. Cada escopo exige também a permissão equivalente do criador no momento da criação **e** a cada requisição (se o perfil perder a permissão, o escopo some).
- A chave usa o contexto de tenant do criador: isolamento por escritório e sigilo de processos valem como na tela; escritório suspenso, usuário desativado ou vínculo suspenso derrubam a chave.
- Rotas `/api/v1` são públicas para o proxy (sem cookie, sem CSRF por não usarem sessão) e se autenticam sozinhas; respostas `no-store`; limite de 120/min por chave e 30 falhas/min por IP (em memória do processo — pendência: Redis para várias instâncias).
- Pendência: sem rotação automática de chaves nem alerta de uso anômalo; a validade é opcional.

## Webhooks
- Segredo de assinatura aleatório de 256 bits, mostrado uma vez, guardado cifrado (AES-256-GCM); o envio assina `t.corpo` com HMAC-SHA256 (anti-replay pelo timestamp, a verificar no receptor).
- Proteção contra SSRF: https obrigatório, domínio público, DNS revalidado na conexão (bloqueia loopback, redes privadas, link-local/metadata), sem redirecionamentos, TLS verificado, tempo limite de 10 s. Mensagens de erro não revelam detalhes da rede.
- Carga contém só identificadores (nunca conteúdo de intimações, nomes ou valores). Criar/remover exige `integrations:manage` e 2FA; tudo auditado (`webhook.create|enable|disable|delete|test`).
- A rota `/api/cron/webhooks` exige `CRON_SECRET` (≥24 caracteres, comparação em tempo constante).
- Pendência: sem lista de IPs de origem fixa para o receptor liberar no firewall; sem rotação de segredo (apague e crie outro).
## Relatórios e exportações
- Cada relatório exige `reports:read` e a permissão do módulo; processos sigilosos (e o que se liga a eles) só entram para quem os vê; consultas sempre filtradas por `organization_id`.
- Exportação CSV auditada (`report.export`), limitada a 20/min por usuário, com neutralização de células que começam com `=`, `+`, `-`, `@` (injeção de fórmula) e `cache-control: no-store`.
- Pendência: o arquivo baixado sai do controle do sistema (o usuário responde pelo seu manuseio, LGPD); sem marca d'água nem exportação com aprovação.
