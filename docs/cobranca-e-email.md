# Cobrança automática (Asaas) e e-mail

## O que existe e o que NÃO foi provado
- **E-mail:** envio SMTP real já existia (convites, confirmação, recuperação de senha). Novo: **fila com reenvio** para avisos (cobrança e fim do teste), com layout HTML + texto. Testado contra um servidor SMTP real local. **Não foi testado com Google/Zoho/SES de verdade**: use `npm run mail-test -- seu@email` na primeira vez.
- **Cobrança:** integração com o **Asaas** (assinatura mensal, fatura com Pix/boleto/cartão escolhido por quem paga na página do Asaas; nenhum dado de cartão passa pelo LegalOS). Foi escrita pela documentação pública do Asaas e testada contra um **simulador** local. **Não foi testada contra o Asaas real**: faça o primeiro ciclo completo na **sandbox** antes de produção.
- E-mails com link de acesso (recuperação de senha, convite) continuam sendo enviados na hora e **não** vão para a fila (o token não pode ficar gravado em texto no banco). Se o envio falhar, o link continua sendo mostrado ao administrador.

## Passo a passo — e-mail
1. Escolha um provedor SMTP (Google Workspace com senha de app, Zoho, Brevo, Amazon SES…) e um remetente do **seu domínio** com SPF e DKIM configurados no DNS (sem isso cai no spam).
2. Em `.env.production`: `MAIL_DRIVER=smtp`, `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
3. Reinicie o app e teste: `docker compose run --rm app npm run mail-test -- seu@email.com` (se o comando não existir na imagem, use o script a partir do código).
4. Instale os agendadores: `sudo scripts/server/install-cron.sh` (agora inclui `mail` a cada 5 min e `billing` de hora em hora).

## Passo a passo — cobrança (Asaas)
1. Crie a conta no Asaas e use a **sandbox** primeiro (Asaas → Integrações → chave de API da sandbox).
2. `.env.production`: `ASAAS_API_KEY=…`, `ASAAS_WEBHOOK_TOKEN=$(openssl rand -hex 24)`, `ASAAS_ENV=sandbox`. Reinicie o app.
3. No Asaas (Integrações → Webhooks): URL `https://SEU-DOMINIO/api/billing/asaas/webhook`, **token de autenticação = o mesmo ASAAS_WEBHOOK_TOKEN**, eventos de cobrança (`PAYMENT_*`) e de assinatura (`SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`). Deixe a fila de sincronização ativa.
4. Na administração da plataforma, em **Planos e preços** (`/admin/planos`), defina o preço mensal de cada plano (plano sem preço não pode ser contratado).
5. Como proprietário de um escritório de teste (com 2FA ativo): Configurações → **Assinatura e faturas** → preencher dados de cobrança → Contratar. A fatura aparece na lista; pague na sandbox e confira: a situação vira "Em dia", o período avança 1 mês e chega o e-mail de confirmação.
6. Teste também: atraso (vencimento no passado na sandbox), cancelamento, troca de plano e "Atualizar situação".
7. Só depois: `ASAAS_ENV=production` com a chave de produção e o webhook de produção.

## Regras de negócio (como o sistema decide)
- Contratar **não** ativa o plano: só o **pagamento confirmado** ativa (status "Ativa", período = vencimento + 1 mês). Durante o teste, o 1º vencimento é o fim do teste (ninguém paga antes de precisar).
- O sistema **não confia no conteúdo do aviso**: confirma o estado da fatura consultando a API do Asaas. Cada evento é processado uma só vez; se o Asaas estiver fora do ar, o aviso é recusado (5xx) e reenviado pelo Asaas.
- Fatura vencida (a mais recente) → "Pagamento em atraso" (não bloqueia leitura/download; os bloqueios de expansão só ocorrem em teste vencido ou cancelada). Pagou → volta.
- Cancelar: pago e vigente = acesso até o fim do período, depois "Cancelada" pela rotina horária; em teste = o teste continua. Cancelar pelo painel do Asaas tem o mesmo efeito.
- Trocar de plano atualiza o valor das próximas faturas (sem cálculo proporcional).
- A administração ainda pode definir plano/situação à mão em Escritórios; para escritórios com cobrança automática, o próximo aviso do Asaas prevalece.
- Contratar e cancelar exigem **2FA** e permissão `billing:manage` (só o proprietário).

## Limites conhecidos
- Sem nota fiscal automática, sem cupom, sem cobrança proporcional, sem reembolso pela tela (faça no Asaas).
- Moeda única (BRL), ciclo mensal. Sem anual.
- Os e-mails de cobrança vão ao e-mail de cobrança e a quem tem `billing:manage`; o Asaas também envia os próprios e-mails de fatura ao cliente.
