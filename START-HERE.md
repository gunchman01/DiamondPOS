# DiamondPOS v0.3.57 — Windows receipt dialog test

v0.3.56 logs confirm receipt content was measured and Windows accepted it, but Star paper still comes out blank. This update adds a native driver path for testing, not a confirmed hardware fix.

Source is committed directly to main at Greg's request while he is at the shop. No laptop source access is needed for release creation.

## Publish and test

After the v0.3.57 commit appears on main, create tag/release v0.3.57 targeting main:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.57&target=main

Wait for the Release workflow to finish and upload installer/update files. Do not move existing tags. Update server first, then the actual printing computer. Schema42/min client0.3.52 unchanged; no database/dependency migration.

1. Confirm running version0.3.57.
2. Settings → Printing → Test receipt using Windows dialog.
3. Select the Star in the app's printer chooser and click Print.
4. A visible receipt window and native Windows print dialog should appear. Verify text is visible in the receipt window. Select Star TSP100, its existing72mm x Receipt paper setting, and print.
5. If it prints correctly, enable Use Windows print dialog for receipts (driver compatibility) and Save printing settings on this computer. This is off by default; the dedicated test button uses it without changing your saved preferences.
6. If blank persists, report whether the on-screen receipt has text and the exact Windows driver name/version. Check queue/paper before repeating a timed-out job. Do not create another payment just to test printing.

359 regression checks, typecheck and build checked before commit. No physical Star test, deployment or live payment/message performed by the assistant. Receipt native mode omits app custom paper size; labels/full pages retain their paths.

## Sync laptop later

With a clean working tree:

```bash
cd /drives/c/dev/DiamondPOS
git status --short
git pull --ff-only origin main
```

Preserve local edits if listed. No need to duplicate the direct commit. Future source-only work follows the regular ZIP/user-commit workflow unless direct updates are requested.
