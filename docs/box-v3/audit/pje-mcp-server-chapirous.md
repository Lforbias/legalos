# pje-mcp-server — auditoria

Leitura estática; nada executado. Citações em `~/ext2/pje-mcp-server`. Nota: a pasta é `pje-mcp-server`; não há campo de autor/repositório real (`package.json` aponta `seu-usuario`).

- **Licença verificada:** `LICENSE:1-3` é MIT com "Copyright (c) 2024 [Seu Nome]" (placeholder, titular não identificado); `package.json` declara `"license": "MIT"`. Em tese reutilizável com aviso, mas sem titular identificável a segurança jurídica é frágil.
- **Maturidade:** 1 commit (13/06/2025, "Commit inicial do projeto PJE Peticionamento"), ~2.300 linhas TypeScript/HTML, sem testes (o script `test` aponta para arquivo inexistente). Pré-protótipo.

## O que é REAL
- Servidor MCP por stdio com 10 ferramentas `pje_*` (configurar, listar/buscar processo, órgãos, classes, assuntos, status, configurar/listar/info de certificado): `src/index.ts:223-322,326-355`.
- Cliente HTTP embutido que chama `GET /api/v1/processos`, `/processos/{id}`, `/orgaos-julgadores`, `/classes`, `/assuntos` com `Authorization: Bearer` e cabeçalho `X-pje-legacy-app` (`index.ts:65-70,177-197`), tipo de resposta `{status, code, messages, result, page-info}` (`index.ts:22-32`); SSO por senha (`grant_type=password`, `index.ts:134-155`). Rotas e contrato **não verificados contra nenhum PJe real**; não há teste nem fixture.
- Leitura de PDF (`pdf-processor.ts`): extrai número CNJ por regex e classe/órgão/assunto por rótulos; tipo de petição fixo "Petição Intermediária" (`:56-57`).

## O que é MOCK (fictício)
- `src/pje-client.ts` (usado por `web-server.ts`): autenticação apenas simulada (`:49-52`), `buscarProcesso` devolve dados inventados ("João da Silva", "Empresa XYZ Ltda", `:61-70`) e **`peticionar` gera "protocolo" com `Math.random()` e registra "Petição protocolada com sucesso" sem tocar no tribunal** (`:78-87`). As rotas `/peticionar` e `/peticionar-lote` devolvem esse protocolo como recibo (`web-server.ts:80-137,139-190`). **Peticionamento 100% fictício.**
- Certificado A1/A3: README promete ambos, mas `certificate-manager.ts` só chama `certutil` do Windows e fixa o provedor "SafeSign" (`:49,63,70`); campos de PFX existem, sem leitura (`:13-14`). O agente HTTPS recebe objetos `{thumbprint, provider}` como `cert`/`key` (`:68-81`), que o `https.Agent` do Node não interpreta como credenciais (inferência não executada): na prática não autentica.

## Conceitos de MCP aproveitáveis
Nomenclatura `pje_*` por verbo; ferramenta de status de conexão separada (`index.ts:287`); erros devolvidos como texto de resultado, sem derrubar o servidor (`index.ts:326-355`); transporte stdio e exemplo de `claude_desktop_config.json` (`examples/`); descritor de tribunal por `baseUrl` + `appName` (`docs/TRIBUNAIS_SUPORTADOS.md`). Para o LegalOS: ferramentas somente leitura por padrão, nenhuma ação de escrita sem confirmação humana.

## Riscos
- `rejectUnauthorized: false` (`certificate-manager.ts:79`): TLS sem validação.
- Credencial fixa de exemplo no código: thumbprint e senha `123456` (`index.ts:382-383`).
- Senha do certificado trafega como argumento de ferramenta MCP, isto é, pelo contexto do modelo (`index.ts:299-302,593-596`); `test-certificate.ts:11,22` imprime a senha no console.
- Thumbprint interpolado em linha de comando de shell (`certificate-manager.ts:49`): injeção de comando se vier de entrada externa.
- Servidor web Express sem autenticação, com upload de PDFs em `uploads/` (`web-server.ts:9,80`).
- Documentação promete "integração completa" e "qualquer tribunal PJE"; o código não sustenta.

## Decisão
**APENAS CONCEITO (reimplementar):** MIT com titular em branco e código majoritariamente mock; aproveitar só o desenho de ferramentas MCP e jamais o peticionamento ou o gerenciador de certificado.
