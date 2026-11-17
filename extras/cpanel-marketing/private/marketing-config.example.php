<?php
// Keep the real configuration and SQLite database OUTSIDE public_html. Never commit the real key.
return [
 'api_key' => 'PASTE_64_CHARACTER_KEY_GENERATED_IN_POS',
 'public_url' => 'https://morethanmowers.com/pos-marketing/index.php',
 'database' => __DIR__ . '/marketing.sqlite',
 // Optional coarse map lookup. Enable only after adding your own private provider key.
 'geo_enabled' => false,
 'geo_api_key' => '', // ipgeolocation.io Developer API key; never expose in browser/source.
 'geo_daily_limit' => 900, // Hard application cap, at most 1000; cache reduces lookups.
 'geo_trusted_proxy_cidrs' => [], // Optional trusted Cloudflare source CIDRs only; never trust public forwarded headers by default.
 'store_name' => 'Diamond P Lawn & Garden',
];
