# DiamondPOS v0.3.53 — work-order checkout and Home backup status

Fixes this checkout error on a Ready for Pickup work order:

> Send the current estimate for approval before checking out this repair.

Ready for Pickup tickets can now take payment on the current bill without another online approval message. Existing approval history stays unchanged. Earlier-stage/closed repair checkout, fee credits, inventory, on-account billing and sale idempotence rules remain. No automatic emails/texts are sent. Home backup status also uses the saved frequency and actual next scheduled run instead of the hard-coded 15-minute label.

## Apply

Baseline: existing v0.3.52 checkout, main c863bc0c8b3aaca5f21be6e25d321273a2386d99. This is a small source overlay, not an installer or full project.

Back up the Store Server, resolve pending checkout recovery, finish QuickBooks sync, and close installed/development POS instances. Extract DiamondPOS-update-v0.3.53.zip separately, then copy the CONTENTS of its DiamondPOS-update-v0.3.53 folder over C:\dev\DiamondPOS, merging folders and replacing matching files. Keep .git and all other files. No dependency changes, database migration or website upload.

In PowerShell in your project:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

349 regression checks, typecheck and production build passed in development. Windows interaction, actual receipt/printer and QuickBooks testing remain on your system. Close development before using installed POS.

## Commit and publish — MobaXterm

Review changed files before committing:

```bash
cd /drives/c/dev/DiamondPOS
git status --short
git diff --stat
git add -A
git commit -m "Fix work-order checkout and Home backup status"
git push origin main
git tag v0.3.53
git push origin v0.3.53
```

Do not overwrite an existing tag or discard local changes. Wait for GitHub Actions Release to succeed, then install v0.3.53 on the STORE SERVER FIRST, followed by tills. The payment fix runs on the server; updating only a till will not fix it. Schema stays 42 and minimum client stays 0.3.52.

## Verify

1. Open the affected work order and confirm it is Ready for Pickup.
2. Review its current items, fees, estimate credits and balance with the customer.
3. Choose Ring up / Pay at till, confirm the current amount and take payment normally (or use the enabled account option).
4. Confirm the receipt total, ticket closure and normal inventory behavior. The old estimate history must not become an invented website approval; checkout history notes its state if not current/approved.
5. On Home, compare last verified time, next scheduled run and frequency with Settings → Backups. Change the frequency, return Home and check after its next refresh (up to 30 seconds). Back Up Now should update the last verified time after completion. No schedule/retention changes are made by this fix.
6. A closed ticket must not charge again. A late website decision must not reopen it. Existing Not Fixed deferred-fee checkout remains fee-only.

No Git commit/push/tag, actual payment, QuickBooks export, customer message or deployment was performed by the assistant for this update.
