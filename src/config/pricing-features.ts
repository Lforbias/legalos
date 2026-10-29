/** Public catalogue: granular resources and operations, not 300 standalone modules.
 * Every evidence reference is checked against the source by pricing-content.test.ts.
 * Availability remains subject to permissions, configuration and future commercial packaging.
 */
export type PricingFeatureGroup = { name: string; condition: string | null; features: { id: string; label: string; evidence: string }[] };
const ALL_PRICING_FEATURES: PricingFeatureGroup[] = [
  {
    "name": "Clientes",
    "condition": null,
    "features": [
      {
        "id": "client-listClients",
        "label": "Buscar e filtrar clientes",
        "evidence": "src/server/services/client.service.ts#listClients"
      },
      {
        "id": "client-getClient",
        "label": "Consultar ficha do cliente",
        "evidence": "src/server/services/client.service.ts#getClient"
      },
      {
        "id": "client-createClient",
        "label": "Cadastrar cliente",
        "evidence": "src/server/services/client.service.ts#createClient"
      },
      {
        "id": "client-updateClient",
        "label": "Atualizar cadastro do cliente",
        "evidence": "src/server/services/client.service.ts#updateClient"
      },
      {
        "id": "client-archiveClient",
        "label": "Arquivar cliente",
        "evidence": "src/server/services/client.service.ts#archiveClient"
      },
      {
        "id": "client-listClientTags",
        "label": "Consultar etiquetas de clientes",
        "evidence": "src/server/services/client.service.ts#listClientTags"
      },
      {
        "id": "client-addContact",
        "label": "Adicionar contato ao cliente",
        "evidence": "src/server/services/client.service.ts#addContact"
      },
      {
        "id": "client-updateContact",
        "label": "Atualizar contato do cliente",
        "evidence": "src/server/services/client.service.ts#updateContact"
      },
      {
        "id": "client-deleteContact",
        "label": "Remover contato do cliente",
        "evidence": "src/server/services/client.service.ts#deleteContact"
      }
    ]
  },
  {
    "name": "Processos",
    "condition": null,
    "features": [
      {
        "id": "case-listCases",
        "label": "Buscar e filtrar processos",
        "evidence": "src/server/services/case.service.ts#listCases"
      },
      {
        "id": "case-getCase",
        "label": "Consultar detalhes do processo",
        "evidence": "src/server/services/case.service.ts#getCase"
      },
      {
        "id": "case-listCasesForClient",
        "label": "Consultar vários processos do cliente",
        "evidence": "src/server/services/case.service.ts#listCasesForClient"
      },
      {
        "id": "case-createCase",
        "label": "Cadastrar processo ou caso",
        "evidence": "src/server/services/case.service.ts#createCase"
      },
      {
        "id": "case-updateCase",
        "label": "Editar processo",
        "evidence": "src/server/services/case.service.ts#updateCase"
      },
      {
        "id": "case-changeCaseStatus",
        "label": "Alterar situação do processo",
        "evidence": "src/server/services/case.service.ts#changeCaseStatus"
      },
      {
        "id": "case-setCaseAcervo",
        "label": "Mover processo para o acervo",
        "evidence": "src/server/services/case.service.ts#setCaseAcervo"
      },
      {
        "id": "case-archiveCase",
        "label": "Arquivar registro processual",
        "evidence": "src/server/services/case.service.ts#archiveCase"
      },
      {
        "id": "case-addParty",
        "label": "Adicionar parte ao processo",
        "evidence": "src/server/services/case.service.ts#addParty"
      },
      {
        "id": "case-removeParty",
        "label": "Remover parte do processo",
        "evidence": "src/server/services/case.service.ts#removeParty"
      },
      {
        "id": "case-addCaseMember",
        "label": "Vincular responsável ou colaborador",
        "evidence": "src/server/services/case.service.ts#addCaseMember"
      },
      {
        "id": "case-removeCaseMember",
        "label": "Remover membro do processo",
        "evidence": "src/server/services/case.service.ts#removeCaseMember"
      },
      {
        "id": "case-listCaseEvents",
        "label": "Consultar andamentos e eventos",
        "evidence": "src/server/services/case.service.ts#listCaseEvents"
      }
    ]
  },
  {
    "name": "Contexto processual",
    "condition": null,
    "features": [
      {
        "id": "case-extras-listCaseFees",
        "label": "Consultar honorários do processo",
        "evidence": "src/server/services/case-extras.service.ts#listCaseFees"
      },
      {
        "id": "case-extras-addCaseFee",
        "label": "Registrar honorário no processo",
        "evidence": "src/server/services/case-extras.service.ts#addCaseFee"
      },
      {
        "id": "case-extras-removeCaseFee",
        "label": "Remover honorário do processo",
        "evidence": "src/server/services/case-extras.service.ts#removeCaseFee"
      },
      {
        "id": "case-extras-linkCases",
        "label": "Relacionar processos",
        "evidence": "src/server/services/case-extras.service.ts#linkCases"
      },
      {
        "id": "case-extras-unlinkCases",
        "label": "Desvincular processos relacionados",
        "evidence": "src/server/services/case-extras.service.ts#unlinkCases"
      },
      {
        "id": "case-extras-listCaseLinks",
        "label": "Consultar processos relacionados",
        "evidence": "src/server/services/case-extras.service.ts#listCaseLinks"
      },
      {
        "id": "case-extras-listAppeals",
        "label": "Consultar recursos cadastrados",
        "evidence": "src/server/services/case-extras.service.ts#listAppeals"
      },
      {
        "id": "case-extras-saveAppeal",
        "label": "Cadastrar ou editar recurso",
        "evidence": "src/server/services/case-extras.service.ts#saveAppeal"
      },
      {
        "id": "case-extras-removeAppeal",
        "label": "Remover recurso cadastrado",
        "evidence": "src/server/services/case-extras.service.ts#removeAppeal"
      },
      {
        "id": "case-extras-setValuation",
        "label": "Registrar avaliação do processo",
        "evidence": "src/server/services/case-extras.service.ts#setValuation"
      },
      {
        "id": "case-extras-getValuation",
        "label": "Consultar avaliação do processo",
        "evidence": "src/server/services/case-extras.service.ts#getValuation"
      },
      {
        "id": "case-extras-consolidatedHistory",
        "label": "Consultar histórico consolidado",
        "evidence": "src/server/services/case-extras.service.ts#consolidatedHistory"
      }
    ]
  },
  {
    "name": "Anotações",
    "condition": null,
    "features": [
      {
        "id": "case-note-listCaseNotes",
        "label": "Consultar anotações do processo",
        "evidence": "src/server/services/case-note.service.ts#listCaseNotes"
      },
      {
        "id": "case-note-addCaseNoteItem",
        "label": "Criar anotação",
        "evidence": "src/server/services/case-note.service.ts#addCaseNoteItem"
      },
      {
        "id": "case-note-setNotePinned",
        "label": "Fixar ou desafixar anotação",
        "evidence": "src/server/services/case-note.service.ts#setNotePinned"
      },
      {
        "id": "case-note-deleteCaseNote",
        "label": "Excluir anotação",
        "evidence": "src/server/services/case-note.service.ts#deleteCaseNote"
      },
      {
        "id": "case-note-addBulkNote",
        "label": "Registrar anotação em lote",
        "evidence": "src/server/services/case-note.service.ts#addBulkNote"
      },
      {
        "id": "case-note-updateCaseNote",
        "label": "Editar anotação",
        "evidence": "src/server/services/case-note.service.ts#updateCaseNote"
      },
      {
        "id": "case-note-listNoteHistory",
        "label": "Consultar histórico de anotações",
        "evidence": "src/server/services/case-note.service.ts#listNoteHistory"
      },
      {
        "id": "case-note-addNoteAttachment",
        "label": "Anexar arquivo à anotação",
        "evidence": "src/server/services/case-note.service.ts#addNoteAttachment"
      },
      {
        "id": "case-note-getNoteAttachmentForDownload",
        "label": "Baixar anexo da anotação",
        "evidence": "src/server/services/case-note.service.ts#getNoteAttachmentForDownload"
      },
      {
        "id": "case-note-deleteNoteAttachment",
        "label": "Remover anexo da anotação",
        "evidence": "src/server/services/case-note.service.ts#deleteNoteAttachment"
      }
    ]
  },
  {
    "name": "Tarefas",
    "condition": null,
    "features": [
      {
        "id": "task-listTasks",
        "label": "Buscar e filtrar tarefas",
        "evidence": "src/server/services/task.service.ts#listTasks"
      },
      {
        "id": "task-getTask",
        "label": "Consultar detalhes da tarefa",
        "evidence": "src/server/services/task.service.ts#getTask"
      },
      {
        "id": "task-createTask",
        "label": "Criar tarefa",
        "evidence": "src/server/services/task.service.ts#createTask"
      },
      {
        "id": "task-updateTask",
        "label": "Editar tarefa",
        "evidence": "src/server/services/task.service.ts#updateTask"
      },
      {
        "id": "task-changeTaskStatus",
        "label": "Alterar situação da tarefa",
        "evidence": "src/server/services/task.service.ts#changeTaskStatus"
      },
      {
        "id": "task-deleteTask",
        "label": "Excluir tarefa",
        "evidence": "src/server/services/task.service.ts#deleteTask"
      },
      {
        "id": "task-addTaskComment",
        "label": "Comentar tarefa",
        "evidence": "src/server/services/task.service.ts#addTaskComment"
      },
      {
        "id": "task-listTasksForCase",
        "label": "Consultar tarefas do processo",
        "evidence": "src/server/services/task.service.ts#listTasksForCase"
      }
    ]
  },
  {
    "name": "Organização das tarefas",
    "condition": null,
    "features": [
      {
        "id": "task-extras-listTaskTypes",
        "label": "Consultar tipos de tarefa",
        "evidence": "src/server/services/task-extras.service.ts#listTaskTypes"
      },
      {
        "id": "task-extras-saveTaskType",
        "label": "Criar ou editar tipo de tarefa",
        "evidence": "src/server/services/task-extras.service.ts#saveTaskType"
      },
      {
        "id": "task-extras-deleteTaskType",
        "label": "Excluir tipo de tarefa",
        "evidence": "src/server/services/task-extras.service.ts#deleteTaskType"
      },
      {
        "id": "task-extras-listTaskLabels",
        "label": "Consultar etiquetas de tarefas",
        "evidence": "src/server/services/task-extras.service.ts#listTaskLabels"
      },
      {
        "id": "task-extras-saveTaskLabel",
        "label": "Criar ou editar etiqueta de tarefa",
        "evidence": "src/server/services/task-extras.service.ts#saveTaskLabel"
      },
      {
        "id": "task-extras-deleteTaskLabel",
        "label": "Excluir etiqueta de tarefa",
        "evidence": "src/server/services/task-extras.service.ts#deleteTaskLabel"
      },
      {
        "id": "task-extras-getTaskClassification",
        "label": "Consultar classificação da tarefa",
        "evidence": "src/server/services/task-extras.service.ts#getTaskClassification"
      },
      {
        "id": "task-extras-setTaskClassification",
        "label": "Classificar tarefa",
        "evidence": "src/server/services/task-extras.service.ts#setTaskClassification"
      },
      {
        "id": "task-extras-listTaskEvents",
        "label": "Consultar histórico da tarefa",
        "evidence": "src/server/services/task-extras.service.ts#listTaskEvents"
      },
      {
        "id": "task-extras-listTaskAttachments",
        "label": "Consultar anexos da tarefa",
        "evidence": "src/server/services/task-extras.service.ts#listTaskAttachments"
      },
      {
        "id": "task-extras-addTaskAttachment",
        "label": "Anexar arquivo à tarefa",
        "evidence": "src/server/services/task-extras.service.ts#addTaskAttachment"
      },
      {
        "id": "task-extras-getTaskAttachmentForDownload",
        "label": "Baixar anexo da tarefa",
        "evidence": "src/server/services/task-extras.service.ts#getTaskAttachmentForDownload"
      },
      {
        "id": "task-extras-deleteTaskAttachment",
        "label": "Remover anexo da tarefa",
        "evidence": "src/server/services/task-extras.service.ts#deleteTaskAttachment"
      },
      {
        "id": "task-extras-pointsReport",
        "label": "Consultar pontuação das tarefas",
        "evidence": "src/server/services/task-extras.service.ts#pointsReport"
      }
    ]
  },
  {
    "name": "Etapas de trabalho",
    "condition": null,
    "features": [
      {
        "id": "task-stage-listTaskStages",
        "label": "Consultar etapas personalizadas",
        "evidence": "src/server/services/task-stage.service.ts#listTaskStages"
      },
      {
        "id": "task-stage-saveTaskStage",
        "label": "Criar ou editar etapa de trabalho",
        "evidence": "src/server/services/task-stage.service.ts#saveTaskStage"
      },
      {
        "id": "task-stage-setTaskStage",
        "label": "Mover tarefa entre etapas",
        "evidence": "src/server/services/task-stage.service.ts#setTaskStage"
      }
    ]
  },
  {
    "name": "Checklists e colaboração",
    "condition": null,
    "features": [
      {
        "id": "activity-details-activityDetails",
        "label": "Consultar detalhes integrados da atividade",
        "evidence": "src/server/services/activity-details.service.ts#activityDetails"
      },
      {
        "id": "activity-details-createActivityChecklist",
        "label": "Criar checklist da atividade",
        "evidence": "src/server/services/activity-details.service.ts#createActivityChecklist"
      },
      {
        "id": "activity-details-setChecklistItem",
        "label": "Marcar ou desmarcar item do checklist",
        "evidence": "src/server/services/activity-details.service.ts#setChecklistItem"
      },
      {
        "id": "activity-details-addActivityCollaborator",
        "label": "Adicionar colaborador à atividade",
        "evidence": "src/server/services/activity-details.service.ts#addActivityCollaborator"
      },
      {
        "id": "activity-details-removeActivityCollaborator",
        "label": "Remover colaborador da atividade",
        "evidence": "src/server/services/activity-details.service.ts#removeActivityCollaborator"
      }
    ]
  },
  {
    "name": "Recorrências",
    "condition": null,
    "features": [
      {
        "id": "activity-series-getActivitySeries",
        "label": "Consultar série de atividades",
        "evidence": "src/server/services/activity-series.service.ts#getActivitySeries"
      },
      {
        "id": "activity-series-repeatActivity",
        "label": "Criar recorrência de atividade",
        "evidence": "src/server/services/activity-series.service.ts#repeatActivity"
      },
      {
        "id": "activity-series-updateFollowingActivities",
        "label": "Alterar próximas atividades da série",
        "evidence": "src/server/services/activity-series.service.ts#updateFollowingActivities"
      }
    ]
  },
  {
    "name": "Agenda",
    "condition": null,
    "features": [
      {
        "id": "agenda-listEvents",
        "label": "Consultar compromissos por período",
        "evidence": "src/server/services/agenda.service.ts#listEvents"
      },
      {
        "id": "agenda-getEvent",
        "label": "Consultar detalhes do compromisso",
        "evidence": "src/server/services/agenda.service.ts#getEvent"
      },
      {
        "id": "agenda-createEvent",
        "label": "Criar compromisso",
        "evidence": "src/server/services/agenda.service.ts#createEvent"
      },
      {
        "id": "agenda-updateEvent",
        "label": "Editar compromisso",
        "evidence": "src/server/services/agenda.service.ts#updateEvent"
      },
      {
        "id": "agenda-deleteEvent",
        "label": "Excluir compromisso",
        "evidence": "src/server/services/agenda.service.ts#deleteEvent"
      },
      {
        "id": "agenda-changeEventStatus",
        "label": "Alterar situação do compromisso",
        "evidence": "src/server/services/agenda.service.ts#changeEventStatus"
      }
    ]
  },
  {
    "name": "Prazos",
    "condition": null,
    "features": [
      {
        "id": "deadline-calculateAuxiliary",
        "label": "Calcular prazo auxiliar",
        "evidence": "src/server/services/deadline.service.ts#calculateAuxiliary"
      },
      {
        "id": "deadline-listDeadlines",
        "label": "Buscar e filtrar prazos",
        "evidence": "src/server/services/deadline.service.ts#listDeadlines"
      },
      {
        "id": "deadline-getDeadline",
        "label": "Consultar detalhes do prazo",
        "evidence": "src/server/services/deadline.service.ts#getDeadline"
      },
      {
        "id": "deadline-createDeadline",
        "label": "Criar prazo em rascunho",
        "evidence": "src/server/services/deadline.service.ts#createDeadline"
      },
      {
        "id": "deadline-updateDeadline",
        "label": "Editar prazo",
        "evidence": "src/server/services/deadline.service.ts#updateDeadline"
      },
      {
        "id": "deadline-validateDeadline",
        "label": "Validar prazo revisado",
        "evidence": "src/server/services/deadline.service.ts#validateDeadline"
      },
      {
        "id": "deadline-fulfillDeadline",
        "label": "Marcar prazo cumprido",
        "evidence": "src/server/services/deadline.service.ts#fulfillDeadline"
      },
      {
        "id": "deadline-cancelDeadline",
        "label": "Cancelar prazo",
        "evidence": "src/server/services/deadline.service.ts#cancelDeadline"
      },
      {
        "id": "deadline-listDeadlinesForCase",
        "label": "Consultar prazos do processo",
        "evidence": "src/server/services/deadline.service.ts#listDeadlinesForCase"
      }
    ]
  },
  {
    "name": "Documentos",
    "condition": null,
    "features": [
      {
        "id": "document-listDocuments",
        "label": "Consultar documentos vinculados",
        "evidence": "src/server/services/document.service.ts#listDocuments"
      },
      {
        "id": "document-listRepository",
        "label": "Buscar no repositório de documentos",
        "evidence": "src/server/services/document.service.ts#listRepository"
      },
      {
        "id": "document-uploadDocument",
        "label": "Enviar documento ao repositório",
        "evidence": "src/server/services/document.service.ts#uploadDocument"
      },
      {
        "id": "document-getDocument",
        "label": "Consultar ficha do documento",
        "evidence": "src/server/services/document.service.ts#getDocument"
      },
      {
        "id": "document-updateDocumentMeta",
        "label": "Editar nome e classificação documental",
        "evidence": "src/server/services/document.service.ts#updateDocumentMeta"
      },
      {
        "id": "document-addDocumentVersion",
        "label": "Adicionar versão ao documento",
        "evidence": "src/server/services/document.service.ts#addDocumentVersion"
      },
      {
        "id": "document-getDocumentForDownload",
        "label": "Baixar documento ou versão",
        "evidence": "src/server/services/document.service.ts#getDocumentForDownload"
      },
      {
        "id": "document-deleteDocument",
        "label": "Excluir documento",
        "evidence": "src/server/services/document.service.ts#deleteDocument"
      }
    ]
  },
  {
    "name": "Pesquisa documental",
    "condition": "Formatos e extração disponíveis; resultados dependem do conteúdo indexado.",
    "features": [
      {
        "id": "document-text-extractDocumentText",
        "label": "Extrair texto de documento",
        "evidence": "src/server/services/document-text.service.ts#extractDocumentText"
      },
      {
        "id": "document-text-getDocumentTextInfo",
        "label": "Consultar situação da extração de texto",
        "evidence": "src/server/services/document-text.service.ts#getDocumentTextInfo"
      },
      {
        "id": "document-text-searchDocumentContent",
        "label": "Pesquisar conteúdo já extraído",
        "evidence": "src/server/services/document-text.service.ts#searchDocumentContent"
      },
      {
        "id": "document-text-caseDocumentExcerpts",
        "label": "Recuperar trechos dos documentos do processo",
        "evidence": "src/server/services/document-text.service.ts#caseDocumentExcerpts"
      }
    ]
  },
  {
    "name": "Modelos de documentos",
    "condition": null,
    "features": [
      {
        "id": "template-listTemplates",
        "label": "Consultar modelos de documentos",
        "evidence": "src/server/services/template.service.ts#listTemplates"
      },
      {
        "id": "template-getTemplate",
        "label": "Abrir conteúdo de modelo",
        "evidence": "src/server/services/template.service.ts#getTemplate"
      },
      {
        "id": "template-createTemplate",
        "label": "Criar modelo de documento",
        "evidence": "src/server/services/template.service.ts#createTemplate"
      },
      {
        "id": "template-updateTemplate",
        "label": "Editar modelo de documento",
        "evidence": "src/server/services/template.service.ts#updateTemplate"
      },
      {
        "id": "template-deleteTemplate",
        "label": "Excluir modelo de documento",
        "evidence": "src/server/services/template.service.ts#deleteTemplate"
      },
      {
        "id": "template-generateFromTemplate",
        "label": "Gerar documento a partir de modelo",
        "evidence": "src/server/services/template.service.ts#generateFromTemplate"
      },
      {
        "id": "template-previewTemplatePdf",
        "label": "Visualizar prévia PDF do modelo",
        "evidence": "src/server/services/template.service.ts#previewTemplatePdf"
      }
    ]
  },
  {
    "name": "Autotextos",
    "condition": null,
    "features": [
      {
        "id": "snippet-listSnippets",
        "label": "Consultar autotextos",
        "evidence": "src/server/services/snippet.service.ts#listSnippets"
      },
      {
        "id": "snippet-getSnippet",
        "label": "Abrir autotexto",
        "evidence": "src/server/services/snippet.service.ts#getSnippet"
      },
      {
        "id": "snippet-createSnippet",
        "label": "Criar autotexto",
        "evidence": "src/server/services/snippet.service.ts#createSnippet"
      },
      {
        "id": "snippet-updateSnippet",
        "label": "Editar autotexto",
        "evidence": "src/server/services/snippet.service.ts#updateSnippet"
      },
      {
        "id": "snippet-deleteSnippet",
        "label": "Excluir autotexto",
        "evidence": "src/server/services/snippet.service.ts#deleteSnippet"
      }
    ]
  },
  {
    "name": "Identidade dos documentos",
    "condition": null,
    "features": [
      {
        "id": "letterhead-listLetterheads",
        "label": "Consultar timbrados",
        "evidence": "src/server/services/letterhead.service.ts#listLetterheads"
      },
      {
        "id": "letterhead-createLetterhead",
        "label": "Criar timbrado",
        "evidence": "src/server/services/letterhead.service.ts#createLetterhead"
      },
      {
        "id": "letterhead-updateLetterhead",
        "label": "Editar timbrado",
        "evidence": "src/server/services/letterhead.service.ts#updateLetterhead"
      },
      {
        "id": "letterhead-deleteLetterhead",
        "label": "Excluir timbrado",
        "evidence": "src/server/services/letterhead.service.ts#deleteLetterhead"
      }
    ]
  },
  {
    "name": "Financeiro",
    "condition": null,
    "features": [
      {
        "id": "finance-listAccounts",
        "label": "Consultar contas financeiras",
        "evidence": "src/server/services/finance.service.ts#listAccounts"
      },
      {
        "id": "finance-createAccount",
        "label": "Cadastrar conta financeira",
        "evidence": "src/server/services/finance.service.ts#createAccount"
      },
      {
        "id": "finance-setAccountActive",
        "label": "Ativar ou desativar conta financeira",
        "evidence": "src/server/services/finance.service.ts#setAccountActive"
      },
      {
        "id": "finance-listCategories",
        "label": "Consultar categorias financeiras",
        "evidence": "src/server/services/finance.service.ts#listCategories"
      },
      {
        "id": "finance-createCategory",
        "label": "Criar categoria financeira",
        "evidence": "src/server/services/finance.service.ts#createCategory"
      },
      {
        "id": "finance-setCategoryActive",
        "label": "Ativar ou desativar categoria financeira",
        "evidence": "src/server/services/finance.service.ts#setCategoryActive"
      },
      {
        "id": "finance-listCostCenters",
        "label": "Consultar centros de custo",
        "evidence": "src/server/services/finance.service.ts#listCostCenters"
      },
      {
        "id": "finance-createCostCenter",
        "label": "Criar centro de custo",
        "evidence": "src/server/services/finance.service.ts#createCostCenter"
      },
      {
        "id": "finance-setCostCenterActive",
        "label": "Ativar ou desativar centro de custo",
        "evidence": "src/server/services/finance.service.ts#setCostCenterActive"
      },
      {
        "id": "finance-createEntry",
        "label": "Criar lançamento financeiro",
        "evidence": "src/server/services/finance.service.ts#createEntry"
      },
      {
        "id": "finance-updateEntry",
        "label": "Editar lançamento financeiro",
        "evidence": "src/server/services/finance.service.ts#updateEntry"
      },
      {
        "id": "finance-cancelEntry",
        "label": "Cancelar lançamento financeiro",
        "evidence": "src/server/services/finance.service.ts#cancelEntry"
      },
      {
        "id": "finance-registerPayment",
        "label": "Registrar baixa ou pagamento",
        "evidence": "src/server/services/finance.service.ts#registerPayment"
      },
      {
        "id": "finance-reversePayment",
        "label": "Estornar baixa registrada",
        "evidence": "src/server/services/finance.service.ts#reversePayment"
      },
      {
        "id": "finance-listEntries",
        "label": "Buscar lançamentos financeiros",
        "evidence": "src/server/services/finance.service.ts#listEntries"
      },
      {
        "id": "finance-getEntry",
        "label": "Consultar detalhes do lançamento",
        "evidence": "src/server/services/finance.service.ts#getEntry"
      },
      {
        "id": "finance-financeSummary",
        "label": "Consultar resumo financeiro",
        "evidence": "src/server/services/finance.service.ts#financeSummary"
      },
      {
        "id": "finance-accountBalances",
        "label": "Consultar saldos por conta",
        "evidence": "src/server/services/finance.service.ts#accountBalances"
      },
      {
        "id": "finance-cashflow",
        "label": "Consultar fluxo de caixa",
        "evidence": "src/server/services/finance.service.ts#cashflow"
      },
      {
        "id": "finance-entryTotalsFor",
        "label": "Consultar totais por cliente ou processo",
        "evidence": "src/server/services/finance.service.ts#entryTotalsFor"
      }
    ]
  },
  {
    "name": "CRM e oportunidades",
    "condition": null,
    "features": [
      {
        "id": "crm-listLeads",
        "label": "Buscar oportunidades comerciais",
        "evidence": "src/server/services/crm.service.ts#listLeads"
      },
      {
        "id": "crm-getLead",
        "label": "Consultar oportunidade",
        "evidence": "src/server/services/crm.service.ts#getLead"
      },
      {
        "id": "crm-createLead",
        "label": "Criar oportunidade",
        "evidence": "src/server/services/crm.service.ts#createLead"
      },
      {
        "id": "crm-updateLead",
        "label": "Editar oportunidade",
        "evidence": "src/server/services/crm.service.ts#updateLead"
      },
      {
        "id": "crm-changeLeadStage",
        "label": "Mover oportunidade no funil",
        "evidence": "src/server/services/crm.service.ts#changeLeadStage"
      },
      {
        "id": "crm-markLeadLost",
        "label": "Registrar perda da oportunidade",
        "evidence": "src/server/services/crm.service.ts#markLeadLost"
      },
      {
        "id": "crm-reopenLead",
        "label": "Reabrir oportunidade",
        "evidence": "src/server/services/crm.service.ts#reopenLead"
      },
      {
        "id": "crm-addLeadActivity",
        "label": "Registrar atividade comercial",
        "evidence": "src/server/services/crm.service.ts#addLeadActivity"
      },
      {
        "id": "crm-convertLead",
        "label": "Converter oportunidade em cliente",
        "evidence": "src/server/services/crm.service.ts#convertLead"
      },
      {
        "id": "crm-deleteLead",
        "label": "Excluir oportunidade",
        "evidence": "src/server/services/crm.service.ts#deleteLead"
      },
      {
        "id": "crm-createProposal",
        "label": "Criar proposta comercial",
        "evidence": "src/server/services/crm.service.ts#createProposal"
      },
      {
        "id": "crm-updateProposal",
        "label": "Editar proposta comercial",
        "evidence": "src/server/services/crm.service.ts#updateProposal"
      },
      {
        "id": "crm-sendProposal",
        "label": "Registrar proposta como enviada",
        "evidence": "src/server/services/crm.service.ts#sendProposal"
      },
      {
        "id": "crm-acceptProposal",
        "label": "Registrar aceite da proposta",
        "evidence": "src/server/services/crm.service.ts#acceptProposal"
      },
      {
        "id": "crm-rejectProposal",
        "label": "Registrar recusa da proposta",
        "evidence": "src/server/services/crm.service.ts#rejectProposal"
      }
    ]
  },
  {
    "name": "Quadros Kanban",
    "condition": null,
    "features": [
      {
        "id": "kanban-listBoards",
        "label": "Consultar quadros Kanban",
        "evidence": "src/server/services/kanban.service.ts#listBoards"
      },
      {
        "id": "kanban-createBoard",
        "label": "Criar quadro Kanban",
        "evidence": "src/server/services/kanban.service.ts#createBoard"
      },
      {
        "id": "kanban-renameBoard",
        "label": "Renomear quadro",
        "evidence": "src/server/services/kanban.service.ts#renameBoard"
      },
      {
        "id": "kanban-archiveBoard",
        "label": "Arquivar quadro",
        "evidence": "src/server/services/kanban.service.ts#archiveBoard"
      },
      {
        "id": "kanban-getBoard",
        "label": "Abrir quadro",
        "evidence": "src/server/services/kanban.service.ts#getBoard"
      },
      {
        "id": "kanban-addColumn",
        "label": "Adicionar coluna ao quadro",
        "evidence": "src/server/services/kanban.service.ts#addColumn"
      },
      {
        "id": "kanban-renameColumn",
        "label": "Renomear coluna",
        "evidence": "src/server/services/kanban.service.ts#renameColumn"
      },
      {
        "id": "kanban-shiftColumn",
        "label": "Reordenar coluna",
        "evidence": "src/server/services/kanban.service.ts#shiftColumn"
      },
      {
        "id": "kanban-deleteColumn",
        "label": "Excluir coluna",
        "evidence": "src/server/services/kanban.service.ts#deleteColumn"
      },
      {
        "id": "kanban-createCard",
        "label": "Criar cartão no quadro",
        "evidence": "src/server/services/kanban.service.ts#createCard"
      },
      {
        "id": "kanban-updateCard",
        "label": "Editar cartão",
        "evidence": "src/server/services/kanban.service.ts#updateCard"
      },
      {
        "id": "kanban-moveCard",
        "label": "Mover cartão entre colunas",
        "evidence": "src/server/services/kanban.service.ts#moveCard"
      },
      {
        "id": "kanban-deleteCard",
        "label": "Excluir cartão",
        "evidence": "src/server/services/kanban.service.ts#deleteCard"
      },
      {
        "id": "kanban-listCardEvents",
        "label": "Consultar histórico do cartão",
        "evidence": "src/server/services/kanban.service.ts#listCardEvents"
      }
    ]
  },
  {
    "name": "Intimações",
    "condition": null,
    "features": [
      {
        "id": "notice-listNotices",
        "label": "Buscar e filtrar intimações",
        "evidence": "src/server/services/notice.service.ts#listNotices"
      },
      {
        "id": "notice-noticeCounts",
        "label": "Consultar totais de intimações",
        "evidence": "src/server/services/notice.service.ts#noticeCounts"
      },
      {
        "id": "notice-noticeBoxCounts",
        "label": "Consultar contagens por caixa",
        "evidence": "src/server/services/notice.service.ts#noticeBoxCounts"
      },
      {
        "id": "notice-getNotice",
        "label": "Abrir teor da intimação",
        "evidence": "src/server/services/notice.service.ts#getNotice"
      },
      {
        "id": "notice-createNotice",
        "label": "Cadastrar intimação",
        "evidence": "src/server/services/notice.service.ts#createNotice"
      },
      {
        "id": "notice-assignNotice",
        "label": "Atribuir intimação a uma pessoa",
        "evidence": "src/server/services/notice.service.ts#assignNotice"
      },
      {
        "id": "notice-linkNoticeCase",
        "label": "Vincular intimação ao processo",
        "evidence": "src/server/services/notice.service.ts#linkNoticeCase"
      },
      {
        "id": "notice-markProcessed",
        "label": "Marcar intimação tratada",
        "evidence": "src/server/services/notice.service.ts#markProcessed"
      },
      {
        "id": "notice-discardNotice",
        "label": "Descartar intimação com motivo",
        "evidence": "src/server/services/notice.service.ts#discardNotice"
      },
      {
        "id": "notice-reopenNotice",
        "label": "Reabrir intimação",
        "evidence": "src/server/services/notice.service.ts#reopenNotice"
      },
      {
        "id": "notice-deleteNotice",
        "label": "Excluir intimação",
        "evidence": "src/server/services/notice.service.ts#deleteNotice"
      }
    ]
  },
  {
    "name": "Caixas e equipes",
    "condition": null,
    "features": [
      {
        "id": "inbox-flow-listTeams",
        "label": "Consultar equipes das caixas",
        "evidence": "src/server/services/inbox-flow.service.ts#listTeams"
      },
      {
        "id": "inbox-flow-createTeam",
        "label": "Criar equipe de caixa",
        "evidence": "src/server/services/inbox-flow.service.ts#createTeam"
      },
      {
        "id": "inbox-flow-setTeamMembers",
        "label": "Configurar membros da equipe",
        "evidence": "src/server/services/inbox-flow.service.ts#setTeamMembers"
      },
      {
        "id": "inbox-flow-deleteTeam",
        "label": "Excluir equipe de caixa",
        "evidence": "src/server/services/inbox-flow.service.ts#deleteTeam"
      },
      {
        "id": "inbox-flow-assignNoticeToTeam",
        "label": "Distribuir intimação para equipe",
        "evidence": "src/server/services/inbox-flow.service.ts#assignNoticeToTeam"
      },
      {
        "id": "inbox-flow-returnNotice",
        "label": "Devolver intimação",
        "evidence": "src/server/services/inbox-flow.service.ts#returnNotice"
      },
      {
        "id": "inbox-flow-sendToEntrada",
        "label": "Retornar intimação para entrada",
        "evidence": "src/server/services/inbox-flow.service.ts#sendToEntrada"
      },
      {
        "id": "inbox-flow-snoozeNotice",
        "label": "Adormecer intimação",
        "evidence": "src/server/services/inbox-flow.service.ts#snoozeNotice"
      },
      {
        "id": "inbox-flow-setNoticeTags",
        "label": "Etiquetar intimação",
        "evidence": "src/server/services/inbox-flow.service.ts#setNoticeTags"
      },
      {
        "id": "inbox-flow-listNoticeTags",
        "label": "Consultar etiquetas das intimações",
        "evidence": "src/server/services/inbox-flow.service.ts#listNoticeTags"
      },
      {
        "id": "inbox-flow-addNoticeNote",
        "label": "Anotar na intimação",
        "evidence": "src/server/services/inbox-flow.service.ts#addNoticeNote"
      },
      {
        "id": "inbox-flow-deleteNoticeNote",
        "label": "Remover anotação da intimação",
        "evidence": "src/server/services/inbox-flow.service.ts#deleteNoticeNote"
      }
    ]
  },
  {
    "name": "Captura DJEN",
    "condition": "Depende de cadastro e disponibilidade da fonte externa.",
    "features": [
      {
        "id": "djen-listMonitors",
        "label": "Consultar monitoramentos DJEN",
        "evidence": "src/server/services/djen.service.ts#listMonitors"
      },
      {
        "id": "djen-createMonitor",
        "label": "Cadastrar monitoramento por OAB",
        "evidence": "src/server/services/djen.service.ts#createMonitor"
      },
      {
        "id": "djen-setMonitorRecipients",
        "label": "Definir destinatários da captura",
        "evidence": "src/server/services/djen.service.ts#setMonitorRecipients"
      },
      {
        "id": "djen-setMonitorEnabled",
        "label": "Ativar ou pausar monitoramento",
        "evidence": "src/server/services/djen.service.ts#setMonitorEnabled"
      },
      {
        "id": "djen-deleteMonitor",
        "label": "Excluir monitoramento",
        "evidence": "src/server/services/djen.service.ts#deleteMonitor"
      },
      {
        "id": "djen-syncDjen",
        "label": "Solicitar sincronização DJEN",
        "evidence": "src/server/services/djen.service.ts#syncDjen"
      }
    ]
  },
  {
    "name": "Automações do escritório",
    "condition": null,
    "features": [
      {
        "id": "workflow-listRules",
        "label": "Consultar regras de automação",
        "evidence": "src/server/services/workflow.service.ts#listRules"
      },
      {
        "id": "workflow-getRule",
        "label": "Abrir regra de automação",
        "evidence": "src/server/services/workflow.service.ts#getRule"
      },
      {
        "id": "workflow-createRule",
        "label": "Criar regra de automação",
        "evidence": "src/server/services/workflow.service.ts#createRule"
      },
      {
        "id": "workflow-updateRule",
        "label": "Editar regra de automação",
        "evidence": "src/server/services/workflow.service.ts#updateRule"
      },
      {
        "id": "workflow-setRuleActive",
        "label": "Ativar ou pausar regra",
        "evidence": "src/server/services/workflow.service.ts#setRuleActive"
      },
      {
        "id": "workflow-deleteRule",
        "label": "Excluir regra de automação",
        "evidence": "src/server/services/workflow.service.ts#deleteRule"
      },
      {
        "id": "workflow-listRecentRuns",
        "label": "Consultar execuções de automação",
        "evidence": "src/server/services/workflow.service.ts#listRecentRuns"
      }
    ]
  },
  {
    "name": "Pacotes de trabalho",
    "condition": null,
    "features": [
      {
        "id": "workflow-package-listPackages",
        "label": "Consultar pacotes de tarefas",
        "evidence": "src/server/services/workflow-package.service.ts#listPackages"
      },
      {
        "id": "workflow-package-savePackage",
        "label": "Criar ou editar pacote de trabalho",
        "evidence": "src/server/services/workflow-package.service.ts#savePackage"
      },
      {
        "id": "workflow-package-deletePackage",
        "label": "Excluir pacote de trabalho",
        "evidence": "src/server/services/workflow-package.service.ts#deletePackage"
      },
      {
        "id": "workflow-package-runPackage",
        "label": "Executar pacote de trabalho",
        "evidence": "src/server/services/workflow-package.service.ts#runPackage"
      },
      {
        "id": "workflow-package-listRunsForCase",
        "label": "Consultar pacotes executados no processo",
        "evidence": "src/server/services/workflow-package.service.ts#listRunsForCase"
      }
    ]
  },
  {
    "name": "WhatsApp em equipe",
    "condition": "Requer número conectado; API oficial sujeita às regras e cobranças da Meta.",
    "features": [
      {
        "id": "whatsapp-listConversations",
        "label": "Buscar conversas",
        "evidence": "src/server/services/whatsapp.service.ts#listConversations"
      },
      {
        "id": "whatsapp-unreadTotal",
        "label": "Consultar total de conversas não lidas",
        "evidence": "src/server/services/whatsapp.service.ts#unreadTotal"
      },
      {
        "id": "whatsapp-openConversation",
        "label": "Abrir conversa",
        "evidence": "src/server/services/whatsapp.service.ts#openConversation"
      },
      {
        "id": "whatsapp-sendMessage",
        "label": "Enviar mensagem de texto",
        "evidence": "src/server/services/whatsapp.service.ts#sendMessage"
      },
      {
        "id": "whatsapp-sendFile",
        "label": "Enviar arquivo na conversa",
        "evidence": "src/server/services/whatsapp.service.ts#sendFile"
      },
      {
        "id": "whatsapp-sendTemplateMessage",
        "label": "Enviar template aprovado no WhatsApp",
        "evidence": "src/server/services/whatsapp.service.ts#sendTemplateMessage"
      },
      {
        "id": "whatsapp-addNote",
        "label": "Registrar nota interna na conversa",
        "evidence": "src/server/services/whatsapp.service.ts#addNote"
      },
      {
        "id": "whatsapp-assignConversation",
        "label": "Atribuir conversa a atendente",
        "evidence": "src/server/services/whatsapp.service.ts#assignConversation"
      },
      {
        "id": "whatsapp-setConversationStatus",
        "label": "Abrir ou encerrar conversa",
        "evidence": "src/server/services/whatsapp.service.ts#setConversationStatus"
      },
      {
        "id": "whatsapp-linkClient",
        "label": "Vincular conversa ao cliente",
        "evidence": "src/server/services/whatsapp.service.ts#linkClient"
      },
      {
        "id": "whatsapp-startConversation",
        "label": "Iniciar conversa",
        "evidence": "src/server/services/whatsapp.service.ts#startConversation"
      },
      {
        "id": "whatsapp-getMessageMedia",
        "label": "Abrir mídia recebida",
        "evidence": "src/server/services/whatsapp.service.ts#getMessageMedia"
      }
    ]
  },
  {
    "name": "Chat conectado ao escritório",
    "condition": "Requer permissão para o atendimento e os registros vinculados.",
    "features": [
      {
        "id": "chat-links-linkCase",
        "label": "Vincular conversa ao processo",
        "evidence": "src/server/services/chat-links.service.ts#linkCase"
      },
      {
        "id": "chat-links-createTaskFromConversation",
        "label": "Criar tarefa a partir da conversa",
        "evidence": "src/server/services/chat-links.service.ts#createTaskFromConversation"
      },
      {
        "id": "chat-links-createEventFromConversation",
        "label": "Criar compromisso a partir da conversa",
        "evidence": "src/server/services/chat-links.service.ts#createEventFromConversation"
      },
      {
        "id": "chat-links-createDeadlineFromConversation",
        "label": "Criar prazo a partir da conversa",
        "evidence": "src/server/services/chat-links.service.ts#createDeadlineFromConversation"
      },
      {
        "id": "chat-links-createLeadFromConversation",
        "label": "Criar oportunidade a partir da conversa",
        "evidence": "src/server/services/chat-links.service.ts#createLeadFromConversation"
      },
      {
        "id": "chat-links-attachMessageToDocuments",
        "label": "Guardar anexo da conversa nos documentos",
        "evidence": "src/server/services/chat-links.service.ts#attachMessageToDocuments"
      },
      {
        "id": "chat-links-conversationsOfClient",
        "label": "Consultar conversas do cliente",
        "evidence": "src/server/services/chat-links.service.ts#conversationsOfClient"
      },
      {
        "id": "chat-links-conversationsOfCase",
        "label": "Consultar conversas do processo",
        "evidence": "src/server/services/chat-links.service.ts#conversationsOfCase"
      },
      {
        "id": "chat-links-conversationsOfLead",
        "label": "Consultar conversas da oportunidade",
        "evidence": "src/server/services/chat-links.service.ts#conversationsOfLead"
      }
    ]
  },
  {
    "name": "Ferramentas de atendimento",
    "condition": "Envios requerem conexão e autorização do escritório.",
    "features": [
      {
        "id": "chat-tools-createLabelPreset",
        "label": "Aplicar pacote de etiquetas de atendimento",
        "evidence": "src/server/services/chat-tools.service.ts#createLabelPreset"
      },
      {
        "id": "chat-tools-forwardMessage",
        "label": "Encaminhar mensagem para conversas",
        "evidence": "src/server/services/chat-tools.service.ts#forwardMessage"
      },
      {
        "id": "chat-tools-listLibrary",
        "label": "Consultar biblioteca de arquivos do Chat",
        "evidence": "src/server/services/chat-tools.service.ts#listLibrary"
      },
      {
        "id": "chat-tools-addLibraryFile",
        "label": "Adicionar arquivo à biblioteca do Chat",
        "evidence": "src/server/services/chat-tools.service.ts#addLibraryFile"
      },
      {
        "id": "chat-tools-deleteLibraryFile",
        "label": "Remover arquivo da biblioteca do Chat",
        "evidence": "src/server/services/chat-tools.service.ts#deleteLibraryFile"
      },
      {
        "id": "chat-tools-sendLibraryFile",
        "label": "Enviar arquivo da biblioteca",
        "evidence": "src/server/services/chat-tools.service.ts#sendLibraryFile"
      },
      {
        "id": "chat-tools-listChecklists",
        "label": "Consultar checklists de atendimento",
        "evidence": "src/server/services/chat-tools.service.ts#listChecklists"
      },
      {
        "id": "chat-tools-saveChecklist",
        "label": "Criar ou editar checklist de atendimento",
        "evidence": "src/server/services/chat-tools.service.ts#saveChecklist"
      },
      {
        "id": "chat-tools-deleteChecklist",
        "label": "Excluir checklist de atendimento",
        "evidence": "src/server/services/chat-tools.service.ts#deleteChecklist"
      },
      {
        "id": "chat-tools-sendChecklist",
        "label": "Enviar checklist na conversa",
        "evidence": "src/server/services/chat-tools.service.ts#sendChecklist"
      },
      {
        "id": "chat-tools-listChatStatuses",
        "label": "Consultar status personalizados do Chat",
        "evidence": "src/server/services/chat-tools.service.ts#listChatStatuses"
      },
      {
        "id": "chat-tools-saveChatStatus",
        "label": "Criar ou editar status do Chat",
        "evidence": "src/server/services/chat-tools.service.ts#saveChatStatus"
      },
      {
        "id": "chat-tools-deleteChatStatus",
        "label": "Excluir status personalizado",
        "evidence": "src/server/services/chat-tools.service.ts#deleteChatStatus"
      },
      {
        "id": "chat-tools-setChatStatus",
        "label": "Aplicar status personalizado",
        "evidence": "src/server/services/chat-tools.service.ts#setChatStatus"
      }
    ]
  },
  {
    "name": "Filas de atendimento",
    "condition": null,
    "features": [
      {
        "id": "chat-queue-listQueues",
        "label": "Consultar filas de atendimento",
        "evidence": "src/server/services/chat-queue.service.ts#listQueues"
      },
      {
        "id": "chat-queue-saveQueue",
        "label": "Criar ou editar fila de atendimento",
        "evidence": "src/server/services/chat-queue.service.ts#saveQueue"
      },
      {
        "id": "chat-queue-deleteQueue",
        "label": "Excluir fila de atendimento",
        "evidence": "src/server/services/chat-queue.service.ts#deleteQueue"
      },
      {
        "id": "chat-queue-myAvailability",
        "label": "Consultar disponibilidade pessoal",
        "evidence": "src/server/services/chat-queue.service.ts#myAvailability"
      },
      {
        "id": "chat-queue-setMyAvailability",
        "label": "Alterar disponibilidade para atendimento",
        "evidence": "src/server/services/chat-queue.service.ts#setMyAvailability"
      },
      {
        "id": "chat-queue-listAgents",
        "label": "Consultar disponibilidade dos atendentes",
        "evidence": "src/server/services/chat-queue.service.ts#listAgents"
      },
      {
        "id": "chat-queue-distributePending",
        "label": "Distribuir conversas pendentes",
        "evidence": "src/server/services/chat-queue.service.ts#distributePending"
      },
      {
        "id": "chat-queue-transferToQueue",
        "label": "Transferir conversa para fila",
        "evidence": "src/server/services/chat-queue.service.ts#transferToQueue"
      }
    ]
  },
  {
    "name": "Campanhas",
    "condition": "Envio em lotes, aprovação e opt-out; requer conexão e regras do provedor.",
    "features": [
      {
        "id": "chat-campaigns-listCampaigns",
        "label": "Consultar campanhas",
        "evidence": "src/server/services/chat-campaigns.service.ts#listCampaigns"
      },
      {
        "id": "chat-campaigns-campaignReport",
        "label": "Consultar relatório da campanha",
        "evidence": "src/server/services/chat-campaigns.service.ts#campaignReport"
      },
      {
        "id": "chat-campaigns-createCampaign",
        "label": "Criar campanha com até 10 mil destinatários",
        "evidence": "src/server/services/chat-campaigns.service.ts#createCampaign"
      },
      {
        "id": "chat-campaigns-approveCampaign",
        "label": "Aprovar campanha para envio",
        "evidence": "src/server/services/chat-campaigns.service.ts#approveCampaign"
      },
      {
        "id": "chat-campaigns-pauseCampaign",
        "label": "Pausar campanha",
        "evidence": "src/server/services/chat-campaigns.service.ts#pauseCampaign"
      },
      {
        "id": "chat-campaigns-cancelCampaign",
        "label": "Cancelar campanha",
        "evidence": "src/server/services/chat-campaigns.service.ts#cancelCampaign"
      },
      {
        "id": "chat-campaigns-campaignClientOptions",
        "label": "Selecionar destinatários por filtro",
        "evidence": "src/server/services/chat-campaigns.service.ts#campaignClientOptions"
      }
    ]
  },
  {
    "name": "RUTE e conversas privadas",
    "condition": "Requer IA habilitada, provedor configurado e permissões da pessoa.",
    "features": [
      {
        "id": "rute-assistant-assistantAvailability",
        "label": "Conferir disponibilidade da RUTE",
        "evidence": "src/server/services/rute-assistant.service.ts#assistantAvailability"
      },
      {
        "id": "rute-assistant-listConversations",
        "label": "Consultar histórico pessoal da RUTE",
        "evidence": "src/server/services/rute-assistant.service.ts#listConversations"
      },
      {
        "id": "rute-assistant-getConversation",
        "label": "Abrir conversa da RUTE",
        "evidence": "src/server/services/rute-assistant.service.ts#getConversation"
      },
      {
        "id": "rute-assistant-createConversation",
        "label": "Criar conversa com contexto de cliente ou processo",
        "evidence": "src/server/services/rute-assistant.service.ts#createConversation"
      },
      {
        "id": "rute-assistant-deleteConversation",
        "label": "Excluir conversa da RUTE",
        "evidence": "src/server/services/rute-assistant.service.ts#deleteConversation"
      },
      {
        "id": "rute-assistant-sendMessage",
        "label": "Conversar com a RUTE e suas ferramentas",
        "evidence": "src/server/services/rute-assistant.service.ts#sendMessage"
      }
    ]
  },
  {
    "name": "Propostas da RUTE",
    "condition": "Cada ação depende de suas permissões; propostas exigem decisão humana.",
    "features": [
      {
        "id": "rute-proposal-listProposals",
        "label": "Consultar propostas da RUTE",
        "evidence": "src/server/services/rute-proposal.service.ts#listProposals"
      },
      {
        "id": "rute-proposal-getProposal",
        "label": "Abrir proposta para revisão",
        "evidence": "src/server/services/rute-proposal.service.ts#getProposal"
      },
      {
        "id": "rute-proposal-updateProposal",
        "label": "Editar proposta antes da decisão",
        "evidence": "src/server/services/rute-proposal.service.ts#updateProposal"
      },
      {
        "id": "rute-proposal-approveProposal",
        "label": "Aprovar proposta da RUTE",
        "evidence": "src/server/services/rute-proposal.service.ts#approveProposal"
      },
      {
        "id": "rute-proposal-rejectProposal",
        "label": "Recusar proposta da RUTE",
        "evidence": "src/server/services/rute-proposal.service.ts#rejectProposal"
      },
      {
        "id": "rute-proposal-pendingProposalCount",
        "label": "Consultar propostas pendentes",
        "evidence": "src/server/services/rute-proposal.service.ts#pendingProposalCount"
      }
    ]
  },
  {
    "name": "Biblioteca da RUTE",
    "condition": null,
    "features": [
      {
        "id": "rute-library-listInstructions",
        "label": "Consultar instruções do escritório",
        "evidence": "src/server/services/rute-library.service.ts#listInstructions"
      },
      {
        "id": "rute-library-saveInstruction",
        "label": "Criar ou editar instrução da IA",
        "evidence": "src/server/services/rute-library.service.ts#saveInstruction"
      },
      {
        "id": "rute-library-deleteInstruction",
        "label": "Excluir instrução da IA",
        "evidence": "src/server/services/rute-library.service.ts#deleteInstruction"
      },
      {
        "id": "rute-library-buildSkillPackage",
        "label": "Exportar pacote de instruções do escritório",
        "evidence": "src/server/services/rute-library.service.ts#buildSkillPackage"
      }
    ]
  },
  {
    "name": "Governança da IA",
    "condition": null,
    "features": [
      {
        "id": "rute-governance-usageReport",
        "label": "Consultar consumo de IA",
        "evidence": "src/server/services/rute-governance.service.ts#usageReport"
      },
      {
        "id": "rute-governance-listToolHistory",
        "label": "Consultar histórico de chamadas de ferramentas",
        "evidence": "src/server/services/rute-governance.service.ts#listToolHistory"
      },
      {
        "id": "rute-governance-lgpdReport",
        "label": "Consultar relatório de dados da IA",
        "evidence": "src/server/services/rute-governance.service.ts#lgpdReport"
      },
      {
        "id": "rute-governance-lgpdCsv",
        "label": "Exportar relatório de IA em CSV",
        "evidence": "src/server/services/rute-governance.service.ts#lgpdCsv"
      }
    ]
  },
  {
    "name": "API e webhooks",
    "condition": "Requer configuração, destino autorizado e permissões de integração.",
    "features": [
      {
        "id": "webhook-createWebhook",
        "label": "Cadastrar webhook assinado",
        "evidence": "src/server/services/webhook.service.ts#createWebhook"
      },
      {
        "id": "webhook-listWebhooks",
        "label": "Consultar webhooks",
        "evidence": "src/server/services/webhook.service.ts#listWebhooks"
      },
      {
        "id": "webhook-recentDeliveries",
        "label": "Consultar histórico de entregas de webhook",
        "evidence": "src/server/services/webhook.service.ts#recentDeliveries"
      },
      {
        "id": "webhook-setWebhookEnabled",
        "label": "Ativar ou pausar webhook",
        "evidence": "src/server/services/webhook.service.ts#setWebhookEnabled"
      },
      {
        "id": "webhook-deleteWebhook",
        "label": "Excluir webhook",
        "evidence": "src/server/services/webhook.service.ts#deleteWebhook"
      },
      {
        "id": "webhook-retryDelivery",
        "label": "Reenviar entrega de webhook",
        "evidence": "src/server/services/webhook.service.ts#retryDelivery"
      },
      {
        "id": "webhook-testWebhook",
        "label": "Testar webhook",
        "evidence": "src/server/services/webhook.service.ts#testWebhook"
      }
    ]
  },
  {
    "name": "LegalOS Desktop",
    "condition": "Exclusivo para computador; seções respeitam vínculos, permissões e sigilo.",
    "features": [
      {
        "id": "workspace-listWorkspaceFolders",
        "label": "Buscar pastas por cliente, CPF ou processo",
        "evidence": "src/server/services/workspace.service.ts#listWorkspaceFolders"
      },
      {
        "id": "workspace-getClientWorkspace",
        "label": "Abrir contexto integrado do cliente no Desktop",
        "evidence": "src/server/services/workspace.service.ts#getClientWorkspace"
      }
    ]
  },
  {
    "name": "Acesso à API",
    "condition": null,
    "features": [
      {
        "id": "apikey-createApiKey",
        "label": "Criar chave de API por escopos",
        "evidence": "src/server/services/apikey.service.ts#createApiKey"
      },
      {
        "id": "apikey-listApiKeys",
        "label": "Consultar chaves de API",
        "evidence": "src/server/services/apikey.service.ts#listApiKeys"
      },
      {
        "id": "apikey-revokeApiKey",
        "label": "Revogar chave de API",
        "evidence": "src/server/services/apikey.service.ts#revokeApiKey"
      }
    ]
  },
  {
    "name": "Autenticação em duas etapas",
    "condition": null,
    "features": [
      {
        "id": "mfa-mfaStatus",
        "label": "Consultar situação da autenticação em duas etapas",
        "evidence": "src/server/services/mfa.service.ts#mfaStatus"
      },
      {
        "id": "mfa-startEnrollment",
        "label": "Iniciar configuração de duas etapas",
        "evidence": "src/server/services/mfa.service.ts#startEnrollment"
      },
      {
        "id": "mfa-confirmEnrollment",
        "label": "Confirmar configuração de duas etapas",
        "evidence": "src/server/services/mfa.service.ts#confirmEnrollment"
      },
      {
        "id": "mfa-regenerateRecoveryCodes",
        "label": "Renovar códigos de recuperação",
        "evidence": "src/server/services/mfa.service.ts#regenerateRecoveryCodes"
      }
    ]
  },
  {
    "name": "Perfis de acesso",
    "condition": null,
    "features": [
      {
        "id": "role-listRoles",
        "label": "Consultar perfis e permissões",
        "evidence": "src/server/services/role.service.ts#listRoles"
      },
      {
        "id": "role-createRole",
        "label": "Criar perfil de acesso",
        "evidence": "src/server/services/role.service.ts#createRole"
      },
      {
        "id": "role-updateRole",
        "label": "Editar permissões do perfil",
        "evidence": "src/server/services/role.service.ts#updateRole"
      },
      {
        "id": "role-deleteRole",
        "label": "Excluir perfil de acesso",
        "evidence": "src/server/services/role.service.ts#deleteRole"
      }
    ]
  }
];

const removedBoxEvidence = /(?:notice|inbox-flow|djen|datajud|mni|certificate|petition|monitoring|portal-access|pje-discovery|court-otp|autos-queue)\.service/;
export const PRICING_FEATURES = ALL_PRICING_FEATURES.map(g => ({ ...g, features: g.features.filter(f => !removedBoxEvidence.test(f.evidence)) })).filter(g => g.features.length > 0);
