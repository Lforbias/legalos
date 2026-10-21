# Motor próprio de tribunais

**Estado:** Etapa 0 (cofre A1), Etapa 1 (conector PJe/MNI), Etapa 2a (DJEN por OAB), Etapa 2b (sincronização automática do MNI) e Etapa 4 via MNI (autos na íntegra) implementadas — todas só testadas com tribunal SIMULADO. Faltam: DJe do STF/outras fontes (resto da Etapa 2), robôs de navegador (Etapa 3), autos por robô e protocolo (Etapa 5).

Objetivo: ver intimações, acessar a íntegra dos autos e protocolar petições (inclusive iniciais) em processos de qualquer tribunal, a partir do LegalOS. **Não existe forma de fazer isso "sem depender dos sistemas dos tribunais"**: o motor precisa falar com cada sistema (PJe, e-SAJ, eproc, Projudi…) em nome do advogado, com o certificado digital dele.

## Arquitetura
Um **serviço separado (worker)**, fora do app Next.js, com fila de tarefas por escritório. O app só cria pedidos ("capturar intimações", "baixar autos", "protocolar petição X") e recebe resultados; **o certificado nunca sai do worker**. Cada tribunal é um *conector* que implementa a mesma interface (`listarIntimacoes`, `baixarAutos`, `protocolar`), no estilo do `PetitioningAdapter` que já existe.

## Etapas
| Etapa | Entrega | Observação |
|---|---|---|
| 0. Cofre de certificados | Upload de A1 (.pfx) cifrado (chave fora do banco), por advogado, validade monitorada, auditoria de cada uso, exige 2FA e permissão própria | Fundação de segurança; sem ela nada abaixo deve existir |
| 1. Conector MNI (padrão oficial) | Consulta de processo, avisos/intimações pendentes e entrega de manifestação nos tribunais PJe que habilitam o MNI | Caminho mais estável (SOAP + assinatura); cada tribunal tem particularidades e pode exigir cadastro |
| 2. Captura de intimações → caixa de entrada | Fila periódica, deduplicação, vínculo por CNJ (já pronto), prazos continuam **rascunho até validação humana** | |
| 3. Robôs de navegador, um sistema por vez | e-SAJ, eproc, Projudi, PJe sem MNI (Playwright + certificado) | Frágeis: quebram quando o tribunal muda a tela; exigem manutenção contínua |
| 4. Autos na íntegra | Download e arquivamento nos documentos do processo (com OCR da 8b) | |
| 5. Protocolo | Intermediárias primeiro; **iniciais por último** (tabelas de classe/assunto, partes, tipos de documento mudam por tribunal) | Sempre com confirmação humana antes de enviar |

## Limites e riscos que não somem
- **Certificado:** só A1 (arquivo) funciona em servidor. A3 (token/cartão) não; certificado em nuvem exige aprovação no celular a cada assinatura. Precisa levantar o tipo de cada advogado.
- **Captcha/bloqueio:** não vamos burlar captcha nem limites. Onde houver, o fluxo pede ajuda humana ou aquele tribunal fica de fora.
- **Termos dos tribunais:** alguns restringem acesso automatizado; é preciso conferir caso a caso (e a responsabilidade pelo uso do certificado é do advogado).
- **Teste:** não dá para validar contra tribunais reais no ambiente de desenvolvimento (sem certificado nem acesso); cada conector precisa ser testado por você com seu certificado, de preferência em ambiente de homologação do tribunal.
- **Manutenção:** é trabalho contínuo, não uma fase com fim.
- **Alternativa mais rápida:** usar o LegalMail como motor (adaptador real) enquanto o motor próprio cresce, tribunal a tribunal.

## Etapa 1 — Conector PJe/MNI (implementada, NÃO validada em tribunal real)

- **O que faz:** cadastro de conexões por tribunal (Integrações → PJe (MNI)); botão "Sincronizar intimações" (operação `consultarAvisosPendentes`, importa para a caixa de entrada sem abrir o teor); botão "Consultar no tribunal (MNI)" no processo (operação `consultarProcesso`, importa movimentos como andamentos `MNI_MOVEMENT`). Tudo sob demanda; sem agendamento ainda (Etapa 2).
- **O que NÃO faz de propósito:** não chama `consultarTeorComunicacao` (abrir o teor gera ciência e inicia o prazo); não entrega manifestação nem protocola (Etapa 5, com confirmação humana).
- **Autenticação:** senha no corpo SOAP, certificado A1 por mTLS (do cofre) ou ambos, conforme o que o tribunal exigir.
- **Segurança:** só https com nome de domínio; bloqueio de endereços privados no momento da resolução de DNS (SSRF); senha cifrada (AES-GCM, chave CERT_ENCRYPTION_KEY); cadastrar/remover exige 2FA; uso do certificado registrado; processos sigilosos nunca são consultados; deduplicação por `external_key` (`mni:<J.TR>:<idAviso>`).
- **Variáveis:** `MNI_EXTRA_CA_FILE` (cadeia ICP-Brasil, se o Node não confiar no tribunal); `MNI_ALLOW_LOCAL_ENDPOINTS=1` só para testes.
- **Limite honesto:** escrito pelo padrão público do CNJ e testado só com respostas simuladas. Cada tribunal varia (endereço, autenticação, namespaces, campos opcionais); espere ajustes na primeira conexão real. Movimentos nacionais aparecem como "Movimento nacional (código X)" até haver a tabela TPU.

## Etapa 2a — Captura de publicações do DJEN (implementada, NÃO validada contra o serviço real)

- **O que faz:** cadastro de OAB+UF em Integrações → "DJEN — publicações por OAB"; "Verificar agora" e rota agendada `POST /api/cron/djen` (cabeçalho `Authorization: Bearer $CRON_SECRET`) consultam `GET /api/v1/comunicacao` da API pública do CNJ e colocam as publicações na caixa de entrada (origem "Importada do tribunal"), vinculando ao processo quando o número CNJ já existe.
- **Sem certificado e sem senha:** é a base pública de publicações. Por isso é a fonte mais barata e mais ampla; não substitui a captura de intimações eletrônicas dentro dos sistemas dos tribunais (PJe/MNI e robôs), que seguem nas próximas etapas.
- **Janela:** primeira verificação olha 7 dias; as seguintes retomam 2 dias antes da última janela concluída (sobreposição para não perder nada). Falha não avança a janela. Deduplicação por `djen:<id>`; publicações canceladas são ignoradas.
- **Defesas:** página de 50, pausa de 500 ms entre páginas, repetição com espera crescente em 429/5xx, limite de 40 páginas por execução, resposta fora do formato → erro explícito (nunca importa dado adivinhado), itens sem id ou sem texto são descartados e contados.
- **Limites honestos:** essa consulta não tem documentação oficial estável que eu tenha conseguido confirmar; o contrato vem de relatos de integradores e foi testado só com respostas simuladas. Relatos indicam **bloqueio (403) de servidores fora do Brasil**: hospede no Brasil. Filtro de OAB é exato (variantes com sufixo, como -A, podem exigir cadastro à parte). Publicação só aparece a partir da data de disponibilização. O monitoramento é por OAB, não por processo.
- **Agendamento:** o sistema não tem processo em segundo plano próprio; um agendador externo (cron do servidor, por exemplo a cada 30 min) chama a rota. Exemplo no `.env.example` e em `docs/producao.md`.

## Etapa 2b — Sincronização automática do MNI (implementada, NÃO validada em tribunal real)

- **Rota:** `POST /api/cron/mni` com `Authorization: Bearer $CRON_SECRET` (o mesmo segredo do DJEN). Percorre as conexões PJe/MNI **ligadas** de escritórios ativos (não suspensos), da menos recente para a mais recente, e roda a mesma sincronização de avisos do botão manual (`syncAvisos`), com o contexto de **quem criou a conexão**.
- **Segurança:** se quem criou perdeu o acesso à caixa de entrada (ou saiu do escritório), a conexão não roda e o motivo fica gravado na própria conexão; certificado vencido/revogado também só marca erro. Cada uso do certificado continua registrado no cofre. Continua **só listando** avisos: nunca abre o teor (ciência).
- **Agendamento:** igual ao DJEN (cron externo). Sugestão: a cada 30 min em dia útil.

## Etapa 4 (via MNI) — Autos na íntegra (implementada, NÃO validada em tribunal real)

- **O que faz:** botão "Baixar autos (MNI)" no processo (exige conexão ativa do tribunal, permissão de documentos e de processos). Fase 1 lista os documentos; fase 2 baixa o conteúdo em lotes de 5 (respeita o limite de 20 MB por resposta). Arquiva em Documentos do processo (PDF/imagem/texto), com categoria sugerida pelo tipo (Decisão, Petição…), nome com o número do documento no tribunal e descrição de origem.
- **Sem duplicar:** chave externa `mni:<J.TR>:doc:<id>` (única por escritório); rodar de novo só traz o que falta.
- **Limites de propósito:** 25 documentos por clique (clique de novo para continuar); documentos **sigilosos** não são importados; tipos não suportados (por exemplo HTML), arquivos cuja assinatura não confere e arquivos acima de 8 MB são pulados e contados; processo sigiloso nunca é consultado.
- **Limite honesto:** assume que o tribunal devolve a lista de documentos com `incluirDocumentos=false` e o conteúdo quando pedimos por `<documento>id</documento>`. Isso é o padrão do MNI 2.2.x, mas varia por tribunal; se o TRT5 se comportar diferente, o ajuste é pequeno e localizado (`importAutosMni`).
- **Não faz:** OCR automático dos autos baixados (use a leitura de texto dos Documentos), autos por robô de navegador (Etapa 3+).
