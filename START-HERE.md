# DiamondPOS v0.3.43 — Customer equipment

Cumulative source overlay for your existing v0.3.41 or v0.3.42 project on main. It includes the previous v0.3.42 End of Day update, so you do not have to apply that ZIP first. GitHub main baseline when prepared: 6be322ff0553da169b660e26e50468db887c91b0 (v0.3.41). No commit, push, tag or release was made here.

## Install and release

1. Make a verified server backup. Close POS/dev instances.
2. Extract this ZIP separately. Copy everything inside DiamondPOS-update-v0.3.43 into your existing Git project folder, merging folders and replacing matching files. Keep .git and all other project files. This package has source only, no installer or customer database.
3. In PowerShell in that project:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

4. Verify the checks below, then commit/push main and tag your normal release:

```powershell
git add .
git commit -m "Show customer equipment and service history; include End of Day"
git push origin main
git tag v0.3.43
git push origin v0.3.43
```

Use that tag only if unused; never move an existing tag. GitHub Actions sets installer version from the tag. Update the Store Server first, then tills. The equipment feature itself needs no new migration, but this cumulative package includes schema 30 for End of Day if not already applied. No website/cPanel upload needed.

## Customer Equipment

Open Customer List, then open the customer. Customer Equipment appears above receipt History in the right-hand column. It shows units already linked to that customer: both repair-only intake equipment and serialized units sold to them. No sale/completed work order is required for intake units to appear.

Expand a unit for type, brand, model, serial, hours, notes, purchase information and all its work orders. Inactive units are retained and marked. If a recorded Diamond P purchase exists, Receipt # opens the existing receipt view. A missing purchase record does not mean equipment cannot belong to the customer.

Click a work order to read problem/diagnosis/work done/internal notes, parts/charges before tax and ticket history. This is read-only; use Work Orders for changes, stage changes or payment. Use Refresh equipment to reload changes made at another till while the customer window is open. Reopening a customer reloads automatically. Viewing does not create units, merge duplicate records or move stock.

## Test on your PC

- Check in a unit not bought at Diamond P, associated with an existing customer. Reopen that customer; confirm unit and ticket appear.
- Verify another customer's units do not appear. Check brand/model/serial/hours/notes and open/closed ticket history.
- Sell a serialized unit to a customer, then inspect their equipment and purchase receipt link.
- Check an inactive unit remains visible with an Inactive badge. Read a ticket, close its view, and confirm no accidental customer save or ticket edit occurs.
- Open a customer window, create/update a unit/ticket from another till, then Refresh equipment.

Phone-browser mechanic access, intake photo upload and photo backup/restore remain separate proposed work. This release adds the missing customer equipment/history display only.

## Included End of Day update

The existing Home End of Day icon now opens the store/till summary and drawer count. Reports also has End of Day & receipts. It shows business-date sales/returns/tax/discount comparisons and actual-entry-date money movement, including accounts and void reversals, with manual count/over-short/deposit calculations. Save fixed closeout snapshots, print manually or export Excel. It does not lock/reset a day, settle cards or run QuickBooks/backups. See the in-app manual and docs/END_OF_DAY_REFERENCE.md. Verify per-till vs all-till counts and manual printer layout at the store Wednesday.

## Validation here

212 real SQLite/API regression checks, typecheck and production build passed. New coverage includes unsold repair equipment, active/closed history, inactive units, customer isolation, read-only behavior, serialized-sale linkage, pairing protection and actual check-in → equipment refresh. Existing End of Day and transaction regression checks also passed. Windows visual/physical printer tests remain local; no real customer data was modified here.
