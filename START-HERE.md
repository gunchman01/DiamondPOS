# DiamondPOS v0.3.41 — Sale date and time

Source overlay for your v0.3.40 project on main. No commit, push, tag or release created here. Migration 29 preserves existing dates and adds separate entry timestamps and held-ticket dates. No website upload needed.

## Install and release

1. Make a verified server backup using Settings → Backups → Back Up Now. Close POS/dev instances.
2. Extract this ZIP separately and copy everything inside DiamondPOS-update-v0.3.41 into your existing Git project folder, merging folders/replacing files. Keep .git and all other project files. This is source, not an installer or database.
3. In PowerShell in the project:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

4. Test the workflow below, then commit/push main and create your release:

```powershell
git add .
git commit -m "Add sale date/time with entry audit and future sync deferral"
git push origin main
git tag v0.3.41
git push origin v0.3.41
```

Use that tag only if unused; do not move an existing tag. GitHub Actions sets installer version from the tag. Update the Store Server first, then all tills before using the new date controls. A dated checkout checks server support to avoid silently losing the chosen date. Keep all PCs' Windows time zones consistent with the shop (America/Chicago).

## Using it

On Sell, near payment buttons, tick Choose sale date and time and select the day/time. Leave it unchecked for actual checkout time. You can enter past or future dates. The selected date appears on receipts, sales history, daily/ad hoc reports and QB transactions. Sale details retains the actual server entry timestamp separately. Ad hoc Sales reports offer Sale time, Entered at and Date selected manually.

For an open-house sale entered afterward: select its actual business day, adjust item prices for the agreed vendor discount using the existing price controls, then complete. The date control does not automatically apply 10% or verify vendor eligibility. Review the final amount.

The entire receipt/tenders move to the chosen date for reporting and daily closeout. Completing a future-dated sale still takes payment and removes stock now. If you are only preparing a sale, use Hold: it remembers the chosen date and reserves stock under the existing hold behavior. After holding/completing, a new sale defaults back to actual checkout time. Completed dates are not editable and existing synced receipts are not rewritten.

Future ordinary sales and account invoices wait until their business day for QB eligibility. They sync on a connector run that day or later, not automatically at midnight. Account payments wait for their allocated invoices to sync. Existing sync start-date/reconciliation rules still apply to old dates; review the QB queue and settings when testing a past event.

## Local checks (QuickBooks test company)

- Complete a normal sale: receipt date/time should match checkout; no manual-date marker in sale details.
- Choose a past event date/time and an agreed discounted price: inspect receipt, Sale History, daily report for that day, and ad hoc report entry/business times. Actual Entered timestamp must remain today.
- Sync the past sale to the QB test company with a suitable sync start date: transaction date/amount should match, and repeated connector runs must not duplicate it.
- Select a future day, hold the ticket, recall it and confirm the date survives. Unchecking uses actual checkout time instead. Check that date resets on the next sale.
- Complete a future-dated receipt/account invoice: stock/payment is processed now, reports use the future day, and QB waits. Test invoice eligibility/due date and payment sync when its day arrives.
- Backdated work-order payments and refunds follow the same chosen business date; existing manual reconciliation restrictions on refunds/split tenders/account credits remain.

194 SQLite/API/QuickBooks regression checks, typecheck and production build passed here. Tests use disposable databases and mocked QB responses; actual Windows UI, printers and real QB integration require your checks above. No real transactions were created or synced here.
