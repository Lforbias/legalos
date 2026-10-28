# LegalOS PJe — captura assistida 0.1.0

Instalação no Chrome/Edge: extraia o ZIP, abra chrome://extensions ou edge://extensions, ative o modo de desenvolvedor, clique em Carregar sem compactação e selecione esta pasta.

1. No LegalOS → Integrações → PJe, clique em Criar conexão pessoal e copie a chave para a extensão. Exige 2FA ativo e permissão de cadastrar processos. Ela só concede `pje:discover`, expira em 90 dias e pode ser revogada na mesma tela. A fila é pessoal.
2. Abra a extensão e conecte a chave. Confira o nome do escritório devolvido pelo LegalOS. Trocar a chave limpa a fila local e desliga o envio automático.
3. Abra o PJe no domínio oficial do tribunal e autorize apenas aquela origem na extensão. O Chrome apresenta a permissão de leitura da página para esse tribunal.
4. Entre normalmente no PJe (certificado/senha e OTP). A extensão não faz login nem captura credenciais.
5. Autorize o envio automático ou clique em Sincronizar fila agora. Números visíveis são detectados após mudanças da página e ao retornar à aba. Formatação suportada: NNNNNNN-DD.AAAA.J.TR.OOOO.
6. Abra LegalOS → Integrações → PJe e confira o cliente/caso de cada número. Um número observado não prova uma distribuição nova. Não há vinculação apenas por nome.

Envio: somente número CNJ e origem HTTPS do tribunal, sem URL completa, CPF, nomes, textos, cookies, OTP ou documentos. Um CNJ identifica um processo: autorize somente tribunais e o escritório correto. A chave fica no armazenamento local do perfil do navegador, limitado aos contextos da própria extensão; não usa sincronização do Chrome.

Escopo: a extensão detecta páginas acessadas, não processos invisíveis nem todos os processos de uma OAB. Não acompanha o tribunal com navegador fechado. Não protocola, não dá ciência a intimações e não preenche formulários. A captura permanece local por padrão; o envio automático é opção explícita. Repetições são deduplicadas. Falhas mantêm a fila; a cada 5 minutos há nova tentativa se o automático estiver ligado, enquanto o navegador estiver aberto. Chave recusada pausa o automático. Fila local: 500 números; o LegalOS mantém até 1.000 pendentes por pessoa e mostra os 100 mais recentes.

Autenticador: em Integrações → PJe, registre a chave real (Base32 ou otpauth) cadastrada no tribunal, confirme com um código atual dela e autorize com seu 2FA do LegalOS. TOTP SHA1/6 dígitos/30 segundos. Cada geração exige verificação pessoal e retorna só o código temporário. O código deve ser digitado na página oficial. Isso não registra automaticamente um autenticador no PJe nem comprova login. Não substitua o cadastro do tribunal por uma chave inventada pelo LegalOS.

Validação em tribunal real ainda necessária. Esta versão não foi instalada na Chrome Web Store; instale como extensão de desenvolvimento somente em um perfil de teste até confirmar o fluxo do seu tribunal.
