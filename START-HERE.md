# DiamondPOS v0.3.74 — cancellation and customer-described kiosk issues

Back up first. Update Store Server before all tills (schema47). No website upload required.

New check-in: select customer and unit → Check in & send questions to kiosk. No staff issue text required. Customer answers fill Reported issue, preserving staff notes and printing on both work-order sheets. Long answers can span pages. Ordinary non-kiosk check-in still requires an issue.

Open an active ticket → Cancel work order → reason → confirm reserved parts can return to stock → Cancel work order. If parts are used/installed, bill the appropriate repair instead. No automatic printing/messages.

Cancelled tickets remain in history under Cancelled, separate from Open/Picked Up. Parts release once, repair balance0, charges retained as history, and no reopening/checkout. Customer/unit/history stay linked. Paid estimate fees and recorded payments remain unchanged as requested; no automatic refund. Completed/invoiced repair checkouts cannot cancel this way. Pending kiosk intake ends; local estimates superseded immediately and website link invalidates on next successful approval sync.

Publish after direct main check-in:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.74&target=main

Wait for Windows installer assets before installing.475 regression checks/typecheck/build passed; actual Windows modal interaction remains to verify. Use a test ticket to confirm reason, inventory restoration, retry does not restore twice, Cancelled/customer history, no reopening, and original paid-fee receipt unchanged.

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
git tag v0.3.74
git push origin v0.3.74
```
