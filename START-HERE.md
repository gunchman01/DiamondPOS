# DiamondPOS v0.3.46 — Re-subscribe confirmations and campaign typing

Source overlay for the v0.3.45 project on main. Verified GitHub baseline: 3fb26375a27e200487977c86ddb1d4754c546940. No Git commit, push, tag, real email send or hosting deployment was performed here.

## Apply the update

1. Pause campaigns, make a verified Store Server backup, back up the private cPanel marketing directory/database, and close POS/dev instances.
2. Extract this source ZIP separately. Copy everything inside DiamondPOS-update-v0.3.46 over your existing Git project, merging folders and replacing matching files. Keep .git and other project files. This contains source, no installer or customer database.
3. Upload the separate **DiamondPOS-cPanel-marketing-v0.3.46.zip** to the same document root as before. It contains pos-marketing/index.php, tracking.php, subscriptions.php and .htaccess. Preserve your private config/key/database and **restore your custom configPath line in the new index.php**. See extras/cpanel-marketing/CPANEL-SETUP.md. No new SMTP account or PHP mail configuration is needed.
4. In PowerShell in your existing project:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

5. Follow the setup guide's own-address checks: unsubscribe, request confirmation, verify GET alone does nothing, explicitly confirm, then sync POS. Check a later opt-out makes the old confirmation unusable. Also test campaign typing with a large flyer on your Windows PC.
6. When verified, run these commands from the same project folder:

```powershell
git status --short
git add .
git commit -m "Add confirmed marketing resubscriptions and improve campaign typing"
git push origin main
git tag v0.3.46
git push origin v0.3.46
```

Only use the tag if unused. Never move a published tag; choose the next unused release if v0.3.46 already exists. GitHub Actions sets installer version from the tag, while package.json keeps its existing development version. Update the Store Server first, then all tills (schema 33). Marketing pauses during a mismatch between old/new consent-service protocol versions; keep campaigns paused through the upgrade.

## What changes

- Website subscription request page: your configured marketing service URL plus **?action=subscribe**. The existing unsubscribe page links to it. Add it to your website footer if desired.
- A saved customer's **Request confirmation email** button queues a request. The Store Server sends it using your existing email account, roughly once a minute while running. Settings → Email shows requests, errors and confirmed permissions, with a Process confirmation requests now button.
- Permission only returns after an explicit valid customer confirmation; links expire 24 hours after issue. A newer unsubscribe invalidates older requests. Restoring/replaying old suppression history does not override newer website confirmation. Unknown/inactive-only addresses do not receive mail and no new customers are created by the public form.
- Confirmation audit survives in POS and website backups. Already skipped campaign messages are not resent; the address becomes eligible for future campaigns. Spreadsheet/checkbox edits still cannot clear a suppression.
- Campaign typing: isolated preview waits for a 250 ms typing pause, old campaign loads cannot overwrite in-progress text, and list/progress requests omit the large flyer payload. Slow audience responses cannot overwrite newer audience selections. Actual Windows responsiveness still needs your check.

Validation: 261 regression checks, typecheck, production build, real PHP/SQLite HTTP tests and a PHP-to-POS SQLite integration test through mocked SMTP. No real mail sent. The setup guide includes rollout, retry, consent and recovery details.
