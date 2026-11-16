# DiamondPOS v0.3.39 — import mapping, Item List columns and bulk cleanup

Source overlay for your current v0.3.38 project on main. No commit, push, tag or GitHub release created here. No database migration or cPanel update needed.

## Install and release

1. Make a verified Store Server backup and export your current Items/Customers before cleanup. Close POS/dev instances.
2. Extract this ZIP to a temporary folder. Copy everything inside DiamondPOS-update-v0.3.39 into your existing Git project folder, merging folders and replacing matching files. Keep .git and all other project files. This is source code, not an installer, and includes no database/customer records.
3. In PowerShell in that project run:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

4. Test the workflows below. When satisfied, commit/push main and make your normal tagged release:

```powershell
git add .
git commit -m "Add item import mapping, list columns and bulk cleanup controls"
git push origin main
git tag v0.3.39
git push origin v0.3.39
```

Only create that tag if unused; do not move an existing tag. GitHub Actions sets the installer version from the tag. Update the Store Server, then all tills for consistent deletion behavior.

## Correct your inventory spreadsheet

Open Item List → Import from Excel and choose your file (.xlsx/.xls/.csv). The first worksheet is used; row 1 needs unique headers. The mapping page lists every defined POS import field, a source-column dropdown and three sample values. Pick which spreadsheet column supplies Item Name, Item Description, Item No., UPC, prices, vendor, manufacturer and any other fields you want. One spreadsheet column can fill multiple POS fields. Auto-match headings and Clear mapping are available.

For label corrections, keep the existing Item No. or UPC mapped and Update existing items checked. Map the corrected text to Item Name and/or Item Description. Leave On-Hand Qty unmapped to retain current inventory. You do not need to delete items first. If correcting inactive records, map Active to a spreadsheet column containing Yes to reactivate them.

Unmapped fields/blank cells preserve existing values on updates. New items require Item Name and Reg Price. Prices/costs are dollars, not cents. Format Item No. and UPC as Text in Excel to keep leading zeros. Unmapped spreadsheet columns can be kept as Other details or skipped using the checkbox. Mapping is for the currently open file; it is not saved as a reusable profile.

Click Preview import and review source → destination choices, mapped samples and per-row results. Preview writes nothing. Go back to Change column mapping if needed; then preview again. Import N items saves the valid rows. Rows with problems are skipped/listed. Try a few rows first, inspect the saved items and manually print a test tag before the full file. Imports do not automatically print tags.

## Choose Item List columns

Right-click a heading or click Columns…. Tick fields to show/hide. Right-click a particular heading to move it left/right. Item Name stays visible; Reset to default restores the original columns. Layout/order is saved on that computer separately from Sale layout. Exports and printed label designs are not changed by the visible columns.

## Bulk cleanup

Item List and Customer List have Select shown, Select entire list and Clear selection. Select shown uses displayed rows (up to 500). Select entire list includes every active/inactive record, even outside the search and beyond the displayed rows. Selection stays across searches; Delete selected uses the full displayed selection count. Clear selection starts over. The confirmation explains permanent deletion versus inactivation. Up to 50,000 IDs can be processed per request.

Unlinked test records are erased. Records linked to sales, work orders or open held receipts are made inactive; items on receiving vouchers are also kept. Existing history, QuickBooks transactions, allocations and work orders are not deleted/reset. This is not a complete database reset. The result reports deleted/inactive/not-found counts. Item List includes inactive; use Show inactive on Customer List.

## Validation

169 regression checks passed with disposable SQLite databases and real Excel parsing, including arbitrary mappings, leading zeros, same-source reuse, dry-run rollback, stock-preserving label updates and held-record deletion guards. Typecheck and production build passed. Browser fixture checks verified right-click column choices, reorder and reload persistence. The test browser's file chooser stalled and its tab became unavailable; interactive file upload/import and physical Windows tag printing remain local checks. No actual user records were imported or deleted here.
