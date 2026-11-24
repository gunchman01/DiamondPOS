# DiamondPOS v0.3.72 — edit customer units

Work order: open ticket → Edit unit beside unit details.
Customer: open customer → Customer Equipment → expand the unit → Edit unit.

Serial number/model can be blank at check-in. Add them later, along with brand/type, current hours, purchase date and notes. Save unit updates the same equipment record everywhere, preserving owner/history. Original sale receipt serial and hour-at-intake remain historical records. No automatic printing. Unsaved ticket notes are preserved.

Publish the committed update:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.72&target=main

Wait for Windows installer assets. Update Store Server first, then tills, to keep versions consistent. No new migration or website upload in72; upgrades skipping70/71 include their migrations, so take a verified backup first.

## Git commands

Preserve local edits first; direct main check-in is already done.

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
git tag v0.3.72
git push origin v0.3.72
```

Windows check: add mower with blank serial, check in, edit from work order, confirm customer equipment; edit again from customer and confirm ticket. Confirm Save/Cancel does not close or submit the customer form and unsaved ticket problem/diagnosis remains. Reprint label manually if needed.
