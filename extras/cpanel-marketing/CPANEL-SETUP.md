# DiamondPOS v0.3.44 — Website unsubscribe setup

This adds a website unsubscribe service and two-way suppression sync for the existing POS marketing sender. It is not a website campaign dashboard. No hosting files have been uploaded and no real email has been sent by this update.

## 1. Install the POS update

Back up the Store Server, close POS, and apply DiamondPOS-update-v0.3.44 over the existing v0.3.43 Git project. Run typecheck, tests and build. Release with your usual process; update the Store Server first, then all tills. Schema 31 adds suppression and outgoing opt-out tables. Existing pending campaigns wait for consent-service configuration instead of sending unchecked. Ordinary SMTP connection tests, repair estimates and work-order emails remain separate.

## 2. Upload the public service

Use cPanel File Manager to extract DiamondPOS-cPanel-marketing-v0.3.44.zip into the website document root (usually public_html). It creates **pos-marketing/index.php** and **pos-marketing/.htaccess**. Do not overwrite or move the existing pos-approval service. Enable PHP 8.3 or 8.4 with PDO and PDO SQLite for this site. Enable HTTPS.

For production, the endpoint is:

https://morethanmowers.com/pos-marketing/index.php

For staging, use:

https://oho.staging.tulsapickem.com/pos-marketing/index.php

Choose the actual site you upload to. Test campaigns should use test customer addresses only. Tokens issued on staging remain staging links; preserve that service and database if those old links must keep working. Changing the POS URL does not rewrite already sent emails. Use one authoritative production service once live.

## 3. Create the private configuration

Outside public_html (and every domain's document root), create a directory such as:

/home/YOUR_CPANEL_USERNAME/diamondpos-private

Copy the example from **extras/cpanel-marketing/private/marketing-config.example.php** in the POS source update to that private directory, named **marketing-config.php**. Never upload this configuration into pos-marketing. Set private directory permissions to 700 and the configuration file to 600 where supported; the PHP account must be able to read/write there.

In POS, open **Settings → Email → Website marketing consent**, click **Generate new key**, then **Copy entered key**. Paste that generated key into the private configuration's api_key. Set public_url to the exact HTTPS URL above and database to a private writable file path (the example uses the private directory). Set store_name.

Edit only the config-path line near the top of public **pos-marketing/index.php** to point to your actual private configuration file. The service refuses configuration/database storage inside the document root. It creates the SQLite database automatically. No database password or MySQL setup is needed. Never commit the real configuration, key or SQLite file to Git.

Back in POS, enter that same HTTPS service URL and key, enable the service, and **Save consent settings**. A blank key on later saves keeps the saved key. **Generate new key** only creates an unsaved key; rotating it requires updating both cPanel and POS. Click **Check connection / sync now**. Last successful sync should populate and errors should clear. A disabled/unreachable service pauses marketing; it does not bypass consent checks.

## 4. Test the whole path

1. Add your own test address to a test customer and check OK to email. Duplicate customers can share that test address for the duplicate-record test.
2. Create a campaign and send a test only to that address. The delivered HTML and text should include a website unsubscribe link. A campaign test uses real marketing consent checks; the ordinary SMTP settings test does not.
3. Open the link. It must show a confirmation button. Merely opening it must not unsubscribe anyone (email-security scanners may open links).
4. Confirm **Unsubscribe from marketing**. The website immediately stores a permanent suppression for that address. Every future sender using this service must check it before sending. An email already handed to SMTP cannot be recalled.
5. Click sync in POS, or leave the Store Server running for up to one minute. Every customer with the same trimmed, case-insensitive email must have OK to email cleared. The recent-unsubscribes table should list it. Queued messages for that address become skipped.
6. Try checking OK to email again and importing an older spreadsheet with Yes for that address. It must stay suppressed. Import preview must not change data.
7. With the POS closed, unsubscribe another test address from a previously issued link. Reopen the Store Server and sync; the website retains the event until it is applied, and retains history after acknowledgment so restore/replay remains possible.
8. Temporarily use an incorrect key to test an outage. A campaign must pause and keep unsent recipients pending. Restore the correct matching key and sync. It retries automatically after approximately five minutes. Do not use real customer campaign addresses for this test.

Opt-outs affect the email address, including every duplicate customer at that address. Editing a customer's email does not transfer a suppression to a different address. This release has no re-subscribe button: fresh consent will need a dedicated workflow. Replying to an email is not automatically processed; staff must uncheck OK to email in the customer's record for a reply-based opt-out. That change is stored locally immediately and queued for website upload.

## Contact exports and future website campaigns

**Export eligible contacts** first synchronizes suppression, then exports active, opted-in customers with valid, deduplicated addresses. This CSV is a snapshot, not permission to ignore future unsubscribes. The future website dashboard must keep its suppression database independent of contact imports and check it immediately before every recipient send. Importing contacts or calling prepare never removes a suppression.

The service API is server-to-server HTTPS POST JSON with X-DiamondPOS-Key. Keep the key off public pages and browser JavaScript:

| Action query parameter | JSON request | Result |
|---|---|---|
| prepare | email | suppressed=true, or suppressed=false plus unsubscribeUrl; check immediately before each marketing send and include the URL in HTML/text |
| suppress | email | Persist a staff/provider-requested opt-out; repeated calls are safe |
| pull | cursor (integer) | Ordered events (up to 200), hasMore; apply atomically then advance the local cursor |
| ack | clientId (UUID), cursor | Acknowledge only after local commit; events remain available for replay |

A website sender must stop/pause if this service is unavailable. No full campaign dashboard, email provider integration, bounce/complaint webhook, open/click tracking or automated inbox reader is included yet. The existing POS SMTP campaign sender now follows these rules. Forwarded unsubscribe links act on the original recipient's address; tokens are random and stored hashed, and the page does not disclose their email address.

Emails include a visible confirmation link and List-Unsubscribe header. This release does not claim RFC 8058 one-click support: its POST semantics and DKIM header signing need a provider-specific implementation/verification before advertising that capability.

## Backups, recovery and updates

The POS database backup includes local suppressions, outgoing opt-outs and service settings/key. Protect backup access. **It does not back up cPanel.** Back up the private website directory (configuration and marketing.sqlite) with cPanel separately. Website tokens must survive restores so links in older emails still work. Do not delete or routinely prune suppression history, tokens or event records.

After restoring either database, use **Replay suppression history** in POS: it republishes all locally known suppressions and replays website history from the beginning. It never clears suppression. If the website detects a POS cursor beyond its restored history, it refuses synchronization until replay; sending pauses. History missing from both backups cannot be reconstructed, so retain good backups of both systems. A message already delivered to SMTP cannot be recalled.

When changing service URL or rotating the API key, POS resets its cursor and republishes all local suppressions to the configured service before sending/exporting. Keep old unsubscribe endpoints available for already-issued links. Do not switch between separate staging/production databases for live campaigns without consolidating their suppression histories.

Do not downgrade to an older POS marketing sender that ignores suppression. Update all PCs together; older tills also lack the new safeguards on customer edits. Review current suppression state before resuming marketing after a restore.

## Verification provided

The source update passes TypeScript checking, the regression suite and a production build. A real local PHP/SQLite HTTP test checks key authentication, invalid requests, confirmation-only unsubscribe, repeated POST idempotency, suppression, event replay/acknowledgment and private database permissions. Run it on a machine with PHP/PDO SQLite using `python tests/cpanel/marketing-service.py`; DIAMONDP_TEST_PHP can select a PHP executable. Actual cPanel configuration, outbound SMTP delivery and Windows UI checks remain yours to verify using your own test address. No production hosting changes were made.
