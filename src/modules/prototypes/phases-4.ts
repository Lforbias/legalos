import type { Proto } from "./types";

export const PROTOS_4: Proto[] = [
  {
    id: "4.0-F1", version: "4.0", space: "Chat", title: "Etiquetas pré-definidas, menção a colega e encaminhar a vários chats",
    summary: "Atalhos que aceleram o atendimento.",
    blocks: [
      { t: "table", title: "Etiquetas pré-definidas", cols: ["Etiqueta", "Cor", "Usada em"], rows: [["Documentos pendentes", "Amarelo", "34 conversas"], ["Aguardando cliente", "Azul", "21 conversas"], ["Urgente", "Vermelho", "5 conversas"]], actions: ["Nova etiqueta"] },
      { t: "form", title: "Encaminhar mensagem a vários chats", fields: [{ label: "Mensagem", kind: "textarea", value: "Lembrete: envie o laudo atualizado até sexta." }, { label: "Chats selecionados", value: "Maria S., João P., Ana L. (3)" }], actions: ["Encaminhar"] },
      { t: "note", text: "Dentro da conversa, @nome avisa um colega da equipe. Nada é enviado ao cliente sem autorização humana." },
    ],
  },
  {
    id: "4.0-F2", version: "4.0", space: "Chat", title: "Biblioteca de arquivos e checklists enviáveis no chat",
    summary: "Arquivos prontos e listas de documentos para enviar ao cliente com um clique.",
    blocks: [
      { t: "table", title: "Biblioteca de arquivos", cols: ["Arquivo", "Tipo", "Usos"], rows: [["Modelo de procuração.pdf", "PDF", "58"], ["Contrato de honorários.pdf", "PDF", "41"]], actions: ["Enviar arquivo à biblioteca"] },
      { t: "table", title: "Checklists", cols: ["Checklist", "Itens", "Enviado"], rows: [["Documentos para aposentadoria", "9", "37 vezes"], ["Documentos para auxílio-doença", "7", "52 vezes"]], actions: ["Novo checklist"] },
    ],
  },
  {
    id: "4.0-F3", version: "4.0", space: "Chat", title: "Vários números de WhatsApp com status e reconexão",
    summary: "Mostra se cada número está conectado e ajuda a reconectar.",
    blocks: [
      { t: "table", title: "Números", cols: ["Número", "Situação", "Última atividade"], rows: [["Atendimento geral", "Conectado", "agora"], ["Previdenciário", "Conectado", "há 2 min"], ["Cobrança", "Desconectado", "há 3 h"]], actions: ["Reconectar"] },
      { t: "steps", title: "Reconectar um número", steps: [{ title: "Clique em Reconectar", text: "Aparece um QR Code." }, { title: "No celular, WhatsApp → Aparelhos conectados", text: "Escaneie o QR Code." }, { title: "Pronto", text: "O número volta a receber mensagens." }] },
    ],
  },
  {
    id: "4.0-F4", version: "4.0", space: "Chat", title: "Status de chat e arquivamento automático",
    summary: "Situação de cada conversa e regras para arquivar sozinhas as paradas.",
    blocks: [
      { t: "table", title: "Conversas por situação", filters: ["Abertas", "Aguardando cliente", "Resolvidas", "Arquivadas"], cols: ["Cliente", "Situação", "Última mensagem"], rows: [["Maria S.", "Aguardando", "há 1 dia"], ["João P.", "Em atendimento", "há 5 min"], ["Ana L.", "Resolvida", "há 3 dias"]] },
      { t: "form", title: "Arquivamento automático", fields: [{ label: "Arquivar conversas resolvidas", kind: "toggle", on: false }, { label: "Depois de (dias)", value: "7" }] },
    ],
  },
  {
    id: "4.0-F5", version: "4.0", space: "Chat", title: "Bot 2.0: horário, audiência/perícia, aniversário, timer e delegador",
    summary: "Respostas automáticas mais inteligentes, cada uma com liga/desliga.",
    blocks: [
      { t: "toggles", title: "Regras do robô", items: [{ label: "Mensagem fora do horário de atendimento", on: true }, { label: "Lembrete de audiência ou perícia ao cliente", hint: "só com autorização", on: false }, { label: "Parabéns no aniversário", on: false }, { label: "Aviso se ninguém responder em X minutos", on: true }, { label: "Delegar a conversa a quem tem menos fila", on: false }] },
      { t: "form", title: "Horário de atendimento", fields: [{ label: "Dias", value: "Segunda a sexta" }, { label: "Das", value: "08:00" }, { label: "Às", value: "18:00" }] },
    ],
  },
  {
    id: "4.0-F6", version: "4.0", space: "Chat", title: "Relatórios de atendimento e exportação agendada",
    summary: "Números de atendimento por pessoa e envio automático do relatório por e-mail.",
    blocks: [
      { t: "stats", items: [{ label: "Conversas", value: "1.284" }, { label: "Tempo médio de resposta", value: "6 min" }, { label: "Resolvidas", value: "1.102" }, { label: "Em aberto", value: "182" }] },
      { t: "table", title: "Por atendente", cols: ["Atendente", "Conversas", "Resposta média", "Resolvidas"], rows: [["Sabrina", "540", "4 min", "498"], ["Dra. Talita", "212", "9 min", "190"]] },
      { t: "form", title: "Exportação agendada", fields: [{ label: "Enviar por e-mail", kind: "toggle", on: false }, { label: "Frequência", kind: "select", options: ["Toda segunda-feira", "Todo dia 1º"] }] },
    ],
  },
  {
    id: "4.0-F7", version: "4.0", space: "Chat", title: "Campanhas em massa controladas",
    summary: "Envio para vários clientes, com limites e aprovação.",
    blocks: [
      { t: "table", title: "Campanhas", cols: ["Campanha", "Destinatários", "Situação"], rows: [["Aviso de recesso", "320", "Rascunho"], ["Pesquisa de satisfação", "180", "Concluída"]], actions: ["Nova campanha"] },
      { t: "toggles", title: "Limites de segurança", items: [{ label: "Exigir aprovação de um administrador antes de enviar", on: true }, { label: "Só enviar a quem aceitou receber mensagens", on: true }, { label: "Máximo de 200 envios por dia", on: true }] },
    ],
  },
  {
    id: "4.0-F8", version: "4.0", space: "Chat", title: "NPS pós-atendimento",
    summary: "Nota de satisfação depois do atendimento.",
    blocks: [
      { t: "stats", items: [{ label: "NPS do mês", value: "78" }, { label: "Respostas", value: "214" }, { label: "Promotores", value: "81%" }, { label: "Detratores", value: "3%" }] },
      { t: "table", title: "Últimas respostas", cols: ["Cliente", "Nota", "Comentário"], rows: [["Maria S.", "10", "Atendimento excelente"], ["João P.", "7", "Demorou um pouco"]] },
    ],
  },
  {
    id: "4.0-F9", version: "4.0", space: "Chat", title: "Intenções, transcrição e resumo por IA",
    summary: "A IA entende o assunto da conversa, transcreve áudios e resume, sempre como sugestão.",
    blocks: [
      { t: "toggles", title: "Recursos de IA do Chat", items: [{ label: "Identificar o assunto da conversa", on: false }, { label: "Transcrever áudios", on: false }, { label: "Resumir a conversa para o responsável", on: false }] },
      { t: "table", title: "Assuntos identificados", cols: ["Conversa", "Assunto", "Confiança"], rows: [["Maria S.", "Documentos para benefício", "94%"], ["Carlos M.", "Dúvida sobre prazo", "88%"]] },
      { t: "note", text: "Exemplo de resumo: “Cliente pergunta sobre o laudo e pede novo prazo para enviar documentos.” A pessoa sempre confere antes de usar." },
    ],
  },
  {
    id: "4.0-F10", version: "4.0", space: "Chat", title: "Módulos por plano e segurança da conta",
    summary: "Quais recursos cada plano libera e proteções extras da conta.",
    blocks: [
      { t: "table", title: "Módulos por plano", cols: ["Módulo", "Básico", "Profissional", "Completo"], rows: [["Chat", "Sim", "Sim", "Sim"], ["Campanhas", "Não", "Sim", "Sim"], ["IA no chat", "Não", "Não", "Sim"]] },
      { t: "toggles", title: "Segurança da conta", items: [{ label: "Exigir verificação em duas etapas para a equipe", on: false }, { label: "Sair automaticamente após inatividade", on: true }] },
    ],
  },
  {
    id: "4.0-F11", version: "4.0", space: "Chat", title: "Completar com o que aparecer nas telas ainda não vistas do ChatGuru",
    summary: "Fase reservada para o que ainda não foi analisado.",
    blocks: [{ t: "note", text: "Sem tela por enquanto: aguarda as capturas das telas do ChatGuru que ainda não foram analisadas." }],
  },
];
