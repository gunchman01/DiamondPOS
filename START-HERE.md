# DiamondPOS v0.3.52 — text settings and customer permission

Fixes Work Order Settings showing Work order not found instead of the Mobile Text Alerts API-key form. Adds a saved OK to text service updates checkbox under customer Contact Info. Existing customers default to off. Texts require saved permission independently of marketing email permission. No automatic sending or reply inbox.

## Before copying files

The previous v0.3.51 batch was already committed directly to main as 779bb5d. This v0.3.52 update is NOT committed: Greg applies and commits it. The ZIP includes the cumulative v0.3.51 files too.

In MobaXterm:

```bash
cd /drives/c/dev/DiamondPOS
git status --short
```

If local changes appear, preserve/review them first. Do not reset or discard files. With a clean working tree, get the existing v0.3.51 commit:

```bash
git pull --ff-only origin main
```

Back up the Store Server, resolve pending checkout recovery, finish QuickBooks sync and close installed/development POS instances.

## Apply and verify

Extract DiamondPOS-update-v0.3.52.zip separately. Copy the CONTENTS of its DiamondPOS-update-v0.3.52 folder over C:\dev\DiamondPOS, merging folders and replacing matching files. Keep .git and all other files. Do not create a nested project folder. No npm dependency changes or website upload.

In PowerShell in C:\dev\DiamondPOS:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

342 regression checks, typecheck and build passed during development. Follow TESTING-NOTES.md; Windows/hardware and real SMS delivery still need testing. Close the development instance before starting installed POS.

## Commit and publish — MobaXterm

Review git status for unexpected files before adding them. These are YOUR commands; no GitHub write or release tag was performed by the assistant for v0.3.52.

```bash
cd /drives/c/dev/DiamondPOS
git status --short
git diff --stat
git add -A
git commit -m "Fix text settings and add saved customer service text permission"
git push origin main
git tag v0.3.52
git push origin v0.3.52
```

If the tag already exists, inspect it instead of replacing it. Wait for GitHub Actions Release to succeed. Install v0.3.52 on STORE SERVER FIRST, then every till. Schema 42 adds default-off customer permission; minimum client is 0.3.52.

## Where the controls are

1. Work Orders → Work order settings → Work-order texts — Mobile Text Alerts (near the top). You should now see Enable, API key, store callback number and Save text settings. Blank key keeps the saved key. Set up a Mobile Text Alerts account enabled for custom messages with its sender number verified.
2. Customers → Add/Edit customer → Contact Info → OK to text service updates (near Mobile). Check only with customer permission, then save. Mobile is used first, otherwise Phone. Changing a number clears the choice; confirm permission for the new number before checking again. This is separate from OK to e-mail for marketing and does not override provider STOP opt-outs.
3. Reopen the work order after editing its customer. Estimate/pickup Notify dialog offers Email/Text/both; Text is disabled without saved customer permission. The server checks current permission again before sending. Replies are not monitored; estimate decisions use the website link, other questions use the store callback.
4. Test first with your own authorized number/email. No real messages were sent during development. Accepted is not confirmed delivery. Check Unknown results with the provider before deliberately sending again.

Do not change your working approval website files or AOD configuration for this update.
