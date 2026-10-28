# TRF1 — validação de consultas MNI

Estado em 28/10/2026: certificado real do escritório preparado para TLS e restrito a consulta. Consulta autenticada de avisos/movimentos **ainda não homologada**.

## Evidências

- O teste local do cofre concluiu a preparação TLS do A1 sem acessar tribunais.
- No LegalOS em produção, a verificação do WSDL do TRF1 de 1º grau em produção recebeu HTTP 403 com o certificado cadastrado.
- A requisição pública ao mesmo WSDL, sem certificado, recebeu página do próprio serviço dizendo que o acesso à URL foi negado para o IP de origem.
- Homologação: a tentativa no LegalOS falhou na negociação TLS. Na verificação pública local, o servidor encerrou a conexão sem apresentar certificado. Isso não comprova falta de uma autoridade certificadora no LegalOS.
- Nenhuma consulta real de notificações ou movimentos foi confirmada; nenhuma petição ou ciência foi enviada.

## Dependência externa

A [orientação oficial do TRF1](https://www.trf1.jus.br/trf1/conteudo/NUGTI/MNI_Orienta%C3%A7%C3%B5es.pdf) exige autorização institucional e informação dos IPs públicos que acessarão os serviços. Confirmar com o tribunal a elegibilidade do escritório, o procedimento de autorização e o método de autenticação. Não presumir que um certificado pessoal ou o OTP do portal libere acesso ao MNI.

Informar ao responsável do tribunal: instituição solicitante; serviço e ambiente pretendidos; consulta de processos e avisos pendentes sem abertura do teor; IP público de **saída** efetivamente utilizado pelo servidor de aplicação. O IP do domínio/site pode diferir do IP de saída, especialmente com NAT, proxy ou IPv6. Não enviar arquivo A1, senha, chave privada ou segredo OTP.

## Sequência de homologação após liberação

1. Revalidar o arquivo A1 pelo botão do cofre.
2. Verificar WSDL de `https://pje1g.trf1.jus.br/pje/intercomunicacao`. Confirmar `consultarProcesso` e, separadamente, `consultarAvisosPendentes` no contrato.
3. Com as credenciais exigidas pelo tribunal, habilitar apenas esta conexão. Não usar a existência do WSDL como prova de autenticação.
4. Usar um processo conhecido e autorizado do escritório, com CNJ válido e movimentos recentes; comparar órgão, datas e movimentos com o portal. Confirmar que nova consulta não duplica movimentos.
5. Listar avisos pendentes, conferir o total e os vínculos, repetir para testar deduplicação. Zero avisos pendentes não prova ausência de todas as notificações históricas. Não chamar `consultarTeorComunicacao`.
6. Verificar agendador `/api/cron/mni`, auditoria, tratamento de indisponibilidade, certificado expirado/revogado e perda de permissões do criador.
7. Só declarar a conexão operacional após as verificações reais. Testes locais simulados não substituem esta etapa.

## Diagnóstico implementado

O transporte diferencia bloqueio explícito de IP, HTTP 401/403 genérico, limitação 429, redirecionamento, DNS, encerramento de conexão e erros específicos de confiança/validade do HTTPS. Não devolve corpo HTML/SOAP bruto nem segue redirecionamentos com o A1. Falhas do WSDL ficam na conexão e na auditoria, sem alterar a data de sincronização nem apagar um contrato anteriormente verificado.

Manter `rejectUnauthorized: true`. Só configurar `MNI_EXTRA_CA_FILE` com cadeia oficial conferida quando o erro específico comprovar falha de confiança. Não adicionar certificados arbitrários nem reduzir o nível de segurança TLS.
