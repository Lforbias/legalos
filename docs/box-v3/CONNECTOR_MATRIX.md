# Box 3.0 — matriz de conectores e cobertura

Esta matriz tem duas partes que NUNCA devem ser confundidas (prompt mestre, §22):

1. **O que está implementado** (existe código) — é estática, vem do catálogo (`src/lib/judicial/catalog.ts`) e está resumida na tabela abaixo.
2. **O que está homologado** (há evidência real recente de funcionamento, por tribunal e operação) — é dinâmica, muda a cada verificação real, e por isso NÃO é publicada como tabela fixa neste arquivo (ficaria desatualizada no mesmo dia). Ela é servida ao vivo por `GET /api/box/v3/capabilities` (requer sessão, permissão `inbox:read`, prévia do Box 3.0 habilitada) e exibida na tela **Box 3.0 → Monitoramento → Verificações registradas**.

## Implementado (código), por conector — snapshot de 30/10/2026

| Conector | Acesso | Autorização do escritório | Capacidades implementadas | Observação |
|---|---|---|---|---|
| `djen` | Público | Não | `checkAvailability`, `listNotices` | Só publicações públicas; não há consulta de autos nem protocolo. Contrato sem documentação oficial estável — primeira verificação real registra a evidência. |
| `datajud` | API oficial pública | Não (chave pública do CNJ, do escritório ou da plataforma) | `getCase`, `listMovements` | **Nesta entrega, passou a gravar evidência real via `runCapability`** (antes só gravava auditoria de ação). Não substitui comunicação privada nem teor dos autos. |
| `pje-portal` | Robô de portal | Sim | `validateCredentials` | Só confirma login (CPF/senha/2º fator); leitura de intimações, autos e protocolo pelo portal ainda não implementada. |
| `pje-mni` | MNI 2.2.2 | Sim | `getCase`, `listNotices`, `listDocuments`, `downloadDocument`, `submitFiling` | Nenhum tribunal real homologado; testado só contra tribunal simulado. Exige habilitação do tribunal e, em geral, liberação de IP. |
| `eproc-mni` | MNI 2.2.2 | Sim | `getCase`, `listNotices`, `downloadDocument` | Só instâncias MNI 2.2.2; sem robô de interface para eproc com webservice próprio. Nenhuma instância homologada. |
| `esaj-mni` | MNI 2.2.2 | Sim | `getCase`, `listNotices` | Só se o tribunal oferecer MNI 2.2.2 (webservices proprietários do e-SAJ não são suportados). Nenhuma instância homologada. |
| `projudi-mni` | MNI 2.2.2 | Sim | `getCase`, `listNotices` | Idem; usuário de integração e permissões variam por tribunal. Nenhuma instância homologada. |
| `esaj` (interface própria) | — | Sim | Nenhuma | Sem conector; webservices proprietários não equivalem ao MNI. |
| `projudi` (interface própria) | — | Sim | Nenhuma | Sem conector; depende de interface de cada tribunal. |
| `domicilio-judicial` | API oficial | Sim | Nenhuma | Fluxo separado do DJEN, com efeito próprio de ciência; sem integração implementada. |

Fonte única desta parte estática: `CONNECTORS` em `src/lib/judicial/catalog.ts` — qualquer adição de capacidade muda o catálogo primeiro, esta tabela depois (resumo, não a fonte de verdade).

## Como ler a parte dinâmica (evidência/homologação)

Estados possíveis por conector × tribunal × operação (`src/lib/judicial/evidence.ts`): `NOT_IMPLEMENTED`, `UNVALIDATED` (código existe, nunca verificado de verdade), `VALIDATED` (evidência real e recente), `STALE` (evidência real, mas vencida — cada operação tem seu próprio prazo, de 3h para `checkAvailability` a 90 dias para `submitFiling`), `FAILING` (última verificação real falhou). Evidência `SIMULATED` (teste, tribunal fictício) nunca conta como prova — nunca aparece como `VALIDATED`.
