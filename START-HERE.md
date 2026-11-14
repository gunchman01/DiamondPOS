# DiamondPOS v0.3.23 — returns using negative quantities

Apply this source update over the v0.3.22 project you just tested. It includes only the changed files. Your backup and checkout protection improvements remain in place. No new database migration is required. This revised package stays at v0.3.23. If you already applied the earlier v0.3.23 files, merge this package over them too.

## Copy and test

1. Close the POS / development app.
2. Extract this ZIP. Copy everything **inside** the extracted `DiamondPOS-update-v0.3.23` folder into your existing Git project folder, merging folders and replacing matching files. Keep `.git` and all other existing project files.
3. In PowerShell in your existing project folder, run:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

No dependencies were added. Use `npm.cmd` if PowerShell blocks `npm` scripts.

## Try a return

1. Scan or add an item as you normally would for a sale.
2. Select it, click **Change qty** or press **F3**, and click **− Return** to make it negative, or enter **-1**. **+ Sale** makes it positive again. These buttons keep the quantity magnitude. Other negative whole quantities work for non-serialized items.
3. Choose the reason and whether it goes back into stock or is damaged.
4. Optional: enter the original receipt number and click **Find receipt**. Choose the correct item line if needed. The original price/tax and quantity limits are used. For serialized equipment the serial must match.
5. Or leave the receipt blank to use today's regular price plus applicable tax, flagged as a no-receipt return. A sale-line price override does not change this refund price.
6. Click **Apply return**. It replaces the scanned positive line with a negative return line. Cancel keeps the original line unchanged.
7. Add new items on this same screen for an exchange, or choose how to give the refund.

Check a cancellation, a no-receipt return, a receipt-linked return, an exchange and a serialized unit. Serialized equipment must be one unit per line. The existing **Return** button remains available for starting from a receipt/customer search. Work order payments still need to be completed separately.

The `− 1` shortcut button still decreases a positive quantity; use **Change qty / F3** to enter a negative number. To correct an applied return, remove that return line and add it again.

No-receipt serials are recorded on the return, but without the original receipt the app cannot identify which customer-unit ownership record to retire.

## Commit and release from main

In MobaXterm in your existing Git project folder, confirm you are on main and inspect your changes:

```bash
git branch --show-current
git status --short
git diff
```

After local checks pass (only tag v0.3.23 if it has not already been published):

```bash
git add -A
git commit -m "v0.3.23: return items using negative sale quantities"
git push origin main
git tag v0.3.23
git push origin v0.3.23
```

The tag starts the Windows release build. If v0.3.23 was already published, commit these revised files to main but do not overwrite its existing release tag. This revision remains v0.3.23 as requested; test it locally with npm run dev. A new updater release would require a separate version decision.

After the release build finishes, update the **Store Server first, then tills** through the POS Updates screen. The server update retains serial numbers for no-receipt returns. There is no new schema migration and this update does not switch QuickBooks sending on or off.

## Validation

23 regression checks passed using Electron and real SQLite databases. TypeScript checks and the production build passed. The actual Windows UI, scanner and printer flow still need the local checks above.

QuickBooks refunds still require manual entry, as in v0.3.22. The live QuickBooks Enterprise connection remains unverified until your test company is ready.
