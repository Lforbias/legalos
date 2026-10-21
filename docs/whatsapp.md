# Atendimento por WhatsApp (Fase 1)

Caixa de conversas dentro do LegalOS, ligada ao cadastro de clientes, usando a **API oficial da Meta (WhatsApp Cloud API)** diretamente, sem intermediário.

**Estado honesto:** foi escrito a partir da documentação pública e testado contra um servidor que **imita** a Graph API (`src/tests/integration/fake-whatsapp.ts`). **Nunca falou com a Meta de verdade.** Antes de usar com clientes, faça o primeiro teste com o número de teste da Meta.

## O que existe
- Receber e enviar texto e arquivos (PDF, Word, Excel, imagens, áudio, vídeo dentro dos limites do WhatsApp).
- Conversa por número do cliente; vínculo automático com o cadastro de clientes pelo telefone (tenta com e sem o nono dígito; se dois clientes tiverem o mesmo telefone, não vincula sozinho). Vínculo manual na própria conversa.
- Atribuir a um atendente, filtros (abertas, minhas, sem responsável, encerradas), busca, encerrar e reabrir (reabre sozinha quando o cliente escreve).
- Notas internas (nunca vão ao cliente), respostas rápidas (digite `/`), indicador de janela de 24 h, envio de **modelos aprovados** (único jeito de falar fora da janela ou iniciar contato), mensagem de ausência fora do expediente (no máximo 1 vez a cada 12 h por conversa).
- Status de entrega (enviada, entregue, lida, falhou, com o motivo da Meta). A tela atualiza a cada 8 s (sem tempo real).
- Token cifrado com `CERT_ENCRYPTION_KEY` (entra na rotação de chaves), conectar/remover exige 2FA ativo, auditoria de conexão/atribuição/vínculo.

## Como ligar (quando houver conta na Meta)
1. Meta for Developers: criar app tipo Business, adicionar o produto WhatsApp, anotar **ID do número de telefone**, **ID da conta do WhatsApp Business** e gerar um **token permanente** (usuário do sistema). Anotar a **chave secreta do app**.
2. `.env.production`: `WHATSAPP_APP_SECRET=<chave secreta do app>`, `WHATSAPP_VERIFY_TOKEN=$(openssl rand -hex 16)`, opcional `WHATSAPP_API_VERSION` (padrão v21.0 — confirme a vigente no painel). Reinicie o app. `npm run check:prod` confere.
3. Na Meta → WhatsApp → Configuração → Webhook: URL `https://SEU-DOMINIO/api/whatsapp/webhook`, token de verificação = `WHATSAPP_VERIFY_TOKEN`, assinar o campo `messages`.
4. No LegalOS: Atendimento → Configurações → colar ID do número, ID da conta e token (exige 2FA). Conferido na Meta antes de gravar.
5. Criar/aprovar modelos no painel da Meta e usar “Sincronizar modelos”.
6. Testar primeiro com o **número de teste** da Meta.

## Conexão por QR-Code (opção avançada, não oficial)
Em Configurações do atendimento há duas opções: **API oficial da Meta** (padrão, recomendada) e **QR-Code** (como o ChatGuru: lê-se o código com o celular em Aparelhos conectados). O QR usa o WhatsApp Web e **contraria os termos do WhatsApp**: o número pode ser banido ou desconectado a qualquer momento. Exige 2FA e a confirmação dos riscos. Sem janela de 24 h e sem modelos. Um número por escritório e **uma única instância do sistema** (duas instâncias se derrubam). Para o primeiro teste real, use um número descartável. Foi testado só com driver simulado; o driver real (Baileys) não foi exercitado contra o WhatsApp.

## Limites e cuidados
- Um número por escritório. Um número não pode estar em dois escritórios.
- **Não verificado:** versão vigente da Graph API, regras de coexistência (app + API no mesmo número), preços por conversa, exigências de revisão do app e de verificação da empresa pela Meta.
- O limite de armazenamento do plano é conferido ao guardar mídia, mas mídias do WhatsApp ainda não entram na conta de uso exibida.
- Sem notificação por push de mensagem nova (só contador na lista e atualização periódica).
- Respostas em massa/campanhas a quem nunca falou com o escritório **não** fazem parte (regras de publicidade da OAB e LGPD). Fases seguintes: tarefa a partir da mensagem, vínculo com processo, resumo por IA, triagem por menu, avisos a clientes existentes.
- Fotos e arquivos recebidos vêm de terceiros: são servidos por rota autenticada, só imagens/áudio/vídeo comuns abrem no navegador, o resto baixa como anexo, com CSP restritiva.
- O endereço de mídia devolvido pela Meta só é baixado se for https e não apontar para rede interna.

## Testes
`src/tests/unit/whatsapp-lib.test.ts`, `src/tests/integration/whatsapp.test.ts` (20), `src/tests/integration/whatsapp-qr.test.ts` (12), `src/tests/unit/whatsapp-qr-lib.test.ts` (4), `src/tests/e2e/whatsapp.spec.ts` (3). Variáveis do E2E em `playwright.config.ts`.
