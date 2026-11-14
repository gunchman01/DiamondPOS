# DiamondPOS v0.3.31 — Vendor List

Source update overlay for main at v0.3.30 (f7a82ed6bdc7d9a646a537f4a8c2bd40bfcbe0a5).

## Apply on your development PC

1. Close the development app. Extract this ZIP.
2. Copy the CONTENTS of DiamondPOS-update-v0.3.31 into your existing DiamondPOS project folder, replacing matching files. Do not replace your project folder itself. No database or configuration is included.
3. In the project terminal, run:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

No dependencies changed. This package passed typecheck, build and 70 regression checks. Windows visual testing is still needed locally.

## Try it

- Home → Purchasing → Vendor List → Add vendor. The editor includes company, contact/address, terms, account settings, yellow notes and receiving history.
- Test Save, Save & New, reopening/editing, search, duplicate-name warning, and Inactive / Include inactive.
- In Item List and Receiving, choose a saved vendor or use + Vendor without leaving the form.
- Existing supplier names migrate to basic vendor records. Fill in missing contacts. Renaming updates linked item master names; receiving vouchers retain the original company-name snapshot and stay in history.
- From Vendor List, click a history voucher to open Receiving. Drafts are listed but excluded from posted totals. Latest 100 vouchers are shown; totals cover all posted vouchers.
- Payment terms are reference only; no automatic discounts, payables, purchase orders or vendor export to QuickBooks.
- If you use customized menus, enable Vendor List in Settings → Menus. The Home Vendor List tile also opens it.

## Commit and release when satisfied

Run from your existing project folder. Review git diff and git status first; include any other local edits intentionally.

```powershell
git add .
git commit -m "Add vendor list and QBPOS-style vendor editor"
git push origin main
git tag v0.3.31
git push origin v0.3.31
```

Use v0.3.31 only if that tag is unused. Pushing main alone does not publish an update: the tag starts the Windows release workflow. Once the release is ready, update the Store Server PC first, then tills. Migration 24 backs up an existing database before upgrading and adds vendor records/links. Keep your regular backups.
