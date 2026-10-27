# RUTE: Desktop, memórias e voz

## Desktop

Na pasta do cliente (`/area-de-trabalho/{id}`), a aba RUTE e o botão Conversar com a RUTE abrem o assistente dentro do Desktop. O seletor usa os processos recentes já carregados e autorizados da pasta (até 40). Sem processo selecionado, o contexto é o cliente, que pode ter múltiplos casos. Cada seleção lista somente as conversas pessoais com os mesmos IDs de cliente/processo. Novas conversas preservam a seleção. O servidor valida acesso, vínculo do processo ao cliente e propriedade da conversa; a interface não é a barreira de segurança.

## Memórias pessoais

A pessoa escolhe o que salvar em Minhas memórias. Não há extração automática das conversas nem compartilhamento com colegas. Escopos: pessoal (todas as próprias conversas), cliente ou processo. No Desktop, os escopos acompanham a seleção. A aba RUTE → Minhas memórias permite revisar notas autorizadas mesmo sem provedor de IA conectado.

O armazenamento isola escritório e usuário. Notas de cliente/processo exigem acesso atual e vínculo válido. Memórias de processo não são enviadas ao consultar outro processo nem ao contexto geral do cliente. Até 50 memórias ativas por pessoa, 1.000 caracteres cada; o limite é protegido por transação. CPF/CNPJ/e-mail são mascarados antes de salvar. Remover arquiva a memória e interrompe seu uso futuro; não reescreve respostas já salvas. A expiração segue a retenção da governança, aplicada ao consultar as memórias. Escrita e remoção geram auditoria sem o conteúdo da nota.

A cada mensagem, até 20 memórias pertinentes entram no contexto, limitadas a 6.000 caracteres. São dados/preferências históricos, não instruções de sistema nem autorização para executar ações. A RUTE deve conferir registros atuais e preservar os modos Consultar/Criar e alterar.

## Voz — primeira versão

A entrada utiliza SpeechRecognition/webkitSpeechRecognition do navegador, quando disponível. A pessoa aceita o aviso na conversa e clica Falar agora; a permissão de microfone é pedida pelo navegador. Português brasileiro, uma fala por ativação, encerramento de segurança após 60 segundos. Fechar o painel, esconder a aba, trocar contexto, iniciar uma requisição ou ouvir uma resposta interrompe o reconhecimento. Resultados tardios após cancelamento são ignorados.

O ditado preenche um rascunho editável. Somente Enviar/Enter inicia o pedido, que usa as mesmas permissões, modo e identificação contra repetição do texto. Não há envio automático por voz, escuta de ambiente, palavra de ativação, gravação armazenada pelo LegalOS ou confirmação de ação apenas por falar sim.

Ouvir resposta usa speechSynthesis, preferindo voz local em português quando disponível. É iniciado por clique, pode ser interrompido e não executa ferramentas. A disponibilidade e o processamento local/remoto dependem do navegador/aparelho. O reconhecimento pode enviar áudio ao serviço do navegador antes do mascaramento do texto pelo LegalOS; a interface informa isso antes da ativação. Não há garantia de funcionamento offline ou compatibilidade universal.

Referências oficiais: [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API).

## Validação

Testes automatizados cobrem isolamento, escopo, sigilo, retenção, arquivamento, contexto entre conversas, modo de leitura e ciclo de reconhecimento com serviço simulado. Fala e leitura reais exigem teste no navegador/aparelho da pessoa; não foram gravadas vozes de usuários para a validação.
