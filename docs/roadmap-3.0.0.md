# LegalOS 3.0.0 — plano (comparação com o LegalMail)

Fontes: a documentação da API do LegalMail e inspeção somente de leitura da aplicação autenticada em 2026-10-29. A inspeção completou o levantamento de UX da F11; ela não revela nem comprova a arquitetura interna do LegalMail. Veja `docs/box-v3-reconstrucao.md` para observações, limites e o estado da nova prévia.

## O que o LegalMail faz e o LegalOS ainda não faz (ou faz só em parte)

- L1. Peticionamento eletrônico automatizado em vários sistemas de tribunal (robô com certificado A1), petição inicial e intermediária, com fila de acompanhamento (rascunho, em fila, protocolando, protocolado, agendado, com pendências, cancelado), recibo, cancelamento que gera cópia em rascunho e protocolo agendado. LegalOS: conector MNI (PJe) desligado, sem os demais sistemas e sem fila.
- L2. Catálogos do tribunal para petição inicial (comarca, área, classe, assunto, procedimento, tipo de justiça, prioridades, gratuidade etc.).
- L3. Monitoramento automático de intimações nos sistemas dos tribunais, além de DJs e DJEN, em caixa central por processo. LegalOS: DJEN e leitura de intimações coladas.
- L4. Importação de processos em lote por número, com verificação do sistema permitido e acompanhamento por status.
- L5. Atualização e download dos autos do processo e link de uma peça por movimentação.
- L6. Classificação automática de documentos por IA, que aprende com a correção manual.
- L7. Cadastro único de partes reaproveitável entre processos e tribunais (profissões, órgãos expedidores, busca).
- L8. Gestor de tarefas: tipos com pontuação, etiquetas próprias, encarregado por usuário ou equipe, comentários com menção que notificam, anexos, histórico de alterações, prazo sincronizado com Google Agenda.
- L9. Notas internas do processo: fixar no topo, anexos, aplicar a mesma nota em até 50 processos.
- L10. Autotextos com variáveis preenchidas pelos dados do processo, timbrados, editor integrado (Google Docs) e prévia em PDF antes de protocolar.
- L11. Prazos calculados por regra (CPC/CPP) ligados à agenda e à Google Agenda.
- L12. Certificado digital A1 com lista de usuários autorizados a usá-lo; avisos de status do certificado.
- L13. Campos personalizados de processo, encarregar processo, arquivar/acervo, resumo com contagens por caixa.
- L14. Créditos e saldo da conta, custo por ação, avisos de saldo baixo e de créditos expirando.
- L15. Webhooks de eventos de petição, protocolo, tribunal e certificado (LegalOS já tem webhooks; faltam estes eventos).
- L16. Gerador de documentos com modelos.
- L17. Credenciais de acesso aos sistemas dos tribunais guardadas por usuário e por tribunal/sistema, com verificação dos requisitos de cada sistema (`courts-systems`). LegalOS: cofre de chaves existe, mas não por tribunal/usuário.
- L18. Gerador de documentos a partir de modelos no Google Docs, listado e apagável. Perfis de membro simples (operador e administrador).
- L19 (pedido da equipe, 2026-10-21, vindo de conversa com cliente). Integração com o Google Drive para os documentos: escolher uma pasta do escritório no Drive, enviar/espelhar documentos e modelos gerados, abrir no Google Docs para editar. Exige credenciais OAuth do Google (chave e consentimento reais, a cargo da equipe); sem elas a tela fica desligada, nunca fingida.

Conferido na documentação completa (referências da API): nada além do acima mudou a lista; o que só as telas mostram (painéis, relatórios, avisos) continua em aberto na fase 3.0-F11.

## Fases sugeridas (3.0)

| Fase | Entrega | Origem |
|---|---|---|
| 3.0-F1 (feita) | Cadastro único de partes, campos personalizados de processo, arquivar/acervo, notas fixas e em lote | L7, L9, L13 |
| 3.0-F2 (feita) | Tarefas 2.0: tipos com pontuação, etiquetas, comentários com menção, anexos, histórico, equipes | L8 |
| 3.0-F3 (feita) | Autotextos com variáveis do processo, timbrados, prévia em PDF | L10, L16 |
| 3.0-F3b (feita, só testada com simuladores) | Integração com o Google Drive/Docs para documentos (pasta do escritório, envio, abrir para editar) | L19, L10 |
| 3.0-F4 (feita) | Importação de processos em lote e atualização/download de autos | L4, L5 |
| 3.0-F5 (feita, aguarda validação em tribunal real) | Fila e acompanhamento de protocolos, recibo, agendamento, cancelamento com cópia em rascunho | L1 |
| 3.0-F6 (feita, só testada com simuladores) | Conectores de peticionamento além do MNI (cada sistema depende de credenciais e certificado reais) | L1, L2 |
| 3.0-F7 (feita, só testada com simuladores) | Monitoramento de intimações nos sistemas dos tribunais | L3 |
| 3.0-F8 (feita, só testada com simuladores) | Classificação de documentos por IA com aprendizado (chave real, aprovação humana) | L6 |
| 3.0-F6b (feita, só testada com simuladores) | Credenciais por tribunal e usuário no cofre, com checagem de requisitos do sistema | L17 |
| 3.0-F9 (feita) | Certificado: usuários autorizados e avisos; webhooks de petição, protocolo e certificado | L12, L15 |
| 3.0-F10 (feita, só testada com simuladores) | Créditos e custos (se o LegalOS for vendido como serviço) | L14 |
| 3.0-F11 (caixa, fluxo interno de petições e cadastro manual de lotes implementados; conectores pendentes) | Caixa por pastas, conexões, monitoramento, histórico de sincronizações, fila de protocolos e importações, com estados internos e oficiais separados | Inspeção de 29/10/2026; sem comprovação da arquitetura interna |

Regra mantida: nada de protocolo, mensagem ou cobrança sem confirmação humana, e nada falso.

## Estado da reconstrução no aplicativo

- A prévia `/box-v3` possui visão geral e seções de caixa, conexões, monitoramento, sincronizações, fila de protocolos e importações. O histórico de sincronizações é paginado e tem detalhe por execução com período, contagens, cobertura, evidências e alertas relacionados, sem cursores ou mensagens técnicas brutas; uma pessoa com `integrations:manage` pode encerrar somente registros sem heartbeat há mais do que o limite do motor, sem retomar a execução. A fila permite criar/editar rascunhos e gerir anexos internos vinculados ao mesmo processo; envio para revisão, aprovação interna, devolução com orientação, cancelamento com cópia em rascunho e registro assistido de conferência humana de protocolo incerto ficam auditados e conferem as versões dos documentos. A conferência registra protocolo/recibo ou a constatação humana de ausência de protocolo; não consulta nem envia ao tribunal e não libera reenvio na V3. A importação V3 valida CNJs e cria apenas registros internos; a ação força DataJud, autos e atualização de existentes para desligado. Aprovação V3 não agenda nem envia: agendamento, consultas externas e qualquer envio seguem indisponíveis. As consultas e ações internas V3 não chamam os serviços antigos protegidos, exceto o serviço compartilhado de reconciliação, explicitamente limitado à prévia.
- Caixa e processos respeitam visibilidade por organização e sigilo. Os detalhes exibem o teor da comunicação apenas para quem tem permissão de leitura. Abrir a tela não grava visualização e não altera ciência oficial.
- Peças já existentes podem ser vinculadas à comunicação se pertencerem ao mesmo processo. A aprovação interna exige leitura dos documentos; o detalhe abre a versão registrada para revisão.
- As execuções, resultados e protocolos são apresentados como histórico. Cursor de sincronização, conteúdo bruto de erro e recibo completo não são mostrados nas listas.
- A primeira entrega permite pesquisa e filtros por tipo, origem, leitura e ciência oficial; vincular a processo visível e peça documental do mesmo processo; registrar abertura interna; distribuir para pessoa ou equipe com acesso; adicionar notas e etiquetas; adormecer/despertar e devolver à Entrada; marcar/reabrir o tratamento; iniciar tarefa vinculada à comunicação; gerar triagem baseada em regras e revisar minuta, com validação humana explícita e criação opcional de prazo em rascunho; criar/editar/revisar/aprovar rascunhos com anexos; importar processos manualmente por lote CNJ sem consulta externa; e gerenciar credenciais/certificados no cofre com permissões e MFA, sem permitir que estes cadastros acionem fontes judiciais. Monitoramento expõe alertas históricos sem detalhes técnicos brutos e permite reconhecê-los internamente. Nenhuma integração real, sincronização, importação de tribunal, download de autos, ciência ou peticionamento foi liberada. A retirada anterior continua em vigor.
- F1–F10 no repositório são cobertura de código registrada no roadmap, não prova de operação real. Onde o roadmap diz “só testada com simuladores” ou “aguarda validação em tribunal real”, continua pendente de homologação externa.

> Decisão (21/10/2026): a 3.0-F3b é opcional e por escritório — cada escritório cadastra o próprio Client ID/Secret do Google (criptografado, com liga/desliga), escopo `drive.file`; nenhuma chave global no servidor.
