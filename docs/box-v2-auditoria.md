# LegalOS Box 2.0 — auditoria e arquitetura

Princípio: o escritório gerencia o escritório; o LegalOS gerencia as integrações. A tela fala a língua do advogado (sem SOAP, WSDL, endpoint nem "jobs"); o detalhe técnico fica só para quem administra integrações (`integrations:manage`).

## O que a auditoria encontrou no Box antigo

- **"Conectado" por cadastro.** Bastava existir uma linha no banco para a tela dizer que a conexão funcionava. Não havia prova de que uma consulta real tinha rodado.
- **Registro de conectores genérico.** PJe, eproc, e-SAJ e PROJUDI apareciam como "consulta, importação e protocolo" sem dizer o que o código realmente faz nem em qual tribunal.
- **Captura sem checkpoint.** A janela de busca podia avançar sem que todas as páginas tivessem sido lidas e conferidas contra o total informado pela fonte; falha parcial parecia sucesso.
- **Sem detecção de "parece funcionar, mas não entrega".** Nenhuma rotina parada ou fonte muda gerava alerta.
- **Comunicação sem origem.** Publicação do DJEN, intimação privada e movimentação eram o mesmo tipo de registro; não havia identificador oficial, idempotência por fonte nem histórico.
- **Um só "estado".** "Aberta" confundia capturada, vista no LegalOS e ciência oficial.
- **Robô do portal.** Abrir o painel era tratado como funcional. A leitura real das intimações não existe.

## Arquitetura nova (resumo)

| Camada | Onde | Papel |
|---|---|---|
| Contratos e catálogo | `src/lib/judicial/contracts.ts`, `catalog.ts` | Cada conector declara capacidade por capacidade (consultar disponibilidade, validar credencial, listar comunicações, ler processo, baixar documento, protocolar...). Declarado ≠ comprovado. |
| Evidência | `evidence.ts`, `evidence.service.ts`, tabela `connector_evidences` | Cada checagem real grava ambiente (PRODUÇÃO, HOMOLOGAÇÃO ou SIMULADO), resultado e data. Evidência simulada **nunca** conta. Evidências vencem com o tempo. |
| Estado da conexão | `connection-state.ts` | Estado derivado só de evidência: Operacional, Parcialmente operacional, Necessita autorização, Autenticação expirada, Falha temporária, Não homologado, Indisponível. Níveis de cobertura: serviço respondeu, autenticação válida, consulta concluída, sincronização parcial, captura comprovada, não verificável. |
| Motor de sincronização | `sync-engine.ts`, `sync_runs` | Uma execução por fonte (índice único parcial), batimento, checkpoint por página, a janela só avança quando todas as páginas foram lidas e a contagem confere, recuperação de execução interrompida. |
| Comunicação unificada | `communication.ts`, `communication-ingest.ts` | Origem preservada (publicação DJEN, intimação privada, movimentação), idempotência por fonte + identificador oficial, vinculação ao processo só quando o CNJ casa com um único processo (ambíguo pede confirmação; não encontrado nunca cria processo). |
| Saúde e alertas | `health-policy.ts`, `health.service.ts`, `alerts.ts`, `health_alerts` | Política por fonte (por exemplo DJEN: atrasado em 90 min, crítico em 6 h), rotinas paradas, certificados a vencer. Alerta abre uma vez, escala, some sozinho; só administradores recebem aviso, e sem segredos. |
| Interface | `src/modules/box`, `src/app/(dashboard)/box/*` | Visão Geral, Conexões Judiciais, Operação e Saúde, Processos, Configurações e o assistente de 5 passos. Atrás da chave `LEGALOS_BOX_V2`. |
| Caixa de Entrada | `notice-state.ts`, `inbox-v2.service.ts`, `/api/box/events` | Estados separados, linha do tempo, "vista" sem ciência oficial, filtros por profissional/origem/vista, atualização ao vivo. |

### Estados de uma comunicação (nunca se misturam)

1. **Capturada** — o LegalOS recebeu da fonte.
2. **Vista no LegalOS** — alguém do escritório abriu aqui. Fato interno; **não** chama o tribunal e **nunca** registra ciência oficial. É gravado por uma ação disparada pelo navegador (pré-carregamento e robôs não contam) e sem alterar a versão do registro (não invalida seleção em lote de outra pessoa).
3. **Ciência oficial** — só existe quando a própria fonte confirma (`officialAckAt` / estado `ACKNOWLEDGED`). Comunicação privada começa como "não confirmada".
4. **Distribuída** — tem responsável ou equipe.
5. **Tratada internamente** — encerrada pelo escritório (ou descartada).

### Atualização ao vivo

Sem Redis nem serviço novo. Servidor de eventos (SSE) autenticado: dentro do mesmo processo quem grava um evento acorda os canais abertos na hora; como garantia, cada canal confere a cada 4 s uma marca no banco (evento mais recente + eventos dos últimos 15 minutos), uma consulta indexada. Pior caso medido: uma comunicação gravada direto no banco por outro processo apareceu na tela em ≈4,5 s, sem recarregar a página (meta: ≤10 s). O canal só diz "mudou" (com contagens já filtradas por permissão e sigilo); a tela se recarrega pelo caminho normal. Seleção em lote em andamento não é derrubada (aparece um aviso). Máximo de 4 canais por pessoa, vida de 5 minutos com reconexão automática a partir da última marca.

Limite conhecido: a marca usa a hora de criação do evento; a contagem recente cobre gravações demoradas, mas uma coincidência exata (um evento sai da janela de 15 minutos no mesmo instante em que outro entra) só perde o aviso até o próximo evento ou recarga manual.

### Certificados digitais: consultar não é assinar

Antes, "pode usar o certificado" era um poder só. Agora são dois, independentes, e a regra mora em um lugar (`src/lib/judicial/certificate-policy.ts`):

- **Consultar** (`local:tls-check`, `mni:wsdl`, `mni:consultarAvisosPendentes`, `mni:consultarProcesso`, autos): sempre permitido ao certificado do escritório.
- **Assinar/protocolar** (`mni:entregarManifestacaoProcessual`): exige o certificado **liberado** para assinatura (`consultationOnly=false`), a permissão de perfil `certificates:sign` e que a pessoa seja a dona do certificado ou usuária autorizada com `can_sign`.
- **Ciência de comunicação** (`mni:consultarTeorComunicacao`) e qualquer finalidade desconhecida: **proibidos**. Abrir uma intimação nunca é ciência.
- Novos envios nascem "somente consulta". Liberar assinatura exige `certificates:manage` + `certificates:sign`, 2º fator, o nome do certificado digitado e deixa auditoria (`certificate.enable_signing`). Voltar a "somente consulta" limpa a liberação e as autorizações de assinar.
- A senha do PFX nunca é registrada e o arquivo nunca volta ao navegador. A3 e certificado em nuvem não são simulados: aparecem como indisponíveis.

### Peticionamento: nada é "protocolado" sem prova

Máquina de estados em `src/lib/judicial/petition-state.ts` (a tela e o servidor usam o mesmo código), serviço em `petition.service.ts`, tabelas `petition_attempts` e `petition_receipts`:

- Cada envio grava uma **tentativa** (impressão digital do conjunto de arquivos, chave de idempotência, ambiente e resultado). O banco impede duas tentativas abertas da mesma petição.
- Só o ambiente de produção com protocolo **e** recibo oficial vira "Protocolada com confirmação oficial". Demonstração, simulado e homologação ficam "Enviada" (teste), e vale sempre o ambiente de **menor** confiança entre o destino e o que o conector declarar.
- Resposta incerta, exceção inesperada de conector real, resposta sem protocolo ou envio preso por mais de 10 minutos viram **Estado desconhecido** (ou "falta a confirmação oficial"): nunca há reenvio às cegas. Só uma pessoa com permissão de aprovar resolve, registrando o protocolo com o recibo (documento do mesmo processo) ou que conferiu e nada foi protocolado.
- Protocolo real em produção só roda com evidência recente, não simulada, de envio aceito para o mesmo conector e tribunal; e conector real sem `describeTarget` (que informa tribunal e ambiente) não protocola.
- Falha definitiva (o tribunal recusou) é a única que libera reenvio direto.

### Dados novos

`professional_identities`, `sync_runs`, `connector_evidences`, `health_alerts`, `notice_events`, `petition_attempts`, `petition_receipts`, colunas novas em `certificates`, `certificate_authorized_users` e `petition_filings`, três valores novos no enum `PetitionStatus`, e colunas anuláveis em `court_notices` (origem, fonte, id oficial, tribunal, profissional, captura, primeira vista, ciência oficial, vinculação) e `djen_monitors`. Os tipos de `notice_events.kind` são restritos por CHECK; ações mais finas ficam em `data.action` (mapa em `notice-state.ts`, com teste que garante que nenhum tipo gravado viola a restrição).

### Segurança, multi-escritório e privacidade

- Toda leitura/gravação passa por `TenantContext`; confidencialidade de processo respeitada em lista, detalhe, histórico, contagens e título do processo no histórico.
- Testes de isolamento entre escritórios em integração (`box-v2-*`).
- Nenhuma senha é registrada; o canal ao vivo nunca envia conteúdo de comunicação; evidência técnica não carrega o texto da publicação.
- O robô **nunca** contorna captcha, segundo fator ou bloqueio: para e pede uma pessoa.
