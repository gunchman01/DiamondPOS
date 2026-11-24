# DiamondPOS v0.3.76 — smaller findings rows, more parts rows

Print estimate worksheet now has4findings rows with smaller spacing,10compact parts rows instead of6, and no bottom disclaimer. Compact questionnaire table retained. Long issue descriptions may still span pages.

Publish after direct main check-in:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.76&target=main

Wait for installer assets and update server/tills. No new migration or website changes.476 regression checks/typecheck/build passed; reprint the same ticket at the shop to confirm page count and writing space.

## Git commands

Preserve local edits first.

```bash
cd /drives/c/dev/DiamondPOS
git status
git pull --ff-only origin main
npm ci
npm run typecheck
npm run build
```

Only if publishing via Git instead of the release page:

```bash
git tag v0.3.76
git push origin v0.3.76
```
