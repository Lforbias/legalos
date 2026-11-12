# Evolution 1.0 — Matriz de Rastreabilidade de Rotas

> Mapeamento Ethos → Evolution. Nenhuma rota antiga foi removida.

## Como funciona

A Evolution cria uma **camada de navegação paralela** sob `/evolution/*`.
Cada departamento tem uma landing page que agrega links para as rotas existentes.
A feature flag `LEGALOS_EVOLUTION=1` ativa a experiência; sem ela, `/evolution` redireciona para `/dashboard`.

## Rotas novas (Evolution)

| Rota Evolution | Descrição |
|---|---|
| `/evolution` | Lobby — Meu Escritório |
| `/evolution/mesa` | Minha Mesa — tarefas, agenda, gestão |
| `/evolution/juridico` | Jurídico — processos, prazos, documentos, cálculos |
| `/evolution/controladoria` | Controladoria — alertas, caixa de entrada |
| `/evolution/atendimento` | Atendimento — conversas, clientes, copiloto |
| `/evolution/comercial` | Comercial — CRM, portal do cliente |
| `/evolution/financeiro` | Financeiro & Contábil — lançamentos |
| `/evolution/administracao` | Administração & Gestão — indicadores, equipe, integrações |

## Mapeamento Ethos → Evolution

| Rota Ethos | Departamento Evolution | Descrição |
|---|---|---|
| `/dashboard` | Lobby | Dashboard → Lobby do escritório |
| `/tarefas` | Minha Mesa | Tarefas → Minha Mesa > Tarefas |
| `/agenda` | Minha Mesa | Agenda → Minha Mesa > Agenda |
| `/gestao` | Minha Mesa | Gestão → Minha Mesa (Kanban) |
| `/processos` | Jurídico | Processos → Jurídico > Processos |
| `/prazos` | Jurídico | Prazos → Jurídico > Prazos |
| `/documentos` | Jurídico | Documentos → Jurídico > Documentos |
| `/calculos` | Jurídico | Cálculos → Jurídico > Cálculos |
| `/ia` | Jurídico | IA → Jurídico (assistente contextual) |
| `/caixa-de-entrada` | Controladoria | Caixa de entrada → Controladoria > Caixa de entrada |
| `/alertas` | Controladoria | Alertas → Controladoria > Alertas |
| `/atendimento` | Atendimento | Chat / WhatsApp → Atendimento > Conversas |
| `/clientes` | Atendimento | Clientes → Atendimento > Clientes |
| `/copiloto` | Atendimento | Copiloto → Atendimento > Copiloto |
| `/crm` | Comercial | CRM → Comercial > CRM / Leads |
| `/portal` | Comercial | Portal do cliente → Comercial > Portal |
| `/financeiro` | Financeiro | Financeiro → Financeiro > Lançamentos |
| `/indicadores` | Administração | Indicadores → Administração > Indicadores |
| `/equipe` | Administração | Equipe → Administração > Equipe |
| `/integracoes` | Administração | Integrações → Administração > Integrações |
| `/automacoes` | Administração | Automações → Administração > Automações |
| `/configuracoes` | Administração | Configurações → Administração > Configurações |
| `/relatorios` | Administração | Relatórios → Administração > Indicadores |
| `/rute` | Administração | RUTE → Administração (configuração da IA) |

## Rotas preservadas (sem alteração)

- `/comercial` (corporativo LegalOS) — **não** é o Comercial departamental
- `/admin` — administração interna do LegalOS
- Todas as rotas `/box*`, `/certificados`, `/peticoes`, `/monitoramento` — permanecem desativadas (`BOX_AVAILABLE=false`)
- `/area-de-trabalho` — continua acessível independentemente da Evolution

## Procedimento de retorno

1. Remova `LEGALOS_EVOLUTION=1` do `.env`
2. Reinicie a aplicação
3. As rotas `/evolution/*` passam a redirecionar para `/dashboard`
4. O link "Meu Escritório →" desaparece da barra lateral
5. Nenhum dado foi alterado — retorno imediato e sem efeitos colaterais
