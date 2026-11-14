# DiamondPOS v0.3.26 — Home totals and operational status at the bottom

This source update applies over your current v0.3.25 project. It uses the current main-branch code (baf0195f) as its baseline, which matches the previous delivered navigation/return code. No database schema migration or dependency change is required.

## Apply and check on your PC

1. Close the POS and any development instance.
2. Extract this ZIP. Copy everything **inside** `DiamondPOS-update-v0.3.26` into your existing Git project folder, merging folders and replacing matching files. Keep your `.git` folder and other project files.
3. In PowerShell in that project folder:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

Use `npm.cmd` if PowerShell blocks npm scripts. The dev package may still display an older version label; the release workflow sets the installed version from the Git tag.

## What to check on Home

Sales totals now appear **below the Navigator**, with:

- Today's total/receipt count, cash, card and checks. Click the title for Reports.
- QuickBooks: last successful sync and connection, sending enabled/off, and counts of queued exports, problems and manual entries. Click the heading for QuickBooks settings/history.
- Database backup: last verified scheduled backup, progress and latest failure. More than 30 minutes old is overdue. The backup scheduler still runs at startup and every 15 minutes on the Store Server.
- Store-server reachability and when it was checked.

The cards refresh every 30 seconds while Home is open. Check the layout at your usual window size. Smaller windows use two rows with a scrollable status area. The persistent left menu stays available.

Success timestamps start recording with this update. Earlier backup files and generic Web Connector contacts are not automatically treated as verified successes. QuickBooks will show “Not recorded yet” until a real clean session completes; its connection has not yet been validated against your test company. The first scheduled backup after starting the updated server should populate the backup timestamp.

If a refresh fails, status is labelled unavailable and any displayed last-known history is explicitly identified. A failed backup or connector session does not erase the last good timestamp. The status endpoint is pairing-code protected and does not return QuickBooks credentials.

Backups remain on the Store Server PC. These status cards do not add an off-PC backup destination or retention policy. Refund/manual-entry behavior in QuickBooks is unchanged.

## Commit and release on main

After your local checks pass, in MobaXterm in the project folder:

```bash
git branch --show-current
git status --short
git diff
```

Confirm you are on main and review the intended changes. Then:

```bash
git add -A
git commit -m "v0.3.26: bottom Home totals and backup/QuickBooks status"
git push origin main
git tag v0.3.26
git push origin v0.3.26
```

If v0.3.26 already exists, do not overwrite the tag. Use the next unused version and match the changelog heading before tagging.

Wait for GitHub's Release workflow to finish. Update the **Store Server first, then tills** from the POS Updates screen. Older servers do not provide this new status endpoint; tills will show unavailable details until the server is updated.

## Validation performed

32 regression checks passed using Electron and real SQLite databases. New checks cover verified/failed scheduled backups, persistent history, endpoint authorization/credential exclusion, and successful vs interrupted/failed mocked QuickBooks sessions. TypeScript and production build passed. The tests intentionally log one simulated backup failure. Windows visual/scanner/printer checks and a live QuickBooks Enterprise connection remain for local testing.
