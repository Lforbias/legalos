# PJe assistido — OTP pessoal e detecção pelo navegador

Implementação inicial em 28/10/2026. Tela: `/integracoes/pje`. O fluxo é **assistido pelo titular**, não uma integração universal ao SSO nem monitoramento de todos os processos do advogado.

## Código já existente no celular — extensão 0.2.0

O popup tem um fluxo separado que dispensa importar o segredo do autenticador e dispensa a chave da API de captura. O usuário conclui a primeira etapa do login na página oficial, abre a extensão, escolhe **Verificar pedido de OTP nesta aba** e informa seis dígitos quando existe um desafio reconhecido.

O código é mantido apenas em memória transitória e colocado no formulário do SSO, nunca em armazenamento da extensão ou em uma API do LegalOS. O envio é limitado ao domínio exato `sso.cloud.pje.jus.br`, realm `pje`, caminho `login-actions/authenticate`, formulário Keycloak OTP reconhecido e botão de login esperado. Exige HTTPS, frame principal e POST para a mesma origem. Um ticket aleatório de até 60 segundos prende a tentativa ao formulário e ao `documentId` da aba; uma tentativa consome o ticket, sem repetição automática. Destinos/botões adulterados e navegação concorrente são recusados. Não existem botões para ciência, protocolo ou assinatura.

Depois do envio, o popup instrui conferir a resposta do tribunal: envio não é sucesso de autenticação. Se o portal recusar, uma inspeção nova reconhece a mensagem de código inválido e solicita um novo código. Outros provedores/domínios/realms e layouts não reconhecidos permanecem manuais. A compatibilidade foi testada com DOM simulado; o fluxo real depende de chegar ao desafio com a conta do titular. **Não foi homologado em login real.**

Este fluxo só autentica o navegador. Não cria um robô de consulta de movimentos/avisos nem converte a sessão em autorização MNI. O certificado guardado no servidor não é automaticamente disponibilizado ao PJeOffice do computador. Não exportar o A1 para o navegador por esse recurso.

## O que funciona na implementação

- Importação da chave real Base32 ou URI `otpauth://totp` do autenticador cadastrado no tribunal. Aceita explicitamente SHA1, seis dígitos, 30 segundos. Perfis diferentes são recusados.
- Confirmação com um código daquele autenticador e autorização pessoal com o 2FA do LegalOS. Cada geração de código e remoção também exige verificação pessoal. O certificado A1 não contém o segredo TOTP e não é usado para inventá-lo.
- Segredo cifrado com a chave do cofre, isolado por organização e usuário, sem retorno à tela, API pública, MCP ou RUTE. Retorna somente código e expiração; o código some ao expirar ou ocultar a aba. Auditoria registra a ação sem chave/código.
- Conexão pessoal para extensão (`pje:discover`), com validade de 90 dias, emissão restrita a quem lê/cadastra processos e possui 2FA. Não concede leitura de clientes, acesso a OTP, ferramentas da RUTE ou protocolos. Revogação pelo titular ou administração de integrações.
- Extensão MV3 Chrome/Edge com permissão opcional por origem HTTPS `.jus.br`. O login, certificado e OTP continuam na página oficial. Não coleta valores de formulários, cookies, arquivos ou conteúdo dos autos; extrai CNJs formatados do texto visível e transmite somente CNJ/origem. Não clica em intimações nem protocola.
- Captura local por padrão. Envio automático depende de opção explícita. Falhas preservam fila e geram aviso; há nova tentativa a cada cinco minutos enquanto o navegador está aberto e o automático ligado. Chave recusada pausa o envio. Trocar chave zera a fila anterior e desliga o automático para não enviar dados a outro escritório.
- Fila no LegalOS por pessoa: repetição de CNJ não duplica registro; número observado não significa processo recém-distribuído. Uma confirmação liga ao caso existente, preservando seu ID e dados, ou cria cadastro sigiloso para o cliente escolhido. O vínculo não é decidido por nome. Um CNJ que já existe em cadastro sigiloso de outra equipe não revela ID nem metadados a quem capturou.
- Aprovações repetidas reutilizam o mesmo processo; confirmação concorrente é serializada por organização/CNJ. Se ocorrer falha depois de uma gravação do serviço de casos, a repetição reconhece o CNJ existente em vez de duplicar.

## Uso

1. Acesse Integrações → PJe, com seu usuário do escritório correto e 2FA ativo.
2. Se desejar gerar o OTP no LegalOS, cadastre a chave do autenticador do tribunal. Ela deve vir do cadastro oficial ou de exportação autorizada pelo titular. Não substitua o registro do tribunal por uma chave nova gerada ao acaso.
3. Baixe `/downloads/legalos-pje.zip`, extraia e instale a pasta em `chrome://extensions` ou `edge://extensions`, pelo modo de desenvolvedor / Carregar sem compactação. O pacote não foi publicado na loja.
4. Clique em Criar conexão pessoal e cole a chave na extensão. Ela consulta `GET /api/v1/pje/discoveries` para mostrar o escritório real da chave antes de ativar o envio.
5. Abra um PJe oficial, autorize somente aquela origem e faça o login normal. Ligue o envio automático ou envie a fila manualmente.
6. Confira cada número no LegalOS. Escolha o caso pré-processual/administrativo correto para judicializar, ou escolha o cliente e crie outro processo. Processos com outro CNJ não podem ser sobrescritos por essa aprovação.
7. Confira os metadados no tribunal. A captura não baixa os autos nem obtém automaticamente partes/CPF. As ferramentas de consulta MNI/DataJud continuam separadas e dependem das respectivas conexões.

## API restrita

`GET /api/v1/pje/discoveries`: valida chave `pje:discover` e retorna só identificação do escritório.

`POST /api/v1/pje/discoveries`: corpo `{ "sourceOrigin": "https://pje.tjba.jus.br", "numbers": ["CNJ válido"] }`. Até 50 números por lote; exige token com escopo `pje:discover` e permissão atual `cases:write`. Apenas acrescenta candidatos à fila. Dados fornecidos pelo navegador não são tratados como informação autenticada pelo tribunal.

Limites: 500 números na fila local; até 1.000 pendentes por pessoa no servidor; tela mostra os 100 mais recentes, com novos aparecendo conforme forem tratados. Seletor de casos usa os 200 cadastros recentes visíveis. Autenticadores: 10 ativos por pessoa.

## O que ainda NÃO foi comprovado

- Login em tribunal real com uma chave TOTP do titular. O teste de cadastro comprova a correspondência chave/código, não que o cadastro esteja ativo no PJe.
- Instalação e funcionamento da extensão em uma tela real de distribuição do tribunal. As interfaces variam; precisamos confirmar que o CNJ fica visível como texto formatado.
- Descoberta sem navegador aberto, de processos não visitados, em segundo plano no servidor ou de toda a OAB.
- Autenticação SSO/OAuth do LegalOS como cliente oficial PDPJ. Isso depende de registro, escopos e autorização externa; nenhum cliente/código OAuth fictício foi criado.
- Distribuição de ação inicial pelo adaptador MNI atual. Ele continua exigindo número existente.

## Verificações automatizadas

Vetor oficial TOTP/RFC 6238; importação/recusa de perfis; escopo e isolamento do cofre; revogação; ausência de segredo na auditoria; captura sem texto e bloqueio em formulário de senha; origem permitida; dígito CNJ; isolamento de mensagens da extensão; fila preservada em falha; troca de chave sem reaproveitar fila; escopo da conexão pessoal; confirmação concorrente sem duplicação; preservação de caso/tarefa e sigilo.

Empacotamento: `npx tsx scripts/package-pje-extension.ts`. Regerar o ZIP a cada alteração nas fontes da extensão; o pacote é servido de `public/downloads` e não contém chaves nem dados do escritório.

## Referências oficiais

- MFA e cadastro de autenticador no acesso ao tribunal: https://portal.trf6.jus.br/cnj-implementa-duplo-fator-de-autenticacao-na-plataforma-digital-do-poder-judiciario/
- Autorização de clientes/API PDPJ: https://docs.pdpj.jus.br/servicos-negociais/GeCli/
- Serviço MNI e papéis autorizados: https://docs.pje.jus.br/servicos-auxiliares/servico-mni-client/
- Permissões opcionais Chrome: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Scripts e origens autorizadas Chrome: https://developer.chrome.com/docs/extensions/reference/api/scripting

## Certificado somente consulta (28/10/2026)

Todo novo upload define `consultationOnly = true` no servidor, sem opção pública para liberar escrita. O material só pode ser aberto para o teste criptográfico sem rede `local:tls-check`, `mni:wsdl`, `mni:consultarAvisosPendentes`, `mni:consultarProcesso` e `mni:consultarProcesso:autos`. Finalidade desconhecida, assinatura, protocolo e leitura de teor de comunicação que pudesse registrar ciência são recusados antes da decifragem. O adaptador MNI real verifica o mesmo bloqueio em preflight e submit, também cobrindo invocações diretas e execuções agendadas. Administradores não têm exceção.

Uploads não iniciam requisição ao tribunal nem criam/agendam petições. Consultas/importações podem atualizar a cópia dos dados dentro do LegalOS; não concedem autorização para atos processuais externos.

A migração preserva certificados anteriores com `consultationOnly = false` para não mudar silenciosamente configurações já concedidas a outros escritórios. A tela os identifica como certificados anteriores sem a trava. O usuário que ainda não cadastrou certificado receberá o modo de consulta em seu novo cadastro. Não há mudança na autorização de conexões por senha que não utilizem este certificado.

Testes cobrem consultas permitidas, recusa de operações desconhecidas/de escrita, ausência de abertura da chave em recusa e bloqueio do transporte no adaptador real. A consulta em tribunal real ainda precisa de validação com as credenciais do titular.

## Ajuste de conexões antigas e TRF1

Em Integrações, “Corrigir destino sem apagar o certificado” permite ajustar serviço/WSDL/ambiente mantendo credenciais. Salvar desliga a conexão, limpa a verificação anterior e impõe somente consulta ao certificado associado. Certificados cadastrados antes da restrição também podem ser protegidos pela ação “Restringir a somente consulta” em Certificados. Não há ação para liberar escrita.

Páginas de Swagger, HTML, PDF e login SSO não são endpoints SOAP. O cadastro e as operações de conexões antigas rejeitam esses alvos antes de abrir a chave ou executar o transporte. Isso diagnostica o endereço inválido da captura de tela; a mensagem genérica com referência `78b8c3d7` não teve seu registro de produção consultado e pode conter outra falha subjacente.

Para TRF1, homologação HML1, 1º grau, o WSDL publicado é `https://pjehml1g.trf1.jus.br/pje/intercomunicacao?wsdl`; o campo de serviço usa a mesma origem/caminho sem `?wsdl`. Os outros destinos disponíveis são retirados da mesma orientação oficial: https://www.trf1.jus.br/trf1/conteudo/NUGTI/MNI_Orienta%C3%A7%C3%B5es.pdf

O documento informa necessidade de autorização da Presidência do TRF1 e liberação de IP público da entidade; certificado pessoal e URL correta não substituem essa autorização. Nenhuma chamada autenticada ao TRF1 foi feita nesta correção e não houve alteração de processo no tribunal. A configuração de produção já cadastrada pelo usuário não foi modificada diretamente nesta sessão: requer salvar o destino pela tela autenticada.

## Diagnóstico confirmado do PFX

As referências `78b8c3d7` e `c32fd62d` foram consultadas pela tela administrativa autenticada e correspondem a `Unsupported PKCS12 PFX data`. Portanto, além do Swagger incorreto na primeira configuração, havia incompatibilidade do pacote PFX com a preparação TLS. O código agora reexporta somente em memória para AES-256, preserva o certificado/identidade/cadeia e não altera o material cifrado guardado. O teste local de Certificados prepara um contexto TLS sem qualquer acesso à rede; compatibilidade do arquivo não comprova autorização MNI.

## Preparação de destinos oficiais

Integrações apresenta 12 candidatos de TRF1 (homologação e produção, 1º/2º grau), TJBA, TJPE, TRT6 e TRT15 (produção, 1º/2º grau). As fontes oficiais estão associadas a cada item em `src/lib/connectors/official-targets.ts`. O catálogo não pretende abranger todo o país nem comprova compatibilidade do contrato, autenticação por certificado ou concessão de acesso.

A ação autenticada exige gestão de integrações, acesso ao certificado, permissão para restringi-lo e 2FA ativo. O CPF é validado e, quando a identificação está no CN do certificado, precisa corresponder ao titular. A ação impõe somente consulta, grava credencial cifrada, preserva conexões existentes e deixa os novos cadastros desligados. Não chama tribunais. Repetir a preparação não duplica endpoints já cadastrados. A consulta/contrato de cada destino deve ser validada separadamente antes de ligar.
