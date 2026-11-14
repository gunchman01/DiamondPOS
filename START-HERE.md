# DiamondPOS v0.3.30 — card brands, cash drawer and top scan bar

Apply over your current v0.3.29 source. Baseline: main 448319e1. Migration 23 adds an optional card-brand column; no new dependencies. Update the Store Server first, then tills.

## Apply and test locally

Close the installed POS and development instance. Extract this ZIP. Copy everything **inside** `DiamondPOS-update-v0.3.30` into your existing Git project, merging folders and replacing files. Keep `.git` and all other project files.

In PowerShell from the project folder:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

Use `npm.cmd` if needed. Database upgrade makes its normal pre-migration backup. The test suite intentionally logs a simulated backup failure. Development-mode version may still show the source package version; installed release version comes from the tag.

## Scan bar at the top

Item # / Barcode now sits directly below the sale header, above the receipt. Suggestions open downward over the receipt. Selected-line actions remain below. Test scan-and-Enter, type-ahead arrows/Enter, and layouts with/without Quick Picks at your usual window size.

## Optional card brand / no terminal reference

Card sales and refunds offer Unknown, Visa, Mastercard, Discover, American Express or Other. Leave Unknown if not known. There is no terminal-reference field in new card checkout. Check payments still require their check number. Historical saved references remain visible.

The brand appears in receipt/history. Card totals still aggregate all brands. In QuickBooks mapping, Optional card-brand payment methods lets you map brands to existing QuickBooks methods; create missing methods in QuickBooks and re-read lists first. Blank mappings fall back to general Card. Deposit accounts do not change. The brand is also recorded in the QuickBooks sale memo. Already-synced transactions are not rewritten. Refunds remain manual exceptions for QuickBooks.

Payment processing stays on the standalone terminal: no reader or processor connection was added. Complete the sale only after terminal approval as before.

## Configure the drawer on each PC

1. Open **Settings → Printing → Cash drawer**.
2. Enable Cash Drawer button.
3. Keep **COM3** and **hello** for your current drawer. They match the effect of your working `cmd.exe /c echo hello>com3` shortcut (line ending included). Change them if a future COM-port trigger needs it. Serial port speed/protocol setup is not changed by this feature.
4. Keep **Button only** initially. Save drawer settings.
5. Click **Test saved drawer setup** and confirm the physical drawer opens. The status says signal sent only; software does not receive physical drawer-position feedback.
6. Use **Cash drawer** in the app's top bar. This is manual; cash sales do not automatically pop it.

Optional app-focused shortcuts: F1, F10, F11 or F12. **If choosing F1, first remove F1 from the old Windows shortcut's Properties → Shortcut key**, otherwise both could send a signal. F1 then opens the drawer instead of Help, but the Help button remains available. Windows/app shortcut behavior and actual drawer hardware must be verified locally. Settings are per PC, not shared across tills. The feature starts disabled.

Only a COM port and constrained plain trigger text can be configured; this is not an arbitrary command launcher. The operation is Windows-only, times out after three seconds and blocks overlapping/rapid requests.

## Local checklist

- Drawer enabled/save/test on COM3; old F1 shortcut disabled before assigning in-app F1.
- Check-number entry still works; card-reference entry is absent for both sales and refunds.
- Visa sale shows Visa in sale history/receipt; Unknown still works.
- Configure a Visa QuickBooks payment method, sync a new Visa test sale, verify method/memo/deposit account, then repeat the connector run and check for duplicates.
- Scan/search at the top works with suggestions and normal scanner Enter.

## Commit and release on main

Review branch and changes:

```bash
git branch --show-current
git status --short
git diff
```

After local checks pass:

```bash
git add -A
git commit -m "v0.3.30: card brands, configurable cash drawer and top scan bar"
git push origin main
git tag v0.3.30
git push origin v0.3.30
```

Do not overwrite an existing tag. If v0.3.30 exists, choose the next unused version and match the changelog heading first.

Wait for Release workflow success, then update **Store Server first, then tills** from POS Updates. Reconfigure/enable drawer separately on each physical till.

## Validation

65 regression checks, TypeScript checks and production build passed. Card data/model/XML and migration preservation were tested with Electron/SQLite. Drawer execution used a mock runner: no real Windows COM device was opened here. Real drawer/shortcut, Windows visual/scanner and QuickBooks brand mapping still need your local validation.
