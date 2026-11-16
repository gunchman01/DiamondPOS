# DiamondPOS v0.3.38 — manual printing

Source overlay for your existing v0.3.37 project on main. No commit, push, tag or release created here. No database migration, npm dependency change or website upload needed.

## Copy and verify

Close POS/dev instances. Extract this ZIP separately, then copy everything inside DiamondPOS-update-v0.3.38 into your existing Git project folder, merging folders and replacing matching files. Keep .git and all other project files. This is source code, not a Windows installer.

In PowerShell in the project:

```powershell
npm run typecheck
npm run build
npm run dev
```

Check in a unit and add work-order items: nothing should print. Open the ticket and click 🏷 Label: a label should print. Complete a sale: nothing should print. Choose Print receipt or Reprint last receipt to print it. Existing printer choices, designs and copy counts still apply. Previously saved automatic-print settings are ignored, and their settings switches are removed.

## Commit and release

```powershell
git add .
git commit -m "Make all POS printing manual"
git push origin main
git tag v0.3.38
git push origin v0.3.38
```

Only create the tag if unused; never move an existing tag. GitHub Actions sets the installer version from the tag. Once the release is ready, update the Store Server and all tills so every PC uses manual printing.

Typecheck/build passed here. Targeted checks confirmed legacy auto settings are disabled while printer choices/copies remain. Physical Windows printing must be checked on your PC.
