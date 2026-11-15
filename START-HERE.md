# DiamondPOS v0.3.36 — Editable estimate fee at initial check-in

Source overlay over main v0.3.35 / e1a153eb1905e8f32bc33840970459be0332109e. No dependency or database migration is required. Website approval files and settings are unchanged.

## Apply

Close the development app, extract the ZIP, and copy the CONTENTS of DiamondPOS-update-v0.3.36 into your existing project folder, replacing matching files. Keep the rest of your project and local configuration/data.

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

Typecheck, build and all 131 regression checks passed. Windows visual verification is still a local check.

## Try the change

1. Check in a new work order and select a unit. Estimate fee for this ticket starts with that category's configured default.
2. Enter a lower or higher amount. The check-in collection button shows the edited amount. Collect it now or later.
3. Click No fee (or enter 0.00) to waive it. No estimate-fee payment is required.
4. Use default restores the configured fee. Selecting another unit loads its category's default. You can enter a positive fee even when its default is zero.
5. Confirm the ticket shows the chosen amount and the settings default remains unchanged. A different fee/waiver has a history note with the default and ticket amounts.

Blank, negative, fractional-cent and unsafe numeric amounts are rejected. The defaults must load before check-in; use Retry if loading fails. Existing tickets and paid fees are unchanged; this is a new-ticket check-in control.

## Commit and release

Review git status and git diff first and include other local edits only intentionally.

```powershell
git add .
git commit -m "Allow per-ticket estimate fee at work order check-in"
git push origin main
git tag v0.3.36
git push origin v0.3.36
```

Use the tag only if unused. The tag starts the Windows release workflow; pushing main alone does not publish an installer. Update the Store Server first, then tills, so the server accepts the edited fee field. No cPanel upload or approval-service reconfiguration is needed. No commit, push or tag was made here.
