# DiamondPOS v0.3.63 — direct customer kiosk validation

Customers: open saved customer → Validate on kiosk. No save/reopen required when unchanged. Edited records show Save & validate on kiosk to save and send in one action.

Make a Sale: select customer → Validate on kiosk beside their name. F9/menu also validate the selected customer. No customer selected: F9 remains blank signup. Customer accepts or updates details; selected customer refreshes and current cart stays.

## Publish/install

After direct main check-in, publish v0.3.63 targeting main:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.63&target=main

Wait for installer assets. Update Store Server then tills; paired kiosk must be online and have the v0.3.61+ page loaded. This is UI wiring only: no new schema/website/kiosk protocol changes. Schema43/minimum client0.3.59 retained.

## Check

- Clean saved customer can be sent immediately; dirty customer is saved before sending with the clearly labelled action.
- Selected sale customer goes to correct kiosk record and acceptance/update returns same customer; cart/returns/work-order lines remain. Cancel leaves them alone.
- F9/menu selected customer uses validation; no selected customer/new signup via picker stays blank signup.
- Checkout/hold recovery prevents starting validation. Test actual Windows/tablet placement; no real device interaction was performed here.

## Git commands later on your laptop

Code is directly committed to main. Preserve any local edits first.

```bash
cd /drives/c/dev/DiamondPOS
git status
git pull --ff-only origin main
npm ci
npm run typecheck
npm test
npm run build
```

Only if publishing via Git instead of the release page:

```bash
git tag v0.3.63
git push origin v0.3.63
```
