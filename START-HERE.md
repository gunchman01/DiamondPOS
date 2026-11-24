# DiamondPOS v0.3.75 — compact printed questionnaire

Customer intake now prints as Question / Answer columns on both Print estimate worksheet and the full Print work order. Staff notes remain separate; the plain generated Q/A block is not repeated. Long answers wrap and may still need additional pages. No new migration or website upload; stored answers unchanged.

Publish after direct main check-in:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.75&target=main

Wait for Windows installer assets and update server/tills.476 regression checks, typecheck/build passed; reprint the same ticket on the shop printer to confirm actual layout/readability. If skipping74, back up and update Store Server first for its migration.

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

Only if publishing via Git instead of release page:

```bash
git tag v0.3.75
git push origin v0.3.75
```
