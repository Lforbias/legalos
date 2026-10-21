# Backup e restauração

O LegalOS guarda dados em dois lugares: **PostgreSQL** (tudo estruturado) e **STORAGE_DIR** (arquivos de documentos). Um backup válido precisa dos dois, tirados juntos.

## Scripts (testados com banco real: backup, verificação, restauração, criptografia e detecção de adulteração)

| Script | O que faz |
|---|---|
| `scripts/backup.sh` | `pg_dump` (formato custom) + `tar.gz` dos documentos + manifesto `sha256`; criptografia opcional com `BACKUP_PASSPHRASE` (AES-256, `.enc`); apaga backups mais velhos que `BACKUP_KEEP_DAYS` (padrão 14). |
| `scripts/verify-backup.sh <prefixo>` | **Prova que o backup restaura**: confere o checksum, restaura num banco temporário, confere tabelas/migrações/linhas e apaga o temporário. Não toca no banco de produção. |
| `scripts/restore.sh <prefixo> --yes` | Restaura no banco de `DATABASE_URL` (**destrutivo**) e os documentos em `STORAGE_DIR`. Recusa backup com checksum errado. |

Requisitos: `pg_dump`, `pg_restore`, `psql`, `openssl`, `tar` e `sha256sum`/`shasum` (no macOS: `brew install libpq` e coloque no PATH).

## Rotina recomendada

1. **Diário** (madrugada), no servidor, via cron:
   `0 3 * * * cd /opt/legalos && DATABASE_URL=… STORAGE_DIR=… BACKUP_DIR=/backups BACKUP_PASSPHRASE=… ./scripts/backup.sh >> /var/log/legalos-backup.log 2>&1`
2. **Copie para fora do servidor** (outro disco, outro provedor, bucket privado). Backup só no mesmo servidor não protege contra perda do servidor.
3. **Semanal**: rode `verify-backup.sh` no backup mais recente. Um backup que nunca foi restaurado em teste não é backup.
4. **Guarde a `BACKUP_PASSPHRASE` num cofre/gerenciador de senhas, fora do servidor.** Sem ela, backup criptografado é irrecuperável.
5. **Teste uma restauração completa** (`restore.sh` num servidor de teste) antes de ir para produção e depois a cada trimestre.

## Em caso de desastre

1. Suba um servidor/banco vazio e rode `npm run db:migrate` (cria o esquema).
2. `BACKUP_DIR=… ./scripts/restore.sh legalos-AAAAMMDD-HHMMSS --yes`.
3. Suba o app e confira `/api/ready`.
4. Os dados voltam ao estado do backup (**perde-se o que foi feito depois dele**; por isso a frequência importa). O objetivo de ponto de recuperação (RPO) é o intervalo entre backups.

## Limites honestos

- Backup lógico completo (não incremental): bom para o porte inicial; para bases grandes ou RPO de minutos, use backup contínuo/PITR do PostgreSQL gerenciado do provedor *além* destes scripts.
- A criptografia protege o arquivo em repouso; quem tiver a passphrase lê tudo. Não há rotação automática de passphrase.
- Os scripts não enviam o backup para fora do servidor — isso depende do seu provedor (rclone, rsync, S3…).
- Arquivos de documentos excluídos no sistema permanecem em disco (limite conhecido da Fase 5) e, portanto, também nos backups; a política de expurgo/LGPD ainda é pendência.
