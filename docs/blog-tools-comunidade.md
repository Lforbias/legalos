# Blog, Tools e Comunidade — implementação inicial

Referência: especificação da Dra. Talita e cinco telas fornecidas em 26/10/2026. A implementação está na branch `feat/blog-tools-comunidade`. Não ativa produção, campanhas, DNS ou integrações de terceiros por conta própria.

## Rotas e comportamento

| Frente | Rotas | Comportamento |
|---|---|---|
| Blog | `/blog`, `/blog/[slug]` | Busca, áreas, paginação, fonte/data, revisão, ferramenta relacionada e comentários moderados |
| Transparência editorial | `/blog/como-produzimos`, `/blog/correcoes` | Política editorial e notas de correção |
| SEO | `/sitemap.xml`, `/robots.txt`, `/blog/rss.xml` | Apenas posts aprovados e habilitados, canonical e Article JSON-LD com nonce CSP |
| Tools | `/ferramentas`, `/ferramentas/prazos`, `/ferramentas/rescisao` | Calcula sem login; salvar e baixar PDF exige conta pública; memória e limitações visíveis |
| Comunidade | `/comunidade`, `/comunidade/nova`, `/comunidade/[id]` | Piloto por e-mail autorizado; busca/áreas/ordenação, respostas, votos úteis, salvos, melhor resposta, denúncia e notificações |
| Conta pública | `/acesso`, `/acesso/confirmar`, `/minha-conta` | Google ou link de e-mail, perfil, cálculos salvos, perguntas e saída de marketing |
| Moderação/editorial | `/admin/conteudo` | Superadministrador com 2FA, fontes oficiais, rascunhos, revisão/publicação, correções, convites, moderação e denúncias |
| Comercial | `/comercial` | Contagens por origem; pedidos explícitos de demonstração geram ou etiquetam prospects no funil |
| Agendador | `POST /api/cron/audience` | Bearer `CRON_SECRET`; captura de fontes e campanhas, ambas desligadas inicialmente |

Não há posts, usuários, perguntas nem respostas fictícios na migração. Estados vazios são intencionais. As telas seguem o cabeçalho e herói escuros, fundo claro, cartões brancos e ações azuis das referências, com adaptação para celular.

## Isolamento e dados

Tabelas `audience_*` separadas de usuários, organizações, membros e dados jurídicos do SaaS. Uma conta pública nunca cria membership ou sessão do escritório. As consultas usam SQL parametrizado pelo cliente Prisma existente; nomes de tabelas em moderação vêm de enum fechado. As tabelas são geridas pela migration SQL versionada, sem modelos Prisma: não usar `prisma db push`, que já não é o mecanismo de migração deste projeto.

Tokens aleatórios são armazenados como hash. Sessões expiram em 30 dias; tentativas de acesso em 15 minutos, com token de uso único e cookie de vínculo ao navegador. Produção usa cookies `__Host-`, Secure, HttpOnly e SameSite=Lax. Login Google usa Authorization Code + PKCE S256, state descartável vinculado ao navegador e e-mail verificado do endpoint userinfo. Solicita apenas `openid email profile`. Os endpoints de escrita exigem Origin exata (ou Fetch Metadata same-origin quando Origin estiver ausente) e limites de frequência em memória (a mesma limitação por processo já documentada no projeto).

Aceites registram texto exato, versão, origem e timestamp em registros separados de termos e marketing. A ausência de aceite opcional não impede acesso. Descadastro é imediato; sessões e recursos continuam disponíveis. E-mails do serviço usam o SMTP existente; campanhas usam SMTP separado. Descadastro de um clique é autenticado por assinatura, dispensa login e não é executado por GET.

CPF, CNPJ numérico/alfanumérico e padrão CNJ são bloqueados também no servidor em perguntas, respostas e comentários. A proteção não detecta todos os dados pessoais: nomes, contexto e sigilo dependem de quem escreve e da moderação. Conteúdo não confiável é renderizado como texto, sem HTML; URLs de fontes dos participantes são HTTP(S) e têm `ugc nofollow`.

## Revisão e publicação

A migração cria todos os interruptores desligados. Em `/admin/conteudo`, definir responsáveis e confirmar a revisão jurídica dos documentos antes de habilitar blog/cadastro/comunidade. Os textos de termos e privacidade são **minutas**: devem receber identificação do controlador, canal de dados, retenção e demais decisões jurídicas da operação. Ao mudar o texto, atualizar `TERMS_VERSION` e `TERMS_TEXT` quando aplicável.

Publicar exige confirmação explícita da conferência de fonte, vigência, números e prazos; só aceita fonte HTTPS `.gov.br` ou `.jus.br`. Cada post identifica o responsável configurado; o administrador que executou a ação fica na auditoria. Há limite de uma publicação diária no fuso de São Paulo, com exceção explícita de urgência. Editar post publicado exige nota de correção e o devolve a rascunho até nova revisão. Remover resposta aceita retira sua indicação de melhor resposta. Apenas o autor da pergunta pode escolher uma resposta aprovada.

Perguntas e respostas só ficam públicas após moderação e habilitação do piloto. Perguntas sem resposta ficam `noindex`; perguntas aprovadas com resposta aprovada podem ser indexadas. No momento as rotas são no mesmo host, sob `/comunidade`. **O subdomínio separado não está configurado**: exige DNS/TLS, proxy/implantação e validação de autenticação/cookies/OAuth na origem escolhida antes de divulgar. Não trocar o domínio com uma simples URL de frontend e presumir SSO entre hosts.

## Configuração

1. Aplicar `npm run db:migrate` antes de iniciar esta versão (migration `20261227000000_public_audience`). Backup do banco antes da atualização; não editar migrations já aplicadas.
2. Definir `APP_URL` HTTPS com o domínio real. Nenhum segredo é incluído neste commit.
3. E-mail de acesso: configurar `MAIL_DRIVER=smtp`, `SMTP_*` e `MAIL_FROM` existentes. Sem entrega real, a tela informa indisponibilidade; não mostra links de acesso em produção.
4. Google: `AUDIENCE_GOOGLE_CLIENT_ID`, `AUDIENCE_GOOGLE_CLIENT_SECRET`; cadastrar a URI exata `APP_URL/api/audience/google/callback` no projeto Google. As credenciais são da conta pública, separadas do Drive do escritório.
5. Fontes: cadastrar páginas oficiais específicas no painel. Consulta manual disponível; `AUDIENCE_EDITORIAL_ENABLED=1` permite varredura de até 5 fontes a cada execução, com intervalo mínimo de 12 h por fonte. Captura apenas texto/HTML/XML até 1 MB, sem seguir redirecionamentos; páginas diferentes são snapshots privados. Não rastreia automaticamente links de uma homepage nem lê PDFs.
6. IA editorial: `AUDIENCE_EDITORIAL_AI_PROVIDER` (`ANTHROPIC`, `OPENAI`, `GEMINI`), `AUDIENCE_EDITORIAL_AI_KEY`, `AUDIENCE_EDITORIAL_AI_MODEL`. No snapshot, informar a data conferida na fonte e gerar rascunho. IA sem ferramentas; origem fixada no servidor; saída validada. Nenhum rascunho vai ao ar sem aprovação. Não usa chaves ou dados dos escritórios.
7. Campanhas: `AUDIENCE_MARKETING_ENABLED=1`, `MARKETING_SMTP_HOST`, `MARKETING_SMTP_PORT`, `MARKETING_SMTP_USER`, `MARKETING_SMTP_PASS`, `MARKETING_FROM`, `AUDIENCE_UNSUBSCRIBE_SECRET` (ao menos 32 caracteres). Configurar SPF, DKIM e DMARC no provedor/DNS do subdomínio de envio. O código verifica separação do remetente; **não valida DNS, reputação ou entrega em contas reais**.
8. Dia 14 só é incluído se `AUDIENCE_TRIAL_OFFER_PATH` apontar para uma oferta real em `/produto/...`. Sem oferta configurada, não promete teste ou vaga. O e-mail do dia 5 apresenta recursos e convite para demonstração; vídeo próprio precisa ser produzido/adicionado pela equipe.
9. Programar `POST /api/cron/audience` com Authorization Bearer do agendador existente (ex.: hora em hora). Não há nova automação externa criada por esta alteração. Captura e marketing têm interruptores independentes; falha de uma frente pode impedir a outra naquela execução e deve ser monitorada.
10. Revisar e ativar pelo painel; autorizar os 20–30 e-mails reais do piloto; cadastrar Search Console e sitemap manualmente.

Campanhas usam dias 0, 2, 5 e 9; dia 14 depende da oferta. Após 21 dias, resumo semanal apenas se houver posts publicados nos últimos 7 dias, com intervalo mínimo de 7 dias. Não envia várias etapas atrasadas de uma vez, nem mais de 20 mensagens por execução. Para quando há pedido de demonstração, estágio de demonstração/ganho no Comercial, bloqueio ou retirada de consentimento. Há uma janela normal de envio em andamento após a reserva: um descadastro impede novos envios, mas não cancela uma entrega já iniciada. Reservas e falhas de SMTP ficam no banco; falhas exigem revisão manual, sem reenvio automático que possa duplicar uma mensagem aceita pelo provedor. Monitoramento de bounce/spam, pixel de abertura e tracking de cliques não fazem parte desta entrega.

## Validação e limites

- Testes unitários: detecção de identificadores, fonte oficial, datas inválidas, consentimento separado, contagem, limitação de entrada e PDF com múltiplas páginas.
- Testes de integração: sessão pública separada, acesso por convite, moderação antes da exibição, bloqueio de dados pessoais, votos/aceite, descadastro, revogação, magic link descartável/vinculado ao navegador e OAuth/PKCE com provedor simulado.
- As integrações de IA, Google e SMTP são implementadas, mas não exercitadas com contas reais nesta entrega.
- Calculadoras usam os motores existentes, com entrada manual de critério de prazo. TJSP e Justiça Federal continuam restritos até validar índices e regras para uso público. A estimativa de rescisão não projeta aviso, não inclui descontos nem verbas adicionais.
- Subdomínio, operação editorial diária, revisão jurídica, moderação humana, vídeo, oferta e DNS exigem decisões/configurações reais. Não são apresentados como já ativos.
