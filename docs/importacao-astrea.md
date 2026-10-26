# Importação do backup do Astrea

Importador de linha de comando para trazer o **backup completo (CSV)** do Astrea para **um** escritório do LegalOS. Roda no seu computador, contra o seu banco; nenhum dado sai da máquina.

## Antes de rodar
1. Atualize o projeto (`npm install`, `npx prisma generate`, `npm run db:migrate` — a migration `20261023000000_import_map` cria a tabela de controle).
2. Crie sua conta e o escritório no LegalOS (tela de cadastro). Para que responsáveis sejam vinculados, **convide antes** (Configurações → Equipe) as pessoas da equipe com o **mesmo e-mail de login** que usam no Astrea.
3. Faça um backup do banco (`pg_dump`) se já houver dados reais.

## Comandos
```bash
# 1) Simulação: lê, valida e mostra o relatório, sem gravar nada
npm run import:astrea -- --dir "/caminho/BACKUP_TOTAL_..." --email voce@escritorio.com.br --dry-run --report relatorio.json

# 2) Importação de verdade
npm run import:astrea -- --dir "/caminho/BACKUP_TOTAL_..." --email voce@escritorio.com.br

# Só algumas partes (clientes e processos sempre andam juntos quando se escolhe processos)
npm run import:astrea -- --dir "..." --email ... --only clientes,processos,prazos
```
`--only` aceita: `clientes, processos, prazos, tarefas, agenda, intimacoes, financeiro`. O financeiro usa os vínculos de clientes/processos já importados: rode antes (ou junto) esses dois. Se você participa de mais de um escritório, informe `--org <id>` (o comando lista os ids).

**Pode rodar de novo com segurança:** o que já foi importado é reconhecido pelo código do Astrea e pulado (tabela `import_map`).

## Como cada planilha é convertida
| Astrea | LegalOS | Regras |
|---|---|---|
| Contatos (Classificação = Cliente, mais quem é cliente de algum processo) | Clientes | CPF/CNPJ validado; inválido ou repetido **não** é gravado como documento e vai para as observações; RG, filiação, estado civil etc. vão para as observações; etiqueta `astrea` |
| Processos (Tipo Processo/Caso/Incidente) | Processos | Número CNJ válido → número; fora do padrão (ex.: protocolo) → "número antigo"; Ativo → Ativo; Inativo → Encerrado (se tem data de encerramento) ou Arquivado; partes e qualificações (Ativo/Passivo/Neutro) viram partes; responsável e demais usuários viram membros; data de criação preservada; evento "Importado do Astrea" na linha do tempo |
| Processos "Atendimento" | — | não são processos; ficam de fora e aparecem no relatório |
| Prazos | Prazos (origem "importado") | Feito → Cumprido; Cancelado → Cancelado; **Em progresso → Rascunho** (prazo pendente precisa de validação humana no LegalOS) |
| Tarefas | Tarefas | Realizada → Concluída; prioridade Baixa/Média/Alta; comentários vão para a descrição; tarefa de processo não importado entra sem processo, com aviso |
| Audiências e Eventos | Agenda | horário interpretado no fuso do escritório; cancelados ficam de fora |
| Históricos | Linha do tempo do processo (andamentos e anotações) | Só **"Andamento"** (kind Andamento (Astrea)) e **"Manual"** (anotação) entram, com data/hora no fuso do escritório e o autor quando o responsável casa com a equipe (senão fica sem autor). Tarefas realizadas, publicações, prazos, eventos e audiências **não** entram (já existem como tarefas, intimações, prazos e agenda). Lido em fluxo (arquivo de ~100 MB); `--only andamentos` roda só esta parte, depois de importar os processos |
| Publicações | Central de intimações (origem "importada") | Tratada → Tratada; Rejeitada → Descartada; Recebido → Nova; vínculo ao processo quando existe |
| Contas | Contas financeiras | tipo Conta corrente/Caixa/Outros; "Valor inicial" vira saldo inicial; nome igual a uma conta existente → vinculada |
| Categorias, Centros de custo | Cadastros financeiros | subcategoria vira "Pai › Filho"; inativo continua inativo; cor inválida é ignorada |
| Entradas | Lançamentos financeiros | Entrada → a receber; Saída → a pagar; Honorário/Despesa/Avulsa → honorários/despesa/outro; **Feito → pago integralmente (uma baixa na data de pagamento)**; Aberto → em aberto; "1-3" na descrição → parcela 1/3; "Pago para" → fornecedor; cliente/processo só se já importados |
| Usuário | — | usado só para achar o responsável pelo **e-mail de login**; sem correspondência, o item fica com quem rodou o importador |

## O que NÃO é importado
- **Arquivos binários de documentos:** o CSV não contém os arquivos. O importador atual traz links externos válidos para `linked_documents` (`linked_doc` no mapa), vinculados ao processo/cliente. Links não equivalem a uma cópia local do arquivo.
- **Faturas** (agrupadores), linhas de **saldo inicial** (já vêm da conta), lançamentos de valor zero e as planilhas Honorários/Despesas (espelham as Entradas); transferências entre contas.
- comentários avulsos, timesheets, listas de tarefa, contatos que não são clientes nem partes.
- Datas/campos que o Astrea exporta em formato inválido são ignorados e contados no relatório.

## Cuidados (LGPD)
O backup contém dados pessoais sensíveis de clientes. Mantenha a pasta e o relatório fora de serviços compartilhados e apague cópias que não precisar. O relatório (`--report`) contém só contagens, sem dados pessoais.

## No servidor de produção (Docker)
O banco do servidor não é exposto, então o importador roda **dentro de um contêiner** (imagem `migrate`), lendo a pasta do backup do próprio servidor:

1. No Mac, envie a pasta do backup: `scp -r "BACKUP_TOTAL_..." root@IP:/root/astrea-backup`
2. No servidor, simule: `/opt/legalos/scripts/server/import-astrea-docker.sh /root/astrea-backup seu@email.com --dry-run`
3. Leia o relatório (o que entra, o que fica de fora e por quê). Se estiver certo, grave: `... --yes` (faz **backup criptografado antes** e só segue se der certo). Dá para importar por partes com `--only clientes,processos` e depois `--only prazos,tarefas,agenda,intimacoes,financeiro`.
4. Confira por amostragem (cerca de 20 clientes e 20 processos) comparando com o Astrea.
5. Apague a pasta do backup do servidor e do Mac quando terminar (dados sigilosos).

Rodar de novo é seguro: o que já entrou é reconhecido pelo código do Astrea e pulado.

## Escritório de demonstração (equipe completa, mesmo sem login)
Para mostrar o sistema com os dados reais e a equipe inteira, **antes** de importar cadastre a equipe do Astrea no escritório:

```
/opt/legalos/scripts/server/seed-team-docker.sh /root/astrea-backup DONO@email "Nome do escritório" --owners talitabrito_brito@hotmail.com            # simula
/opt/legalos/scripts/server/seed-team-docker.sh /root/astrea-backup DONO@email "Nome do escritório" --owners talitabrito_brito@hotmail.com --apply    # grava
```
- Lê `Usuário.csv` (+ nome completo em `Contatos.csv`): só **equipe ativa** (os clientes com acesso ao portal e os inativos ficam de fora).
- Quem já tem conta no LegalOS só ganha o vínculo; quem não tem recebe uma conta **sem senha utilizável** (senha aleatória que ninguém conhece, e-mail não verificado): aparece como responsável, mas não consegue entrar. Pode reivindicar a conta mais tarde pelo "Esqueci a senha" quando o e-mail real estiver configurado.
- Papéis sugeridos (ajuste em Configurações → Equipe ou com `--roles email=ADMIN,email2=LAWYER`): `--owners` → Proprietário; administrador **com** acesso financeiro → Administrador; só financeiro → Financeiro; e-mail começando com `dr.`/`dra.` ou contendo `adv` → Advogado; demais → Assistente.
- Depois rode o importador no mesmo escritório: `import-astrea-docker.sh /root/astrea-backup DONO@email --org <id> --dry-run` (o `--org` aparece na mensagem de erro se houver mais de um escritório) e, se estiver certo, `--yes`.


## Conferir tarefas com conclusão no comentário legado

Execute `npm run audit:astrea-tasks -- --org <id do escritório>` no ambiente que contém a importação. O diagnóstico só lê as tarefas vinculadas ao Astrea em `import_map`, desconsidera excluídas, concluídas e canceladas e sinaliza as abertas com evento explícito de conclusão no comentário. O JSON contém apenas identificadores, status e data da última alteração; não inclui nomes ou comentários.

Os candidatos não comprovam erro: uma tarefa pode ter sido reaberta. Confira o campo `Realizada` no CSV original e o histórico de alterações antes de corrigir. O comando não altera nem reimporta registros.

A conferência também pode ser aberta por quem administra o escritório em **Box → Operação e auditoria → Conferir tarefas importadas do Astrea**. A tela percorre todos os vínculos de importação, respeita o sigilo e exibe até 100 indícios. O contador considera todo o conjunto visível, sem concluir ou reabrir tarefas.

## Auditoria no produto

Integrações → Diagnóstico operacional compara os mapas Astrea com os destinos existentes por entidade, conta links e arquivos, mostra estados atuais, tarefas importadas sem data e valores financeiros inválidos. Não altera registros. O relatório declara que exclusão lógica não é destino ausente e que contagens atuais não comprovam igualdade com o backup original. A conferência da exportação original, dos arquivos e da conciliação financeira continua necessária.
