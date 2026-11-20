# DiamondPOS v0.3.51 — work-order texts and checkout fixes

Source prepared for main; creating a commit does not create an installer release. Includes v0.3.50 held-sale cancellation, Email/Text/both service notices, deferred estimate fees and live customer suggestions. No website upload is required.

## Get the checked-in source on your PC

In MobaXterm:

```bash
cd /drives/c/dev/DiamondPOS
git status --short
git pull --ff-only origin main
```

Pull only with a clean working tree. If local edits are listed or Git reports a conflict, preserve them and review before proceeding; do not reset or discard them.

In PowerShell in C:\dev\DiamondPOS:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

No dependency changes. Validation: 338 regressions, typecheck and build passed in the development environment. Windows interaction and real text delivery remain to test. Follow TESTING-NOTES.md. Close the development instance before using installed POS.

## Release later, when ready

These commands create the installer release; they have not been run here:

```bash
cd /drives/c/dev/DiamondPOS
git status --short
git log -1 --oneline
git tag v0.3.51
git push origin v0.3.51
```

Do not overwrite an existing tag. Wait for GitHub Actions Release to succeed. Back up the Store Server, resolve pending checkout recovery, finish QuickBooks sync, and close running POS instances before installing. Update STORE SERVER FIRST, then every till: schema 41 adds notification audit records, and minimum client version is 0.3.51.

Work Order Settings → Work-order texts: enter the Mobile Text Alerts API key and store callback number, then enable. The provider account needs custom messages and a verified sender. Test only your own authorized number/address first. No real messages have been sent during development; do not treat provider acceptance as confirmed delivery.
