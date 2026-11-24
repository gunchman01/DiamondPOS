# DiamondPOS v0.3.71 — reminder settings save correctly

Update Store Server first, then all tills. Back up before updating (settings migration45). The old3-day default becomes1day; other custom reminder periods and explicitly scheduled ticket follow-ups are preserved.

Work Order Settings → Flag after this many calendar days →1 → Save settings. Both main Save buttons now save the approval/reminder section too. Reopen to confirm1. Ticket “Remind again in days” loads the saved value. Service-text settings still have their own Save button. No website upload or connection test required for a reminder change.

Publish the committed update:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.71&target=main

Wait for Windows installer assets, then install server/tills. Actual Windows Save/reopen verification remains.

## Git commands

Preserve local edits first; changes are committed directly to main.

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
git tag v0.3.71
git push origin v0.3.71
```
