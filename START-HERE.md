# DiamondPOS v0.3.47 — Campaign map and graphs

Cumulative source overlay for your v0.3.45 or v0.3.46 project on main, including the v0.3.46 confirmed re-subscription and campaign-typing improvements. Verified GitHub main baseline: 3fb26375a27e200487977c86ddb1d4754c546940 (v0.3.45). No Git commit/push/tag, actual provider lookup, real email or hosting deployment was performed here.

## Apply the update

1. Back up the Store Server and private cPanel marketing configuration/database. Pause campaigns and close POS/dev instances.
2. Extract this source ZIP separately, then merge everything inside DiamondPOS-update-v0.3.47 over your existing Git project. Keep .git and other project files. Source only; no installer or customer database included.
3. Upgrade the public cPanel service using the separate v0.3.47 ZIP. Upload all five pos-marketing files: index.php, tracking.php, subscriptions.php, geography.php and .htaccess. Preserve the existing private key/config/database and **restore your custom configPath line in the new index.php**.
4. Follow **extras/cpanel-marketing/GEOGRAPHY-SETUP.md**. Charts work without a geolocation key; new location markers require your own private IPGeolocation.io key, geo_enabled=true and PHP cURL. No API account was created for you and no real request IP was submitted during development. Older activity without geography stays unknown.
5. In PowerShell in your Git project:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

6. Test a campaign restricted to your own opted-in address, then open Marketing → Mailers → campaign → Campaign activity → Campaign insights. Check map/period controls, charts, unknown counts, export, real location lookup, and existing unsubscribe/re-subscribe/typing behavior on your Windows system.
7. When verified, run these commands from that same project folder:

```powershell
git status --short
git add .
git commit -m "Add campaign location map and analytics charts"
git push origin main
git tag v0.3.47
git push origin v0.3.47
```

Only use an unused tag; never move a published tag. If it already exists, choose the next unused release version. GitHub Actions sets installer version from the tag, while package.json keeps its development version. Update the Store Server first, then all tills (schema 34; includes schema 33). Keep campaign sends paused through website/server upgrades. Older consent protocol versions cannot safely process confirmed subscriptions.

## New inside the POS

- Zoomable, pannable world/U.S. mainland map, with open/click markers and aggregate location details. No external map tiles/CDN required.
- Daily trend, activity by Central-Time hour, recipient engagement rings, top locations, full location table, 7/30/90-day/all-time periods and Excel data export.
- Mapped and unknown activity are counted separately. Markers show approximate network-request locations, not customer addresses or proof of a person's whereabouts. Proxies, VPNs, scanners and forwarded email can affect them.
- Optional server-side geolocation is private, bounded/cached and rounds coordinates to0.1°. Missing key, provider failures and quota limits preserve ordinary click/open counts. Unknown/old data is never fabricated or backfilled.

Validation:268 regression checks, TypeScript, production build, real local PHP HTTP, mocked-provider geography checks and a PHP-to-POS integration test with coarse fixture locations. No actual external delivery/provider account or Windows interaction verified here; finish the guide's self-only checks.
