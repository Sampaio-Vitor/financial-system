# Weekly Database Backup

This project now has a scheduled GitHub Actions workflow at `.github/workflows/database-backup.yml`.

Current strategy:

- Runs every Sunday at `06:00 UTC` (`03:00` Sao Paulo time on April 4, 2026).
- Connects to the production VPS over SSH.
- Runs `mysqldump` inside the production `mysql` container with `--single-transaction --quick --no-tablespaces --routines --triggers --events`.
- Compresses the dump on the VPS as `<APP_DIR>/backups/financial-system-mysql-latest.sql.gz`.
- Overwrites the previous backup on each successful run.
- Writes a matching checksum file and timestamp file next to the dump:
  `<APP_DIR>/backups/financial-system-mysql-latest.sql.gz.sha256`
  `<APP_DIR>/backups/financial-system-mysql-latest.sql.gz.timestamp`

## Required GitHub Secrets

The workflow only depends on the existing VPS deploy secrets:

- `VPS_HOST`
- `VPS_DEPLOY_USER`
- `VPS_SSH_KEY`
- `VPS_APP_DIR`

## Restore Outline

To restore from the latest weekly backup on the VPS:

1. SSH into the production VPS.
2. Verify integrity with `sha256sum -c`.
3. Decompress the dump with `gunzip`.
4. Import it into MySQL.

```bash
cd <APP_DIR>/backups
sha256sum -c financial-system-mysql-latest.sql.gz.sha256
gunzip -c financial-system-mysql-latest.sql.gz | mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"
```

## Operational Notes

- The workflow can also be triggered manually through `workflow_dispatch`.
- The backup is created directly on the VPS and stays there until the next successful run overwrites it.
- The workflow writes to a temporary file first and only replaces the live backup after the dump completes successfully.
