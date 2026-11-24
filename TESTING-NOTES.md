# v0.3.65 kiosk exemption validation

401 regressions passed. Real HTTP/SQLite tests cover separate read-only exemption projection, no financial/staff data leakage, forged tax status/ID/expiry/card-copy changes ignored, cashier-change conflict, contact updates and normal signup behavior. Simulated browser checks cover read-only panel, editable tax controls hidden, cashier instructions and clearing exemption details on completion. Typecheck/build required before check-in. Actual Windows/tablet visual check remains at shop.

Check exempt/non-exempt customers and expired ID: Yes/No, applicable ID/expiry, warning, read-only even after Update details, and cashier-correction message. No live customer record, SMS/email or QuickBooks sync was performed during development.
