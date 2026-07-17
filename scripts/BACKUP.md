# RefMemo backups

Two independent safety nets. Neither costs money.

## 1. Per-user backup (inside the app)
Home screen → **⋯** menu → **Exportar os meus dados**.
Downloads ONE file: `refmemo-backup-YYYY-MM-DD.json` containing that user's
boards, notes AND the actual image files. Restore via **Restaurar de backup**.
A weekly pop-up reminds each user if it's been over 7 days.

This only backs up the logged-in user's own data.

## 2. Owner backup — ALL testers at once (this script)
Run on your computer to pull every tester's data from Supabase:

```bash
SUPABASE_URL="https://YOURPROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..." \
node scripts/backup-all.mjs
```

- Get the **service_role** key: Supabase dashboard → Project Settings → API.
- It bypasses security to read all users — keep it secret, never commit it.
- Output: a timestamped folder `refmemo-backup-<date>/` with `boards.json`,
  `elements.json`, and an `images/` folder of every uploaded picture.

Run it once a week (or set a reminder / cron / Task Scheduler) and keep the
folder on your computer or a cloud drive.
