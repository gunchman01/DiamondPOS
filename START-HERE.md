# DiamondPOS v0.3.66 — saved-customer validation instead of blank signup

Validation now has a dedicated selected-customer request plus server/kiosk capability checks. Older Store Server versions or an already-open older kiosk page can otherwise treat validation as blank signup; the new version blocks those paths with update/reload instructions. Existing contact editing/read-only exemption remain.

Publish v0.3.66 targeting main after direct check-in:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.66&target=main

1. Wait for Release installer assets.
2. Update STORE SERVER FIRST, then every till.
3. Close duplicate kiosk browser tabs and reload the paired kiosk page. Do not clear browser data/pairing unnecessarily.
4. Open an existing customer and click Validate on kiosk. Confirm existing name/address/contact plus read-only exemption, and Accept/Update buttons. Validate from selected sale customer too.
5. New-customer signup without a selected customer should still be blank.

No migration (schema43/minimum client0.3.59). Exact shop version/browser state not observed; actual tablet check required.406 regressions/typecheck/build checked. No live messages or deployment.

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

Only if publishing with Git instead of the release page:

```bash
git tag v0.3.66
git push origin v0.3.66
```
