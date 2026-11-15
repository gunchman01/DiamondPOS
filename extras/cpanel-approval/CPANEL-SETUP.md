# DiamondPOS estimate approvals — cPanel staging setup

Target staging folder: **https://oho.staging.tulsapickem.com/pos-approval/**

This is a working PHP approval service, not a static page. Customer decisions can change the connected POS ticket and inventory. Keep `test_mode` true on staging and use test customers/work orders only. This package has not been uploaded to your server.

## 1. Check PHP support

In cPanel, use your PHP selector / MultiPHP Manager to select **PHP 8.3 or 8.4**, with **PDO SQLite** and sessions available for the staging domain. If extension selection is unavailable, ask your host whether PDO SQLite is enabled. The app needs no MySQL account; it creates a private SQLite file.

Use working HTTPS. The production PHP handler rejects plain HTTP. An Apache/CGI server with PHP execution is required; static-only hosting cannot run this service.

## 2. Upload the public files

1. In cPanel → Domains, find the actual document root for **oho.staging.tulsapickem.com**. Open THAT folder in File Manager. Do not assume it is the main site's public_html folder.
2. Upload **DiamondPOS-cPanel-public-v0.3.34.zip** there and extract it.
3. You should now have **pos-approval/index.php** and the folder's Apache configuration. Your existing home page and website files stay in place.
4. Remove the uploaded ZIP after extracting it. Do not upload the POS source update ZIP, a database, or the private configuration into the public website.

The public folder alone intentionally does not activate the service.

## 3. Create the private folder and configuration

1. In cPanel File Manager, go to your account HOME (normally `/home/YOUR_CPANEL_USERNAME`), above public_html and outside every domain's document root.
2. Create **diamondpos-private** there. Restrict directory permissions to your hosting account (typically 700; follow your host's PHP-user permission requirements). Do not use 777.
3. Create **approval-config.php** inside this private folder, using `private/approval-config.example.php` from the POS update's `extras/cpanel-approval` folder as the template:

```php
<?php
return [
    'api_key' => 'PASTE_GENERATED_64_CHARACTER_KEY_HERE',
    'database' => __DIR__ . '/approval.sqlite',
    'store_name' => 'Diamond P Lawn and Garden',
    'test_mode' => true,
];
```

4. In DiamondPOS → Work Orders → Work order settings → Estimate approvals & customer follow-up, click **Generate key**. Copy that key into this PRIVATE configuration's `api_key` and save. Keep the key private; do not post it in chat or put the real configuration in Git.
5. In the PUBLIC `pos-approval/index.php`, edit the configuration path near the top. Replace only the placeholder path with your actual private file path, for example:

```php
$configPath = getenv('DIAMONDP_APPROVAL_CONFIG') ?: '/home/YOUR_CPANEL_USERNAME/diamondpos-private/approval-config.php';
```

The public file contains only the private configuration's path, not the secret itself. The service refuses configuration/database paths inside its document root. It creates `approval.sqlite` and a `sessions` subfolder in the private area when needed. Include the PRIVATE folder in your hosting backups.

## 4. Connect the test POS

1. Apply the POS source update, and update the Store Server first, then tills.
2. In the same approval settings card, use **https://oho.staging.tulsapickem.com/pos-approval/** and the generated key.
3. Click **Save & test connection**. The website must return a verified service/database identity. If it fails, fix the setup before proceeding.
4. Check **Enable online estimate approvals**, then **Save approval settings**.
5. Leave customer-call flags enabled; the default is **3 calendar days**, adjustable from 1–90.

This settings card has its own Save button. Blank key means keep the saved key; the saved key is not returned to tills. If you lose the key, resolve/cancel outstanding estimates before rotating it on both sides.

## 5. Test the full flow

Use a test customer email address you control and test inventory. No real emails were sent during development tests.

1. Open a test work order in **Needs Estimate**. Add diagnosis/parts/labor and check the total.
2. Choose **Send estimate for decision**, review the preview, then **Send estimate & start follow-up timer**.
3. After a successful email send, the ticket moves to **Waiting on Customer**. Parts stay in stock at this stage. A failed send leaves no running follow-up timer.
4. Open the received estimate email. Click either review button. The website shows the specific revision, itemized estimate, total and parts availability notice. Opening the link does not make a decision.
5. Enter your name, choose Approve or Decline, and confirm. The response is recorded on the website; no payment is taken.
6. Use **Check customer responses now** in POS settings, or wait about a minute while the Store Server runs. A matching approval moves to **Approved to Fix** and deducts parts once. A decline moves to **Not Fixed**. Both clear the follow-up flag. Ticket history records the name, timestamp, revision and comments. Repeat checks must not deduct stock again.
7. Close the POS, record a test website response, then reopen the POS. It should collect that response on its next check. No inbound router port or access to the store LAN is needed.
8. Change a sent estimate's amount/details and test its OLD link. A new revision invalidates unanswered older links on the website. If a response arrives before a cancellation sync, POS places the stale decision in **review**, rather than authorizing the changed repair.
9. Move back to Needs Estimate/Waiting on Customer and **Send revised estimate** to request fresh approval. Approved repairs with changed details/totals cannot be checked out until the current revision is approved.
10. To test follow-up normally, leave an estimate unanswered for the configured period. **Needs customer call** shows on the ticket/list and in its list filter. **Record call & remind again** logs contact and sets another reminder. The timer never automatically approves, declines or cancels a ticket.

The work-order list and an idle ticket refresh every 30 seconds. The ticket pauses refresh while notes, a dialog or an input are being edited. Calendar-day reminders use elapsed 24-hour periods, not business days. Turning off follow-up flags hides reminders without deleting history; changing the default day setting recalculates unsnoozed pending estimates.

## Troubleshooting

- **503 / setup needs attention:** verify the private path, directory permissions, PHP version and PDO SQLite. Check the hosting PHP error log. Never publish a phpinfo page or send secret configuration contents.
- **401 / integration authentication:** the private key must exactly match the POS key. Requests use the `X-DiamondPOS-Key` header. Ask your host to allow this header if a security rule strips it.
- **500 after upload:** the host may restrict Apache directory directives. Ask the host about the folder's Apache configuration; it only disables directory listing and blocks database/log files. Do not weaken the private-folder separation.
- **HTTPS rejected even though the browser uses HTTPS:** ask your hosting provider to pass the HTTPS indicator correctly to PHP behind its proxy. Do not disable the HTTPS requirement.
- **Plain folder URL says open the link from your email:** expected. No estimate is publicly listed; use the private token URL from a test estimate email. Test connection validates setup without a customer link.
- **Email fails:** use the shop's existing SMTP setup in DiamondPOS. Failed/uncertain sends cannot authorize a repair. Retry by sending a new estimate revision. An interrupted prepared estimate can be cancelled from the ticket.
- **Pending after website response:** ensure the Store Server is open, sending is enabled in approval settings, and Check responses now succeeds. Read the settings card's last error/time. This connection is independent from QuickBooks Web Connector.
- **Decision needs review:** a ticket, estimate, stage or connection changed. Contact the customer and issue the correct revision. Do not treat it as automatic approval.
- **Link expired/replaced:** links expire after 30 days. Send a fresh estimate. Customers cannot change a recorded decision through the old form; they must contact the shop.
- **Website database identity changed:** the service database was replaced/restored or the URL changed. Resolve/cancel pending estimates before reconfiguring. Do not silently attach another POS store/database to the same service.

## Move to morethanmowers.com later

Resolve/cancel staging estimates first. Upload the same public folder to the new site's document root and use a NEW private folder/database/key for production. Update the configuration path. In the POS change the website URL and key, Save & test, then enable and save again. Both `morethanmowers.com` and `www.morethanmowers.com` are allowed HTTPS hosts; use the final canonical address without redirects.

After testing, set `test_mode` false in the PRODUCTION private configuration. This flag changes the staging banner; it is not a simulation mode and never prevents POS updates. Do not copy staging customer approvals into production. Do not switch URLs while decisions are outstanding.

## What the approval proves

Each response is tied to one stored estimate revision and total, with the entered name, timestamp and comments. The private link acts as access to that estimate; anyone the customer forwards it to could respond. It does not independently verify identity, accept card details, take payment, or read email replies. Treat the link and hosting backups as private business records.

Implementation references: PHP PDO SQLite and session security documentation:
https://www.php.net/manual/en/ref.pdo-sqlite.php
https://www.php.net/manual/en/session.security.ini.php
