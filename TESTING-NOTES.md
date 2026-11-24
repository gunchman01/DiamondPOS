# v0.3.67 new-customer kiosk entry

408 regression checks, typecheck and production build passed. New HTTP/SQLite checks complete blank signup into one saved customer returned through session, preserve mobile/address2, reject duplicate submission, and confirm cancellation creates no partial customer. Existing tests cover required signup fields, legacy-page safeguards for verification, read-only tax info, conflicts/privacy/timeouts, financial/stock/QB behavior.

Actual shop checks: direct new-sale button/F9 without selected customer; new-work-order Select customer button; Customers Add customer button. Submit should attach/select record and keep scanned items or continue unit selection; Cancel retains draft and does not create row. Tax-card staff step applies when needed. No real customer creation/messages/payments/device interaction performed here.
