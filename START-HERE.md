# DiamondPOS v0.3.54 — POS General QuickBooks mapping

QuickBooks connection now shows only one income mapping: POS General. Pick the income account there for all new sales and work-order charges. New cash/card/check sales and on-account invoice lines use that mapping, ignoring old vendor/department overrides. Catalog departments and historical QuickBooks transactions are preserved. Tax-rounding reconciliation remains.

Validation: 352 regression checks, typecheck and production build passed.

## Apply

Small source overlay for your existing v0.3.53 project (main fa5137d4955d56b6739f05ef21f895e0a8d99b87), not an installer or full repository.

Back up the Store Server, resolve pending checkout recovery and let any active QuickBooks sync finish. Close installed/development POS instances. Extract DiamondPOS-update-v0.3.54.zip separately. Copy the CONTENTS of its DiamondPOS-update-v0.3.54 folder over C:\dev\DiamondPOS, merging folders and replacing matching files. Keep .git and all other files.

In PowerShell in C:\dev\DiamondPOS:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

No dependency, schema or website changes. Windows interaction and actual QuickBooks export remain to test on your system. Close the development app before using the installed POS.

## Commit and release — MobaXterm

Review changes for unexpected files first. No commit/push/tag was performed by the assistant for this update.

```bash
cd /drives/c/dev/DiamondPOS
git status --short
git diff --stat
git add -A
git commit -m "Simplify QuickBooks income mapping to POS General"
git push origin main
git tag v0.3.54
git push origin v0.3.54
```

Do not overwrite an existing tag or discard local edits. Wait for GitHub Actions Release to succeed, then update STORE SERVER FIRST (export logic), followed by tills (screen). Schema remains 42 and minimum client 0.3.52.

## Check after updating

- Open QuickBooks connection. Income account should show one All sales / POS General row, without vendor names. Keep/select the intended default income account and save.
- Send a new test sale with items from different departments and a work-order/account invoice through the normal connector. Confirm POS General item references, customer, amount and tax match. Old vendor overrides must not divert new lines.
- Do not delete historical vendor-named QB items or already synced transactions to apply this update. Nothing previously synced is rewritten.
- POS General is a QuickBooks item name; the income dropdown still lists your company's income accounts, so choose the appropriate account there.

No live QuickBooks/payment/customer-message operations or deployment were performed during development.
