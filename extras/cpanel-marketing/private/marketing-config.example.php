<?php
// Keep the real configuration and SQLite database OUTSIDE public_html. Never commit the real key.
return [
 'api_key' => 'PASTE_64_CHARACTER_KEY_GENERATED_IN_POS',
 'public_url' => 'https://morethanmowers.com/pos-marketing/index.php',
 'database' => __DIR__ . '/marketing.sqlite',
 'store_name' => 'Diamond P Lawn & Garden',
];
