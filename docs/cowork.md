# LegalOS Cowork — relatório técnico e arquitetura

**Escopo desta entrega:** Cowork 1.0 (comunicação humana) e Cowork 2.0 (gestão do trabalho), com reuniões e videoconferência LiveKit (ligada só quando configurada) e a arquitetura preparada para agentes. Os agentes de IA não foram implementados.
**Situação:** implementado e testado na branch `claude/cowork`, ainda não publicado. A videoconferência com LiveKit está implementada e validada com servidor local, mas **fica desligada** até a implantação do servidor de mídia em produção (ver §5.4).

---

## 1. Auditoria do LegalOS existente

| Área | O que existe e foi reaproveitado | Lacuna resolvida |
|---|---|---|
| Next.js 16 / TypeScript / Prisma 6 / Postgres 16 | Monólito modular (`src/server/services`, `src/modules`, `src/app`), adapter `pg` e migrações SQL próprias (`src/lib/db/migrate.ts`, tabela `_legalos_migrations`). | Migração aditiva `20270119000000_cowork`. |
| Autenticação e sessões | Sessão por cookie httpOnly; `requireTenant()`/`getTenant()` montam o `TenantContext` no servidor e revalidam o vínculo (`Membership`) a cada requisição. | O Cowork não tem autenticação própria: usa o mesmo `TenantContext`. |
| Organizações e usuários | `organizationId` em toda entidade; `Membership` ATIVO; `resolveTenantContext`. | Perfil de exibição (`cowork_member_profiles`) sem criar credencial paralela. |
| Perfis e permissões | Catálogo `recurso:ação` (`src/lib/permissions/catalog.ts`), perfis de sistema e perfis personalizados. | 8 permissões `cowork:*` (§3), concedidas aos perfis de sistema pela migração. |
| Departamentos | `DEPARTMENTS` do Evolution (menu), `WorkTeam` (equipes), `CaseDepartment` (área do processo). Não havia departamento por pessoa. | Departamento e cargo por pessoa no perfil do Cowork, além do filtro por equipe (`WorkTeam`). |
| Navegação Evolution | `EvolutionSidebar`, `NAV_ITEMS`, gating por permissão no layout. | Link “Cowork” de primeiro nível com selo de não lidas; guia na Central de Ajuda. |
| Chat e notificações | Atendimento WhatsApp com **polling** (`router.refresh` a cada 3 s); `notify()` idempotente por `dedupeKey`; push só para prazos e tarefas. | Tempo real próprio (SSE + LISTEN/NOTIFY), separado do WhatsApp. O WhatsApp não foi alterado. |
| Tarefas, atividades e agenda | `createTask`, `createEvent`, `changeEventStatus`, `TaskEvent` (histórico), `ActivityCollaborator`, `taskVisibility` e `caseVisibility` (sigilo). | Mensagem e reunião viram trabalho **nesses serviços**: não há um segundo gerenciador de tarefas. |
| Processos, clientes e documentos | `assertCaseVisible`, `documentVisibilityWhere`, `classifyFile` (lista de tipos permitidos + verificação de assinatura), cota do plano. | Cartões resolvidos com as mesmas regras de visibilidade, na leitura. |
| Anexos e armazenamento | `local-storage.ts` (chave `<org>/<uuid>`, fora de `public/`), download autenticado com `nosniff`. | `cowork_attachments` + rota de download que confere participação e sigilo; anexos entram na cota do plano. |
| Produtividade e horas | `TimeEntry`, `teamWorkload`, `productivity:read`. | O painel reaproveita as horas; elas só aparecem para quem tem `productivity:read`. |
| Auditoria e logs | `audit()` com `metadata` sem conteúdo sensível. | Eventos `cowork.*` auditados sem texto de mensagem. |
| Docker, proxy e deploy | Uma instância `node server.js` (standalone), Caddy na frente (`docs/deploy-vps.md`), sem Redis. | SSE funciona com Caddy (§4.3); LISTEN/NOTIFY já suporta várias instâncias. |
| Tempo real | Não havia stream ativo (o SSE do Box foi retirado), nem WebSocket ou broker. | §4. |

---

## 2. Modelo de dados (migração `20270119000000_cowork`, somente aditiva)

| Tabela | Papel | Isolamento e integridade |
|---|---|---|
| `cowork_settings` | Habilitação, canais padrão e permissão de DMs por escritório. | PK = `organization_id`. |
| `cowork_member_profiles` | Nome de exibição profissional, cargo, departamento, disponibilidade declarada e bloqueio administrativo. | PK (`organization_id`, `user_id`). |
| `cowork_channels` | Canais (Geral, departamentais, públicos e privados), DMs (`direct_key` único) e grupos; `case_id` para sala de processo; `last_seq` para a ordem total. | `UNIQUE(id, organization_id)`, `UNIQUE(organization_id, slug)`, `UNIQUE(organization_id, direct_key)`. |
| `cowork_channel_members` | Participação, papel no canal, `last_read_seq` (não lidas) e silenciamento. | **FK composta** (`channel_id`, `organization_id`). |
| `cowork_messages` | Mensagem com `seq` por canal, thread (`parent_id`), menções, edição, exclusão lógica e `author_kind` (HUMAN/SYSTEM/AGENT reservado). | FK composta para o canal; `UNIQUE(channel_id, seq)`; `UNIQUE(channel_id, author_id, client_nonce)` (sem duplicidade). |
| `cowork_attachments` | Metadados do arquivo e `storage_key`. | FK composta para canal e mensagem. |
| `cowork_resource_refs` | Cartão compartilhado: **só (tipo, id)**, nunca título, número ou conteúdo. | FK composta para a mensagem. |
| `cowork_meetings` / `cowork_meeting_participants` | Reunião, vínculos (canal, processo, tarefa, compromisso), ata, decisões, RSVP e presença registrada. | FK composta participante → reunião; `UNIQUE(organization_id, request_key)`. |
| `cowork_work_items` | Vínculo conversa/reunião → tarefa ou compromisso criado no módulo original. | `UNIQUE(organization_id, request_key)` (idempotência). |

Permissões dos perfis de sistema: a migração acrescenta as chaves `cowork:*` aos perfis do sistema já existentes. Perfis personalizados ficam como estão, e o administrador decide.

---

## 3. Permissões e regras de acesso

| Permissão | Proprietário/Admin | Controladoria | Advogado | Financeiro/Assistente |
|---|:-:|:-:|:-:|:-:|
| `cowork:read` usar o Cowork | ✓ | ✓ | ✓ | ✓ |
| `cowork:write` enviar, responder, DMs e grupos | ✓ | ✓ | ✓ | ✓ |
| `cowork:channels` criar canais | ✓ | ✓ | ✓ | — |
| `cowork:members` gerenciar participantes e arquivar canais **públicos** | ✓ | — | — | — |
| `cowork:share` compartilhar arquivos e cartões | ✓ | ✓ | ✓ | ✓ |
| `cowork:meetings` criar e administrar reuniões | ✓ | ✓ | ✓ | ✓ |
| `cowork:insights` painel do trabalho | ✓ | ✓ | — | — |
| `cowork:manage` configurações e bloqueio por pessoa | ✓ | — | — | — |

Regras aplicadas no servidor, em toda leitura e escrita:

- **Escritório:** o contexto vem da sessão. Ids de outro escritório resultam sempre em “não encontrado”. As FKs compostas impedem, no próprio banco, gravar filhos de um canal em outro escritório.
- **Conversas privadas e DMs:** só quem participa vê, lê, busca ou baixa anexos. **Administradores não têm acesso irrestrito.** `cowork:members` só alcança canais públicos.
- **Salas de processo:** exigem participação **e** visibilidade do processo. Quem perde acesso ao processo (por exemplo, quando ele passa a sigiloso) perde a sala. Só entram participantes que enxergam o processo.
- **Cartões:** são resolvidos na leitura com a permissão de quem lê. Sem acesso, o cartão aparece como `{tipo, id, accessible:false}`, sem título, número ou data. Também não é possível compartilhar o que não se vê.
- **Menções:** só alcançam participantes da conversa e nunca concedem acesso.
- **Bloqueio individual** (`cowork:manage`) e **desligamento do Cowork no escritório**. O proprietário não pode ser bloqueado.
- **Notificações** de menção, DM e thread não levam o texto da mensagem.

---

## 4. Tempo real

### 4.1 Escolha: SSE + Postgres LISTEN/NOTIFY

| Opção | Avaliação |
|---|---|
| WebSocket | Exigiria um servidor customizado (o app roda `node server.js` standalone) e um protocolo próprio de autenticação. Descartado nesta fase. |
| Polling (como o WhatsApp) | Simples, mas com 3–15 s de atraso e carga constante. Mantido **apenas como contingência**. |
| **SSE + LISTEN/NOTIFY** | Nativo no Route Handler do Next, usa o cookie de sessão existente, atravessa o Caddy e não precisa de dependência nova (`pg` já existe). O barramento é o próprio Postgres e funciona com várias instâncias. **Escolhido.** |

### 4.2 Como funciona

1. A gravação (mensagem, edição, participação, reunião) chama `pg_notify('cowork_events', …)` **dentro da transação**: o aviso só sai no COMMIT e nunca sai de transação desfeita (há teste para isso).
2. Cada processo mantém **uma** conexão `LISTEN` (`src/server/cowork/realtime.ts`) e distribui os eventos em memória para as conexões SSE do escritório.
3. A rota `/api/cowork/stream` filtra por pessoa: só repassa eventos de canais de que ela participa. O evento leva **apenas ids** (canal, sequência, mensagem); o conteúdo é sempre buscado pelas rotas autenticadas, que conferem a permissão de novo.
4. Ordem consistente: `seq` monotônico por canal, atribuído ao incrementar `last_seq`, com trava de linha. Na reconexão, o navegador pede `?after=<último seq>` e mescla por id, então nada se perde e nada se duplica.
5. Envio sem duplicidade: o navegador gera `clientNonce`. Reenvios por clique duplo, queda de rede ou reconexão devolvem a mesma mensagem (único no banco).
6. Resiliência no cliente (`use-realtime.ts`): reconexão com espera crescente até 30 s; consulta a cada 15 s enquanto o tempo real estiver fora; indicador “Ao vivo/Reconectando/Offline”; mensagens não enviadas ficam pendentes e são reenviadas automaticamente quando a rede volta.
7. Cada conexão SSE dura no máximo 10 minutos. Ao reabrir, sessão e permissões são verificadas de novo. O número de reconexões é limitado por pessoa (`limiters.coworkStream`) e o de envios também (`limiters.coworkMessage`).

### 4.3 Requisitos de produção (Caddy)

- A resposta SSE envia `Cache-Control: no-cache, no-store, no-transform` e `X-Accel-Buffering: no`. O `reverse_proxy` do Caddy entrega `text/event-stream` imediatamente.
- **Verificar no servidor** se o `encode zstd gzip` do Caddyfile não segura o stream. Se segurar, excluir `text/event-stream` do `encode`. Se o stream não abrir, o Cowork continua funcionando pela contingência de 15 s e mostra o aviso.
- Uma conexão Postgres extra por instância do app (a de LISTEN).

---

## 5. Reuniões e videoconferência

### 5.1 Gestão de reuniões (com ou sem vídeo)

- Criar, agendar, convidar (só pessoas aptas ao Cowork) e vincular a conversa, processo ou tarefa.
- Registro na **Agenda do escritório** pelo serviço original, com os participantes como **colaboradores** do compromisso.
- Próximas e histórico, RSVP, iniciar, encerrar e cancelar (sincroniza a situação do compromisso), e presença registrada pelo anfitrião.
- Ata, decisões e encaminhamentos que viram tarefa ou compromisso com responsável e prazo.
- **Com o vídeo desligado** (padrão até a implantação), **nenhum botão de áudio, vídeo, microfone, câmera ou tela** é exibido. A página informa que a videoconferência não está habilitada (`videoConferenceStatus()` retorna `enabled: false`, o que o E2E verifica).

### 5.2 Comparativo LiveKit × Jitsi

| Critério | LiveKit (1ª opção) | Jitsi Meet |
|---|---|---|
| Integração com Next.js | SDKs `livekit-client` e `@livekit/components-react`; token JWT emitido por um Route Handler com o contexto do LegalOS. UI totalmente nossa. | Iframe (`external_api.js`) ou `lib-jitsi-meet`. O iframe traz a UI do Jitsi, menos integrada ao design system. |
| Autenticação e permissões | Token por sala com grants granulares (publicar, assinar, compartilhar tela, administrar), emitido só para participantes da reunião. | JWT (plugin `token_moderation`/prosody) mais configuração no servidor. A granularidade fina exige plugins. |
| Áudio, vídeo e tela | SFU moderno, simulcast/SVC e compartilhamento de tela. | Maduro e completo (JVB como SFU). |
| Estabilidade | Boa, com servidor em Go e reconexão no SDK. | Muito testado em produção, mas a pilha (prosody + jicofo + JVB) tem mais peças. |
| CPU, RAM e tráfego | SFU leve. Tráfego proporcional a participantes × resolução. Para salas pequenas (2–10), 2 vCPU e 4 GB atendem com folga; medir antes. | JVB em Java consome mais memória. A mesma ordem de grandeza de banda. |
| STUN/TURN | TURN embutido (TCP/TLS 443) ou coturn. Exige portas UDP liberadas. | coturn separado e portas UDP 10000. |
| Hospedagem | Própria (Docker/K8s) ou LiveKit Cloud (gerenciado). | Própria (Docker) ou 8x8 JaaS (gerenciado). |
| Custos | Própria: VM + banda. Cloud: por minuto de participante. | Própria: VM + banda. JaaS: por usuário ativo mensal. |
| Agentes de voz futuros | **LiveKit Agents** (framework para agentes de voz e tempo real), o que encaixa no Cowork 3.0/4.0. | Sem framework equivalente nativo. |
| Segurança e privacidade | DTLS-SRTP. Em hospedagem própria, a mídia fica na infraestrutura do escritório. E2EE opcional. | DTLS-SRTP. E2EE (insertable streams) no navegador. Em hospedagem própria, igual. |

**Recomendação:** LiveKit em hospedagem própria (ou LiveKit Cloud numa fase de piloto), com emissão de token por `/api/cowork/meetings/[id]/token` restrita a participantes e com o mesmo sigilo de processo. O **Meetly** foi usado apenas como referência visual: o projeto está incompleto e não teve código copiado.

### 5.3 Integração LiveKit implementada (desligada até a implantação)

**Código:**
- **Servidor** (`src/server/cowork/livekit.ts`, sem SDK de servidor):
  - token JWT HS256 no formato oficial do LiveKit, com validade de 10 min;
  - API administrativa Twirp (`RemoveParticipant`, `DeleteRoom`);
  - verificação do webhook (JWT + `sha256` do corpo).
- **Regras** (`cowork-meeting.service.ts`):
  - **entrada só para participantes convidados** que não recusaram e só com a reunião **em andamento**;
  - só a **anfitriã** recebe `roomAdmin` e pode remover pessoas da chamada;
  - **encerrar ou cancelar** a reunião encerra a sala no servidor de mídia;
  - quem é tirado da lista de participantes sai da sala;
  - o nome da sala é opaco (não leva título nem processo);
  - entrada e remoção são auditadas.
- **Presença verificável:** o webhook `participant_joined`, assinado com a API secret, marca o participante como presente. Ele só vale para participante da reunião daquela sala, com a reunião em andamento.
- **Navegador** (`video-room.tsx`, `livekit-client@2.23.0` carregado só ao entrar):
  - microfone, câmera e compartilhamento de tela;
  - grade de participantes com indicador de fala;
  - áudio remoto;
  - anfitriã remove participante;
  - estados de reconexão e motivo da saída (removido ou reunião encerrada);
  - erros de permissão do navegador.
- **Segurança do navegador:**
  - o CSP (`connect-src`) só libera a origem do `LIVEKIT_URL` quando ele está configurado;
  - `Permissions-Policy` com câmera, microfone e tela só nas páginas do Cowork e só com o vídeo habilitado. Fora delas a câmera continua bloqueada.
- **Sem configuração completa** (incluindo `COWORK_VIDEO_ENABLED=1`), nada muda: a página informa que o vídeo não está habilitado e não mostra nenhum controle de mídia.

**Validação comprovada:**
- **Servidor de mídia real:** com `livekit-server` 1.13.11 local (Homebrew, em 127.0.0.1), o E2E `cowork-video.spec.ts` (projeto `video`) usou dois navegadores Chromium com mídia simulada. Ele confirmou:
  - entrada das duas pessoas;
  - vídeo da câmera chegando ao outro lado (`videoWidth > 0`);
  - microfone desligado refletido no outro lado;
  - compartilhamento e parada da tela;
  - anfitriã removendo a convidada;
  - reentrada;
  - encerramento derrubando a chamada;
  - presença marcada pelo webhook real.

  Passou 3 vezes seguidas.
- **Sem servidor de mídia:** o mesmo projeto confere os cabeçalhos e o erro honesto de conexão, sem estado "conectado" falso.
- **Integração** (`cowork-video.test.ts`): permissões de entrada, `roomAdmin` só para a anfitriã, chamadas Twirp assinadas, webhook e presença.

**Para rodar a chamada real localmente:**

```bash
brew install livekit
livekit-server --dev --bind 127.0.0.1 --keys "devkey: legalos-e2e-livekit-secret-0123456789abc"
LIVEKIT_E2E_REAL=1 npx playwright test src/tests/e2e/cowork-video.spec.ts
```

Para a presença pelo webhook, o servidor precisa de `webhook.urls: [http://localhost:3102/api/cowork/livekit/webhook]` num arquivo de configuração.

### 5.4 Implantação em produção (pendente de infraestrutura e decisão)

1. **Servidor LiveKit:**
   - **Hospedagem própria:** VM com 2 vCPU e 4 GB para salas pequenas; domínio `video.<domínio>` com TLS; portas 7881/TCP e UDP 50000–60000 (ou faixa menor); TURN/TLS na 443 para redes restritas.
   - **Alternativa:** LiveKit Cloud.
2. **No servidor do LegalOS:** `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`.
3. **No LiveKit:** webhook para `https://legalossync.tech/api/cowork/livekit/webhook`, assinado com a mesma API key.
4. **Antes de ligar:** fazer uma chamada real com dois participantes em redes diferentes (incluindo celular 4G) e só então definir `COWORK_VIDEO_ENABLED=1`.
5. **Fica para depois:** gravação e transcrição (Egress), além da sala de espera com admissão manual. Hoje a "permissão de entrada" é o convite da reunião.

---

## 6. Cowork 2.0 — gestão do trabalho

- **Mensagem vira trabalho**: tarefa, atividade, encaminhamento, revisão, pendência (tarefa “Aguardando”) ou compromisso na agenda, criados por `createTask`/`createEvent`. O módulo original guarda responsável, criador, processo/cliente, prazo, situação e histórico. O Cowork guarda o vínculo (`cowork_work_items`, com departamento do canal e conversa de origem) e publica um cartão na thread. É idempotente por `requestKey`.
- **Pós-reunião**: ata, decisões e encaminhamentos com responsáveis e prazos aparecem em Tarefas e Agenda.
- **Estado de trabalho** (`computeWorkStates`), baseado em evidência e nunca em “online”:
  - **Em reunião:** presença registrada em reunião em andamento.
  - **Em andamento:** tarefa ou compromisso em andamento.
  - **Aguardando:** tarefa aguardando.
  - **Concluído:** concluiu tarefa hoje e não tem nada aberto em andamento.
  - **Não informado:** nenhum dos casos acima.
- **Painel do administrador** (`/cowork/painel`, `cowork:insights`): pessoas e departamentos; tarefas a fazer, em andamento, aguardando, atrasadas e concluídas no período; horas (com `productivity:read`); reuniões; trabalho vindo do Cowork; distribuição por departamento; listas de atrasos e pendências. Filtros: pessoa, equipe, departamento, período, processo e situação. **Não lê nem conta mensagens.** Tarefas de processos sigilosos que o gestor não vê ficam fora dos números.

---

## 7. Preparação para agentes de IA (não implementados)

| Requisito | Onde está previsto |
|---|---|
| Identidade separada de humano | `cowork_messages.author_kind` (`HUMAN`/`SYSTEM`/`AGENT`) e `agent_key`. A UI exibe o selo “IA” se `AGENT`. **Nenhum código cria mensagens de agente.** |
| Escopo por departamento | `cowork_channels.department` e `cowork_member_profiles.department` (Comercial, Atendimento, Jurídico, Financeiro, Gestão). |
| Permissões mínimas e colaboração restrita | Toda ação passa pelo `TenantContext` e pelas regras de visibilidade. Um agente precisará de um contexto próprio com permissões explícitas, sem herdar as de quem o menciona. |
| Menções a agentes, aprovação humana e execução rastreável | Reaproveitar `AiProposal`/`AiToolLog` (fluxo de proposta e aprovação já existente na Rute) e `audit()`. Menção a agente = proposta, nunca execução direta. |
| Suspensão | Mesmo mecanismo de bloqueio por perfil (`blocked_at`), aplicado à identidade do agente. |

A tela de configurações informa que **nenhum agente está disponível**.

---

## 8. Testes e evidências

- **Integração** (`src/tests/integration/cowork.test.ts`, 16 casos), contra Postgres real:
  - conversa persistente e não lidas;
  - threads;
  - isolamento entre escritórios por ids (incluindo a FK composta no banco);
  - canal privado invisível ao proprietário;
  - cartão sigiloso sem título;
  - sala de processo e perda de acesso;
  - mensagem → tarefa com responsável, sem duplicar;
  - reunião ↔ agenda, presença, ata e encaminhamento;
  - painel sem DMs;
  - bloqueio e permissões;
  - edição e exclusão;
  - arquivamento;
  - reenvio idempotente e sequência sob concorrência;
  - LISTEN/NOTIFY só após COMMIT e nunca de rollback;
  - validação de arquivos.
- **Unitários:** permissões do Cowork, inclusive a coerência entre a migração e o código; utilitários.
- **E2E** (`src/tests/e2e/cowork.spec.ts`), com três navegadores reais:
  - DM em tempo real sem recarregar e histórico após recarga;
  - cartão restrito;
  - anexo;
  - mensagem → tarefa no módulo da responsável;
  - reunião na agenda com colaboradores, sem controles de vídeo;
  - RSVP, ata e encaminhamento;
  - painel sem DMs e negado à advogada;
  - reenvio idempotente;
  - queda de rede com reenvio automático;
  - outro escritório recebendo 404 em mensagens, envio e anexo, e sem acesso à reunião.

## 9. Riscos e próximos passos

- **Proxy em produção:** confirmar o SSE atrás do Caddy real (§4.3). A contingência por consulta periódica cobre a falha, com atraso de até 15 s.
- **Escala:** cada aba aberta mantém um SSE. Um processo atende centenas de conexões; para milhares, distribuir em mais instâncias (LISTEN/NOTIFY já suporta).
- **Busca:** `ILIKE` nas conversas da pessoa. Para volumes grandes, criar índice `pg_trgm` ou full-text em `cowork_messages.body`.
- **Armazenamento local:** igual ao restante do LegalOS. Para várias instâncias, migrar para object storage (já documentado em `local-storage.ts`).
- **Retenção:** a exclusão de mensagem apaga texto e arquivos e mantém o registro auditado. A política de retenção por escritório ainda precisa ser definida.
- **Vídeo:** implementado e validado com servidor local. A ativação em produção depende de servidor LiveKit, TLS, portas UDP/TURN e de uma chamada real entre redes diferentes (§5.4).
