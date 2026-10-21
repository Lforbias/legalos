# Integrações

**Nenhuma integração externa está ativa na Fase 1.** Não há comunicação com tribunais, provedores de e-mail, pagamento, IA ou calendários.

| Integração | Estado | Observação |
|---|---|---|
| E-mail | Interface `Mailer` pronta; só driver `console` (não entrega) | UI avisa e exibe links para cópia manual. Falta: driver SMTP/API do provedor escolhido |
| Tribunais / intimações | Não iniciada (Fase 4/5) | Arquitetura de conectores independentes; sem scraping, sem burlar autenticação; adaptador de demonstração claramente identificado |
| Provedores de IA | Não iniciada (Fase 8) | Interface independente de fornecedor; avaliar retenção/treinamento/autorização antes de enviar documentos |
| Cobrança (Pix/boleto/cartão) | Não iniciada | `subscriptions.provider_reference` reservado; cobrança real só após integração comprovada |
| Google Calendar / WhatsApp Business | Não iniciada | Dependem de autorização/credenciais do escritório |

Regra: integração só é "ativa" com configuração válida, comunicação real e verificação dos resultados. Demonstração ≠ integração.
