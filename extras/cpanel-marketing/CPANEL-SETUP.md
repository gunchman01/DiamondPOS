# DiamondPOS v0.3.45 — Website unsubscribe setup

This adds estimated open and link-click results inside POS Marketing, using the website service to collect activity. The existing website unsubscribe service and two-way suppression sync remain in place. It is not a website campaign dashboard. No hosting files have been uploaded and no real email has been sent by this update.

## Upgrading your working v0.3.44 setup

Keep your existing private configuration, API key and marketing.sqlite database. Back up that private directory and the existing public index.php first. Pause campaign sending during the upgrade.

1. Extract the new public cPanel ZIP into the same document root. It contains **pos-marketing/index.php**, **pos-marketing/tracking.php** and **pos-marketing/.htaccess**. Upload all three files; an index.php without its new tracking.php will not work. If uploading individually, upload tracking.php before index.php.
2. **Restore your configured private-config path** on the configPath line at the top of the new index.php, using your old index.php as reference. The downloadable copy has a placeholder path. Do not replace the private config or database with an empty/example file. Existing unsubscribe tokens are preserved in that same private database.
3. Apply the POS source update and release v0.3.45, updating the Store Server first and then all tills. No new website URL or key is required. Existing database tables stay intact; tracking tables are created automatically.
4. Under Settings → Email, tracking is enabled by default for future campaign sends. You can turn it off and save while leaving unsubscribe checks enabled. If you leave tracking enabled against the old website service, tracked campaigns pause rather than silently omit tracking.
5. Open a sent campaign under **Marketing → Mailers**, scroll to **Campaign activity**, and click **Sync activity now**. This also checks that the upgraded website activity API is reachable. Results are viewed inside the POS; there is no separate website dashboard to sign into.

To test tracking, create an actual campaign whose audience contains **only your own opted-in test address**, include a full HTTPS website URL in the message, and send it. Open its HTML message with remote images allowed and click the message link. After about one minute, or Sync activity now, that recipient should show the detected activity. **Send test** and the SMTP connection test intentionally do not collect campaign activity. Emails sent before v0.3.45 cannot gain tracking retroactively.

## 1. Install the POS update

Back up the Store Server, close POS, and apply DiamondPOS-update-v0.3.45 over the existing v0.3.44 Git project. Run typecheck, tests and build. Release with your usual process; update the Store Server first, then all tills. Schema 32 adds campaign activity records and tracking identities. Existing pending campaigns wait for consent-service configuration instead of sending unchecked. Ordinary SMTP connection tests, repair estimates and work-order emails remain separate.

After copying the source update, run the checks from your project folder:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

After verifying the update and the website setup below, commit and release with:

```powershell
git status --short
git add .
git commit -m "Track campaigns and target service customers"
git push origin main
git tag v0.3.45
git push origin v0.3.45
```

Run these commands in your DiamondPOS Git project folder after copying the update and completing the checks. Use the v0.3.45 tag only if it has not already been published; never move an existing tag. If v0.3.45 is already released, stop before the tag commands and use the next unused release version.

## 2. Upload the public service

Use cPanel File Manager to extract DiamondPOS-cPanel-marketing-v0.3.45.zip into the website document root (usually public_html). It creates **pos-marketing/index.php**, **pos-marketing/tracking.php** and **pos-marketing/.htaccess**. Do not overwrite or move the existing pos-approval service. Enable PHP 8.3 or 8.4 with PDO and PDO SQLite for this site. Enable HTTPS.

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

A website sender must stop/pause if this service is unavailable. Campaign activity is available inside POS Marketing. No separate website campaign composer/dashboard, email provider integration, bounce/complaint webhook or automated inbox reader is included yet. The existing POS SMTP campaign sender now follows these rules. Forwarded unsubscribe links act on the original recipient's address; tokens are random and stored hashed, and the page does not disclose their email address.

Emails include a visible confirmation link and List-Unsubscribe header. This release does not claim RFC 8058 one-click support: its POST semantics and DKIM header signing need a provider-specific implementation/verification before advertising that capability.

## Backups, recovery and updates

The POS database backup includes local suppressions, outgoing opt-outs and service settings/key. Protect backup access. **It does not back up cPanel.** Back up the private website directory (configuration and marketing.sqlite) with cPanel separately. Website tokens must survive restores so links in older emails still work. Do not delete or routinely prune suppression history, tokens or event records.

After restoring either database, use **Replay suppression history** in POS: it republishes all locally known suppressions and replays website history from the beginning. It never clears suppression. If the website detects a POS cursor beyond its restored history, it refuses synchronization until replay; sending pauses. History missing from both backups cannot be reconstructed, so retain good backups of both systems. A message already delivered to SMTP cannot be recalled.

When changing service URL or rotating the API key, POS resets its cursor and republishes all local suppressions to the configured service before sending/exporting. Keep old unsubscribe endpoints available for already-issued links. Do not switch between separate staging/production databases for live campaigns without consolidating their suppression histories.

Do not downgrade to an older POS marketing sender that ignores suppression. Update all PCs together; older tills also lack the new safeguards on customer edits. Review current suppression state before resuming marketing after a restore.

## Verification provided

The source update passes TypeScript checking, the regression suite and a production build. A real local PHP/SQLite HTTP test checks key authentication, invalid requests, confirmation-only unsubscribe, repeated POST idempotency, suppression, event replay/acknowledgment and private database permissions. Run it on a machine with PHP/PDO SQLite using `python tests/cpanel/marketing-service.py`; DIAMONDP_TEST_PHP can select a PHP executable. Actual cPanel configuration, outbound SMTP delivery and Windows UI checks remain yours to verify using your own test address. No production hosting changes were made.

## Reading campaign activity in the POS

Marketing → Mailers shows distinct recipients with estimated opens/clicks out of successfully sent messages that included tracking. Open a campaign and scroll to Campaign activity for per-recipient status, observed counts, first/latest timestamps and links clicked. Filter for detected opens, no open detected, clicks or untracked sent messages. Export activity saves all recipient results as an Excel file. Sync activity now fetches website activity; the Store Server also polls about once a minute. The visible screen refreshes local results every 30 seconds. An activity-sync error marks results as stale and preserves existing totals; it does not bypass unsubscribe checks or by itself pause otherwise valid sends.

A remote 1×1 image records an estimated open when requested. Only explicit HTTP/HTTPS links in the message body become tracked redirects, in both HTML and plain-text mail. Links drawn into an uploaded flyer image are not clickable. The unsubscribe and reply links are never wrapped as engagement links. The preview opens no tracking image, and test messages create no campaign metrics.

These are observations, not proof that a person read the message. Privacy services can preload images; disabled images or caching can hide actual opens. Scanners can click links. Obvious bot/prefetch/preview requests and HEAD requests are ignored, but other automated traffic cannot be reliably distinguished. Repeated requests to the same token within a minute are coalesced. A click can appear without an open. Forwarded copies retain the original recipient's tokens; forwarding and deleting without reading cannot be determined. “Sent” means SMTP accepted the message, not proven delivery to the inbox. No open/bounce/delivery provider webhook is included.

Future campaign messages include a brief tracking notice. The activity database stores event time, opaque delivery identity, type and clicked URL; it does not store IP addresses or user agents. Hosting access logs remain controlled by your hosting configuration. After an address unsubscribes, the service stops recording future activity for it while keeping its old click links functional. Prior activity is retained.

Tracking can be disabled in Settings → Email for future sends. Existing sent links continue to function and may record activity until that address unsubscribes. No retroactive tracking is possible for older messages. The report distinguishes untracked messages from tracked messages with no detected open.

The private website database now also contains tracking tokens/deliveries and an append-only activity feed. Back it up separately along with the existing unsubscribe data. POS backups include synchronized activity. After a restore, use **Replay activity history** in a campaign: event identities prevent duplicate counts. This replays all campaigns, not just the one visible. Replay can only attach events to delivery identities still present in the POS database. If a POS restore predates a send or the creation of its tracking identity, unknown delivery events are ignored and cannot automatically be associated with that campaign. Use Replay suppression history separately for opt-outs; they are independent feeds. Changing service URL/key resets both feed cursors while preserving local results, and old website endpoints/databases must remain available for previously issued links. Events or tokens missing from the website backup cannot be recreated from the report alone.

Additional server-to-server APIs (same private API key):

| Action | Request | Result |
|---|---|---|
| prepareTracking | email, deliveryKey (stable random 64-hex ID), links (up to 100 safe HTTP/HTTPS URLs) | version=1, suppressed flag; if allowed, pixelUrl and clickUrls mapping |
| activity | cursor (integer) | version=1, ordered events (up to 200), hasMore |

Activity events include a stable eventKey and deliveryKey. Apply a batch and its cursor atomically, deduplicate by eventKey, and retain history for replay. Public open/click routes require opaque tokens; click destinations are fixed during authenticated preparation and cannot be replaced through a public query parameter. Tracked sends refuse an outdated/incompatible website service. Normal work-order and estimate emails remain untracked.

## Service-history audiences and deleting campaigns

In Marketing → New mailer → Who gets it, choose **Customers with service history**. Select Any service / all equipment, Mower service, Handheld service or Other equipment service. The category comes from the unit linked to an actual work order; owning a unit alone does not qualify, and the equipment need not have been bought from Diamond P. Choose completed only (Ready for Pick Up / Picked Up) or any non-cancelled work order including in-progress jobs. Not Fixed jobs, including a picked-up ticket whose last prior stage was Not Fixed, are excluded. Tickets with no stage history are evaluated by their current recorded stage. The date filter uses check-in/creation date, not the last edited date or completion date. Customer types, active status, marketing permission, shared-address deduplication and permanent suppression still apply. Existing purchase-based campaigns keep their existing audience type; Everyone on the email list ignores purchase/service criteria.

Delete an old campaign from the mailer list or its editor. Confirm deletion to permanently remove that campaign and its local recipient/activity records. Customer records and unsubscribe preferences are retained. A sending campaign must be stopped first; if its current email is already being handed to SMTP, wait for that handoff to finish before deletion. It cannot recall a message already handed to SMTP. The website retains old tracking/unsubscribe tokens so previously sent links continue working; incoming activity for a deleted campaign is ignored and does not recreate it. Restoring an older POS backup can bring back a campaign deleted after that backup was made.

For an additional real PHP-to-POS integration check (PHP/PDO SQLite installed), run `node scripts/test-marketing-php.cjs`. It prepares tokens against a local PHP server, records an image/click, syncs to the correct local recipient, then confirms/syncs an unsubscribe and verifies future sending is blocked. It sends no SMTP mail. DIAMONDP_TEST_PHP can select the executable; optional DIAMONDP_TEST_PHP_ARGS is a JSON array of PHP flags.
