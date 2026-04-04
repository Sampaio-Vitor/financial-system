# Weekly Database Backup

This project now has a scheduled GitHub Actions workflow at `.github/workflows/database-backup.yml`.

Current strategy:

- Runs every Sunday at `06:00 UTC` (`03:00` Sao Paulo time on April 4, 2026).
- Connects to the production VPS over SSH.
- Streams a `mysqldump` directly from the `mysql` container with `--single-transaction --quick --routines --triggers --events`.
- Compresses the dump as `financial-system-mysql-<timestamp>.sql.gz`.
- Generates a matching `sha256` checksum file.
- Uploads both files to a Google Drive folder via `rclone`.
- Keeps the 12 most recent weekly backups and deletes older ones from Drive.

## Required GitHub Secrets

The workflow depends on the existing deploy secrets plus two new backup secrets:

- `VPS_HOST`
- `VPS_DEPLOY_USER`
- `VPS_SSH_KEY`
- `VPS_APP_DIR`
- `GDRIVE_SERVICE_ACCOUNT_JSON`
- `GDRIVE_FOLDER_ID`

## Google Drive Setup

1. Create a Google Cloud project for backups.
2. Enable the Google Drive API.
3. Create a service account.
4. Generate a JSON key for that service account.
5. Create a folder in Google Drive that will store the backups.
6. Share that folder with the service account email.
7. Save the JSON file contents in the `GDRIVE_SERVICE_ACCOUNT_JSON` GitHub secret.
8. Save the target Google Drive folder ID in the `GDRIVE_FOLDER_ID` GitHub secret.

## Restore Outline

To restore from one of the weekly backups:

1. Download the target `.sql.gz` file and its `.sha256` companion from Google Drive.
2. Verify integrity with `sha256sum -c`.
3. Decompress the dump with `gunzip`.
4. Import it into MySQL:

```bash
mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < financial-system-mysql-<timestamp>.sql
```

## Operational Notes

- The workflow can also be triggered manually through `workflow_dispatch`.
- The dump is created on the GitHub runner, not stored permanently on the VPS.
- Because the backup is streamed from the running production container, no extra backup tooling has to be installed on the server.
