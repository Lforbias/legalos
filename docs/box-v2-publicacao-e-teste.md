# LegalOS Box 2.0 — roteiro de teste e publicação

Para quem vai testar e publicar (Dra. Talita). Linguagem direta, passo a passo. Leia também `docs/box-v2-relatorio-final.md` (o que está provado e o que não está) e `docs/box-v2-rollback.md` (como voltar).

## 0. O que ninguém faz sozinho

- Enviar a branch `feat/box-v2` ao GitHub **só roda o CI** (testes). Não publica nada.
- O servidor só recebe código quando alguém faz o *merge* no `main` **e** clica em *Actions → Publicar no servidor → Run workflow* (modo padrão manual), ou quando a variável `AUTO_DEPLOY=true` existe no repositório. Se ela existir e você não quiser publicação automática, apague-a antes do merge.
- O Box 2.0 chega **desligado**. Ligar é uma decisão separada, feita no servidor (parte C).

## A. Testar no seu Mac, sem publicar nada

Serve para ver as telas novas e conferir o que você achou estranho. Não prova DJEN nem tribunal (o DJEN recusa acessos de fora do Brasil).

```bash
cd ~/Downloads/legalos
git switch feat/box-v2
npm ci --legacy-peer-deps
# .env com DATABASE_URL apontando para um banco LOCAL (nunca o de produção)
npm run db:migrate
npm run db:seed            # opcional: dados de demonstração fictícios
LEGALOS_BOX_V2=1 npm run dev   # abre em http://localhost:3000
```

O que percorrer (com a chave ligada):

1. `/box/configurar`: assistente de 5 passos (OAB, monitoramento público, acesso privado, validação, resumo). Fora do Brasil o teste real do DJEN falha e a tela deve dizer isso em português claro, sem fingir que funcionou.
2. `/box`: Visão Geral. `/box/conexoes`: cada fonte com o estado honesto (Operacional, Necessita autorização, Não homologado, etc.). `/box/saude`: alertas.
3. `/caixa-de-entrada`: abrir uma comunicação **não** pode registrar ciência oficial; os cinco estados aparecem separados.
4. `/peticoes`: uma petição aprovada só envia em modo "demonstração", e o resultado mostra "Enviada em demonstração", nunca "Protocolada".
5. `/certificados`: certificado novo nasce "somente consulta". Para assinar, é preciso liberar com 2º fator e confirmação digitada.
6. Sem a chave (`npm run dev` sem `LEGALOS_BOX_V2`): o Box antigo aparece como sempre, e `/box/saude` dá 404.

## B. Publicar (com a chave desligada)

Faça nesta ordem. Cada passo tem uma conferência.

1. **Backup.** O workflow de publicação já faz um backup criptografado antes de migrar, mas faça um você mesma agora e guarde: no servidor, `scripts/server/backup-docker.sh` (detalhes em `docs/backup-restore.md`).
2. **Enviar a branch e abrir o pull request.** Se o commit já foi feito por mim: `git push -u origin feat/box-v2` e, no GitHub, *Compare & pull request*. O CI roda (cerca de 10 min). Verde = pode revisar. Se algo ficar vermelho, me mande o nome do teste.
3. **Merge no `main`** (botão do GitHub). Se não houver `AUTO_DEPLOY`, nada é publicado ainda.
4. **Publicar:** *Actions → Publicar no servidor → Run workflow*. Acompanhe, em paralelo, no servidor: `tail -f /var/log/legalos-deploy.log`. O app fica fora do ar por alguns segundos na troca. Se `/api/ready` não responder em 90 s, o servidor volta sozinho ao código anterior (o banco **não** volta sozinho; as migrações do Box 2.0 são só aditivas e compatíveis com o código antigo, exceto o ponto de petições descrito no rollback).
5. **Reinstalar o agendamento** (uma vez): no servidor, como root, `/opt/legalos/scripts/server/install-cron.sh`. Ele cria a rotina de saúde a cada 5 minutos.
6. **Conferir que nada mudou para quem usa o Box antigo** (a chave continua desligada):
   - `https://legalossync.tech/api/ready` responde 200.
   - Entrar no sistema, abrir `/box` e `/caixa-de-entrada`: telas de sempre. `/box/saude` deve dar 404.
   - A captura do DJEN continua chegando: veja a Caixa de Entrada e o histórico de execuções depois do próximo ciclo (a cada 30 min). O código de captura foi alterado (paginação, conferência do total, checkpoint); esta é a primeira coisa a observar.
   - **Mudanças que valem mesmo com a chave desligada** (de propósito, por segurança): petição só vira "protocolada com confirmação oficial" com recibo de tribunal; protocolo real em produção só roda em tribunal homologado; certificado novo nasce "somente consulta". Quem protocolava de verdade pelo conector MNI será barrado até a homologação (ou protocola no portal e registra o recibo no LegalOS).

## C. Piloto: ligar o Box 2.0 só para o seu escritório

A chave tem dois modos. O de piloto liga **apenas os escritórios listados**; os demais continuam com o Box antigo.

1. Descubra o identificador do seu escritório. No servidor:

   ```bash
   cd /opt/legalos
   docker compose exec -T db psql -U legalos -d legalos -Atc "select id, name, slug from organizations order by created_at"
   ```

2. Edite `.env.production` e acrescente (use o `id`, não o nome; vários ids separados por vírgula):

   ```
   LEGALOS_BOX_V2_ORGS=COLE-AQUI-O-ID-DO-SEU-ESCRITORIO
   ```

3. Recrie o app para ler a variável: `docker compose up -d --force-recreate app`.
4. Entre como titular/administradora do escritório do piloto e percorra `/box/configurar`, `/box/conexoes` e `/box/saude`. Outro escritório (qualquer usuário de fora do piloto) continua vendo o Box antigo.
5. **Só depois de validar** decida ligar para todos: troque por `LEGALOS_BOX_V2=1` (e apague `LEGALOS_BOX_V2_ORGS`), recrie o app.

O que muda para o escritório do piloto: menu novo, telas novas, histórico por comunicação, atualização ao vivo e os avisos de saúde para administradores. Para os demais escritórios nada disso aparece, e eles não recebem avisos novos.

## D. Validar no servidor o que o Mac não consegue

Faça com o piloto ligado.

1. **DJEN real** (o servidor está no Brasil): em `/box/configurar`, informe a OAB e rode o teste. Resultado esperado: a conexão passa a "Operacional" **só** depois de uma consulta real ao DJEN que respondeu. Se a tela disser "sem verificação real", a consulta não chegou ao DJEN; me mande a mensagem exata.
2. **PJe (TRF3, TJMG, TRT15, TRT2)**: o acesso pelo portal não foi provado de ponta a ponta. Reimplante o robô com os diagnósticos, tente o acesso do TRF3 e me traga a saída (sem senha, sem certificado). Se eu precisar ler os logs do `~/.pjeoffice-pro` no seu computador, peço antes a sua permissão.
3. **Protocolo:** não tente protocolar de verdade antes de existir evidência de envio aceito no tribunal (homologação). Até lá use "demonstração" ou protocole no portal e registre o recibo no LegalOS.

## E. Voltar atrás

- **Voltar o Box antigo:** remova `LEGALOS_BOX_V2` e `LEGALOS_BOX_V2_ORGS` do `.env.production` e rode `docker compose up -d --force-recreate app`. Efeito imediato; os dados ficam guardados e sem uso.
- **Voltar o código:** reverta o commit no GitHub (*Revert* no pull request) e publique de novo. Antes, rode o SQL de petições de `docs/box-v2-rollback.md` (o Postgres não remove valores de enum).
- **Restaurar o banco:** `docs/backup-restore.md`, usando o backup do passo B.1. Perde-se o que foi feito depois dele.

## F. O que me trazer se algo falhar

O nome do teste ou da tela, a mensagem exata, e o horário. Nunca envie senha, certificado, token ou o conteúdo do `.env.production`.
