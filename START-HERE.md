# DiamondPOS v0.3.59 — customer address on every customer receipt

Customer billing address is ON by default for all selected-customer receipts (ordinary and serialized purchases), and omitted for walk-ins/no address. Existing layouts receive a growing address block once; designer can hide/move/style it or optionally restrict it to serialized purchases.

New receipts capture the billing address at checkout; later customer edits do not change it. Legacy receipts use current customer data. Full-page receipts also use captured addresses.367 regressions, typecheck and build pass; Windows visual/physical address print needs the shop test.

## Publish from the shop

After direct commit appears on main, create/publish v0.3.59 targeting main:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.59&target=main

Wait for Release workflow/installer files. Back up the Store Server, resolve pending checkout recovery and finish QuickBooks sync before installing. Update STORE SERVER FIRST, then EVERY till. Schema43 stores receipt addresses and minimum client is0.3.59; older tills must update. No dependency or website changes.

## Check

- Select a customer with billing address, make an ordinary or serialized test purchase in the test system, print/reprint: address should appear by default under customer header and before items. Do not create a real payment just to test a printer.
- Walk-in/customer with no recorded address: no address block prints.
- Settings → Receipt Designer: Customer address is selected in the middle by default. Move/hide/style and save if desired. It can also be placed as a header/footer field. Leave Only when buying a serial-numbered unit unchecked for every customer receipt.
- Existing old receipts use the current customer address; new ones retain the address from sale time, even after customer edits. Previously printed receipts cannot recover unknown historical addresses.
- Keep the Windows-dialog Star mode accepted at the shop. This update does not change thermal fit/fonts.

## Sync laptop later

With a clean working tree:

```bash
cd /drives/c/dev/DiamondPOS
git status --short
git pull --ff-only origin main
```

Preserve local edits; do not duplicate the direct commit or move earlier version tags. No actual customer payment/message, hardware print or installation performed by the assistant.
