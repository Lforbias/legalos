# Auditoria rápida — LegalOS Box 3.0

Auditoria de código e documentação em 29/10/2026. Não é homologação de tribunal nem confirmação de execução em produção.

## Resultado executivo

- **Box antigo:** retirado. `src/lib/box-retirement.ts` fixa `BOX_AVAILABLE=false`; `src/proxy.ts` bloqueia rotas antigas. Serviços antigos de protocolo, agenda, certificado e monitoramento também chamam `assertBoxAvailable`.
- **Prévia V3:** disponível em desenvolvimento ou com `LEGALOS_BOX3_PREVIEW=1`; cada rota e ação também verifica a prévia. A V3 consulta registros existentes, permite ações internas na caixa e cria/edita rascunhos, anexos, revisão e aprovação interna de petição; não chama conectores judiciais.
- **Operações judiciais reais:** continuam bloqueadas. Não há evidência de homologação ponta a ponta por tribunal nesta auditoria.

## Fases do roadmap e evidência no repositório

| Fase | Evidência encontrada | Situação auditada |
|---|---|---|
| F1 — partes, campos e notas de processo | `party-registry.service.ts`, `case-extras.service.ts`, `case-note.service.ts`, `/partes` e páginas de processo | Código presente; comportamento e cobertura não revalidados nesta auditoria. |
| F2 — tarefas 2.0 | `task.service.ts`, `task-extras.service.ts`, `/tarefas`, `/configuracoes/tarefas` | Código presente; comportamento e cobertura não revalidados nesta auditoria. |
| F3 — modelos e documentos | `template.service.ts`, `document.service.ts`, páginas `/documentos` | Código presente; Google Docs e PDF dependem da configuração correspondente. |
| F3b — Google Drive/Docs | `google-drive.service.ts` | Código presente; roadmap limita a evidência a simuladores. OAuth do escritório ainda é necessário para uso real. |
| F4 — importação e autos | `case-import.service.ts`, páginas `/processos/importar` e `/processos/[id]/autos`, `/box-v3/importacoes` | Cadastro manual de processos por lote CNJ disponível na V3; consulta/atualização judicial e download de autos seguem bloqueados. |
| F5 — fila e agendamento de protocolo | `petition.service.ts`, `petition-queue.service.ts` | Código presente; serviços antigos bloqueados. A página V3 é somente leitura e mostra metadados históricos. |
| F6/F6b/F7 — conectores, credenciais e monitoramento | Catálogo e serviços judiciais existentes; `integracoes`, `configuracoes/credenciais`, `monitoramento` | Código presente, com evidência descrita no roadmap como simulada. Não equivale a validação real. |
| F8 — classificação assistida | `documentos/classificar` e serviços de classificação | Tela/código existentes; chave real e aprovação humana continuam dependências declaradas. |
| F9 — certificados e webhooks | `certificate.service.ts`, `webhook.service.ts`, `/certificados` | Código presente; acesso antigo a certificados e eventos Box fica desligado pelo bloqueio global. |
| F10 — créditos | `credit.service.ts`, `/configuracoes/creditos` | Código presente; roadmap registra validação apenas com simuladores. |
| F11 — caixa e operação diária | `/box-v3` e serviços V3 | Prévia implementada: pastas, filtros, detalhe, vínculo de processo e peça documental, atribuição individual/equipe com checagem de sigilo, notas, etiquetas, adiamento, retorno à Entrada, tratamento interno, tarefas e prazos relacionados, triagem por regras com minuta revisável e validação explícita, gestão local de credenciais/certificados com cofre e MFA, histórico, conexões, monitoramento/alertas e sincronizações históricas. A fila cria/edita rascunhos, revisa, aprova internamente, devolve com orientação e cancela com cópia em rascunho. Importação manual por CNJ cria registros locais; consultas DataJud/tribunal, sincronização, importação externa, autos, agendamento e envio seguem bloqueados. |

## Limites verificados da V3

- Caixa, processos e lotes aplicam organização e visibilidade por sigilo.
- A leitura da tela não marca abertura. A abertura interna requer ação explícita e não muda ciência oficial.
- Notas, etiquetas, distribuição, adiamento, retorno e tratamento são mudanças internas auditadas.
- A fila preserva eventos e recibos históricos e permite somente mudanças internas de rascunho/revisão/aprovação. Conexões, sincronizações e importações são históricas; não há ações V3 de envio, sincronização, importação ou download de autos.
- A triagem V3 usa regras locais, sem IA automática. A minuta é editável e salvamentos são auditados sem guardar seu texto nos metadados de auditoria. Validar é ação explícita; se solicitado, cria prazo em rascunho, sujeito à conferência posterior. Datas sugeridas não consideram automaticamente feriados locais.
- A tela `/box-v3/configuracoes` permite a quem tem `certificates:manage` guardar/revogar certificados A1 no cofre e autorizar/remover integrantes para consulta; guardar, revogar e autorizar exige MFA. Cada pessoa com `cases:read` pode guardar, conferir requisitos locais e remover suas próprias credenciais; `integrations:manage` pode remover credenciais da equipe. O código não seleciona material cifrado, senha, documento completo, serial ou impressão digital para exibição. Essas ações só alteram cadastros internos, não testam nem acessam o tribunal.
- Ações de editar ou validar triagem também conferem no servidor se a comunicação permanece aberta; esconder botões na interface não é usado como controle de acesso.
- A fila V3 permite registrar reconciliação manual somente para petições em `UNKNOWN` ou `AWAITING_CONFIRMATION`. A rota exige prévia habilitada; `FILED` requer `petitions:approve`, `documents:read`, protocolo e recibo anexado ao mesmo processo. `NOT_FILED` exige nota sobre onde a conferência foi feita. A reconciliação não faz requisição a tribunais e a V3 não oferece reenvio; o serviço legado continua protegido por `BOX_AVAILABLE`.
- O detalhe de sincronização não retorna cursor, `sourceId` nem `errorMessage` ao navegador. A ação manual de interromper exige `integrations:manage`, estado `RUNNING` e heartbeat além do limite de 10 minutos usado pelo motor; a atualização é condicional e auditada, sem retomar ou iniciar execução.
- Indicadores herdados de assinatura em certificados são identificados como cadastro antigo e inativos na prévia V3; a configuração V3 não libera assinatura nem protocolo.
- Listas omitem conteúdo bruto de erros, cursores de sincronização e recibos integrais.
- `ConnectionList` identifica cadastros antigos como históricos e mostra operação pausada; cadastro preservado não é prova de conexão ativa.

## Dependências externas para fechar operação

1. Escolher um tribunal/sistema piloto e ambiente de homologação.
2. Obter credenciais autorizadas e certificado de teste sob controle do escritório.
3. Validar captura, paginação/cobertura, deduplicação, idempotência, recibos e recuperação de estado incerto.
4. Validar a integração local com navegador e PJeOffice; a extensão existente não declara `nativeMessaging` e não controla o PJeOffice local.
5. Configurar OAuth próprio do escritório para usar Google Drive/Docs fora dos simuladores.
6. Manter confirmação humana no momento de qualquer protocolo real.

## Verificação executada

Nesta atualização, lint das telas e serviços V3 de triagem/configurações, `npm run typecheck` e `git diff --check` passaram após incluir gestão local de credenciais/certificados sem leitura de segredos e validar no servidor que a triagem só pode ser alterada enquanto a comunicação estiver aberta. Nenhum teste automatizado, envio, protocolo, consulta a tribunal ou alteração de credencial foi executado. A auditoria de código das fases F1–F10 ainda não revalidou o comportamento ponta a ponta.
