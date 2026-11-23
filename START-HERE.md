# DiamondPOS v0.3.55 — Star thermal receipt update

Windows prints correctly on your Star TSP100, but DiamondPOS sends blank feed-and-cut receipts. This update changes the app's rendering/page-size handling. It has not yet been confirmed on your physical printer.

The app now waits for fonts/images/layout, checks content is nonempty, and passes Windows an explicit width and measured receipt length. Both Print test receipt and saved-sale receipts use it. Labels and Letter jobs keep their existing sizing.

## Apply and test at the shop

Small source overlay for v0.3.54 main e59a7ed317a06eb303c55824f093d4a78b4d832a. Back up the Store Server, resolve pending checkout recovery, finish QuickBooks sync and close all installed/development POS instances. Extract DiamondPOS-update-v0.3.55.zip separately. Copy the CONTENTS of DiamondPOS-update-v0.3.55 over C:\dev\DiamondPOS, merging folders/replacing files. Keep .git and all other files. No dependency/schema/website changes.

In PowerShell in C:\dev\DiamondPOS:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

356 regression checks, typecheck and build passed in development. Physical Star output and native Windows rendering still need your test.

Open Settings → Printing. Select the installed Star TSP100, keep DiamondPOS receipt width 80mm for an 80mm roll, and leave the working Star Windows size at 72mm x Receipt. Click Print test receipt. Confirm text, full total, width and cut position. Reprint a long saved receipt afterward; do not create a duplicate sale just to print. Close development before using installed POS.

If the app reports an empty/rendering error or still prints blank, stop repeating jobs and report the exact error plus Help → Open diagnostic logs. Receipt-page width/height are logged without customer content. This patch is not a driver reinstall and does not automatically reprint previous jobs.

## Commit and release — MobaXterm

After reviewing/testing:

```bash
cd /drives/c/dev/DiamondPOS
git status --short
git diff --stat
git add -A
git commit -m "Size thermal receipts from rendered content before printing"
git push origin main
git tag v0.3.55
git push origin v0.3.55
```

Do not replace an existing tag or discard local edits. Wait for GitHub Actions Release to finish. Install server first then tills. This printing fix must be installed on the computer sending the print job; changing only the server will not fix an older till's local print code. Schema42/minimum client0.3.52 unchanged.

No GitHub writes, tags, installer deployment, actual hardware prints/payments or messages performed by the assistant for this update.
