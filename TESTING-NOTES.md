# v0.3.54 — QuickBooks generic income checks

Validation: 352 regression checks, typecheck and production build passed.

Automated tests cover new paid/account summary lines from multiple brand/service departments, old saved account overrides, POS General XML references, unchanged local product departments and legacy taxable/non-taxable summary totals. Existing regression coverage includes work-order invoices, returns, voids and duplicate-protected QB sync. Actual QuickBooks Desktop/Windows testing remains on your system; no live messages or QB calls performed here.

1. After server/till update, open QuickBooks: Income account has one POS General row and no vendor/department list.
2. Select/verify default income account and save. Keep the company tax/deposit settings already working.
3. Test a paid sale and an on-account invoice with multiple departments; confirm QB item references use POS General with correct customer/amount/tax.
4. Check a work-order charge and historical receipt/void workflow. Previously synced transactions must remain as they were; do not delete old QB items.
5. Confirm POS inventory/vendor/department reports still retain their data. No schema, dependency or website changes.
