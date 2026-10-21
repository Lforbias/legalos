# Roadmap

| Fase | Escopo | Estado |
|---|---|---|
| 0 | Auditoria, arquitetura, docs | ✅ |
| 1 | Fundação: projeto, design system, autenticação, organizações, usuários/permissões, banco/migrations, isolamento multiempresa, dashboard, testes | ✅ (ver pendências em `implementation-status.md`) |
| 2 | Clientes (CPF/CNPJ validados) e processos (partes, linha do tempo, documentos básicos) | ✅ (ver pendências em `implementation-status.md`) |
| 3 | Tarefas, Kanban, agenda, prazos manuais + validação, notificações | ✅ (ver pendências em `implementation-status.md`) |
| 4 | Central de intimações (registro manual/texto colado, duplicidade, distribuição, providências; import automático e OCR dependem das Fases 5/8) | ✅ (ver pendências em `implementation-status.md`) |
| 5 | Documentos, modelos, versões, peticionamento (adaptador de demonstração) | ✅ (envio real em tribunal depende da Fase 8) |
| 6 | CRM, workflows (automações), portal do cliente | ✅ (ver pendências em `implementation-status.md`) |
| 7 | Financeiro (contas a pagar/receber, parcelas, baixas e estornos, fluxo de caixa) + importação financeira do Astrea | ✅ (ver pendências em `implementation-status.md`) |
| 8 | IA e integrações | em andamento — 8a (IA) ✅, 8b (OCR e busca) ✅ e 8c (consulta DataJud/CNJ) ✅; pendentes: Google Agenda/Gmail e envio de e-mail |
| 9 | BI, segurança ampliada (RLS, CSP, MFA), backups, monitoramento, planos/cobrança, checklist de produção | — |

## Riscos técnicos principais
- Cálculo de prazos exige regras versionadas e validação humana (Fase 3/4) — nunca "genérico".
- Integrações judiciais dependem de acesso institucional/credenciais e de APIs que nem todo tribunal oferece.
- Uso de IA com documentos sigilosos exige avaliação contratual/LGPD antes de ativar.
- Migrations SQL manuais podem divergir do `schema.prisma` (mitigar com `prisma migrate diff` no CI quando houver acesso aos binários).

## Ideias (ainda não planejadas)

- **API própria `/api/v1`:** chaves de API por escritório (somente hash, mostradas uma vez, com escopo leitura/escrita, validade e revogação, auditadas), começando por clientes, processos, tarefas e prazos; processos sigilosos nunca expostos a chaves.
- **Dashboard de administração:** a versão da PLATAFORMA (dono do sistema) está pronta em `/admin`. Falta a versão por escritório (administrador do escritório ver uso, 2FA da equipe e saúde das integrações do próprio escritório), armazenamento em disco por escritório e estado dos backups.
- **Integração LegalMail como adaptador real** de intimações, autos e protocolo (substitui o adaptador de demonstração do peticionamento).
