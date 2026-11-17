# DiamondPOS v0.3.45 — Campaign tracking and service audiences

Source overlay for v0.3.44 on main. Verified GitHub baseline: 3c3c4e5429728063e24fd6f142fc607f2f14a7fb. No commit, push, release, real email send or hosting upload was performed here.

## Install

1. Back up the Store Server and the private cPanel marketing directory/database. Pause campaigns and close POS/dev instances.
2. Extract this ZIP separately. Copy everything inside DiamondPOS-update-v0.3.45 into your existing Git project, merging folders and replacing matching files. Keep .git and other existing files. This contains source, no installer or customer database.
3. Upgrade the existing cPanel service using the separate public ZIP and **extras/cpanel-marketing/CPANEL-SETUP.md**. Upload index.php, tracking.php and .htaccess together. Preserve your private configuration/key/database and restore your custom configPath line in the new index.php. Existing unsubscribe links continue to work with the same private database. No key rotation is required.
4. Run checks from PowerShell in your project:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

5. Test using an actual campaign restricted to your own opted-in test address. Include a full HTTPS URL in the message. Send test intentionally does not collect activity. Open the sent HTML email with images allowed, click its message link, then open Marketing → Mailers → that campaign → Campaign activity → Sync activity now. Old messages show as untracked; nothing is retroactive.
6. When verified, run these commands in the same Git project:

```powershell
git status --short
git add .
git commit -m "Track campaigns and target service customers"
git push origin main
git tag v0.3.45
git push origin v0.3.45
```

Use the tag only if unused. Never move a published tag; if v0.3.45 already exists, choose the next unused version instead. GitHub Actions sets installer version from the tag; package.json keeps its existing development version. Update the Store Server first, then all tills (schema 32). Do not use an older marketing sender after enabling tracking.

## What you get

- Service-history audiences: any service, mower, handheld or other equipment, with completed-only/all non-cancelled jobs, check-in lookback and customer-type filters. Customers do not need a purchase history.
- Delete drafts and old finished/stopped campaigns with confirmation; sending/in-flight campaigns are protected and unsubscribe history is retained.
- Campaign results inside POS Marketing: distinct recipients with detected opens/clicks, tracked-send totals, first/latest timestamps, observed request counts and links clicked.
- Recipient filters and Excel activity export; automatic website sync approximately every minute, manual sync and deduplicated history replay.
- A Settings → Email toggle for tracking on future campaign sends. Tests, previews, repair estimates and work-order emails remain untracked.
- Existing unsubscribe safeguards retained. Confirmed opt-outs stop new engagement collection for that address. Website tracking tokens use opaque IDs, and click destinations cannot be substituted by public query parameters.

Open detection is an estimate, not proof a person read an email. “No open detected” never means “unread.” Privacy image loads and security scanners can affect results, while blocked/cached images can hide activity. Forwarded copies attribute activity to the original recipient; forwards and deletions cannot be identified. Sent means accepted by SMTP, not confirmed inbox delivery. Details and recovery steps are in the setup guide.

Validation: 250 regression checks, TypeScript, production build, real local PHP/SQLite HTTP tests and a real PHP-to-POS SQLite integration check. Actual cPanel configuration, Windows UI and external email delivery remain to be verified on your own systems. No hosting changes or real sends were performed here.
