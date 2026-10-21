import type { Proto } from "./types";

export const PROTOS_3: Proto[] = [
  {
    id: "3.0-F3b", version: "3.0", space: "Func", title: "Google Drive/Docs opcional, com as credenciais de cada escritório",
    summary: "Cada escritório conecta o próprio Google. Nada de chave global no servidor.",
    blocks: [
      { t: "steps", title: "Como conectar (uma vez só)", steps: [{ title: "Criar o projeto no Google Cloud", text: "Ative a Google Drive API (e a Docs API, se quiser Docs)." }, { title: "Criar o acesso OAuth", text: "Tipo “Aplicativo da Web”, com o endereço de retorno que o LegalOS mostra abaixo." }, { title: "Colar o Client ID e o Client Secret", text: "O Secret fica criptografado, só deste escritório." }, { title: "Entrar com a conta Google", text: "O LegalOS só enxerga os arquivos que ele mesmo cria." }] },
      { t: "form", title: "Google Drive deste escritório", fields: [{ label: "Integração ligada", kind: "toggle", on: false }, { label: "Client ID", value: "123456789-abc.apps.googleusercontent.com" }, { label: "Client Secret", kind: "password", value: "••••••••••••" }, { label: "Endereço de retorno (copiar)", value: "https://legalossync.tech/api/integrations/google/callback" }, { label: "Criar uma pasta por processo", kind: "toggle", on: true }, { label: "Gerar modelos como Google Doc", kind: "toggle", on: false }], actions: ["Salvar", "Entrar com o Google"] },
      { t: "table", title: "Pastas criadas", cols: ["Processo", "Pasta no Drive", "Arquivos"], rows: [["Maria S. — Incapacidade", "LegalOS / Maria S.", "7"], ["João P. — Trabalhista", "LegalOS / João P.", "12"]] },
    ],
  },
  {
    id: "3.0-F5", version: "3.0", space: "Box", title: "Fila de protocolos, recibo, agendamento e cancelamento",
    summary: "Fila das petições aprovadas, com agendamento, cancelamento antes do envio e recibos guardados.",
    blocks: [
      { t: "stats", items: [{ label: "Na fila", value: "6" }, { label: "Agendadas", value: "3" }, { label: "Protocoladas hoje", value: "4" }, { label: "Com falha", value: "1" }] },
      { t: "table", title: "Fila de protocolos", filters: ["Todas", "Na fila", "Agendadas", "Protocoladas", "Com falha"], cols: ["Processo", "Peça", "Tribunal", "Situação", "Quando"], rows: [["0001234-55.2024.8.05.0001", "Apelação", "TJBA", "Agendada", "18/10 08:00"], ["0004321-10.2025.5.05.0013", "Réplica", "TRT-5", "Aguardando", "agora"], ["0007654-33.2025.4.01.3300", "Inicial", "TRF-1", "Protocolada", "17/10 16:12"], ["0002222-11.2025.8.05.0001", "Contrarrazões", "TJBA", "Falha", "17/10 11:40"]], actions: ["Agendar", "Cancelar envio"] },
      { t: "table", title: "Recibos", cols: ["Processo", "Protocolo", "Data", "Recibo"], rows: [["0007654-33.2025.4.01.3300", "Nº 123456789", "17/10 16:12", "Baixar PDF"]] },
      { t: "note", text: "Nada é protocolado sem a aprovação humana da petição; cancelar só é possível antes do envio." },
    ],
  },
  {
    id: "3.0-F6", version: "3.0", space: "Box", title: "Conectores de peticionamento além do MNI",
    summary: "Escolha de como protocolar em cada sistema de tribunal.",
    blocks: [
      { t: "table", title: "Conectores", cols: ["Sistema", "Tribunais", "Situação"], rows: [["MNI / PJe", "TJBA, TRT-5, TRF-1", "Conectado"], ["eproc", "TRF-4, TJSC", "Desconectado"], ["e-SAJ", "TJSP", "Desconectado"], ["Projudi", "TJPR", "Desconectado"]], actions: ["Configurar conector"] },
      { t: "form", title: "Credenciais por tribunal e por usuário", fields: [{ label: "Tribunal", kind: "select", options: ["TJBA", "TRT-5", "TRF-1"] }, { label: "Usuário que protocola", kind: "select", options: ["Dra. Talita", "Sabrina"] }, { label: "Certificado", kind: "select", options: ["Certificado do escritório (A1)"] }], actions: ["Salvar credencial"] },
    ],
  },
  {
    id: "3.0-F7", version: "3.0", space: "Box", title: "Monitoramento de intimações nos sistemas dos tribunais",
    summary: "Acompanha a caixa de intimações dos sistemas onde o escritório tem acesso.",
    blocks: [
      { t: "table", title: "Monitoramentos", cols: ["Sistema", "Quem", "Última checagem", "Situação"], rows: [["PJe TJBA", "OAB/BA 12345", "há 12 min", "Ativo"], ["PJe TRT-5", "OAB/BA 12345", "há 14 min", "Ativo"], ["eproc TRF-4", "OAB/BA 12345", "nunca", "Desconectado"]], actions: ["Novo monitoramento"] },
      { t: "table", title: "Intimações encontradas hoje", cols: ["Processo", "Sistema", "Tipo", "Prazo"], rows: [["0001234-55.2024.8.05.0001", "PJe TJBA", "Despacho", "5 dias"], ["0004321-10.2025.5.05.0013", "PJe TRT-5", "Sentença", "8 dias"]] },
      { t: "toggles", title: "Quando encontrar uma intimação", items: [{ label: "Enviar à Caixa de entrada", on: true }, { label: "Avisar o responsável", on: true }] },
    ],
  },
  {
    id: "3.0-F8", version: "3.0", space: "Box", title: "Classificação de documentos por IA",
    summary: "A IA sugere o tipo de cada documento; a pessoa aceita ou troca.",
    blocks: [
      { t: "toggles", title: "Classificação automática", items: [{ label: "Sugerir o tipo ao anexar documentos", hint: "só sugere; nunca muda sozinho", on: false }] },
      { t: "table", title: "Sugestões pendentes", cols: ["Documento", "Tipo sugerido", "Confiança", "Situação"], rows: [["scan_0412.pdf", "Procuração", "96%", "Sugerida"], ["laudo_final.pdf", "Laudo médico", "91%", "Sugerida"], ["img_2210.jpg", "Comprovante de residência", "74%", "Revisar"]], actions: ["Aceitar", "Trocar tipo"] },
    ],
  },
  {
    id: "3.0-F9", version: "3.0", space: "Box", title: "Certificado com usuários autorizados e webhooks de protocolo",
    summary: "Define quem pode usar cada certificado e avisa sistemas externos quando um protocolo é feito.",
    blocks: [
      { t: "table", title: "Usuários autorizados por certificado", cols: ["Certificado", "Usuário", "Pode protocolar"], rows: [["Certificado A1 do escritório", "Dra. Talita", "Sim"], ["Certificado A1 do escritório", "Sabrina", "Sim"], ["Certificado A1 do escritório", "Estagiário", "Não"]], actions: ["Autorizar usuário"] },
      { t: "table", title: "Webhooks de protocolo", cols: ["Endereço", "Eventos", "Situação"], rows: [["https://exemplo.com/hook", "Protocolado, Falha", "Ativo"]], actions: ["Novo webhook"] },
    ],
  },
  {
    id: "3.0-F10", version: "3.0", space: "Func", title: "Créditos e custos",
    summary: "Saldo de créditos e consumo por serviço (consultas, IA, mensagens).",
    blocks: [
      { t: "stats", items: [{ label: "Saldo de créditos", value: "1.240" }, { label: "Consumo no mês", value: "860" }, { label: "Custo estimado", value: "R$ 86,00" }, { label: "Previsão de duração", value: "13 dias" }] },
      { t: "table", title: "Consumo por serviço", cols: ["Serviço", "Usos", "Créditos"], rows: [["Consulta de processos", "420", "420"], ["IA", "180", "360"], ["Mensagens de WhatsApp", "80", "80"]] },
      { t: "table", title: "Compras de créditos", cols: ["Data", "Pacote", "Valor", "Situação"], rows: [["02/10", "1.000 créditos", "R$ 100,00", "Concluída"]], actions: ["Comprar créditos"] },
    ],
  },
  {
    id: "3.0-F11", version: "3.0", space: "Box", title: "Completar com o que aparecer nas telas do LegalMail",
    summary: "Fase reservada para o que ainda não foi visto nas telas do LegalMail.",
    blocks: [{ t: "note", text: "Sem tela por enquanto: esta fase aguarda as capturas das telas do LegalMail que ainda não foram analisadas." }],
  },
];
