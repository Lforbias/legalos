# LegalOS Box 2.0 — cobertura e homologação

Este documento não declara cobertura nacional. Cobertura é o que existe de **evidência real** por fonte, tribunal e operação. Enquanto não houver evidência, a tela mostra "Não homologado" ou "sem verificação real".

Regra: a homologação de uma fonte + operação só é registrada com ambiente, método, permissões usadas, resultado, data, limites e evidência técnica sanitizada. Resposta de servidor fictício (testes) é ambiente SIMULADO e nunca conta.

## Situação em 28/10/2026

| Fonte | Operação | Implementado em código | Verificado contra o serviço real | Observação |
|---|---|---|---|---|
| DJEN | disponibilidade, listar publicações por OAB | Sim (paginação, checkpoint, conferência do total) | **Não** | O DJEN recusa acessos de fora do Brasil. Falta rodar a verificação a partir do servidor brasileiro (`docs/box-v2-rollback.md`, passo 4). Testado contra servidor fictício. |
| PJe (portal, login do advogado) | validar credencial | Sim (CPF, senha, 2º fator por QR) | **Não** | Parou de funcionar no login real do TRF3/TJMG; aguarda saída do robô para diagnóstico. A leitura de intimações do painel **não** foi implementada. |
| PJe (MNI 2.2.2) | consultar processo, avisos pendentes, autos, protocolo | Sim | **Não** | Só contra tribunal simulado. Exige habilitação do tribunal e liberação do IP. |
| eproc | consultar via MNI 2.2.2 | Parcial | **Não** | Sem robô de interface para o eproc (TRF2, TJSP). |
| e-SAJ, PROJUDI | via MNI só onde o tribunal oferece | Parcial | **Não** | Webservices proprietários não são suportados. |
| DataJud | dados públicos do processo, movimentos | Sim | Anterior ao Box 2.0 | Não substitui comunicação privada. |
| Domicílio Judicial Eletrônico | — | **Não** | — | Fluxo separado, com efeito jurídico próprio. |
| Peticionamento (MNI `entregarManifestacaoProcessual`) | validar o envio e protocolar | Sim (estados, tentativas, recibo, conferência por pessoa) | **Não** | Só contra tribunal simulado. O protocolo REAL em produção fica **bloqueado** enquanto não existir evidência recente, não simulada, de um envio aceito (homologação do tribunal ou protocolo confirmado) para o mesmo conector e tribunal. Não há conferência automática no tribunal: quem confere é uma pessoa, com o recibo. |
| Certificado digital A1 | consultar (leitura) e assinar/protocolar | Sim, como poderes independentes | **Não** | A1 **não** dá acesso universal: cada tribunal define quem pode consultar ou protocolar. A3 e certificado em nuvem **não** são simulados nem suportados: aparecem como indisponíveis. |

## Peticionamento: o que cada estado prova

| Estado | O que significa | Reenvio |
|---|---|---|
| Rascunho, Em revisão, Aprovada | Fluxo interno do escritório | — |
| Enviando | Uma tentativa está em andamento (no máximo uma por petição, garantido pelo banco) | Bloqueado |
| **Protocolada com confirmação oficial** | Ambiente de PRODUÇÃO + número de protocolo + recibo oficial do tribunal (ou, para protocolo feito por fora, número + documento do recibo anexado ao processo, registrado por uma pessoa com permissão de aprovar) | Bloqueado |
| Enviada (demonstração / simulado / homologação) | Teste. **Nunca** vira protocolo oficial, mesmo que o conector afirme o contrário (vale o ambiente de menor confiança) | Não se aplica |
| Enviada — falta a confirmação oficial | O tribunal respondeu sem o recibo oficial | Bloqueado até uma pessoa conferir |
| **Estado desconhecido** | Queda, resposta ilegível, exceção inesperada ou envio interrompido (>10 min "Enviando"). A petição PODE ter sido protocolada | Bloqueado até uma pessoa conferir |
| Falha no envio | O tribunal recusou antes de aceitar (ou erro de configuração) | Permitido |

A pessoa que confere registra **protocolada** (número + recibo) ou **não protocolada** (explicação de pelo menos 10 caracteres); só a segunda libera novo envio. Tudo fica em `petition_attempts` (nunca apagado) e `petition_receipts` (no máximo um por petição) e na auditoria. Registros antigos cuja dúvida foi guardada como "Falha" com a marca "ATENÇÃO: não recebemos confirmação" continuam bloqueados.

Limites conhecidos: não há consulta automática ao tribunal para resolver uma dúvida (documentado como pendência); o ambiente "homologação" só conta quando vem de um tribunal que ofereça ambiente de testes e a evidência foi registrada de verdade.

## Como registrar uma homologação real

1. Rode a verificação pela tela (Conexões Judiciais → Consultar agora) com ambiente de PRODUÇÃO ou HOMOLOGAÇÃO do tribunal.
2. O LegalOS grava a evidência (resultado, páginas lidas, total conferido, hash do bruto, duração) sem o texto das comunicações.
3. A cobertura só sobe para "captura comprovada" quando uma execução de produção leu todas as páginas e a contagem conferiu.
4. Anote aqui: data, tribunal, método, permissões, resultado e limites.

## Pendências que dependem de acesso externo

- DJEN real: servidor no Brasil.
- Certificado A1, login PJe do TRF3/TJMG e demais: acesso autorizado e uma pessoa para o segundo fator. Nenhuma credencial deve ser enviada por chat.
- MNI em tribunal real: habilitação do tribunal e liberação do IP do servidor.
