# DiamondPOS v0.3.60 — QuickBooks tax locations and labor income

Maps the tax rate saved on each sale to its matching QuickBooks sales tax item. Includes separate Sales and Labor income mappings. No shipping workflow or new database migration; schema43 and minimum client0.3.59 remain.

## Release from the shop

Direct main check-in authorized. Create/publish v0.3.60 targeting main:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.60&target=main

Wait for the Release workflow and installer assets. Back up the Store Server and finish pending checkouts/syncs. Update Store Server first, then all tills to0.3.60. Existing confirmed QuickBooks transactions are not rewritten.

## Configure and test

1. In the QuickBooks TEST company, create the sales tax items for each applicable location at the correct percentage, and choose/create the Sales and Labor Income accounts you need.
2. Run Web Connector. In POS QuickBooks settings, refresh lists if necessary and run again.
3. Select the default store tax item; map every other tax location/rate in Sales tax locations and rates. Historical rates remain available. Save mappings.
4. Select Sales and Labor income accounts. Work-order labor uses Service Labor automatically; assign catalog labor items to that department. Other fees/supplies remain general sales income.
5. Complete store-rate and Exmark customer-location test sales using the checkout tax selector. Include parts/labor and an on-account invoice. Sync and verify tax item, tax amount, total and separate income accounts in QuickBooks.
6. Test an unmapped rate: it must show a problem and not add a transaction. Correct mapping, retry the paid sale in transaction queue or use account Retry sync, then run Web Connector. Repeat sync to confirm no duplicate.

## Git commands on your laptop later

The code is already committed directly to main; pull it before making further local changes. If you have uncommitted edits, preserve them before pulling.

```bash
cd /drives/c/dev/DiamondPOS
git status
git pull --ff-only origin main
npm ci
npm run typecheck
npm test
npm run build
```

If publishing the tag from Git instead of the GitHub release page (use only one route):

```bash
git tag v0.3.60
git push origin v0.3.60
```

374 regression checks, typecheck/build are the automated release checks. Actual QuickBooks Desktop, Windows UI and printer checks remain on shop hardware. No website file changes.
