# NEW FEATURES — LegalOS Evolution

> Backlog de novas funcionalidades aprovado em 17/11/2026.
> **Status geral: PLANEJADO — não implementado nem validado em produção.**
> Fonte de referência para respostas futuras a "o que temos para fazer no LegalOS?".
> Este arquivo registra apenas os quatro projetos aprovados, na ordem de prioridade escolhida.

## 1. Docassemble — automação de documentos (prioridade 1)

**Referência:** https://github.com/jhpyle/docassemble  
**Objetivo:** adicionar um motor de formulários/entrevistas inteligentes e geração de documentos (DOCX/PDF), integrado às entidades já existentes do LegalOS, sem substituir a plataforma.

**Funcionalidades desejadas**
- Modelos de contratos, procurações, declarações, petições padronizadas e formulários.
- Entrevistas guiadas e perguntas condicionais com validação.
- Pré-preenchimento com clientes/partes/processos já cadastrados no CRM/Jurídico.
- Geração versionada de DOCX/PDF, registro de autoria e histórico auditável.
- Revisão e aprovação humana; armazenamento no processo/cliente; integração posterior a assinatura.
- Acionamento por eventos interdepartamentais, com autorização e visibilidade adequadas.

**Primeiro piloto (dados fictícios):** cliente no CRM → entrevista para contrato de honorários → DOCX/PDF → revisão por advogado → anexação ao cadastro/processo.

**Abordagem:** avaliar implantação do Docassemble como serviço separado, com integração via API/adaptador; preservar autenticação, permissões e multiempresa no LegalOS. Verificar desempenho, segurança, isolamento de dados e condições da licença MIT.

**Critério de aceite:** fluxo demonstrável ponta a ponta, sem copiar dados entre telas manualmente, com logs, versionamento e revisão obrigatória.

**Status:** A fazer.

## 2. Mike — IA jurídica e revisão documental (prioridade 2)

**Referência:** https://github.com/open-legal-products/mike  
**Objetivo:** inspirar a camada LegalOS Intelligence, vinculando agentes jurídicos a documentos, processos e serviços do produto.

**Funcionalidades desejadas**
- Pesquisa e respostas fundamentadas nos documentos autorizados, com referências conferíveis.
- Análise de contratos, comparação de versões, sugestões e revisão tabular.
- Fluxos reutilizáveis de revisão e elaboração de minutas.
- Conectores MCP, integração com Google Workspace/Word quando apropriado.
- Aprovação explícita para operações que modificam, compartilham ou enviam dados.
- Logs, rastreabilidade de fonte, limites de acesso, prevenção de vazamento entre escritórios e avaliações de qualidade.

**Primeiro piloto:** selecionar documentos fictícios de um processo, perguntar sobre pontos-chave e gerar relatório revisável com citações e trilha de auditoria.

**Abordagem:** avaliação funcional/técnica e protótipo isolado; **não incorporar código do Mike diretamente antes de revisar a AGPL-3.0 e obrigações aplicáveis ao SaaS**. Avaliar arquitetura e reimplementar conceitos com componentes próprios/licenciados adequadamente.

**Critério de aceite:** respostas com origem rastreável, controle de acesso do escritório, revisão humana para conclusões jurídicas e aprovação antes de ações de escrita.

**Status:** A fazer.

## 3. Juriscraper — padrões arquiteturais para o LegalOS Box (prioridade 3)

**Referência:** https://github.com/freelawproject/juriscraper  
**Objetivo:** aproveitar padrões de coleta, normalização, testes por fonte e observabilidade para tornar o Box mais confiável, sem assumir que a ferramenta suporta tribunais brasileiros.

**Funcionalidades desejadas**
- Adaptadores independentes por tribunal/motor (PJe, Eproc, e-SAJ), com versões e capacidades identificadas.
- Agendador e fila persistente de processos a conferir, tentativas controladas e retomada segura.
- Extração e normalização de metadados e movimentações; comparação idempotente com o banco.
- Logs por tribunal e motor, códigos de erro estruturados, métricas e relatórios do Modo Dev.
- Alertas para alterações reais e encaminhamento aos módulos de Processos/Prazos/Atendimento.
- Autenticação permitida, sessão persistente quando autorizada, tratamento de OTP/certificado e intervenção humana quando exigida.
- Preservar fontes públicas como DJEN e DataJud em paralelo.

**Limites:** Juriscraper é voltado a tribunais dos EUA; **não fornece integração pronta com PJe/Eproc/e-SAJ**. Não prometer bypass de CAPTCHA, nem listar MNI como disponível sem acesso autorizado.

**Primeiro piloto:** um tribunal/motor em ambiente de testes, com dados permitidos, resultado normalizado, diff entre capturas, logs e notificação validada.

**Critério de aceite:** fluxo real verificável, sem duplicação de movimentações, com erros diagnosticáveis e sem necessidade de testes manuais constantes.

**Status:** A fazer.

## 4. E-Discovery — evidências e gestão documental avançada (prioridade 4)

**Referência/catálogo:** https://github.com/ishandutta2007/Awesome-Ediscovery  
**Ferramentas a avaliar:** IPED (https://github.com/sepinf-inc/IPED), Paperless-ngx (https://github.com/paperless-ngx/paperless-ngx), FreeDiscovery (https://github.com/FreeDiscovery/FreeDiscovery).

**Objetivo:** explorar capacidades para um futuro módulo LegalOS Evidence e fortalecer o acervo de documentos, respeitando a necessidade concreta dos escritórios.

**Funcionalidades desejadas**
- OCR e busca por conteúdo de documentos, PDFs e e-mails.
- Classificação e etiquetagem; processamento em lote e deduplicação.
- Pesquisa de evidências, agrupamento de arquivos relacionados e metadados preservados.
- Hashes, proveniência, cadeia de custódia, auditoria de acesso e exportação.
- Vinculação de evidências a clientes, casos, processos e responsáveis.

**Primeiro piloto:** pequeno conjunto fictício de documentos e mensagens com OCR, busca, agrupamento e identificação de duplicidades.

**Abordagem:** avaliar cada dependência e sua licença separadamente; usar serviços especializados apenas quando comprovarem valor e desempenho. Não substituir o GED atual precipitadamente.

**Critério de aceite:** acervo pesquisável, com origem e integridade verificáveis, sem violação de permissões entre escritórios.

**Status:** A fazer.

## Regras de execução

1. Preservar o repositório e as funcionalidades existentes; não reconstruir o LegalOS do zero.
2. Integrar cada funcionalidade aos departamentos e fluxos reais (Comercial → Jurídico/Documentos → Financeiro → Atendimento) quando fizer sentido.
3. Validar no ambiente de desenvolvimento com dados fictícios e fluxo ponta a ponta antes de publicar.
4. Tratar licenciamento, segurança, segregação multiempresa, LGPD, auditoria e aprovação humana como requisitos obrigatórios.
5. Não confundir "planejado" com "implementado"; atualizar o status aqui apenas após entrega e testes verificáveis.
6. Ao perguntar **"o que temos para fazer?"**, recuperar este arquivo e apresentar estes quatro itens, nessa ordem, junto com as demais pendências atuais do LegalOS quando solicitado.

## Resumo rápido

| Ordem | Projeto | Entrega-alvo | Status |
|---|---|---|---|
| 1 | Docassemble | Geração e revisão de documentos integrada ao CRM/Jurídico | A fazer |
| 2 | Mike | IA jurídica fundamentada em documentos e com aprovações | A fazer |
| 3 | Juriscraper | Arquitetura robusta para conectores e monitoramento do Box | A fazer |
| 4 | E-Discovery | OCR, busca, deduplicação e cadeia de custódia | A fazer |
