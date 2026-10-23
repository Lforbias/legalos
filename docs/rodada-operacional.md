# Rodada operacional — paridade Astrea

Escopo autorizado: oito frentes do comparativo, implementadas e verificadas em etapas na mesma rodada.

- [x] Atividade canônica em lista, agenda, gestão, processo e ferramentas: mesma origem/ID; quadros livres continuam distintos.
- [x] Checklists, colaboradores e recorrência de tarefas/compromissos, com isolamento e regras de sigilo.
- [x] Workflows com datas relativas, dias úteis/corridos e encadeamento.
- [x] Ampliar catálogo compartilhado RUTE/REST/MCP (financeiro, produtividade, documentos, CRM, Chat e atividades).
- [ ] Diagnóstico e validação de WhatsApp; conexão real depende de número/credenciais do escritório.
- [ ] Auditoria de migração: cobertura e vínculos, arquivos/links, estados e saldos; sem corrigir registros automaticamente.
- [ ] Homologação de conectores: testes de contrato e diagnóstico; tribunal real depende de credenciais/ambiente autorizado.
- [ ] Pesquisa jurisprudencial com recuperação e fontes verificáveis; sem apresentar texto gerado como julgado localizado.

## Decisões

A unificação usa referências aos registros de tarefa, prazo e compromisso, sem duplicar registros nos quadros. Transições continuam passando pelos serviços e permissões do domínio, especialmente validação humana de prazos. Dados reais não serão criados para teste em produção. Credenciais não entram em código, logs ou documentação. Funcionalidades externas só serão consideradas homologadas após evidência real.

## Implementado nesta rodada (aguardando publicação)

- Atividades originais na agenda e gestão; checklists, colaboradores e séries. Compromissos com responsável e situação; detalhes também disponíveis para leitura.
- Workflows atômicos, datas relativas e dependência. Dias úteis operacionais não usam recesso processual; permitem exceções locais informadas.
- 52 ferramentas compartilhadas (32 consultas e 20 propostas). Escritas financeiras/CRM/documentos/envios de Chat continuam nas telas; não há cobertura total de escritas externas.
- Diagnóstico somente leitura em `/integracoes/diagnostico`: evidência de entrada/saída do WhatsApp, contratos de tribunais, mapas de importação e limites explícitos da auditoria.
- Pesquisa pública Google/Gemini em IA: referências dos metadados de busca, somente trechos com suporte, sugestões do Google em iframe isolado. Não afirma que todo resultado é decisão ou inteiro teor e não verifica separadamente a disponibilidade da página.

## Validação e pendências externas

71 testes de integração passaram, incluindo serviços de atividades/workflows, propostas compartilhadas, diagnósticos, WhatsApp e MNI contra servidores simulados. 12 testes unitários passaram para calendário, grounding e contratos. Build de produção passou. Seis cenários de navegador passaram: atividade unificada/checklist/recorrência, tarefas/prazos/agenda, isolamento, produtividade, caixa de entrada e aprovação no chat. Tribunal real e WhatsApp real dependem de conexão autorizada; simulação não homologa produção. Auditoria integral contra os arquivos de exportação e verificação dos binários ainda não foi realizada.
