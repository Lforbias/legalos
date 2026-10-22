# LegalOS 5.0.0 — ideias de futuro (além do Astrea, LegalMail e ChatGuru)

Origem: conversa de 2026-10-21 sobre "o que mais poderíamos fazer". Não é comparação com concorrente: são ideias que partem da rotina real do escritório (previdenciário, trabalhista, cível, JEF, TJBA) e das skills já usadas pela equipe. Ordem sugerida abaixo; as marcadas com ⭐ foram as de maior valor. Antes de cada fase, conferir o que o LegalOS já tem (portal do cliente e cobrança pelo Asaas, por exemplo, já existem em parte).

## Fases sugeridas (⭐ = prioridade)

| Fase | Entrega | Depende de |
|---|---|---|
| 5.0-F1 ⭐ | Calculadoras dentro do sistema: atrasados da Justiça Federal (INPC + SELIC), débitos do TJSP, verbas trabalhistas e prazos; o cálculo fica salvo no processo e a planilha sai pronta | só código (regras e índices atualizados com fonte) |
| 5.0-F2 ⭐ | Portal do cliente com andamento em linguagem simples ("aguarda perícia"), pendências do cliente e botão para falar com a equipe | revisão humana do texto de cada andamento |
| 5.0-F3 ⭐ | Cobrança de honorários por Pix e boleto com baixa automática; contratos de êxito (o que entra quando o processo terminar) | Asaas em produção (hoje só sandbox) |
| 5.0-F4 ⭐ | Triagem de publicações com minuta: o sistema diz o que a publicação exige, calcula o prazo e deixa uma minuta em rascunho. Sempre com validação humana antes de protocolar | provedor de IA (2.0-F10) |
| 5.0-F5 ⭐ | Copiloto de atendimento: transcrição, resumo, ações cabíveis, tarefas e documentos a partir da reunião | provedor de IA (2.0-F10) |
| 5.0-F6 ⭐ | Metas e carga de trabalho por pessoa, com distribuição de tarefas por peso | só código |

## Ideias para depois (sem ordem)
- Pacote de fechamento de contrato (esteira de tarefas com responsável e prazo) dentro do sistema.
- Pesquisa de jurisprudência ligada ao processo, separando o que foi localizado do que é só indicação.
- Relatório de produtividade mensal automático.
- Contrato e procuração com assinatura eletrônica guardados no processo.
- Formulário de entrada (site ou WhatsApp) que já cai na triagem certa.
- Pesquisa de satisfação (NPS) no fim do processo.
- Avisos proativos ao cliente ("saiu a sentença"), só com aprovação humana e chave liga/desliga.
- Rentabilidade por processo e por área (horas contra honorário).
- Agenda de audiências com deslocamento e checklist do dia anterior; rede de correspondentes.
- Base de conhecimento do escritório (modelos, teses e checklists por área).
- LGPD pronta (consentimento, pedido de exclusão, relatório de acessos por cliente).
- Teste de restauração do backup automático, avisando a TI se falhar.
- Vender o LegalOS para outros escritórios: página de planos, cadastro com teste grátis, marca própria por escritório.

Regras que valem para toda a 5.0: IA só com chave real e sempre com aprovação humana; nada fala com cliente sem autorização humana; toda automação tem chave liga/desliga; nada de dados inventados.

## Estado (2026-10-22)
F1 a F6 **feitas** (ver `CHANGELOG.md` 5.0.0 e `PHASES_5`). Migração `20261217000000_calc_5_0`. Pendências do lado da equipe: lançar índices (BCB, reajuste INSS 2026, IPCA-E, TR, salário mínimo), configurar Asaas no sandbox antes da produção, `GEMINI_API_KEY`/chave de IA se quiser triagem com IA, transcrição e copiloto.
