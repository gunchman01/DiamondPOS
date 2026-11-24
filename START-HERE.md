# DiamondPOS v0.3.67 — new-customer kiosk intake in all three places

- Make a Sale, no selected customer → New customer on kiosk beside search (or F9).
- New work order → Select customer → New customer on kiosk. Submission selects customer and continues unit/check-in steps.
- Customers → Add customer → New customer on kiosk. Submission saves/matches customer and refreshes originating list/picker.

No blank customer needs saving first. Cancel creates no partial record. Existing validation is separate and sends saved details. Kiosk must be paired/online; existing tax-card staff review still applies.

Publish v0.3.67 targeting main after direct check-in:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.67&target=main

Wait for installer assets. Update server then tills; keep kiosk browser refreshed from v0.3.66+. No new schema/protocol/website changes.408 regressions/typecheck/build checked; actual shop interaction remains to verify.

## Git commands later

Preserve local edits before pulling.

```bash
cd /drives/c/dev/DiamondPOS
git status
git pull --ff-only origin main
npm ci
npm run typecheck
npm test
npm run build
```

Only if publishing via Git instead of release page:

```bash
git tag v0.3.67
git push origin v0.3.67
```
