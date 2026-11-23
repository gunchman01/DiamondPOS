# v0.3.55 — receipt page/rendering tests

356 regression checks, typecheck and production build pass. New tests verify explicit Star printer/page micron dimensions and 100% scale, long/narrow receipt sizing, and refusal to spool empty/oversize/conflicting jobs. Existing label size/named-printer, timeout, cancellation, sales/QB/account/stock tests remain passing. Linux live-render probe could not run successfully; no Windows/Star hardware pass claimed.

- Windows test page is already confirmed working on the shop Star TSP100. Windows 72mm x Receipt is normal for its standard 80mm roll; leave DiamondPOS at 80mm.
- Run Settings → Printing → Print test receipt. Verify visible text/logo/barcode/total and cut after complete content.
- Reprint a short and long existing receipt, including work-order sale with Receipt format explicitly selected. Confirm no duplicate sale/payment or automatic reprint.
- Check labels/full pages still use their configured device/size.
- If content measurement errors or blank slips persist, obtain the diagnostic log (receipt-page width/length, load/print timeout events), exact driver name/version and app version. Do not mark the physical issue resolved until Greg confirms.
