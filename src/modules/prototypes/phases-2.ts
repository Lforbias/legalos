import type { Proto } from "./types";

export const PROTOS_2: Proto[] = [
  {
    id: "2.0-F3", version: "2.0", space: "Func", title: "Kanban de gestão e workflows do escritório",
    summary: "Quadro de acompanhamento dos casos do escritório por etapa e fluxos prontos que criam as tarefas de cada etapa.",
    blocks: [
      { t: "kanban", title: "Quadro de gestão — Contratos e novos casos", description: "Arraste o cartão para mudar de etapa (no protótipo, só visual).", cols: [
        { name: "Contrato fechado", cards: [{ title: "Maria S. — Auxílio por incapacidade", meta: "Responsável: Dra. Talita · há 1 dia", tag: "Previdenciário" }, { title: "João P. — Reclamação trabalhista", meta: "Responsável: Sabrina · hoje", tag: "Trabalhista" }] },
        { name: "Reunindo documentos", cards: [{ title: "Ana L. — Revisão de aposentadoria", meta: "Faltam: CNIS, laudo · 3 dias", tag: "Previdenciário" }] },
        { name: "Petição em redação", cards: [{ title: "Carlos M. — Ação de cobrança", meta: "Prazo interno: 25/10", tag: "Cível" }] },
        { name: "Protocolado", cards: [{ title: "Rita F. — BPC/LOAS", meta: "Protocolo em 18/10", tag: "Previdenciário" }] },
      ] },
      { t: "table", title: "Fluxos do escritório", description: "Quando o cartão chega a uma etapa, as tarefas dela são criadas sozinhas.", cols: ["Fluxo", "Etapas", "Dispara quando", "Situação"], rows: [["Fechamento de contrato", "6 tarefas", "Cartão entra em “Contrato fechado”", "Ligado"], ["Petição inicial previdenciária", "4 tarefas", "Cartão entra em “Petição em redação”", "Ligado"], ["Pós-protocolo", "3 tarefas", "Cartão entra em “Protocolado”", "Desligado"]], actions: ["Novo fluxo"] },
    ],
  },
  {
    id: "2.0-F4", version: "2.0", space: "Func", title: "Financeiro: fluxo de caixa, contas e faturas",
    summary: "Visão do caixa do mês, contas a pagar e receber e faturas de honorários.",
    blocks: [
      { t: "stats", items: [{ label: "Saldo em caixa", value: "R$ 48.320", hint: "em 17/10" }, { label: "A receber (30 dias)", value: "R$ 31.900" }, { label: "A pagar (30 dias)", value: "R$ 17.450" }, { label: "Inadimplência", value: "6,2%", hint: "faturas vencidas há +30 dias" }] },
      { t: "table", title: "Fluxo de caixa por mês", cols: ["Mês", "Entradas", "Saídas", "Resultado"], rows: [["Agosto", "R$ 52.100", "R$ 38.900", "R$ 13.200"], ["Setembro", "R$ 47.800", "R$ 41.200", "R$ 6.600"], ["Outubro (previsto)", "R$ 56.400", "R$ 39.700", "R$ 16.700"]] },
      { t: "table", title: "Faturas de honorários", filters: ["Todas", "Em aberto", "Vencidas", "Pagas"], cols: ["Fatura", "Cliente", "Vencimento", "Valor", "Situação"], rows: [["#0231", "Maria S.", "20/10", "R$ 2.500", "Aguardando"], ["#0230", "João P.", "12/10", "R$ 1.800", "Vencida"], ["#0229", "Ana L.", "05/10", "R$ 3.200", "Concluída"]], actions: ["Nova fatura"] },
      { t: "table", title: "Contas a pagar", cols: ["Conta", "Categoria", "Vencimento", "Valor", "Situação"], rows: [["Aluguel do escritório", "Fixa", "05/11", "R$ 4.200", "Pendente"], ["Certificado digital", "Tecnologia", "30/10", "R$ 390", "Pendente"]] },
    ],
  },
  {
    id: "2.0-F5", version: "2.0", space: "Func", title: "Processo mais rico: honorário, apensos, recursos e provisão",
    summary: "Novas áreas dentro do processo: honorário contratado, processos apensados, recursos e valor de provisão.",
    blocks: [
      { t: "form", title: "Honorários do processo", fields: [{ label: "Tipo", kind: "select", options: ["Êxito", "Fixo", "Misto"] }, { label: "Valor fixo (R$)", value: "2.500,00" }, { label: "Percentual de êxito (%)", value: "30" }, { label: "Forma de pagamento", kind: "select", options: ["À vista", "Parcelado", "No êxito"] }], actions: ["Salvar honorários"] },
      { t: "table", title: "Apensos e dependências", cols: ["Número", "Relação", "Situação"], rows: [["0001234-55.2024.8.05.0001", "Apensado ao principal", "Em andamento"], ["0004321-10.2025.8.05.0001", "Execução provisória", "Em andamento"]], actions: ["Vincular processo"] },
      { t: "table", title: "Recursos", cols: ["Recurso", "Interposto em", "Instância", "Situação"], rows: [["Apelação", "10/09", "TJBA", "Aguardando"], ["Embargos de declaração", "02/10", "1º grau", "Concluída"]], actions: ["Novo recurso"] },
      { t: "form", title: "Provisão e risco", fields: [{ label: "Valor da causa (R$)", value: "85.000,00" }, { label: "Provisão (R$)", value: "25.500,00" }, { label: "Risco de perda", kind: "select", options: ["Remoto", "Possível", "Provável"], value: "Possível" }, { label: "Observação", kind: "textarea" }] },
    ],
  },
  {
    id: "2.0-F7", version: "2.0", space: "Func", title: "Migração do Astrea: modelos, certificado e andamentos",
    summary: "Assistente de importação com simulação antes de gravar e relatório do resultado.",
    blocks: [
      { t: "steps", title: "Como migrar", steps: [{ title: "Conectar ao Astrea", text: "Informe o acesso de leitura. Nada é alterado no Astrea." }, { title: "Escolher o que importar", text: "Modelos, certificado e andamentos, em passos separados." }, { title: "Simular", text: "O sistema mostra o que seria importado, sem gravar nada." }, { title: "Importar", text: "Confirmado o resultado da simulação, a importação é feita." }] },
      { t: "form", title: "Opções da importação", fields: [{ label: "Importar modelos de documento", kind: "toggle", on: true }, { label: "Importar certificado digital", kind: "toggle", on: false, hint: "exige a senha do certificado" }, { label: "Importar andamentos", kind: "toggle", on: true }, { label: "Só simular (não gravar)", kind: "toggle", on: true }], actions: ["Simular importação"] },
      { t: "table", title: "Resultado da última simulação", cols: ["Item", "Encontrados", "Novos", "Já existiam", "Com problema"], rows: [["Modelos", "42", "40", "2", "0"], ["Andamentos", "18.730", "18.512", "210", "8"]] },
    ],
  },
  {
    id: "2.0-F8", version: "2.0", space: "Chat", title: "Chat: vários números e relatórios",
    summary: "Cadastro de mais de um número de WhatsApp e relatório de atendimento por número.",
    blocks: [
      { t: "table", title: "Números de WhatsApp", cols: ["Nome", "Número", "Situação", "Fila padrão"], rows: [["Atendimento geral", "+55 71 9 0000-0001", "Conectado", "Geral"], ["Previdenciário", "+55 71 9 0000-0002", "Conectado", "Previdenciário"], ["Cobrança", "+55 71 9 0000-0003", "Desconectado", "Financeiro"]], actions: ["Adicionar número"] },
      { t: "stats", items: [{ label: "Conversas no mês", value: "1.284" }, { label: "Tempo médio da 1ª resposta", value: "6 min" }, { label: "Conversas sem resposta", value: "9" }, { label: "Satisfação (NPS)", value: "78" }] },
      { t: "table", title: "Atendimento por número (outubro)", cols: ["Número", "Conversas", "1ª resposta", "Sem resposta"], rows: [["Atendimento geral", "702", "5 min", "4"], ["Previdenciário", "498", "7 min", "3"], ["Cobrança", "84", "11 min", "2"]] },
    ],
  },
  {
    id: "2.0-F9", version: "2.0", space: "Chat", title: "Chat: follow-ups, mensagens agendadas, NPS e formulários",
    summary: "Lembretes de retorno ao cliente, mensagens agendadas, pesquisa de satisfação e formulários dentro da conversa.",
    blocks: [
      { t: "table", title: "Follow-ups programados", cols: ["Cliente", "Quando", "Mensagem", "Situação"], rows: [["Maria S.", "18/10 09:00", "Lembrete de documentos pendentes", "Agendada"], ["João P.", "19/10 14:00", "Atualização do processo", "Agendada"]], actions: ["Novo follow-up"] },
      { t: "form", title: "Pesquisa de satisfação (NPS)", fields: [{ label: "Enviar após o fim do atendimento", kind: "toggle", on: false }, { label: "Texto da pergunta", kind: "textarea", value: "De 0 a 10, quanto você recomendaria nosso atendimento?" }, { label: "Esperar (horas)", value: "2" }] },
      { t: "table", title: "Formulários enviáveis", cols: ["Formulário", "Campos", "Respostas"], rows: [["Dados para contrato", "8", "23"], ["Checklist de documentos", "12", "41"]], actions: ["Novo formulário"] },
      { t: "note", text: "Nenhuma mensagem é enviada ao cliente sem autorização humana; cada recurso tem o próprio liga/desliga." },
    ],
  },
  {
    id: "2.0-F10", version: "2.0", space: "Func", title: "IA com chave real: resumo, jurisprudência e peças",
    summary: "Configuração do provedor de IA do escritório e uso das ajudas (sempre com validação humana).",
    blocks: [
      { t: "form", title: "Provedor de IA do escritório", description: "A chave fica criptografada e é do escritório.", fields: [{ label: "Provedor", kind: "select", options: ["Anthropic", "OpenAI", "Google"] }, { label: "Chave de API", kind: "password", value: "••••••••••••" }, { label: "IA ligada para o escritório", kind: "toggle", on: false }], actions: ["Salvar", "Testar conexão"] },
      { t: "toggles", title: "Ajudas disponíveis", items: [{ label: "Resumo de processo", on: true }, { label: "Pesquisa de jurisprudência", hint: "cita as fontes", on: true }, { label: "Minuta de peça", hint: "sempre como rascunho para revisão", on: false }] },
      { t: "table", title: "Uso no mês", cols: ["Ajuda", "Usos", "Custo estimado"], rows: [["Resumo", "128", "R$ 14,20"], ["Jurisprudência", "41", "R$ 9,80"], ["Minuta", "17", "R$ 12,10"]] },
    ],
  },
  {
    id: "2.0-F11", version: "2.0", space: "Func", title: "Cofre de credenciais de clientes e perfis mínimos",
    summary: "Guarda segura de acessos de clientes (ex.: Meu INSS) e perfis de acesso com o mínimo necessário.",
    blocks: [
      { t: "table", title: "Cofre de credenciais", description: "Senhas ficam criptografadas e cada consulta é registrada.", cols: ["Cliente", "Sistema", "Usuário", "Senha", "Último acesso"], rows: [["Maria S.", "Meu INSS", "123.***.***-00", "••••••••", "14/10 por Sabrina"], ["João P.", "Gov.br", "joao@exemplo", "••••••••", "10/10 por Dra. Talita"]], actions: ["Nova credencial"] },
      { t: "toggles", title: "Quem pode abrir o cofre", items: [{ label: "Advogados", on: true }, { label: "Assistentes", on: false, hint: "só nos clientes em que atuam" }, { label: "Financeiro", on: false }] },
      { t: "table", title: "Registro de acessos ao cofre", cols: ["Quando", "Quem", "Cliente", "Ação"], rows: [["14/10 15:02", "Sabrina", "Maria S.", "Viu senha"], ["10/10 09:40", "Dra. Talita", "João P.", "Editou"]] },
    ],
  },
  {
    id: "2.0-F12", version: "2.0", space: "Func", title: "Fechamento: revisão geral e versão 2.0.0",
    summary: "Lista de conferência final da versão (não é uma tela nova).",
    blocks: [
      { t: "steps", title: "Conferência de fechamento", steps: [{ title: "Testes completos", text: "Suíte inteira, navegador e build verdes no GitHub." }, { title: "Revisão de segurança", text: "Permissões, isolamento entre escritórios e segredos." }, { title: "Revisão dos textos e do site /produto", text: "Só fatos verificados." }, { title: "Backup e plano de volta", text: "Backup recente e rollback testado." }, { title: "Marcar a versão 2.0.0", text: "Etiqueta no repositório e registro no painel." }] },
      { t: "note", text: "Esta fase não cria tela; é a revisão que fecha a versão." },
    ],
  },
];
