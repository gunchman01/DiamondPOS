# DiamondPOS v0.3.46 — Confirmed marketing re-subscriptions

This update adds a website request/confirmation page and a staff request button. The Store Server sends confirmation emails through the SMTP account you already use. Only a valid explicit customer confirmation can remove an unsubscribe; importing a spreadsheet or checking the box still cannot override it. It also reduces campaign-editor typing delays.

No hosting upload, real email, Git commit/push or release was performed here.

## Upgrade your working setup

1. Pause campaigns and back up the POS Store Server plus the private cPanel marketing configuration/database. Save the current public index.php so you have its configured private path.
2. Extract **DiamondPOS-cPanel-marketing-v0.3.46.zip** into the existing website document root. Its pos-marketing folder contains **index.php, tracking.php, subscriptions.php and .htaccess**. Upload all four. If uploading files individually, upload the helper PHP files before index.php. Keep your existing pos-approval pages separate.
3. Restore your actual **configPath** line near the top of the new index.php using the old file as reference. The download uses a placeholder. **Keep your existing private configuration, API key and marketing.sqlite** outside public_html; never replace them with empty/example data. No key rotation, PHP mail() configuration or second SMTP account is needed. PHP 8.3/8.4 with PDO SQLite remains required. New private tables/columns are added automatically without removing old unsubscribe or tracking tokens.
4. Copy the source overlay into your v0.3.45 Git project. Update the Store Server first, then every till. Schema 33 stores confirmation evidence, request delivery audit and durable opt-out identities. The website consent API now requires consent protocol 2: older Store Server versions pause consent syncing/sending until updated. Keep campaigns paused during the short website/server upgrade window.
5. Under **Settings → Email**, save your existing website URL/key only if they changed. Check connection / sync now, then Process confirmation requests now. Request status and recent confirmed permissions appear below the unsubscribe list. The server must remain running with working SMTP for confirmation delivery and consent sync.

## Build, verify and release

From PowerShell in your existing DiamondPOS Git project:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

After the self-address checks below pass:

```powershell
git status --short
git add .
git commit -m "Add confirmed marketing resubscriptions and improve campaign typing"
git push origin main
git tag v0.3.46
git push origin v0.3.46
```

Use that tag only if unused; never move a published tag. If it already exists, choose the next unused release version. GitHub Actions sets installer version from the tag; package.json retains its development version.

## Where customers request marketing emails

For your production service:

https://morethanmowers.com/pos-marketing/index.php?action=subscribe

For staging, if that is the service you have configured:

https://oho.staging.tulsapickem.com/pos-marketing/index.php?action=subscribe

The existing unsubscribe page now includes a Request marketing subscription link. To make it visible on your website, add a footer/navigation link to the production subscription URL after uploading the new files. For example:

```html
<a href="/pos-marketing/index.php?action=subscribe">Subscribe to marketing emails</a>
```

The customer enters the email address already on their customer record and explicitly requests marketing. The response is generic and does not reveal whether the customer exists. This does not create a new customer or change permission. Requests with no matching active customer are ignored by the Store Server without sending mail. Add a new customer separately if needed, then request confirmation.

When the Store Server is online, it checks roughly once a minute and sends the requested confirmation using your existing SMTP account. A customer can receive this specific requested confirmation even when unsubscribed from marketing. The email has no marketing flyer or engagement tracking. Work-order/estimate delivery stays separate.

The link is valid for **24 hours after it is issued**. Opening it only displays a confirmation page; an email scanner's GET request does not subscribe the customer. They must press **Confirm marketing subscription**. The website records the confirmation and removes that address's suppression. The POS then restores OK to email for all matching addresses on its next sync. Inactive customers stay inactive and are excluded from campaigns. Previously skipped campaign messages are not resent; use a future/new campaign.

## Staff request from POS

Open a saved customer, next to OK to email use **Request confirmation email**. Only request it when the customer asked to subscribe. The button uses the saved email address; save any address changes first. Staff confirm the request prompt, but cannot bypass the customer's email confirmation. The button queues a request and reports if a recent request/limit already exists. Check the customer's inbox/spam folder, or Settings → Email → Process confirmation requests now.

If a customer record was open before background consent changed, saving unrelated edits preserves the current server permission when the checkbox/email were unchanged in that form. An intentional checkbox opt-out still creates a new suppression. Importing No can also opt an address out again; importing Yes cannot remove a suppression.

## Safe retries and newer preferences

- Repeated confirmation POSTs are idempotent and retain one consent event.
- A newer unsubscribe invalidates pending/emailed requests. An older confirmation cannot re-enable marketing after that unsubscribe. Request a fresh email after preferences have synchronized.
- A genuine pending local opt-out takes priority over an incoming confirmation. If the POS was offline with an unsent opt-out, reconnect/sync it first and request a new confirmation afterward.
- Restore/replay uploads of old local suppression history are distinguished from genuine new opt-outs. They cannot overwrite a newer confirmed subscription already recorded on the website. A deliberate new opt-out still wins.
- Opt-out change IDs survive retries so a lost response does not turn a retry into a new unsubscribe that cancels a newer confirmation request.
- The confirmation sender saves successful SMTP handoff before acknowledging the website. A lost acknowledgment retries the ACK without another send. A lost/ambiguous SMTP response can still result in an extra confirmation email; SMTP does not provide exactly-once delivery. Such emails never subscribe anyone automatically.
- Failed sends can retry after about five minutes, up to three preparations per request. Ask for a new request if the original expired/was cancelled. The queue processes up to 20 eligible requests per pass, capped by the configured emails-per-minute value. Transactional traffic shares the SMTP provider's overall limits.
- Requests are limited to one per address per five minutes and three per address per day, plus five public requests per IP per hour and an overall service cap. The public form uses a signed expiring form token and a honeypot. Raw IPs are not stored in these counters; hourly HMAC buckets are used and old buckets expire. Generic responses avoid revealing customer membership.

## Test with your own address

1. Use your own active test customer, with the email saved. If testing duplicates, use the same address on another test customer. Do not use actual customer addresses for development tests.
2. Unsubscribe through a delivered marketing email and sync POS. Confirm OK to email clears and the address appears in the suppression list.
3. Request confirmation through the website form or the saved customer's POS button. Confirm permission stays off and imports/checking the box cannot reactivate it.
4. Leave the Store Server running or use Process confirmation requests now. Confirm the email arrives with no marketing tracking image. Check SMTP settings/spam if it does not arrive; the request audit shows send errors.
5. Open the confirmation link but do not press its button. Sync POS; the address must still be suppressed.
6. Press Confirm marketing subscription, then sync POS. All matching customers should have OK to email restored, with a timestamp/request ID in recent confirmed permissions. It should be eligible for a future campaign if active and matching that audience.
7. Unsubscribe again using an older marketing email. Open/POST the old confirmation link again; it must not reactivate the address. A new request/confirmation is required.
8. In a campaign with a large flyer, type a name, subject and message. Inputs update immediately; the preview follows after a 250 ms pause. Status/list refreshes no longer download the full image repeatedly. Verify responsiveness on your Windows PC.

## Backups and recovery

Keep the private website configuration/database in cPanel backups, separately from POS backups. It holds old emailed tokens, consent history, confirmation requests and tracking. POS backups include synchronized evidence/audit and outstanding local opt-outs, but not the website database. Keep old endpoints/private databases for previously sent links.

After restoring, use Replay suppression history and Replay activity history, then inspect the current customer permission and confirmation evidence. Website events now represent both unsubscribe and confirmed subscription, in order. Replaying them must finish at the latest known preference. Replay cannot recreate history missing from the website backup, attach activity to a delivery identity absent from the POS backup, or reconstruct old tokens. A website restore that loses confirmations may conservatively require another confirmation. Do not downgrade to a sender/server that does not understand consent protocol 2.

The website permanently retains confirmation audit (request identity, address, timestamp and consent event) and hashed confirmation tokens. Confirmation is specific to the email address, not proof of a named person's identity. No browser cookies are needed for the forms, and marketing opens remain estimates; forwarding/deletion cannot be identified.

## Existing functionality retained

Campaign open/click results, service-history audiences, safe campaign deletion, customer duplicate handling and imports still honor consent. Tracking runs independently from the subscription queue. Turning off tracking affects future campaign messages; it does not disable unsubscribe checks. Turning off the entire consent service pauses marketing and confirmation requests. Work-order/estimate emails and SMTP configuration tests stay independent.

A website campaign composer/provider webhook/inbox reader is not included. Reply-based opt-outs still need staff to clear OK to email. The subscription page is a separate page inside your existing website service, while campaign results remain in POS Marketing.

## Verification provided

261 regression checks, TypeScript and production build passed. Real local PHP/SQLite HTTP tests cover old unsubscribe links, tracking, public requests, expiration, confirmation-only re-subscribe, repeated/stale links, protocol protection and restore intent. A real PHP-to-POS SQLite integration test covers queued confirmation through mocked SMTP, re-subscribe sync, restoration and later opt-out. No real email was sent.

With PHP/PDO SQLite installed, optional checks are:

```powershell
python tests/cpanel/marketing-service.py
node scripts/test-marketing-php.cjs
```

DIAMONDP_TEST_PHP selects the PHP executable; DIAMONDP_TEST_PHP_ARGS optionally supplies a JSON array of PHP flags. Your actual cPanel path/permissions, external email delivery and Windows typing behavior still need the self-address/UI checks above.
