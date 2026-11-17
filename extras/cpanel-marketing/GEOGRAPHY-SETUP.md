# DiamondPOS v0.3.47 — Campaign map and charts

Campaign results remain inside **POS → Marketing → Mailers → open a sent/stopped campaign → Campaign activity → Campaign insights**. This includes an interactive world/U.S. mainland map, daily opens/clicks trend, hourly activity, recipient engagement rings, top locations, full location table and Excel data export. Choose 7/30/90 days or all time. Charts use America/Chicago (Central Time).

Locations are estimates of where a tracking image/link request appeared to originate. They are not customer addresses or proof of a person's whereabouts. Privacy proxies, VPNs, scanners and forwarded messages can change them. Old activity without geography remains unknown and cannot be backfilled; no IP history was retained for that purpose. Counts include unknown locations.

## Apply source and cPanel updates

This is a cumulative source overlay containing v0.3.46 re-subscription/typing improvements. It can be applied over v0.3.45 or v0.3.46. GitHub main baseline when prepared: 3fb26375a27e200487977c86ddb1d4754c546940 (v0.3.45). No commit, push, tag, real email, provider lookup or hosting deployment was made here.

1. Back up the Store Server and private website marketing directory/database. Pause campaigns and close POS/dev instances.
2. Merge the source ZIP into your existing Git project, preserving .git and other files.
3. Extract **DiamondPOS-cPanel-marketing-v0.3.47.zip** in the same website document root. It contains **pos-marketing/index.php, tracking.php, subscriptions.php, geography.php and .htaccess**. Upload all five files; upload helpers before index.php if uploading separately. Keep pos-approval separate.
4. Preserve your existing private configuration, API key and marketing.sqlite. **Restore your actual configPath line in the new public index.php**. Never overwrite private data with the example. PHP/PDO SQLite remains required; PHP cURL is needed only for live location lookups.
5. Update the Store Server first, then all tills (schema 34; includes schema 33 if needed). For confirmed re-subscription setup also see CPANEL-SETUP.md. Do not downgrade to older consent protocol versions.

From PowerShell in your existing Git project:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

After validating on your PC:

```powershell
git status --short
git add .
git commit -m "Add campaign location map and analytics charts"
git push origin main
git tag v0.3.47
git push origin v0.3.47
```

Only use an unused tag. Never move an existing published tag; choose the next unused version if v0.3.47 already exists. Installer version comes from the GitHub Actions tag; package.json keeps its development version.

## Enable approximate locations (optional, private)

The map requires your own **IPGeolocation.io** API key. The charts work without it. At preparation time the provider documents a free Developer tier with 1,000 credits/day, commercial use allowed and no overage charges on Free. Review current terms before choosing a plan:

- https://ipgeolocation.io/faq.html
- https://ipgeolocation.io/pricing.html
- https://ipgeolocation.io/documentation/ip-location-api.html

Create your own provider account/key; no account was created for you. In your existing **private marketing-config.php outside public_html**, add these entries inside the returned array, keeping the other settings:

```php
'geo_enabled' => true,
'geo_api_key' => 'YOUR_PRIVATE_IPGEOLOCATION_IO_KEY',
'geo_daily_limit' => 900,
'geo_trusted_proxy_cidrs' => [],
```

Do not put the key in a public file, browser JavaScript, Git, a screenshot or a chat message. No POS field or public page exposes it. To turn location collection off, set geo_enabled to false. This stops new lookups but preserves prior coarse locations and ordinary tracking. Tracking disabled in POS stops adding tracking to future sends; old sent links still work under the existing rules.

Enable PHP cURL on cPanel. The service uses HTTPS with certificate checks, no redirects, a 700 ms connect timeout and a 1.5 second total timeout. It calls the fixed provider v3/ipgeo endpoint. Existing private IP/loopback requests and obvious bot/prefetch/HEAD traffic are not geolocated. Provider failures, missing key, budget exhaustion or unavailable cURL produce unknown locations while preserving normal open/click collection and fixed-destination click redirects. Provider error messages shown in POS do not expose its key or raw IP.

The application caps new lookups at 900/day by default (configurable 1–1000), counting failures too. The free provider key may also be used elsewhere, so its remaining credits can be lower; HTTP 429/other errors remain unknown. A daily HMAC cache reuses a coarse result for repeated requests from that IP, expires within 24 hours and never stores the raw IP. Failed lookup results are cached briefly. In the activity record only city, region, country, country code, source and latitude/longitude rounded to 0.1° are retained. No exact device/GPS position is collected. The provider receives the request IP transiently for its lookup; its terms/logging and your hosting access logs are separate from the POS activity database.

## Reverse proxies / Cloudflare

By default only REMOTE_ADDR is used. Public forwarded headers are ignored to prevent spoofed locations. If a reverse proxy makes REMOTE_ADDR represent the proxy rather than the visitor, the result may reflect the proxy.

For an actual Cloudflare deployment you can explicitly configure its verified source CIDR ranges in geo_trusted_proxy_cidrs. Only when REMOTE_ADDR belongs to one of those configured ranges will CF-Connecting-IP be accepted. Do not use a universal 0.0.0.0/0 or ::/0 trust range. Get current ranges from your proxy provider; no ranges are guessed or automatically downloaded. X-Forwarded-For is not trusted. If unsure, leave the list empty and investigate your hosting setup before relying on map locations.

## Read and verify the dashboard

1. Configure location lookup privately, then create an actual campaign whose audience is restricted to your own opted-in test address. Send test and transactional emails intentionally have no campaign metrics.
2. Include a full HTTPS URL in the message, send the real self-only campaign, open its HTML with remote images allowed and click the message link. Your apparent location may be a privacy relay; this is expected and not proof of actual whereabouts.
3. Leave the Store Server running for about a minute or choose Sync insights. Open the campaign and scroll to Campaign insights. A successful public-IP lookup should add a marker and a location row. With no key/lookup error, counts still appear with unknown-location totals and a setup/status message.
4. Use World/U.S. mainland, +/− and drag to pan. Select a marker for aggregate opens/clicks and distinct campaign recipients. Keyboard users can focus a marker and press Enter/Space. Switch the map between opens and clicks. Larger markers represent more observed requests.
5. Select the report period. Daily/hourly counts are observed requests after existing duplicate suppression, not unique people. Engagement rings show distinct recipients with period activity divided by all successfully sent tracked messages for that campaign; clicks can occur with no recorded open. The map/top-location table excludes unknown coordinates but the totals/charts include them. The recipient activity table below remains its existing all-time view.
6. Export charts data creates an Excel file of summary, daily activity and coarse locations. There is no public dashboard and no external map-tile/CDN request; the bundled outline uses Natural Earth public-domain data.
7. Turn geo_enabled off, or test an invalid provider key using your own account settings. New clicks must still reach their original destination and activity remains countable even when location is unknown. Restore correct configuration afterward.

Historical activity with no stored location stays unknown. A replay must not invent or double-count markers; it reuses the same event identity. No demo locations or customer-address substitutions are inserted into your data. Tests use explicitly labeled local fixtures and no real third-party lookup.

## Backups and testing

Back up the private website SQLite/config independently of POS backups; it now includes coarse geo/cache/status fields alongside old consent, confirmation and tracking records. POS backups include synchronized locations. Preserve old tokens and endpoints for sent emails. Existing unsubscribe/new-confirmation protections remain unchanged. Replay cannot restore location never captured or recreate website data absent from backup.

268 regression checks, TypeScript, production build, real PHP HTTP tests, mocked-provider geography tests and a PHP-to-POS integration check passed. Tests verify grouping, Central Time, unknowns, paired API, deduplication, coarse coordinates, caching, trusted proxies, quotas and safe failures. No actual provider account/key lookup, external email delivery, cPanel deployment or Windows map interaction was performed here. Complete the self-only test above on your environment.

Optional PHP/PDO SQLite tests:

```powershell
python tests/cpanel/marketing-service.py
php tests/cpanel/geography.php
node scripts/test-marketing-php.cjs
```

See MAP-DATA-NOTICE.md for outline provenance and location-data limitations.
