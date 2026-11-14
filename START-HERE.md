# DiamondPOS v0.3.32 — Reports, audited voids and receiving costs

Changed-source update over main v0.3.31 / 969294769f2be459867194827b4953ed99a8e08e.
No database, dependencies or local configuration files are included. No Git commit/tag was made here.

## Apply to your development project

1. Close the development app. Extract the ZIP.
2. Copy the CONTENTS of DiamondPOS-update-v0.3.32 into your existing DiamondPOS project folder, replacing matching files. Keep the rest of the project.
3. Run in that project folder:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

No dependencies changed. Typecheck, build and all 104 regression checks passed here. Connector scenarios use mocked QuickBooks SOAP responses; Windows UI, printing and a real test company still need local verification.

## Reports

Use the Reports navigation button or Home tile. Pick Sales, Inventory or Receiving, select one of 13 canned reports, then Run report. Custom reports support chosen columns, AND filters, grouping, sorting and date ranges. Saved definitions are shared by all tills; relative dates recalculate each run.

Export Excel/CSV or print to the configured full-page printer (Windows default when blank). Results are capped at 10,000 rows with an explicit notice; totals cover every match. Narrow filters for complete detail. Existing daily totals/receipts are under Daily closeout & receipts.

Sales reports are receipt-level (not per-item profit reports), retain signed refunds/exchanges, and exclude voids by default. Inventory is a current snapshot. Receiving reports count freight once and normally exclude drafts. See Help → Reports for details.

## Void a test sale — check both sides

Use your QuickBooks TEST company and cash test transactions first.

1. Create a simple ordinary sale. Before syncing it, open its receipt in Reports → Daily closeout & receipts and choose Void sale. Enter a reason, your name, how the payment was handled, and confirm. Check that the receipt remains VOID, stock is restored, and it stays out of sales totals and later QB exports.
2. Create another simple sale and sync it normally. Confirm it appears in QuickBooks. Open it in POS and Void sale. QuickBooks correction status should be pending.
3. Run Web Connector with sending enabled. In QuickBooks the original Sales Receipt should remain but be voided at zero. In POS → QuickBooks → Voided receipts, it should say Void confirmed. Reopen/reprint the POS receipt: original values remain for audit with a VOID banner.
4. Run the connector again: no new receipt and no second stock restoration. If a correction fails, fix the reported cause and use Retry correction. Pending/failed corrections are included in Home status counts and cannot be selected as ordinary sale resends.
5. Check Reports → Sales → Voided sales audit. Date filters here use the ORIGINAL sale date; void timestamps are separately shown in UTC.

Voiding does not operate the standalone payment terminal. Cancel/return the actual payment separately and document it. Old receipts require stock review because quantities use current item types. New receipts snapshot the actual stock movement.

Automatic voiding is intentionally blocked for refunds/exchanges, work-order payments, already-returned receipts, equipment with work orders, and tracked manually entered/legacy daily QuickBooks entries. Use their existing return/work-order or manual reconciliation workflow. Operator name is a typed audit label, not a manager authentication system.

A stopped/disabled connector leaves corrections pending; it does not mean the systems are reconciled. A success response alone is insufficient: the app queries the same receipt to verify zero value and VOID marker. Conflicts stay visible for review. Do not independently edit/delete exported receipts or change QB company files during reconciliation.

## Receiving, tags and cost comparison

- A NEW receiving starts with Add freight to item cost unchecked. Freight remains in voucher totals. Existing drafts retain their saved preference.
- Post a receiving and confirm the tag picker opens with current item prices and editable quantities. Close it without printing if not needed. Reopen the posted voucher and use the prominent Print tags for received items button at the top to print later.
- Open an item: Item costs & receiving history shows last received unit cost, current saved inventory average, lifetime receiving average, and lifetime average with allocated freight.
- Lifetime averages use ALL posted receiving lines, weighted by quantity, not only the latest 20 displayed lines. Drafts and opening/imported stock without vouchers are excluded. The invoice average excludes freight; the landed average honors each voucher's recorded allocation preference. Sales do not change this lifetime average.
- Example: receive 2 at $100 and 1 at $400; the lifetime invoice average is $200, not $250. Current inventory average can differ after intervening sales or manual cost edits.

## Commit and release once local checks pass

Review git status and git diff first; include other local changes only intentionally.

```powershell
git add .
git commit -m "Add custom reports, audited sale voids and receiving cost summaries"
git push origin main
git tag v0.3.32
git push origin v0.3.32
```

Use the tag only if unused. Pushing main alone does not publish the installer; the version tag starts the Windows release workflow. Migration 25 adds audit records and stock snapshots and backs up the existing database before upgrading. Update the Store Server FIRST, then EVERY till before using the new void workflow.

The QuickBooks void request follows Intuit's Desktop SDK transaction-void workflow:
https://static.developer.intuit.com/resources/QBSDK_ProGuide.pdf
