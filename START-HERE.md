# DiamondPOS v0.3.40 — Backup Settings

Source overlay for your v0.3.39 project on main. No Git commit, push, tag or release created here. No database migration or website upload needed.

## What changes

Settings → Backups gives you frequency (15/30/60/240/1440 minutes), recent copies to keep (1–365), Back Up Now and status/storage information. Defaults are hourly / 12 copies. Settings are saved on the Store Server and can be viewed/changed from any paired till. Changes reschedule without a restart. The server must remain open for scheduled backups; startup still takes a baseline backup.

IMPORTANT: The first successfully verified backup after installing can remove older generated store-auto-…db files beyond the default 12. Scheduled, startup and Back Up Now snapshots share this limit. No files are pruned until a new snapshot passes SQLite verification. store-before-v…db pre-migration backups, unknown names, partials, directories and symlinks are never pruned. Changing retention alone does not delete files; the next successful backup applies it. If you want an archive of old scheduled copies, copy them elsewhere before updating.

Backups remain in the existing server data/backups folder. This update does not configure copying off the PC, change the folder, or add database restore. Keep a separate copy on another drive/off the server.

## Apply and release

1. Close POS/dev instances. If desired, copy/archive existing backups separately before the new retention takes effect.
2. Extract this ZIP separately. Copy everything inside DiamondPOS-update-v0.3.40 into the existing Git project folder on your PC, merging folders/replacing matching files. Keep .git and all other project files. This package has source files only, not an installer or database.
3. In PowerShell in that project:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

4. Test the page/workflow below, then commit/push and create your normal release:

```powershell
git add .
git commit -m "Add backup schedule settings and verified retention cleanup"
git push origin main
git tag v0.3.40
git push origin v0.3.40
```

Only use that tag if unused; do not move an existing tag. GitHub Actions sets the installer version from the tag. Install the Store Server update first, then all tills so the new page has its server API.

## Verify locally

- Open Settings → Backups. Check the displayed server folder, hourly frequency, retention 12, last successful backup, next time, file count and folder size.
- Change the interval and Save backup settings. Confirm next-run time changes without restarting. Restore your preferred interval afterward. Every 24 hours is elapsed time while open, not a specific daily clock time.
- Click Back Up Now. Wait for verification. Confirm the completed file exists and scheduled/startup/manual copies obey retention. Pre-migration backups must remain.
- Save a different retention count: no immediate deletion should occur. A new successful backup should apply the count.
- Close/reopen the server and confirm the saved settings persist and a startup snapshot is verified. Check the page from a till: paths and settings refer to the server, not the till.
- If a backup fails, the previous last-good time remains and an error is displayed. If cleanup fails, the new snapshot is still valid and the cleanup warning is separate; a later backup retries cleanup.
- If a manual request times out, refresh/check status before retrying. Concurrent scheduled/manual requests join the active backup. Avoid restoring/replacing a live database; this page does not perform restores.

## Verification here

183 regression checks passed with disposable SQLite/filesystem fixtures and HTTP APIs. Coverage includes validated defaults, settings persistence/rescheduling, joined concurrent runs, retention after verification, preservation of protected files, failed backup without cleanup, cleanup failure/retry and pairing-key protection. Typecheck and production build passed. Windows UI and actual disk/permissions failures must be checked locally. No backups on your PC were accessed or deleted here.
