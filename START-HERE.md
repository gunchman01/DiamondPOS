# DiamondPOS v0.3.65 — read-only tax exemption at kiosk validation

Existing-customer validation shows Tax exempt: Yes/No and applicable ID/expiration. Expired dates are labelled. Customers cannot edit these fields, including in Update details mode; the screen tells them to notify the cashier for changes. Contact editing and Accept details remain available. Staff-only tax fields remain unchanged by kiosk submissions. Cashier changes during review require a fresh request.

Publish v0.3.65 targeting main after direct check-in:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.65&target=main

Wait for installer assets. Update server first, then tills, and reload the kiosk browser page. No migration (schema43/min client0.3.59). New-customer signup unchanged. Check actual tablet layout after update.

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

Only if publishing via Git instead of the release page:

```bash
git tag v0.3.65
git push origin v0.3.65
```
