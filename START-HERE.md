# DiamondPOS v0.3.62 — unified Sales History

Home → Sales History now opens a dedicated transaction table for sales, voids, work-order checkout sales, refunds/exchanges, on-account sales and payments on account. Click a row for its receipt/payment; payment allocations link to original invoices. All dates by default, newest first, 50/page with search/date/type filters. Reports and End of Day remain separate.

## Publish and install

After direct main check-in, publish v0.3.62 targeting main:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.62&target=main

Wait for Release installer assets. Back up and update Store Server first, then tills. No migration (schema43/minimum client0.3.59 retained). No website or kiosk changes in this version. Existing customized menus can add Sales History under Settings → Menus; the Home tile always opens the new page.

## Shop checks

- Browse all transaction types, search customer/receipt/payment/WO/reference, date/type filters and Previous/Next.
- Open sale/refund/work-order/void receipts; original void amounts are marked and refund signs remain negative. Reprint if desired. Closing after a void refreshes the table.
- Open AP payment details; confirm amount/method, QuickBooks status and links to invoices paid. A payment is not another sale; no combined revenue total is shown.
- Verify readable layout at 125% scaling, horizontal scrolling if needed, keyboard Enter/Space on rows. No real Windows visual/printing check was performed here.

## Git commands later on your laptop

Changes are committed directly to main. Preserve any uncommitted local edits before pulling.

```bash
cd /drives/c/dev/DiamondPOS
git status
git pull --ff-only origin main
npm ci
npm run typecheck
npm test
npm run build
```

If publishing the tag with Git instead of the release page (choose one):

```bash
git tag v0.3.62
git push origin v0.3.62
```
