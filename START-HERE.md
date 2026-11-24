# DiamondPOS v0.3.70 — split warranty billing and vendor report

Back up the Store Server first. Update the Store Server before all tills (schema44, minimum client0.3.70). No website upload required.

1. QuickBooks settings: refresh lists and choose customer Accounts Receivable; optionally choose a separate warranty A/R. Keep Sales/Labor income mapping.
2. Add the warranty company to Vendors and add its billing identity as an account-enabled company customer. Keep the real owner on each work order.
3. Ticket → Warranty / manufacturer billing: choose vendor/billing customer, claim and coverage per line before tax. Save before estimate approval.
4. At Ready for Pickup, collect only the customer share in Make a Sale. Provider share is an unpaid account invoice. Fully covered jobs use Bill warranty provider.
5. Reports → Warranty by vendor: filter, inspect linked work orders/receipts, print or export. Sync QuickBooks to refresh back-office payments.

Verify with test jobs before store use: split coverage, fully covered job, customer estimate deposit, correct taxes for both payers, separate invoices in QuickBooks, payment on provider account and outstanding report. A deposit exceeding the customer share blocks checkout until resolved. Claims are tracked, not submitted automatically.

Publish targeting main after the commit:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.70&target=main

Wait for Windows installer assets before updating. Actual Windows UI/printer and QuickBooks-company testing remain necessary.

## Git commands

Preserve local edits before pulling. These changes are committed directly to main, so do not reapply an older source ZIP.

```bash
cd /drives/c/dev/DiamondPOS
git status
git pull --ff-only origin main
npm ci
npm run typecheck
npm test
npm run build
```

If publishing via Git instead of the release page (only once):

```bash
git tag v0.3.70
git push origin v0.3.70
```
