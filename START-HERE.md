# DiamondPOS v0.3.49 — cumulative source update

This ZIP contains all changes since GitHub main v0.3.47, including the previously supplied v0.3.48 focus/shutdown fixes and the new work-order, sale, printing and display features. You do not need to apply v0.3.48 separately.

Verified baseline: main commit 73e3634867bb8c6fefd7c21d41d3dd3d9266a9f2. Source only: no customer database, secrets, node_modules or installer included. No commit, push, tag or deployment has been performed for you.

## 1. Apply to your existing Git project

1. Make a verified backup on the Store Server. Finish/resolve checkout/account-payment recovery and let QuickBooks sync finish. Close all POS and development instances.
2. Extract DiamondPOS-update-v0.3.49.zip into a separate folder.
3. Copy the CONTENTS of its DiamondPOS-update-v0.3.49 folder into your existing C:\dev\DiamondPOS project. Merge directories and replace matching files; do not replace the whole project or remove .git. This is an overlay, so files not present in the ZIP stay in place.
4. Keep your AOD website files, real private config and databases unchanged. No website upload is required for this POS update.

## 2. Verify locally — PowerShell in C:\dev\DiamondPOS

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

npm ci installs the locked dependencies and rebuilds the SQLite binding for Electron. The package version is already 0.3.49. The build MUST include out/main/backupVerifier.js; the ZIP includes the Vite config needed to build it.

Starting the Store Server applies schemas 35–40 and creates its normal pre-migration backup. Test data uses your current test store DB; no database is supplied here. After testing, close the development instance before starting the installed POS.

Read TESTING-NOTES.md for the test sequence and known limits. New UI and physical printing still require store testing; 318 automated regression checks, typecheck and build passed locally.

## 3. Commit and publish — MobaXterm in your existing project

Review git diff before committing. These commands publish the installer through your existing GitHub Actions workflow:

```bash
cd /drives/c/dev/DiamondPOS
git status --short
git diff --stat
git add -A
git commit -m "Release v0.3.49 sale and work order improvements"
git push origin main
git tag v0.3.49
git push origin v0.3.49
```

If Git reports the tag already exists, stop and inspect it; do not force or delete it. The last published release checked here was v0.3.47.

Wait for GitHub → Actions → Release to complete successfully. Then use Updates in the POS to install v0.3.49 on the STORE SERVER FIRST, let the DB upgrade complete, and update every till afterward. This release requires tills at v0.3.49 or newer.

If any local check or GitHub build fails, stop before updating the store and send the exact error. Do not run both installed and development Store Server instances against the same database.

## Included / not included

Included: sale redesign; Quick Pick removal; ALU grid/receipt option; optional costs; Cancel sale; account-payment customer list; Credit/Debit; mechanics/On the Bench; visit grouping; receiving notices; Auto fit; flashing estimate responses; v0.3.48 focus/shutdown fixes.

Not included: working SMS delivery or a confirmed fix for the Citizen blank receipt. See TESTING-NOTES.md. No automatic printing is enabled.
