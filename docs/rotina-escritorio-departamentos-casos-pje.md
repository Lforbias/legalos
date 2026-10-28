# Rotina operacional — reunião com Talita

## Entrega implementada nesta branch

### Processos e casos

O menu e a carteira passam a se chamar **Processos e casos**. Cada registro tem uma natureza explícita:

- `CASE`: caso pré-processual ou consultivo.
- `ADMINISTRATIVE`: caso administrativo, com número administrativo opcional em “Número antigo / outro”. Não exige CNJ.
- `JUDICIAL`: processo judicial; pode aguardar número. Se houver CNJ, ele continua validado e a natureza precisa ser judicial.

Criar um cadastro sem CNJ e sem natureza explícita gera um caso. Clientes antigos de API que enviam CNJ continuam criando processos judiciais. Uma edição sem natureza preserva a classificação administrativa quando não há CNJ; informar CNJ em uma edição antiga promove para judicial.

A judicialização é uma edição no **mesmo registro**, mantendo ID, partes, documentos, tarefas, comentários e histórico. Não cria um segundo processo automaticamente. Um cliente pode ter vários casos, cada um com natureza e departamento independentes.

CRM continua convertendo o lead em cliente. A ficha do lead ganho oferece “Abrir um caso para este cliente”; o formulário abre com o cliente selecionado. O Desktop também oferece esse vínculo no botão de novo caso. A criação só ocorre após salvar o formulário, evitando cadastros involuntários.

Migração: registros antigos com CNJ tornam-se judiciais; os demais começam como casos. Não se tenta deduzir administratividade a partir de texto livre, o que exige revisão humana.

### Departamentos

Departamento é um registro do próprio escritório, separado da natureza do caso e do responsável. O modo automático resolve a área jurídica para um departamento; na primeira utilização, cria um departamento com o nome da área. Registros existentes com área são vinculados na migração.

A troca de área com encaminhamento automático redireciona o cadastro. Uma escolha explícita pode encaminhar para outro departamento do mesmo escritório. Quem administra pode personalizar os nomes em **Processos e casos → Departamentos**. A listagem tem filtros independentes por natureza e departamento.

REST `GET /api/v1/cases` e a ferramenta compartilhada `buscar_processos` da RUTE/MCP recebem filtros `nature` e `departmentId` e devolvem a classificação e o departamento. A criação compartilhada usa os novos campos opcionais do schema de casos.

**Limite desta entrega:** classificação e encaminhamento de carteira. Ainda falta cadastro de membros do departamento, múltiplas áreas por regra, responsável padrão, rodízio e distribuição automática de tarefas. Departamentos não concedem acesso a casos sigilosos.

### Comentários, menções e remarcação

Comentários e menções já existiam. A tela da tarefa agora explica seu uso e permite **Comentar e remarcar**: comentário, mudança de vencimento e histórico são salvos na mesma transação. Uma versão desatualizada da tarefa impede a gravação conjunta e pede recarregamento. Quem recebeu a menção pode abrir a tarefa e responder/remarcar com a mesma permissão de escrita já existente.

Notificações e IDs de menção só são gerados para membros ativos com acesso à tarefa. Um colega sem acesso ao caso sigiloso não recebe o conteúdo na prévia da notificação. O painel exibe os 200 comentários mais recentes em ordem cronológica.

## Pendências reais — não implementadas nem homologadas

### OTP / MFA do PJe

O LegalOS tem MFA para sua própria conta. Isso não é o OTP do PJe/Jus.br. As credenciais de tribunal atuais guardam identificação, senha e/ou certificado cifrado; não há sessão interativa PDPJ, cadastro de segredo TOTP do tribunal ou desafio OTP integrado.

A tela de credenciais explicita essa limitação. Não foi adicionado um campo de OTP sem conector que o consuma, nem gerador de códigos que aparente autenticação funcional.

Próxima entrega: validar o mecanismo oficial aceito no tribunal e no serviço utilizado. Se houver desafio interativo suportado: operação pendente de autenticação, coleta temporária do código, expiração, cancelamento e retomada única da operação. O código não deve ir para logs, chat da RUTE ou notificações. Certificado e sessão de homologação são necessários para confirmar o acesso real. Não reutilizar o segredo de MFA do LegalOS como se fosse do tribunal.

Fontes oficiais consultadas em 28/10/2026:
- https://portal.trf6.jus.br/cnj-implementa-duplo-fator-de-autenticacao-na-plataforma-digital-do-poder-judiciario/
- https://www.trf3.jus.br/imprensa/campanhas/autenticacao-multipos-fatores-no-pje

Essas páginas descrevem MFA no acesso ao portal. Elas não confirmam que um contrato MNI específico aceita OTP ou que fornece credenciais de integração equivalentes.

### Protocolo e descoberta de processos criados fora do LegalOS

Existe adaptador de demonstração, explicitamente sem protocolo real. O adaptador MNI real disponível envia documentos para processo com CNJ já conhecido, mediante conexão, permissões e tipos de documento compatíveis. Não distribui ação inicial e não retorna automaticamente um novo CNJ. `findConnection` em `mni-petition.service.ts` exige CNJ válido.

Os fluxos atuais de consulta/importação e captura de avisos não equivalem a um observador geral de novas distribuições feitas diretamente no PJe. Não existe webhook universal do PJe configurado para isso.

Para implementar a descoberta:
1. Definir fonte autorizada por tribunal: serviço oficial, consulta de distribuições por advogado ou fornecedor que entregue esse evento.
2. Buscar incrementalmente com cursor, repetir com segurança e deduplicar por escritório + CNJ.
3. Buscar candidatos por CPF/CNPJ de partes, respeitando sigilo. Nome semelhante sozinho nunca confirma vínculo.
4. Mostrar vínculo sugerido para confirmação quando houver mais de um caso, homônimos ou ausência de documento. Preservar o caso pré-processual e seu histórico ao judicializar.
5. Registrar origem, data da última sincronização, erros e pendências de autenticação. Nunca marcar captura ou protocolo como realizado sem retorno verificável.

## Verificação manual

1. Criar um caso administrativo em Previdenciário e outro caso do mesmo cliente em Cível.
2. Conferir os filtros de natureza/departamento e a identificação no Desktop.
3. Editar o primeiro caso para judicial e informar CNJ válido; tarefas e documentos devem continuar no mesmo registro.
4. Comentar numa tarefa usando “Mencionar colega”; verificar a notificação na conta do destinatário autorizado.
5. Responder com “Alterar vencimento com este comentário”; conferir data e histórico.
6. Tentar remarcar a partir de duas abas: a aba antiga deve pedir recarregamento, sem gravar um comentário parcial.
7. Confirmar que menções não enviam notificações a colegas sem acesso a tarefa de caso sigiloso.
