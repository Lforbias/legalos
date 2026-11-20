/**
 * Termos de uso e privacidade do PILOTO (MVP de testes). O texto é um rascunho operacional e precisa da revisão
 * jurídica do escritório antes de ir para clientes; ao mudar o texto, troque a versão (todos aceitam de novo).
 * Exigência ligada com LEGALOS_PILOT_TERMS=1.
 */
export const PILOT_TERMS_VERSION = "piloto-2026-11-v1";
export const pilotTermsRequired = () => process.env.LEGALOS_PILOT_TERMS === "1";

export const PILOT_TERMS: { title: string; body: string }[] = [
  { title: "1. O que é o piloto", body: "Esta é uma versão de testes do LegalOS, oferecida a escritórios convidados para avaliação. Funções podem mudar, ficar indisponíveis ou apresentar falhas. Algumas funções estão desligadas de propósito nesta fase (protocolo e robôs nos tribunais, WhatsApp por QR-Code, campanhas em massa, conciliação bancária e cálculo de atualização trabalhista)." },
  { title: "2. Conferência humana obrigatória", body: "Prazos, cálculos, publicações e sugestões da IA são ferramentas de apoio. Toda informação que gere ato processual, cobrança ou comunicação com cliente deve ser conferida por profissional habilitado antes do uso. O escritório continua responsável pelo controle dos seus prazos." },
  { title: "3. Dados pessoais (LGPD)", body: "O escritório é o controlador dos dados de seus clientes e o LegalOS atua como operador, tratando-os apenas para prestar o serviço. Os dados ficam em servidor no Brasil, com acesso restrito, criptografia de segredos, registro de auditoria e backup cifrado. CPF, CNPJ e e-mails são mascarados antes de qualquer envio a provedores de IA. Ao fim do piloto, o escritório pode exportar seus dados e pedir a exclusão." },
  { title: "4. Segurança da conta", body: "Cada pessoa usa o próprio login. Recomenda-se ativar a verificação em duas etapas. Suspeita de acesso indevido deve ser comunicada imediatamente ao suporte." },
  { title: "5. Feedback e suporte", body: "Durante o piloto, o escritório se compromete a relatar falhas e sugestões pelos canais combinados. Registros técnicos de uso e de erros (sem conteúdo de processos) podem ser analisados para corrigir problemas." },
  { title: "6. Disponibilidade e responsabilidade", body: "O piloto é fornecido no estado em que se encontra, sem garantia de disponibilidade contínua. Mantenha cópia dos documentos essenciais e não use o piloto como único controle de prazos fatais até o fim da avaliação." },
];
