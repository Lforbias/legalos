# LegalOS Evolution 1.0 — preparação para homologação

## Situação

**Ainda não liberada para homologação.** Os PRs #17–#29 estão abertos e marcados como mergeáveis no GitHub na data deste checkpoint. Nenhum foi integrado à `main`; nenhum deploy foi feito.

## Evidências desta rodada

| Verificação | Resultado |
|---|---|
| TypeScript | Passou |
| ESLint completo | Passou |
| Vitest completo com banco `legalos_test` | 188 arquivos; 1.368 testes passaram |
| Build de produção com `DATABASE_URL` de teste | Passou |
| E2E de workspace e workspace UX | 2 testes passaram após alinhar expectativas à UI atual |
| E2E completo | Incompleto: execução interrompida em 12/72; 7 falharam, 1 foi interrompido e 60 não rodaram |

## Pendências que bloqueiam o aceite

1. Investigar a falha E2E de superadmin: após suspender um escritório, a navegação esperava `/suspenso` e permaneceu em `/`.
2. Atualizar os E2E dos fluxos do Box retirado para validar a desativação atual sem reativar rotas ou integrações antigas. Seis falhas vieram desses fluxos.
3. Executar novamente o conjunto E2E completo e resolver as falhas restantes; o resultado parcial não valida os 72 cenários.
4. Fazer conferência visual e por perfil com `LEGALOS_EVOLUTION=1`: Desktop, busca global, acesso às áreas e sigilo/permissões.
5. Confirmar os checks de CI dos PRs encadeados e resolver qualquer regressão antes de homologar.
6. Validar conectores somente com credenciais e consentimento reais do escritório; nenhum conector simulado serve como evidência.

## Guardrails mantidos

- Ethos continua acessível; a paridade automatizada cobre as rotas internas mapeadas.
- O portal autenticado do cliente permanece fora da navegação interna da equipe.
- Box antigo permanece desativado.
- Não houve merge nem deploy.

## Critério para mudar o status

Marcar como pronta para homologação somente após fechar as seis pendências acima, repetir a suíte completa e registrar evidência visual/perfil e CI. Até lá, este documento é o checkpoint de handoff, não uma aprovação de lançamento.
