# DiamondPOS v0.3.64 — single-line Sales History

Fixes the shared customer-history card style accidentally applied to transaction table rows. All nine columns now remain aligned on a single row. Secondary details show when opening the receipt/payment; long fields truncate with full customer/till hover titles. Narrow screens scroll horizontally.

Publish v0.3.64 targeting main after direct check-in:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.64&target=main

Wait for installer assets, then update server/tills. No schema, website, kiosk or financial behavior changes. Check table alignment at125% and row-click details on shop PC. Typecheck/build checked; no Windows visual pass claimed.

## Git commands later

Preserve uncommitted local edits before pulling.

```bash
cd /drives/c/dev/DiamondPOS
git status
git pull --ff-only origin main
npm ci
npm run typecheck
npm run build
```

Only if publishing with Git instead of release page:

```bash
git tag v0.3.64
git push origin v0.3.64
```
