# LegalOS Box 2.0 — publicação e volta atrás

Branch: `feat/box-v2`. **Nada daqui vai para produção sem a autorização expressa da responsável.** O Box 2.0 chega desligado: o Box antigo continua exatamente como está até alguém ligar a chave.

## Como o Box 2.0 fica desligado ou ligado

- A chave é a variável de ambiente `LEGALOS_BOX_V2` (valores que ligam: `1`, `true`, `on`) e vale para **todos** os escritórios. Para um **piloto**, deixe-a desligada e liste os escritórios em `LEGALOS_BOX_V2_ORGS` (ids separados por vírgula): só eles veem o Box 2.0. Sem nenhuma das duas, ou com outro valor, o Box antigo roda sozinho.
- A verificação de saúde (a cada 5 min) e os avisos novos só alcançam escritórios com o Box 2.0 ligado; os demais continuam só com o aviso antigo. O roteiro de teste e publicação está em `docs/box-v2-publicacao-e-teste.md`.
- Desligada: as rotas novas (`/box/conexoes`, `/box/saude`, `/box/processos`, `/box/configuracoes`, `/box/configurar`) respondem 404, o canal ao vivo (`/api/box/events`) responde 404, as ações novas recusam, a navegação e a Ajuda mostram o menu antigo e `/box` e `/caixa-de-entrada` são as telas de sempre. Há teste automatizado disso (`box-v2-off.spec.ts`).
- Ligada: navegação nova (Visão Geral, Caixa de Entrada, Processos, Peticionamento, Conexões Judiciais, Operação e Saúde, Configurações), assistente de configuração, estados separados na caixa, linha do tempo e atualização ao vivo.

## Banco de dados — migrações do Box 2.0

Três migrações, todas só para frente (com checksum, uma transação por arquivo): `20270106000000_box_v2_foundation`, `20270107000000_box_v2_certificate_signing` e `20270108000000_box_v2_petition_filing`.

### `20270106000000_box_v2_foundation`

Só ADITIVA: tabelas novas (`professional_identities`, `sync_runs`, `connector_evidences`, `health_alerts`, `notice_events`), colunas novas e anuláveis em `court_notices` e `djen_monitors`, e índices. Nada é apagado nem renomeado. O código antigo ignora o que é novo, por isso a **volta atrás não exige desfazer a migração**: as tabelas e colunas novas podem ficar sem uso. As migrações são só para frente (com checksum); não edite uma migração já aplicada.

O histórico (`notice_events`) das comunicações antigas começa vazio: a tela diz "anterior ao histórico do Box 2.0" e nada é inventado.

## Peticionamento e certificados: o que vale mesmo com a chave desligada

Estas regras de segurança **não** ficam atrás da chave `LEGALOS_BOX_V2`, porque deixar a versão insegura disponível seria pior do que o risco da mudança:

- **Peticionamento** (`20270108000000_box_v2_petition_filing`): uma petição só é "protocolada com confirmação oficial" com recibo de tribunal real; sem resposta do tribunal ela fica em "Estado desconhecido" e **não é reenviada**; protocolo real em produção só roda com conector homologado naquele tribunal. Na prática: um escritório que usava o conector MNI para protocolar de verdade passa a ser barrado até existir homologação (ou a pessoa protocola no portal e registra o recibo).
- **Certificados** (`20270107000000_box_v2_certificate_signing`): consultar e assinar/protocolar são poderes separados. Certificados enviados antes da trava de "somente consulta" mantêm o comportamento anterior para quem já estava autorizado (a migração marca `can_sign` para eles); certificados novos nascem "somente consulta". Quem pode liberar assinatura: perfis com `certificates:manage` e a nova permissão `certificates:sign` (a migração concede a Titular e Administrador), com 2º fator e confirmação digitada.

### Voltar o código para a imagem anterior depois de usar estes recursos

As colunas e tabelas novas podem ficar sem uso, mas o Postgres **não remove** valores de enum. Se alguma petição estiver em `AWAITING_CONFIRMATION`, `UNKNOWN` ou `FILED_CONFIRMED`, o código antigo não conhece esses valores e a lista de petições falharia. Antes de reimplantar a imagem anterior, rode (com backup feito):

```sql
UPDATE petition_filings SET status = 'FAILED',
       error = COALESCE(error, 'ATENÇÃO: não recebemos confirmação do tribunal e a petição PODE ter sido protocolada. Confira no tribunal antes de reenviar.')
 WHERE status IN ('AWAITING_CONFIRMATION', 'UNKNOWN');
UPDATE petition_filings SET status = 'SUBMITTED', adapter = COALESCE(adapter, 'manual') WHERE status = 'FILED_CONFIRMED';
```

O texto "ATENÇÃO: não recebemos confirmação" é o que o código antigo já usa para avisar que não se deve reenviar às cegas. Os recibos continuam em `petition_receipts`.

## Passo a passo para publicar (quando você autorizar)

1. Faça backup do banco (`docs/backup-restore.md`).
2. Publique a branch e suba a imagem como de costume (`docs/deploy-vps.md`). A migração roda sozinha no início; com a chave desligada nada muda para ninguém.
3. Reinstale o agendamento para incluir a rotina nova de saúde (de 5 em 5 minutos): `install-cron.sh`.
4. **A partir do servidor no Brasil**, faça a verificação real do DJEN. O DJEN recusa acessos de fora do Brasil, então esta é a única forma de provar que a captura funciona. Enquanto não houver uma consulta real concluída, o LegalOS mostra "sem verificação real" em vez de "operacional".
5. Ligue primeiro só para o seu escritório: `LEGALOS_BOX_V2_ORGS=<id do escritório>` em `.env.production`, recrie o app (`docker compose up -d --force-recreate app`), percorra o assistente em `/box/configurar` e confira `/box/conexoes` e `/box/saude`. Só depois troque por `LEGALOS_BOX_V2=1` para todos.
6. Só depois decida ligar para todos.

## Como voltar atrás

1. Remova `LEGALOS_BOX_V2` de `.env.production` (ou use `0`) e reinicie o contêiner. O Box antigo volta na hora, com todos os dados.
2. Dados criados com o Box 2.0 ligado (profissionais, execuções, evidências, eventos) continuam no banco e voltam a aparecer se religar. As comunicações capturadas continuam na caixa antiga.
3. Se for preciso voltar o código, reimplante a imagem anterior. A migração aditiva não impede isso.
4. Não é necessário apagar tabelas. Se um dia quiser remover o Box 2.0 de vez, isso é uma migração nova e separada, com backup.

## O que NÃO muda ao ligar

Escritórios, usuários, autenticação, permissões, processos, clientes, documentos, auditoria, certificados, as integrações antigas (`/integracoes`, `/certificados`, `/integracoes/pje`) e a Caixa de Entrada com todas as comunicações antigas.
