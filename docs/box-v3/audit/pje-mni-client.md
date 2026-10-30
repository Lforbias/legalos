# pje-mni-client — auditoria

Somente leitura, nada executado. 2026-10-29. Clone em `$HOME/ext2/pje-mni-client`. Repositório SEM licença: só ideias, nenhum código reproduzido.

- **Licença verificada:** nenhum `LICENSE`/`COPYING`; o `README.md` não cita licença. Direitos reservados: não copiar nem adaptar.
- **Maturidade:** 1 commit (2026-05-30), 4 arquivos, 258 linhas em um único módulo (`pje_mni_client.py`), sem testes.

## O que o código realmente faz
- Monta sessão HTTP com certificado A1 via PKCS#12 (`pje_mni_client.py:106-115`) e cliente SOAP zeep carregando o WSDL remoto do CNJ (`:65,102`) com `strict=False` e `xml_huge_tree=True` (`:100`), que afrouxam o parser; proteções contra entidades e recursos externos dependem do padrão da versão do zeep e não são configuradas no código (não verificado).
- Expõe consulta de processo, download de documento por ID, download completo e avisos pendentes (`:117-233`).

## Capacidades reais versus documentadas
- **Não encontrado no código:** o "retry automático" para base64 malformado e o "contornar bloqueios PDPJ" prometidos no README; o `README.md` cita `requirements_mni.txt`, que não existe. O endpoint de produção/staging é guardado mas nunca usado para criar o serviço (`:93,104`), então as chamadas vão ao endereço do WSDL.
- As operações não casam com o MNI 2.2.2 visto no `pje-download` (`mni_client.py:476-494`): aqui `consultarProcesso` recebe só `nrProcesso`, sem consultante e senha (`:130-131`), e `consultarTeorComunicacao` é usada para baixar documento por ID (`:172-173`). A leitura da resposta por `.get` e `hasattr` em campos como `documentos` e `situacao` (`:139-152,183,230`) não corresponde ao esquema real (`processo/dadosBasicos/documento`). Provavelmente não funciona fora do exemplo.

## Conceitos aproveitáveis (só ideias, a validar na documentação oficial do CNJ)
1. Certificado cliente no transporte (mTLS) separado do SOAP.
2. Operação de avisos pendentes como fonte de intimações.
3. Ambiente de homologação separado do de produção.

## Riscos de segurança e qualidade
- **Sucesso simulado:** `consultar_avisos_pendentes` devolve lista vazia em erro (`:231-233`), indistinguível de "sem intimações" (risco de perder prazo); `baixar_processo_completo` engole falha por documento e registra "baixado completamente" (`:220-223`).
- **Certificado exposto a qualquer host:** o adaptador PKCS#12 é montado em `https://` e `http://` (`:113-114`) ou seja, vale para qualquer host: se `wsdl_url` ou imports do WSDL apontarem para terceiros, a conexão com o certificado de cliente vai junto (risco de SSRF e de exposição de identidade). O parser frouxo (`:100`) amplia a superfície de DoS.
- **Gravação sem validação:** tudo vira `.pdf` (`:218`), base64 sem modo estrito (`:41`), sem checksum, e `dest_dir/nr_processo` sem validação (`:205`) permite path traversal.
- **Possível efeito jurídico:** `consultarTeorComunicacao` pode registrar ciência da comunicação; não confirmado no código, verificar antes de qualquer uso.
- Sem `verify=False` (TLS padrão do requests); sem CAPTCHA/MFA; passphrase mantida em atributo (`:91`).

## Decisão
**DESCARTAR:** sem licença, chamadas MNI provavelmente incorretas, sucesso simulado e sem testes; usar apenas a documentação oficial do CNJ como fonte.
