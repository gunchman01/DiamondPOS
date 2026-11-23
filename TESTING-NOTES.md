# v0.3.60 tax-location / labor mappings

374 regressions cover mixed-rate paid receipts and account invoice XML, independent same-percentage authorities, mismatched/missing/unknown cached QuickBooks tax items, historical rate/default edits, retry deduplication and optional separate labor income. Existing financial, account/void, stock, backup and printing regressions remain required. Typecheck/build also required.

Manual test company checks: map store and Exmark customer-location rates, refresh lists, select Sales/Labor accounts, sync a parts-plus-labor receipt and on-account invoice, compare QuickBooks tax item/rate/tax total and income reports. Try unmapped/wrong rate, confirm blocked insertion and visible reason; fix and explicitly retry. Repeat connector run to verify no duplicates. Keep previously confirmed transactions unchanged. Validate Windows UI and actual QuickBooks separately; no claim of live QuickBooks or hardware validation here.
