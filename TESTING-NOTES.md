# v0.3.56 print tests

357 regression checks pass. Includes script failure before spool, explicit measured page dimensions, long/narrow/empty/oversize receipts, label dimensions/printer selection, timeout/cancel and all existing financial tests. Typecheck/build run before check-in. Real Windows/Star verification is pending.

1. Install v0.3.56 on the actual print computer.
2. Settings → Printing → Print test receipt; select Star TSP100 and click Print.
3. Status near button should progress to Windows acceptance or show the actual error. It must not silently wait with the message below the fold.
4. Confirm the earlier Script failed to execute error is gone. Check the paper for visible content/full total/cut position. A successful Windows callback is not hardware proof.
5. Test one long saved receipt plus a Zebra label and full-page print. Do not create a new sale/payment solely to test a printer.

Retain Windows72mm x Receipt and app80mm for the shop's80mm roll. No driver reinstall, hardware change, automatic retry, real payment or customer message performed here.
