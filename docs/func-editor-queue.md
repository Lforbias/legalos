# FUNC — Lexical e pg-boss

A descrição de tarefas usa Lexical com negrito, itálico e histórico local de edição.
O conteúdo é salvo como Markdown no campo existente e apresentado pelo mesmo editor
em modo de leitura na ficha da tarefa. Outros consumidores textuais continuam recebendo Markdown.
Tabelas, imagens, colaboração simultânea e menções não estão implementadas neste editor.

A primeira fila pg-boss executa a rotina existente de avisos de tarefas e prazos.
Requer PostgreSQL 13+ e Node 20+ (pg-boss 10, compatível com o mínimo do projeto).
O schema func_jobs é criado pelo pg-boss no banco configurado ao iniciar a fila.

Para ativar em um ambiente validado:
1. Configurar FUNC_QUEUE_ENABLED=1 no servidor e no worker.
2. Iniciar o processo persistente com npm run worker:func.
3. Manter o agendador autenticado de POST /api/cron/push-due.
4. Conferir execuções no registro existente de rotinas e falhas em func_jobs.job.

Com a flag ativa, a chamada HTTP retorna 202 após gravar o trabalho.
O worker processa um lote por vez, com até três novas tentativas após exceções,
espera inicial de 30 segundos e backoff. Os avisos usam as regras de deduplicação
do serviço existente. Falhas que o serviço absorve não geram retry da fila.
Ao desligar a flag, o endpoint volta à execução direta. Drene trabalhos pendentes
antes dessa mudança para evitar executar as duas modalidades simultaneamente.
A ativação de produção exige configurar e supervisionar o worker.

Fontes consultadas:
- https://github.com/timgit/pg-boss (README da versão instalada e tipos locais)
- https://github.com/meta/lexical
- https://lexical.dev/docs/react/plugins

Esta entrega seleciona aplicações dos frameworks. Não incorpora todos os plugins
e exemplos dos dois repositórios.
