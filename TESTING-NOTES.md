# v0.3.58 — native thermal receipt fit/legibility

Run359 regression checks/typecheck/build before check-in. Source changes are HTML layout/font only in driver mode; exact physical rendering remains to test on the Star. Existing financial/print lifecycle tests remain required, but no new test merely mirroring CSS is added.

- Windows-dialog test: standard80mm roll, driver72mm x Receipt. Confirm all right-hand amounts fit and ordinary item/date/payment text is dark enough. Layout total72mm uses68mm body+2mm each side.
- Reprint a long saved receipt with long item/ALU/serial text; wrapping must not push price column off paper.
- Confirm total/customer/item values match saved receipt. Reprint must not create a new sale/payment.
- Enable/save native mode for actual receipts if accepted. Silent mode remains unconfirmed; labels/full-page/designer rendering are not changed.
-58mm native mode targets50mm width; hardware test only if using that roll.
