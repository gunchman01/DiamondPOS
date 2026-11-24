# DiamondPOS v0.3.61 — work-order texts and kiosk customer verification

No separate customer service-text opt-in is needed. Select Text, Email or both when manually sending an estimate or ready-for-pickup notice. Text starts unchecked; nothing auto-sends. Mobile Text Alerts STOP/provider restrictions remain.

Open a saved customer (Customers or edit the selected sale customer), save changes, then click Verify customer on kiosk. The customer can accept their contact details or update and save to the same record. Account/tax/staff fields remain private. A changed email does not gain marketing permission. Conflicting staff contact edits require a new verification request.

## Publish and install

After direct main check-in, publish v0.3.61 targeting main:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.61&target=main

Wait for Release installer assets. Back up and update Store Server first, then tills. Reload the paired kiosk browser page. No migration (schema43/minimum client0.3.59 retained); old till screens still show obsolete service-text restrictions until updated. No website file changes.

## Verify at the store

1. Existing customer without old service-text permission: Text should be selectable for estimates/pickup. Confirm the number and choose whether to send. Replies remain unmonitored. Provider opt-outs are not bypassed.
2. Customer → Verify customer on kiosk: Accept details, then a second session Update details; confirm same customer, correct changes, refreshed staff view and unchanged balance/tax data.
3. Cancel/re-send, and change contact details on another till during verification; stale submissions must be rejected. New-customer signup must still work. Kiosk clears contact fields on completion/timeout.
4. Run a self-number text test only when you choose; no real text was sent during development.

## Git commands later on your laptop

Changes are directly committed to main. Preserve uncommitted local edits before pulling.

```bash
cd /drives/c/dev/DiamondPOS
git status
git pull --ff-only origin main
npm ci
npm run typecheck
npm test
npm run build
```

If publishing from Git instead of the release page (choose one):

```bash
git tag v0.3.61
git push origin v0.3.61
```
