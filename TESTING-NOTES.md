# v0.3.62 Sales History

399 regressions, typecheck and production build passed. New real SQLite/HTTP tests use actual checkout, return, void and account-payment routines to verify unified row types, unique sale/payment keys, original receipt/detail lookup, amounts/signs/cash change, work-order links, allocation details without request hashes, filters and escaped wildcard queries, company names, stable bounded pagination, paired API validation and unchanged stock/allocations after reading. Existing financial/QuickBooks/service-text/kiosk/backup/printing checks remain included.

Actual Windows display/click/keyboard/reprint checks remain shop tests. Verify at125% scaling, all types, date/search/type filters, pagination and AP detail → receipt link. No live sales, messages, QuickBooks sync or hardware printing were performed here.
