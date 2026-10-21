# LegalOS 3.0.0 — plano (comparação com o LegalMail)

Fonte desta primeira versão: a documentação oficial da API do LegalMail (spec OpenAPI e guia do agente), lida em 2026-10-21. A navegação pela tela do LegalMail ainda NÃO foi feita (a extensão do Chrome não chegou à sessão). Quando houver acesso, percorrer as telas só para leitura e completar a lista.

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

Conferido na documentação completa (referências da API): nada além do acima mudou a lista; o que só as telas mostram (painéis, relatórios, avisos) continua em aberto na fase 3.0-F11.

## Fases sugeridas (3.0)

| Fase | Entrega | Origem |
|---|---|---|
| 3.0-F1 | Cadastro único de partes, campos personalizados de processo, arquivar/acervo, notas fixas e em lote | L7, L9, L13 |
| 3.0-F2 | Tarefas 2.0: tipos com pontuação, etiquetas, comentários com menção, anexos, histórico, equipes | L8 |
| 3.0-F3 | Autotextos com variáveis do processo, timbrados, prévia em PDF | L10, L16 |
| 3.0-F4 | Importação de processos em lote e atualização/download de autos | L4, L5 |
| 3.0-F5 | Fila e acompanhamento de protocolos, recibo, agendamento, cancelamento com cópia em rascunho | L1 |
| 3.0-F6 | Conectores de peticionamento além do MNI (cada sistema depende de credenciais e certificado reais) | L1, L2 |
| 3.0-F7 | Monitoramento de intimações nos sistemas dos tribunais | L3 |
| 3.0-F8 | Classificação de documentos por IA com aprendizado (chave real, aprovação humana) | L6 |
| 3.0-F6b | Credenciais por tribunal e usuário no cofre, com checagem de requisitos do sistema | L17 |
| 3.0-F9 | Certificado: usuários autorizados e avisos; webhooks de petição, protocolo e certificado | L12, L15 |
| 3.0-F10 | Créditos e custos (se o LegalOS for vendido como serviço) | L14 |
| 3.0-F11 | Completar com o que aparecer nas telas do LegalMail | — |

Regra mantida: nada de protocolo, mensagem ou cobrança sem confirmação humana, e nada falso.
