# DiamondPOS v0.3.27 — direct receipt quantity editing

Apply this source update over your current v0.3.26 project. It is based on main d5968288, which matches the last delivered source. No dependencies, database migration or server API changes are required.

## Apply and run locally

Close the installed POS and development app. Extract this ZIP and copy everything **inside** `DiamondPOS-update-v0.3.27` into your existing Git project folder. Merge folders and replace matching files; keep `.git` and all other project files.

In PowerShell in that project folder:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

Use `npm.cmd` if PowerShell blocks npm scripts.

## What to test

1. Scan an ordinary item. Type 3 directly into its Qty box and press Enter: quantity and total should update.
2. Try the row's + and − buttons. They add/subtract one from the displayed quantity. Zero removes the line.
3. Type a different value and press Escape: it must leave the saved quantity unchanged. Tab or clicking away saves a valid value.
4. Type an invalid quantity (blank, decimal, oversized): an error should appear without changing the saved quantity or total.
5. Type -1 on a sale row. Return details should open. Cancel must keep the original sale line; applying a reason/restocking choice converts it to a return.
6. Adjust a return's negative quantity. Original receipt limits still apply. − increases the amount coming back; + moves it toward zero. A positive return quantity is rejected; remove and rescan the item to sell it instead.
7. Try a serialized unit: quantities greater than one per line must be rejected. Work order, credit and fee quantities remain read-only.
8. Confirm scanner Enter, F3, pricing, checkout and the persistent left menu still behave normally.

The original F3 Change qty window and its sign buttons remain available. Return reason, stock choice and original receipt price/tax are retained when only quantity changes. No payment is taken by these controls; checkout still saves the transaction.

## Commit and release from main

In MobaXterm in your existing project folder, review branch and changes first:

```bash
git branch --show-current
git status --short
git diff
```

After local checks pass, on main:

```bash
git add -A
git commit -m "v0.3.27: edit quantities directly in receipt grid"
git push origin main
git tag v0.3.27
git push origin v0.3.27
```

If that tag already exists, do not overwrite it. Choose the next unused version and update the changelog heading before tagging.

Wait for the GitHub Release workflow to finish, then install via the POS Updates screen. Use the usual server-first, then tills update order to keep PCs on the same release.

## Validation

35 regression checks passed (including all existing SQLite/checkout/QuickBooks checks and new quantity parsing/rule checks). TypeScript checks and production build passed. The controls still need visual, keyboard and scanner testing on your Windows PC; these are not claimed as tested here.
