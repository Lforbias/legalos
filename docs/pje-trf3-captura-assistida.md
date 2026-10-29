# PJe/TRF3 → LegalOS Box: captura assistida 0.3.0

## O que foi desenvolvido

Endpoint `GET/POST /api/v1/portal/notices` com escopo próprio `portal:import` (permissão `inbox:write`). O GET confirma só o nome do escritório e o modo suportado. O POST recebe no máximo 50 metadados conferidos da lista do TRF3 de primeiro grau. A chave antiga `pje:discover` não ganha poderes novos.

A extensão lê a página ativa apenas após o clique da pessoa, apresenta prévia e confirma a mesma aba, documento, lista e conexão antes do envio. Não clica, não navega entre caixas, não abre teor e não coleta certificado, cookies, senhas, OTP ou nomes das partes. A chave da importação é separada e fica no armazenamento local restrito da extensão; desconectar a importação a remove.

O Box recebe registros de origem **Histórico importado**, sistema `pje-portal-assisted`, com CNJ, referência exibida e data de comunicação no conteúdo. Sem identificador oficial inventado, ciência ou prazo calculado. Deduplicação por escritório + CNJ + referência + data de comunicação; a referência é uma observação da lista, não um identificador oficial de expediente homologado. CNJ pode vincular ao processo existente visível, sem criar cliente ou processo.

## Passo a passo para a titular

1. Após publicar esta versão, baixe `/downloads/legalos-pje.zip` e extraia em pasta fixa. Atualize a extensão em `chrome://extensions` (Carregar sem compactação, ou Recarregar se a mesma pasta já estiver instalada). Confira **0.3.0**.
2. Em Integrações → API, crie uma chave apenas com **Box: importar metadados conferidos da lista PJe/TRF3**. Exige 2FA e permissão de administrar integrações. Cole-a diretamente na seção de importação da extensão; não envie a chave ao assistente nem nesta conversa.
3. Confira o escritório de destino exibido pela extensão.
4. Abra `https://pje1g.trf3.jus.br/pje/login.seam` no Chrome. Entre pelo certificado/PJeOffice e conclua o OTP no portal oficial. O certificado salvo no cofre do servidor não instala o certificado no computador e não cria uma sessão de navegador.
5. No painel do advogado, expanda **Pendentes de ciência ou de resposta → jurisdição → Caixa de entrada**. Isso exibe metadados sem abrir o expediente. Não clique em Responder, Autos Digitais ou no teor.
6. Abra a extensão, clique **Ler lista visível para conferir**. Compare CNJs, referências e datas com o portal. Se faltar registro ou aparecer aviso de linha não interpretada, não considere a caixa completamente importada.
7. Clique **Confirmar importação no Box**. O resultado informa novos e já conhecidos.
8. Na caixa de entrada do LegalOS, pesquise pelo CNJ. Confira origem, conteúdo e vínculo. Repita a mesma importação: deve informar já conhecido, sem outra linha na caixa.
9. Repita em todas as caixas e páginas desejadas. A extensão não afirma ter lido páginas não visitadas. Desconecte a importação e revogue a chave em Integrações ao encerrar o uso.

## Estado da validação

- Sessão real TRF3/1º grau e painel autenticado confirmados no Chrome da titular.
- Forma de linha observada: `Decisão (referência)`, meio `Diário Eletrônico (data/hora)`, CNJ, situação e último movimento. O extrator foi escrito para essa estrutura. Estruturas desconhecidas são recusadas/contadas como não interpretadas.
- Testes automatizados usam dados fictícios: extração, exclusão de nomes, origem restrita, limites, deduplicação concorrente, isolamento por escritório e ausência de ciência/prazo.
- **Pendente:** instalar a extensão 0.3.0, conectar com a chave cadastrada pela titular e comparar uma importação real na produção. Login no Chrome não é evidência de importação nem de funcionamento do robô do servidor.
- Não é monitoramento permanente, não obtém PDFs/teor nem movimentações completas. Não torna MNI operacional. eproc e outros tribunais ficam para uma etapa seguinte com layout e autenticação próprios.

## Publicação e retorno

Nenhuma migração nem variável nova. Publicar pelo fluxo padrão do projeto após aprovação do PR. A extensão é atualizada separadamente no Chrome. Desativar/remover a extensão e revogar a chave interrompe a captura assistida; registros já importados permanecem. Não altere os acessos DJEN/MNI para instalar esta ponte.
