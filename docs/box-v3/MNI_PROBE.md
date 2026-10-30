# Sonda do MNI (`scripts/mni-probe.ts`)

Script isolado para testar a conexão MNI (CNJ/SOAP) com um tribunal real, **fora** do LegalOS, antes de
cadastrar a conexão no app. Reaproveita o mesmo transporte e os mesmos parsers de produção
(`src/lib/mni/transport.ts` e `src/lib/mni/xml.ts`) — não é um código paralelo, é o cliente MNI de verdade
rodando sozinho.

## Onde rodar

**Sempre no seu computador, ou no de alguém da equipe com acesso técnico — nunca dentro do ambiente de
nuvem do Claude/LegalOS.** De preferência num computador com internet no Brasil (o IP de saída costuma
importar para tribunais). O certificado A1 (.pfx) e as senhas ficam só nessa máquina: nada é enviado para
o Claude, para a nuvem do LegalOS nem para qualquer lugar além do próprio tribunal.

## Passo a passo (se for você mesma, Dra. Talita, rodando)

1. Abra o Terminal e entre na pasta do projeto `legalos` (a mesma onde já roda `npm run dev`).
2. Rode primeiro o teste **sem senha e sem certificado**, só para ver se o endereço do tribunal responde:
   ```
   npm run mni:probe -- --url https://pje1g.trf3.jus.br/pje/intercomunicacao --mode wsdl
   ```
   Troque a URL se o TRF3 já tiver te passado o endereço oficial do serviço MNI (o de cima é um
   **palpite** baseado no padrão comum do PJe — pode não ser o certo). Se não informar `--url`, o script
   tenta sozinho dois endereços padrão e avisa que são palpites.
3. Se o passo 2 funcionar (aparecer "OK" e as operações do MNI), aí sim teste com o seu CPF, senha e/ou
   certificado. Para não deixar a senha salva no histórico do Terminal, exporte as variáveis antes:
   ```
   export MNI_PROBE_PASSWORD="sua senha do MNI/PJe"
   export MNI_PROBE_PFX_PASSWORD="senha do certificado, se for usar"
   npm run mni:probe -- --url https://pje1g.trf3.jus.br/pje/intercomunicacao --mode avisos \
     --cpf SEU_CPF_SO_NUMEROS --pfx /caminho/para/seu/certificado.pfx
   ```
4. O resultado final (a seção `=== FIM ===` e a mensagem OK/FALHOU de cada endereço) pode ser colado de
   volta no chat comigo — por padrão o script nunca imprime senha, certificado, número de processo, nome
   de parte ou texto de movimentação, só contagens e o formato da resposta.

## Se for o Felipe (ou outra pessoa técnica) rodando

Mesma coisa acima, via linha de comando normal (`npm run mni:probe -- --help` não existe, mas os
comentários no topo de `scripts/mni-probe.ts` têm todos os exemplos). Resumo das flags:

- `--url <endereço>` — endereço do serviço MNI do tribunal. Sem isso, tenta os dois endereços padrão do PJe.
- `--mode wsdl|avisos|processo` — `wsdl` (padrão) só testa alcançabilidade, sem credenciais; `avisos`
  consulta avisos pendentes; `processo` consulta um processo específico (precisa de `--cnj`, 20 dígitos).
- `--cpf <dígitos>` — CPF (ou CNPJ) do consultante, só números. Obrigatório nos modos `avisos`/`processo`.
- `MNI_PROBE_PASSWORD` (variável de ambiente) — senha do MNI/PJe. Evite `--password` na linha de comando.
- `--pfx <caminho local>` + `MNI_PROBE_PFX_PASSWORD` — certificado A1 e sua senha, se o modo de autenticação
  do tribunal exigir certificado.
- `--show-content` — mostra o conteúdo de verdade (números de processo, texto de movimentação) no SEU
  PRÓPRIO terminal. Sem essa flag a saída já sai segura para colar em qualquer lugar.

## O que o resultado significa

- **`wsdl` falhou com "domínio não encontrado" ou "conexão recusada"** → o endereço está errado, ou o
  tribunal não libera esse serviço nesse ambiente. Não é problema de certificado nem de senha.
- **`wsdl` funcionou mas sem nenhuma operação do MNI encontrada** → provavelmente não é o endpoint do MNI
  (pode ser outro contrato WSDL do mesmo domínio).
- **`avisos`/`processo` responderam "HTTP 403" mencionando IP** → o tribunal bloqueia esse IP de saída;
  é preciso pedir autorização/liberação formal ao tribunal, trocar certificado não resolve.
- **"Consultante ou senha inválidos"** → credencial errada ou ainda não habilitada para acesso MNI nesse
  tribunal (às vezes é um cadastro separado do login web do PJe).
- **Tudo "OK"** → o LegalOS já pode ser configurado com este mesmo endereço, CPF, senha e certificado em
  Integrações → Avançado: conexão oficial MNI.

## O que NÃO fazer

- Não rode este script dentro de uma sessão do Claude/Cowork (nem aqui, nem na VM de automação do Mac) —
  nenhuma delas tem acesso real à internet para falar com o tribunal, e o certificado/senha nunca devem
  transitar por essas sessões.
- Não cole o conteúdo do `.pfx` nem a senha dele em nenhum chat.
