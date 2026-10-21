# Avisos no celular (push) — 2.0-F14

Cada pessoa recebe, no celular, um aviso quando prazos ou tarefas suas estiverem perto de vencer. **O texto é sempre genérico** (por exemplo, "Você tem 2 prazos e 1 tarefa para vencer ou em atraso"): nenhum nome de cliente, título ou número de processo passa pelo serviço de push do Google/Apple/Mozilla.

## Como funciona
- **Liga/desliga por escritório** (nasce desligado): Minha conta → Avisos no celular → "Escritório (administração)" (precisa da permissão de administrar o escritório). Fica na auditoria.
- **Cada pessoa escolhe**: ativa no próprio aparelho (até 5 aparelhos), escolhe a antecedência (0 a 3 dias), e se quer prazos, tarefas ou os dois.
- **Rotina agendada** `push-due`, a cada 15 minutos (`install-cron.sh`). Só envia entre 7h e 20h (horário do escritório). Cada item é avisado uma vez por etapa (a vencer, hoje, atrasado). Itens atrasados há mais de 3 dias não geram aviso (evita enxurrada ao ligar).
- **Botão "Enviar notificação de teste"** manda um aviso só para os aparelhos de quem clicou (funciona mesmo com o escritório desligado). Limite de 1 teste a cada 20 segundos.
- Aparelhos que o serviço de push recusa (app desinstalado) saem da lista sozinhos.

## Configurar no servidor (uma vez)
1. Gerar as chaves (VAPID). No servidor, dentro de `/opt/legalos`:
   ```
   docker compose run --rm --no-deps app node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log('VAPID_PUBLIC_KEY='+k.publicKey);console.log('VAPID_PRIVATE_KEY='+k.privateKey)"
   ```
   (Se o comando acima não existir na imagem, use `npx web-push generate-vapid-keys` em qualquer computador com Node.)
2. Colocar as duas linhas no `.env.production` e acrescentar `VAPID_SUBJECT=mailto:um-email-do-escritorio@dominio` (um contato do escritório, exigido pelo padrão). **Não cole a chave privada no chat.** Guarde as duas chaves no gerenciador de senhas: se trocar as chaves, todo mundo precisa ativar o aviso de novo.
3. `docker compose up -d app` e `sudo scripts/server/install-cron.sh` (instala a rotina `push-due`).
4. Em Minha conta → Avisos no celular: "Ativar neste aparelho" → "Enviar notificação de teste". Depois um administrador liga os avisos do escritório.

## Aparelhos
- **Android (Chrome):** funciona direto no site ou com o app instalado.
- **iPhone:** só com o app instalado na tela inicial (Safari → Compartilhar → Adicionar à Tela de Início) e iOS 16.4 ou mais novo. Abra o app pelo ícone e ative em Minha conta.
- Precisa de HTTPS (o servidor já tem).

## Segurança
- O servidor só envia para endereços de serviços de push conhecidos (Google FCM, Mozilla, Apple, Windows); qualquer outro endereço é recusado.
- O service worker nunca guarda dados de clientes no aparelho.
- Sem as chaves, a tela avisa a TI e não deixa ligar nem ativar.

## Comunicados do developer (2.0-F15)
No painel do developer, aba **Comunicados**, o dono da plataforma envia novidade, manutenção ou alerta ao sino e/ou ao celular, para todos, um escritório ou uma pessoa. Usa as mesmas chaves e os mesmos aparelhos desta página. Quem desmarcar "Receber comunicados da plataforma" em Minha conta não recebe push (o sino continua). Não coloque dados de clientes no texto.
