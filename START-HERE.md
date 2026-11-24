# DiamondPOS v0.3.73 — repair questions on the kiosk

Back up the Store Server, update it first, then all tills (schema46). Reload the kiosk browser page and close older kiosk tabs. No website upload required.

1. Work Order Settings → Customer kiosk · Repair intake questions → Mowers / Handhelds / Other equipment. Edit starter questions, set type/required, then main Save settings.
2. At new check-in, choose Check in & send questions to kiosk. This saves the ticket first; estimate fee is collected later. Closing the waiting window keeps the checked-in ticket, even on error/offline.
3. Existing open ticket → Customer repair intake → Send intake to kiosk.
4. Customer answers and taps Send answers. Staff select Review answers. Each submission keeps original wording; resending keeps prior responses. This is intake information, not repair approval.

Five-minute unanswered timeout. Required/choice answers validated; no partial answers saved on cancel. Questionnaire follows unit category. Empty category cannot send. Unit/category changes require resend; closed tickets cannot take new submissions. Saved answers are included in database backups.

Publish after direct main check-in:
https://github.com/gunchman01/DiamondPOS/releases/new?tag=v0.3.73&target=main

Wait for installer assets, then update.460 regression checks/typecheck/build passed; actual kiosk touchscreen/Windows interaction still to verify. Test one mower and handheld, Save/reopen settings, cancel/timeout, and successful answer review before store use.

## Git commands

Preserve local edits first; changes are already committed to main.

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
git tag v0.3.73
git push origin v0.3.73
```
