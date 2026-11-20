# DiamondPOS v0.3.49 — store test notes

Validated locally: typecheck, production build and 318 regression checks. The actual Windows 125% layout and physical store devices still need testing. No installer has been built here; GitHub Actions builds Windows after you push the tag.

## Test at the store

1. Back up first; update Store Server, then all tills to v0.3.49. Confirm no unresolved checkout/account-payment recovery or QuickBooks sync before closing.
2. Maximize the POS on the 1920×1080 / 125% screen. Review Settings → Display Auto fit and manual sizes. Check customer search, scanning/F2, qty +/- and negative returns, tax/date overrides, payment methods, holds and Cancel sale.
3. Right-click columns: add Alt lookup and cost columns if custom choices were already saved. Settings → Receipt Layout → Items → Alt lookup checkbox; test preview/print and reprint after changing the item's ALU.
4. Credit and Debit checkout/refunds, account charge, Take payment on account search/full/partial payment, and end-of-day/QB method mappings. Existing historical Visa etc remain intact. Test with the existing QuickBooks test company.
5. Add/remove a mechanic, assign a ticket, group four units (1 of 4), and move an approved repair with all parts available to On the Bench.
6. Receive a partial delivery for Waiting on Parts tickets, check the popup, open a ticket and verify the remaining shortage. Review the posted receiving again. No ticket stage is automatically changed; no label automatically prints.
7. Submit a test estimate approval/decline on your working website. After the normal sync and up to 15 seconds for header polling, confirm the new-response header notice. Restart before acknowledging to test persistence; open it and navigate to the work order. Acknowledgement is store-wide.
8. Test item/receiving/work-order labels, chooser defaults/cancel, receipt and full-page print, then normal app close and restart. If typing freezes again, use Help → Restore keyboard focus and collect Help → Open diagnostic logs.

## Known limits

- Citizen CT-S310 blank feed/cut: not reproduced or confirmed fixed. Retest with the existing working Citizen Windows driver; collect its test-page result and exact driver/paper settings if still blank. This update adds printer choice, not a confirmed hardware fix.
- Browser screenshot/interaction preview was blocked by the execution environment's Chromium socket restrictions. New layout, dialogs and Auto fit need the physical Windows check above.
- Work-order SMS sending is not included. Provider connection and estimate-link/pickup-text delivery remain future work.
- No website PHP files or private keys/databases need replacement for this POS update. Keep the working AOD configuration. The separate mobile website stylesheet fix is not part of this ZIP.
- Database upgrades from schema 34 to 40 include a reserved SMS audit table (no active texting feature), mechanics, visit groups, Credit/Debit classification, receipt ALU snapshots and unread estimate notices.
- Earlier converted On the Bench tickets stay Approved until manually moved back. Old receipts without an ALU snapshot use current item lookup data. Historical responses are not backfilled into unread notifications.

## Recovery

Keep the verified pre-update backup. Do not simply install an old POS on a newly changed database if results look wrong; stop, record any test activity, and plan the rollback/restore so nothing is accidentally discarded. Do not take payment again after an uncertain save or printer failure: use the original recovery/receipt checks.
