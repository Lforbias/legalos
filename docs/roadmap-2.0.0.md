# LegalOS 2.0.0 — plano de atualizações

Versão alvo: **2.0.0**. Hoje o sistema está em 1.x (package.json 0.1.0). A versão vira 2.0.0 quando todas as fases abaixo estiverem concluídas e verificadas (tsc, eslint, testes, `next build`, E2E). Cada fase fecha com pacote entregue, documentação e `CHANGELOG.md` atualizados.

A 3.0.0 vem depois e está em `docs/roadmap-3.0.0.md` (comparação com o LegalMail).

Regras: sem dado, integração ou IA falsos; nada enviado ao cliente sem autorização humana; toda automação com botão ligar/desligar; IA só liga com chave real configurada e sempre com aprovação de uma pessoa.

## Fases (ordem de execução)

| Fase | Entrega | Origem | Status |
|---|---|---|---|
| 2.0-F1 | Tratamento de publicações: contadores do dia, aviso de nome não monitorado, escolha de quem recebe, sugestão de providência por IA com aprovação humana (tratar/descartar/distribuir já existiam) | E1 | **feita** |
| 2.0-F2 | Painel de indicadores (atrasados por tipo, movimentação 7/30/60/90 dias, evolução da carteira, processos por cliente, pessoais) e central de alertas com abas e ação direta | E4, E5 | **concluído e verificado** (565 testes, 40 E2E) |
| 2.0-F3 | Quadro Kanban de gestão e workflows do escritório (contrato novo, encerramento com acordo, encerramento por condenação) | E2, E3 | a fazer |
| 2.0-F4 | Financeiro: fluxo de caixa anual por categoria (realizado/previsto), saldo do dia, parcelas, várias contas, faturas a faturar/emitidas, boleto no fluxo | E9 | a fazer |
| 2.0-F5 | Processo mais rico: honorário no processo, apensos, recursos por grau, valor da causa e provisão corrigidos, histórico consolidado | E8 | a fazer |
| 2.0-F6 | Pequenos itens: aniversariantes, equipes, 2FA obrigatório por escritório, exportação geral para Excel, botão "enviar por WhatsApp" no processo e no financeiro | E10–E12 | **concluída** (equipes e cobrança no financeiro já existiam) |
| 2.0-F7 | Migração Astrea: modelos de documento, certificado digital, andamentos | E13, E14 | a fazer |
| 2.0-F8 | Chat: vários números no mesmo chat e relatórios do chat | Bloco 2 | a fazer |
| 2.0-F9 | Chat: follow-ups e mensagens agendadas, NPS, exportação de conversas, formulários | Bloco 2 | a fazer |
| 2.0-F10 | IA (com chave real): resumo de conversa (ligar/desligar), jurisprudência por chat, geração de peças (a base de IA, MCP e assistente passa a ser planejada em `docs/roadmap-6.0.0.md`) | E6, E7 | a fazer |
| 2.0-F11 | Segurança: cofre de credenciais de clientes e perfis com o mínimo de acesso | Bloco 5 | a fazer |
| 2.0-F13 | Painel de developer (só o dono da plataforma): saúde e rotinas, API/chaves/webhooks, auditoria e erros, testes de integração e interruptores | `/admin/developer` | **concluído e verificado** (551 testes, 36 E2E) |
| 2.0-F14 | Avisos no celular (push/PWA): tarefa ou prazo a vencer notifica o aparelho (Android; iPhone com o app instalado), por pessoa, com antecedência escolhida, interruptor geral e aviso sem dados sensíveis | pedido em 2026-10-21 | **concluído** (docs/push.md) |
| 2.0-F15 | Comunicados do developer: no painel do developer, escrever um comunicado (novidade, manutenção, alerta) e enviar por aviso no celular (push) e no sino do sistema, para todos os escritórios, um escritório ou uma pessoa; com histórico, agendamento opcional, texto revisado antes de enviar, limite de frequência e auditoria. Reaproveita a infraestrutura da F14 (chaves VAPID, aparelhos ativados). Respeita quem desligou os avisos. **Agendamento ficou para uma próxima versão.** | pedido em 2026-10-21 | **concluído** |
| 2.0-F12 | Fechamento: revisão geral, testes completos, `package.json` 2.0.0, CHANGELOG, guia de atualização | — | a fazer |

## Ações da equipe (sem código)

- [ ] Instalar no servidor o pacote com o novo visual do chat.
- [ ] Manter a cobrança pelo WhatsApp desligada até a Dra. Talita autorizar.
- [ ] Religar o 2FA da conta lforbiano e guardar os códigos de recuperação.
- [ ] Trocar os segredos que apareceram no chat (`rotate-secrets.sh`).
- [ ] Configurar a cópia do backup fora do servidor (BACKUP_OFFSITE).
- [ ] Configurar o SMTP e rodar `mail-test`.
- [ ] Ciclo completo no Asaas sandbox.
- [ ] Importar andamentos do Astrea (`--only andamentos --dry-run`, conferir, depois `--yes`).
- [ ] Fornecer a chave do provedor de IA quando chegar a F10 (sem ela, os recursos de IA ficam desligados e avisam).

## Fora da 2.0.0 (frentes seguintes, já pedidas)

Assinatura eletrônica por integração, consulta processual autenticada para o cliente, e-mail profissional no app, editor Word/Excel embutido.
- Regra de entrega: atualizar também `src/lib/updates.ts` (aba Novidades do painel do developer).
