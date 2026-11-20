# Guia do piloto: MVP de testes do LegalOS

Versão: novembro de 2026. Lista de origem: [lista-mvp-2026-11-19.md](lista-mvp-2026-11-19.md).

## 1. Decisões aplicadas (itens 1, 2, 3 e 6)

| # | Decisão | Situação |
|---|---|---|
| 1 | Módulo judicial (Box, robôs, certificados, protocolo) | **Desligado e escondido no MVP.** O piloto de certificado só liga de propósito (`EVOLUTION_PJE_LOGIN_ENABLED=1`) e só para os escritórios listados em `EVOLUTION_PJE_LOGIN_ORGS`. Na `/apresentacao`, o protocolo aparece como "em breve · depois do lançamento". |
| 2 | Escopo do MVP | Aprovado conforme a tabela da lista do MVP. |
| 3 | Escritórios piloto | **Pendente.** Sugestão: de 1 a 3 escritórios, durante 4 semanas. Anote aqui quais são e as datas. |
| 6 | Revisão jurídica de prazos e cálculos | **Pendente.** É preciso indicar uma advogada ou calculista. Já corrigido: prazos da CLT e do Juizado contam em dias úteis. Escondido até a revisão: o cálculo de atualização trabalhista. Falta revisar a tabela de atos inteira, inclusive os embargos da LEF, que contam em dias corridos. |

## 2. O que está ligado e desligado

**Ligado:**
- login, 2FA, equipe e permissões;
- importação do Astrea;
- clientes, processos, prazos, tarefas, agenda e kanban;
- documentos e cofre de senhas;
- financeiro básico;
- cálculos cíveis e de prazo;
- publicações do DJEN, verificadas manualmente;
- portal do cliente;
- RUTE no modo consulta. No modo "Criar e alterar" ela só propõe, e a pessoa confirma.

**Desligado.** Cada item volta com uma variável no `.env`, sempre de propósito:

| Recurso | Variável para religar |
|---|---|
| WhatsApp por QR-Code | `WHATSAPP_QR_ENABLED=1` |
| Campanhas pelo QR-Code | `WHATSAPP_QR_CAMPAIGNS=1` |
| Conciliação bancária | `LEGALOS_FIN_CONCILIACAO=1` |
| Atualização trabalhista | `LEGALOS_CALC_TRABALHISTA=1` |
| RUTE gravando sem aprovação | `LEGALOS_RUTE_EXECUTE=1` |
| OAuth de aplicativos fora da lista confiável | `MCP_OAUTH_TRUSTED_HOSTS` ou `MCP_OAUTH_ALLOW_ANY=1` |

## 3. Configuração do servidor antes do piloto (itens 55 a 59)

O `deploy.sh` agora **se recusa a publicar** quando falta alguma destas configurações. Para um servidor de testes, use `DEPLOY_SKIP_PILOT_CHECK=1`.

- [ ] `MAIL_DRIVER=smtp`, com o SMTP configurado. Teste com `npm run mail-test`.
- [ ] `REGISTRATION_MODE=code` (com um `REGISTRATION_CODE` de 12 caracteres ou mais) ou `closed`.
- [ ] `CRON_SECRET` com 24 caracteres ou mais. Depois, rode `scripts/server/install-cron.sh`.
- [ ] (Recomendado, não obrigatório) `BACKUP_OFFSITE=usuario@outro-servidor:/caminho`, com a chave SSH autorizada nesse destino. Sem ele, o backup diário fica só no servidor e o deploy apenas avisa.
- [ ] **Teste de restauração** antes do piloto: rode `scripts/server/backup-docker.sh` e depois `scripts/verify-backup.sh` (veja [backup-restore.md](backup-restore.md)).
- [ ] `ALERT_WEBHOOK_URL` com um webhook https (Slack, Discord, Teams ou n8n), que recebe um aviso a cada erro do servidor, sem dados pessoais. Crie também um monitor de uptime externo (UptimeRobot, Better Stack ou similar) apontando para `https://SEU-DOMINIO/api/ready`.
- [ ] `LEGALOS_PILOT_TERMS=1`: obriga cada usuário a aceitar os termos do piloto, e o aceite fica registrado.
- [ ] Rode `npm run check:prod` com as variáveis de produção. Ele não pode mostrar nenhum **erro**.

### Migração de limpeza do Box (item 49)

A migração `20270111000000_purge_removed_box_data` apaga, sem volta, os dados do módulo judicial. Isso inclui intimações, monitoramentos DJEN e certificados.

- **Ela não foi alterada.** Se já foi aplicada em produção, mudar o arquivo quebraria a conferência de checksum das migrações.
- O deploy faz um backup cifrado antes de migrar (passo 1 do `deploy.sh`) e não publica se o backup falhar. **Guarde esse backup** até o fim do piloto.
- Se a migração ainda não rodou em produção e alguém precisa dos monitoramentos DJEN antigos, exporte esses dados antes do próximo deploy.

## 4. Validação no mundo real (itens 65 e 66)

### Importação do Astrea, com o backup real de cada escritório piloto
1. Rode a importação em modo de simulação: Configurações → Importação → Simular.
2. Compare as contagens com o Astrea: clientes, processos, tarefas, andamentos e **publicações**. As publicações agora aparecem na Central Judicial (Jurídico → Publicações) e na aba do processo.
3. Importe de verdade e confira 10 processos por amostragem.

### WhatsApp oficial (Meta): só se o Atendimento entrar no piloto
1. No painel da Meta, use o **número de teste** do aplicativo e cadastre o webhook `https://SEU-DOMINIO/api/whatsapp/webhook`.
2. Defina `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN` e conecte o número em Atendimento → Configurações.
3. Teste:
   - receber uma mensagem;
   - responder dentro da janela de 24 horas;
   - enviar um modelo aprovado fora da janela;
   - receber mídia (imagem e áudio).
4. Só libere para o escritório depois que os quatro testes passarem.

## 5. Como reportar problemas durante o piloto

- Anote a **tela** (endereço), **o que fez**, **o que esperava** e **o que aconteceu**. Se possível, mande um print.
- Quando aparece a tela "Algo deu errado", ela mostra um **código**. Informe esse código: ele leva direto ao erro no log do servidor.
- Prazos e cálculos: confira sempre. O piloto não deve ser o único controle de prazos fatais.

## 6. O que ainda falta e depende de pessoas

- Indicar os escritórios piloto (item 3) e a revisora jurídica (item 6).
- Revisar juridicamente o texto dos termos do piloto, que está em `src/lib/pilot-terms.ts`. Ao mudar o texto, troque a versão.
- Rodar as validações reais da seção 4.
- Atualizar a cópia local de cada desenvolvedor com o `main` (item 91).
