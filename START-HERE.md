# DiamondPOS v0.3.69 — shorter mechanic worksheet

Removed two blank parts rows (eight → six), saving14mm of page height. Reprint the same ticket on Letter paper to confirm one-page output. Other worksheet content remains; unusually long issue text can still create additional pages.

Publish v0.3.69 targeting main after direct check-in:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.69&target=main

Wait for installer assets then update server/tills. No migration/server/website changes. Four focused worksheet checks, typecheck/build checked; actual physical print remains to confirm.

## Git commands later

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
git tag v0.3.69
git push origin v0.3.69
```
