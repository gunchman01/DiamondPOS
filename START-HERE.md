# DiamondPOS v0.3.56 — receipt script correction

The v0.3.55 receipt-measurement step failed because JavaScript was disabled in the hidden print window. v0.3.56 enables the fixed measurement script in a sandbox with Node integration off and context isolation on. Test status/errors now appear at the top of Printing settings and beside the receipt test button.

357 regressions pass; typecheck and build are checked before check-in. Actual Windows/Star output still needs the shop test. No database or dependency change.

Greg authorized direct GitHub check-in for this fix while at the shop. Baseline main f60b86308147e038c717451b46e2d9933605e73e. No local laptop checkout is needed to create the release tag through GitHub's website.

## Publish from the shop browser

After the v0.3.56 commit appears on main, open:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.56&target=main

Create tag v0.3.56 on main, title v0.3.56, and publish. Wait for the Release workflow to build/upload the Windows installer. An empty release without installer/update files is not ready for POS Updates. Do not move or overwrite the old v0.3.55 tag.

Back up the server and close/resolve any in-progress checkout before updating. Update the Store Server first, then each till, particularly the computer connected to the Star. Printing is local; the old till must itself be updated.

## Test

- Confirm running app version0.3.56.
- Keep Star Windows paper at72mm x Receipt and DiamondPOS at80mm for the standard80mm roll.
- Open Settings → Printing → Print test receipt, choose Star and click Print.
- Read the status directly beside the button. Rendering errors mean no job was sent to Windows. Windows acceptance still requires checking actual paper output.
- Reprint a saved receipt if test prints correctly; do not repeat a payment to test printing.

## Sync your laptop later

With a clean working tree, in MobaXterm:

```bash
cd /drives/c/dev/DiamondPOS
git status --short
git pull --ff-only origin main
```

If local edits exist, preserve/review them rather than resetting. Do not duplicate the assistant's direct commit. For future source-only updates, use the usual ZIP-first/user-commit workflow unless direct updates are requested.
