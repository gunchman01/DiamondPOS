# DiamondPOS v0.3.58 — Star receipt width and text

The native Windows path printed real content, but right-hand amounts were clipped and ordinary text faint. This update makes Windows-dialog receipts fit within72mm on80mm roll, wraps long descriptions and uses bold Arial with larger ordinary text. It does not change your printer darkness settings or saved receipt design.

## At the shop

After the source commit appears on main, create/publish v0.3.58 targeting main:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.58&target=main

Wait for Release workflow/installer upload. Back up/resolve checkout recovery before updating. Update server first, then the actual print computer. No DB/dependency change; schema42/min client0.3.52 unchanged.

1. Confirm app0.3.58.
2. Keep Windows Star72mm x Receipt and app80mm for the80mm roll.
3. Settings → Printing → Test receipt using Windows dialog; select Star and print.
4. Check that right-hand amounts fit and item/date/payment text is darker.
5. If correct, enable Use Windows print dialog for receipts and Save printing settings. Then reprint one existing receipt (do not create a new payment).

Normal silent printing remains unresolved; continue using Windows-dialog mode for this test.359 regressions/typecheck/build checked before check-in; physical fit/darkness remains to be confirmed by Greg. No live hardware print/payment/customer message performed here.

## Sync laptop later

With clean working tree:

```bash
cd /drives/c/dev/DiamondPOS
git status --short
git pull --ff-only origin main
```

Preserve local edits if listed; do not duplicate the direct GitHub commit. Do not overwrite old version tags.
