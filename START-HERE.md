# DiamondPOS v0.3.22 update — Greg's instructions

This is a **source-code update for your existing 0.3.21 project**, not a Windows installer. Work directly on main as requested. No branch, Git commit, tag or GitHub release has been created for you.

## 1. Copy the files into your existing project

1. Close the installed POS and any `npm run dev` instance.
2. Extract this ZIP into a separate temporary folder.
3. Open the extracted `DiamondPOS-update-v0.3.22` folder.
4. Copy **everything inside it** into the existing Git project folder on your PC (for example `C:\dev\DiamondPOS`), merging folders and replacing matching files. The `src` folder must merge with the existing `src` folder, alongside `package.json`.
5. Keep the existing `.git` directory and all other project files. This package contains only added/changed files. Do not replace or delete the entire existing project folder.

The package contains no database or customer records. App data stays in `%APPDATA%\DiamondPOS`.

## 2. Check and run locally

In **PowerShell**, change into your actual existing project folder, then run:

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

`npm.cmd` can be used instead of `npm` if PowerShell blocks scripts.

- The tests use Electron's bundled Node runtime, so SQLite uses the correct ABI; you do not need Python.
- Startup upgrades the database to schema 22 and first makes a migration backup.
- The restored scheduler backs up at startup and every 15 minutes while the Store Server runs.
- Look for `[backup] Verified scheduled backup: ...` in the terminal.
- If development mode displays a version warning because the source package still says 0.1.0, the release build gets its actual version from the Git tag. The development warning alone does not block checkout.

After the server has made a backup, you can verify a temporary restore copy:

```powershell
npm run verify:backup
```

Expected output includes **Integrity check: ok**, a table count, and a sale count. This command never replaces the live database. The backup scheduler matches the earlier Phase 1 work: local backups are kept without automatic pruning or an off-PC destination.

## 3. What changed

- Verified SQLite online backups restored; server waits for in-flight backup before closing.
- Checkout request IDs prevent duplicate sales after a lost response. The exact pending request is retained locally across app restarts until confirmed. A Recover checkout dialog retries it; do not collect payment again.
- Two tills cannot complete the same held receipt; conflicting checkout rolls back.
- Partial returns allocate the original tax pennies consistently.
- Startup can recover after an occupied server port.
- QuickBooks uses individual sale receipts and customer names, not daily summaries.
- Regression checks were added to CI and the release workflow.

## 4. QuickBooks setup after this update

**Sending is switched off once during migration.** Review `docs/QUICKBOOKS_SETUP.md`, the start date and account mapping before enabling it.

- Selected customer names have a short identifier, such as `Greg Barnes [DP123]`, to keep same-name people distinct. Existing unsuffixed QuickBooks customers are not automatically merged. Sales without a selected customer use the walk-in name.
- Item descriptions, quantities and serial numbers appear on the accounting receipt. Inventory stays in DiamondPOS.
- Refunds, zero-total exchanges and split payments are **Enter by hand** exceptions, not automatic transactions.
- Dates with any old daily-export record are flagged for reconciliation, to avoid sending both a daily summary and individual copies.
- Tests used a mocked Web Connector. The real QuickBooks Enterprise connection, Windows UI and printers still need your on-PC check.

Confirm one named-customer cash sale and one card sale in QuickBooks, including tax and deposit accounts. Run the connector again and check that no duplicates appear.

## 5. Commit and publish from main

Once your local checks pass, open **MobaXterm** in your actual Git project folder:

```bash
git branch --show-current
git status --short
```

If the branch is not `main`, switch to main before applying these files; keep any unrelated local changes safe. Review `git diff` so you only commit changes you intend.

Then:

```bash
git add -A
git commit -m "v0.3.22: backups, checkout recovery and individual QuickBooks sales"
git push origin main
git tag v0.3.22
git push origin v0.3.22
```

**Pushing main alone does not publish an update.** The version tag starts the Windows release workflow, which builds the installer and publishes the GitHub Release.

If a tag called `v0.3.22` already exists, do not overwrite it; use the next unused version and update the changelog heading to match before committing/tagging.

## 6. Update the POS PCs

After GitHub Actions finishes the Release workflow:

1. Update the **Store Server PC first** from the POS Updates screen.
2. Update **every till** to v0.3.22 before taking sales. Older tills cannot provide the required checkout IDs.
3. Check a normal sale, held receipt and return.
4. Review the QuickBooks settings and enable sending when ready.

Do not revert the server to an older daily-export version with QuickBooks sending enabled. Turn sending off and reconcile exports before any rollback.

## Validation performed here

- Dependency installation completed.
- Node and renderer TypeScript checks passed.
- 18 regression checks passed using Electron and real SQLite databases, including migration backup, restore verification, duplicate checkout, held-receipt rollback, refund pennies, mocked Web Connector lost-response recovery and unrelated receipt collisions.
- Electron/Vite production build passed.
- A desktop browser UI check could not start in this environment. Windows installation, visual interaction, real printers and a live QuickBooks Enterprise company file have not been validated here.
