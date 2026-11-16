# DiamondPOS v0.3.37 update

Source overlay for your existing v0.3.36 project on main. No commit, push, tag or release has been created. No cPanel upload is needed; the included cPanel guide only corrects its stock instructions.

## Install and publish

1. Make a verified database backup from the current Store Server before updating. Close POS/dev instances.
2. Extract this ZIP separately, then copy everything inside DiamondPOS-update-v0.3.37 into your existing Git project folder. Merge folders and replace matching files; keep .git and other project files. This contains no database/customer data and is not an installer.
3. In PowerShell in that project run:

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

4. Review the changes, then commit/push main and create your usual release:

```powershell
git add .
git commit -m "Add customer accounts and reserve held/work-order stock"
git push origin main
git tag v0.3.37
git push origin v0.3.37
```

Use that tag only if it is unused; do not move an existing tag. GitHub Actions sets the installer version from the tag, runs checks and publishes the release. package.json remains at its source baseline version as in previous updates.

5. Install/update the Store Server first, then every till before resuming transactions. Migration 28 reserves existing open held sales and previously unallocated open work-order parts. Available on-hand may fall at first startup; review open tickets and physical stock. Already deducted parts are not taken twice. Keep the new version after migration; do not run older binaries against the migrated database.

## Test with your QuickBooks test company

- Enable on-account purchasing in a test customer's editor and set terms. Sell an item using Charge to account. Confirm inventory falls once, receipt says unpaid, and no cash/card tender is recorded.
- Run Web Connector with your existing customer/item/tax/income mappings. Confirm exactly one unpaid Invoice for the customer, correct items, tax, total and due date, and no paid Sales Receipt for that charge. Send/print the invoice from QuickBooks; POS does not automatically email it.
- Open the customer account window and collect a partial payment (cash/check or an already processed standalone card payment). Run Connector. Confirm one Receive Payment applied to the correct invoice, correct remaining balance, and no new sale/tax/stock movement. Repeat sync and check no duplicates. Test the remaining payment and payment across two invoices.
- If payment is recorded in QuickBooks, sync again and verify the POS balance updates. Balances cover POS-created invoices only, not imported past-due fields or unrelated QuickBooks invoices.
- Review errors in the account window or QuickBooks account sync panel. Reconcile back-office payment/invoice conflicts before using Retry. Retry a saved timeout request rather than collecting money twice.
- Put an item on hold; verify available stock falls. Edit quantities, recall and complete it: no double deduction. Delete another hold and verify stock returns.
- Add parts to a new work order; verify stock falls immediately. Waiting for approval/approving must not deduct again. Remove a part or decline the ticket and verify restoration; complete another work order and confirm no second deduction.
- Check Daily Closeout: account charges are sales but not takings; received account payments are takings without new sales tax. Sales reports stay based on original sales.

Account overpayments, payment reversals and automatic account-sale credit/void/refund synchronization are not included. Account-sale cash voids and receipt-linked returns are blocked; coordinate account adjustments/reconciliation with the bookkeeper in QuickBooks.

## Validation completed here

162 real SQLite/API regression checks passed, including mocked QuickBooks SOAP invoice/payment recovery, tax, external payment conflicts, oldest-first allocations and stock migration/lifecycles. Typecheck and production build passed. Actual Windows UI, printers and QuickBooks Desktop were not exercised here; complete the test-company checks above before relying on the workflow.

See CHANGED-FILES.txt for the overlay contents and the in-app user manual for operating instructions.
