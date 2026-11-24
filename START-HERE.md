# DiamondPOS v0.3.68 — leading-zero scans and mechanic estimate worksheet

Scanned025752 can find item25752;049234 can find49234. Exact UPC/item/ALU matches win, ambiguous matches stop for manual selection, stored/displayed codes stay unchanged.

Open a checked-in work order → Print estimate worksheet → choose full-page/laser printer. Letter sheet includes customer, WO/check-in/unit/issue, blank mechanic notes,8part-number/name/qty rows and labor/date lines. Manual printing only, no estimate/approval/stage change. Enter handwritten findings into POS later before sending estimate for approval. Existing Print/Label remain.

## Publish/install

User approved combining both requests and adding to Git. After direct main check-in publish v0.3.68:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.68&target=main

Wait for installer assets, back up and update Store Server first then tills. No migration (schema43/min client0.3.59), website or kiosk changes.423 regressions/typecheck/build checked; actual Windows scanner and Letter output remain shop checks.

## Check at shop

- Scan025752, confirm25752 and unchanged ALU. Test normal manufacturer UPC/item lookup.
- Open checked-in ticket, print worksheet, verify fields/handwriting space/part rows. Very long issue text can use more pages.
- Print should not change notes, totals, stage or approval state and should never auto-send an estimate.

## Git commands later

Preserve local edits before pulling assistant's direct check-in.

```bash
cd /drives/c/dev/DiamondPOS
git status
git pull --ff-only origin main
npm ci
npm run typecheck
npm test
npm run build
```

Only if publishing with Git instead of release page:

```bash
git tag v0.3.68
git push origin v0.3.68
```
