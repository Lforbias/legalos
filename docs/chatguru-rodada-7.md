# Rodada ChatGuru — quatro prioridades do LegalOS Chat

Implementação autorizada em 24/10/2026. Não habilitar campanhas, trocar uma conexão real, enviar mensagens ou simular ligações no escritório para teste.

## Campanhas

Até 10.000 clientes selecionados individualmente ou por filtro de nome. O servidor resolve os destinatários; a lista e o relatório usam páginas de 100. Telefones iguais são deduplicados, pedidos de parada são preservados e números inválidos são ignorados com motivo. Campanha e destinatários são criados na mesma transação. A pessoa confere o rascunho antes de aprovar.

Lotes de até 20 por campanha, com reserva persistida de um lote por minuto inclusive entre processos concorrentes. A chave de campanhas é conferida e pause/cancelamento são respeitados. Resultados SENDING antigos são marcados UNKNOWN, sem reenvio automático, pois o provedor pode já ter recebido a mensagem. Meta usa modelo aprovado mesmo dentro da janela de texto. A aceitação do envio não prova entrega ou leitura.

## Situações

`service_status` guarda OPEN, IN_SERVICE, WAITING, RESOLVED, CLOSED ou UNDEFINED. `status` OPEN/CLOSED permanece compatível com relatórios, filas e rotinas existentes. Um trigger mantém a coerência quando rotinas legadas escrevem apenas o campo antigo; os status personalizados continuam independentes.

Resposta humana aceita pelo transporte marca IN_SERVICE quando habilitado por número. Resposta do cliente tira de WAITING. Recebimento reabre atendimentos encerrados, preservando o responsável antes do intervalo configurado; depois, pode devolver à fila para redistribuição (padrão 30 minutos). Ausência de agente disponível pode deixar a conversa sem responsável. Eventos antigos não desfazem encerramento posterior; timestamps da Meta têm resolução de segundos. Automações internas e notas não iniciam atendimento humano.

## Ligações

O driver Baileys recebe eventos de chamadas individuais QR e persiste um único registro por chamada. `accept` é a evidência de atendimento; `terminate` sozinho não comprova atendimento. Eventos repetidos não criam registros extras e ofertas atrasadas não regridem o encerramento. O log não abre a janela de mensagens de 24 horas, não atende/rejeita chamadas e não grava áudio. A duração da chamada não é estimada.

Todas as conexões permitem registro manual identificado, separado dos eventos automáticos. Meta Calling não está integrado: não se afirma captura automática de chamadas na conexão Meta. O comportamento real do QR depende dos eventos efetivamente disponibilizados pelo aparelho/Baileys e precisa de teste autorizado com uma ligação real.

## Troca de conexão

A reconexão QR já preservava as conversas. O fluxo agora é explícito, protegido por permissões e 2FA cadastrado e pausa campanhas ativas antes do novo pareamento. O mesmo ID de conta permanece, assim como mensagens, conversas, responsáveis e vínculos. Está disponível para número principal e adicionais.

Não foi implementada importação de sessão do ChatGuru ou de fornecedores incompatíveis. Parear um aparelho não migra seu histórico anterior. Credenciais Meta continuam sendo validadas antes de salvar na conta principal existente. Nenhuma conexão real foi substituída durante a implementação.

## Validação

98 testes de integração passaram, incluindo campanha de 2.601 clientes sem envio, concorrência, opt-out, resultados incertos, isolamento, reabertura, registro de chamada e preservação de histórico no pareamento, além de bots, automações, cobrança, filas e NPS. Dois testes unitários de transição passaram. Quatro cenários de navegador passaram contra serviços simulados: atendimento Meta, permissões, pareamento QR, campanha de 2.601 contatos e relatório paginado. Build e lint passaram. Homologação real de entrega/captura de chamadas exige o número e contato autorizados; não foram feitas campanhas reais de teste.

## Publicação

Publicado em 24/10/2026 no commit `d0fb5b0`, execução GitHub Actions [40062670967](https://github.com/Lforbias/legalos/actions/runs/40062670967), concluída com sucesso. A migração foi aplicada e `/api/ready` confirmou banco, migrações e armazenamento. Conferência somente de leitura nas configurações do site mostrou o pareamento com preservação de histórico, regras por número com intervalo de 30 minutos e limite de 10.000 clientes nas campanhas. Nenhuma conexão foi trocada nem campanha aprovada nessa conferência. Captura e entrega reais continuam sem homologação nesta rodada.
