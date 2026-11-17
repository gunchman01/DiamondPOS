# DiamondPOS v0.3.44 — Website marketing unsubscribes

Source overlay for the current v0.3.43 project on main. Baseline: 9a2f368420deebe8fed4ea93c46e75c0984f1f33. No commit, push, tag, real email send or website deployment was made here.

1. Make a verified Store Server backup and close all POS/dev instances.
2. Extract the source ZIP separately. Copy everything inside DiamondPOS-update-v0.3.44 into your existing Git project, merging folders and replacing matching files. Keep .git and the other project files. No customer database or installer is included.
3. In PowerShell in your project:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

4. Follow **extras/cpanel-marketing/CPANEL-SETUP.md**. The separate public cPanel ZIP creates pos-marketing beside your existing pos-approval pages. The example private configuration is in this source ZIP; put the real configuration and database outside public_html.
5. Configure **Settings → Email → Website marketing consent**, then test with your own address. Marketing sends pause until the website service is available. Ordinary SMTP settings tests and work-order messages remain separate.
6. When verified, commit/push main and create an unused tag through your usual process. Suggested commit: `Sync website marketing unsubscribes and protect campaign consent`. Suggested new tag: v0.3.44. Never move an existing tag. GitHub Actions sets installer version from the release tag; package.json stays at its existing development version.

Update the Store Server first, then every till (schema 31). Older versions do not honor the suppression safeguards, so do not use their marketing sender after customers unsubscribe.

What changes: visible website unsubscribe links; minute-by-minute Store Server sync with durable history/acknowledgments; local opt-outs uploaded to the website; duplicate email addresses suppressed together; imports cannot re-enable unsubscribes; final per-recipient checks before SMTP; skipped-recipient progress; synchronized contact export and a consent status screen. No website campaign dashboard or tracking provider is included in this stage.

Validation: 230 regression checks, TypeScript and production build; real local PHP/SQLite HTTP verification. No real emails sent. Complete the cPanel/SMTP/Windows checks in the setup guide before using marketing with actual customers. Back up the private cPanel database separately from POS backups.
