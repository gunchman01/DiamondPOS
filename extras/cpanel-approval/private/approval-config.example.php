<?php
// Copy OUTSIDE every public website/document root. Rename to approval-config.php.
// Paste the same 64-character generated key into DiamondPOS Work Order Settings.
return [
    'api_key' => 'REPLACE_WITH_64_CHARACTER_GENERATED_KEY',
    'database' => __DIR__ . '/approval.sqlite',
    'store_name' => 'Diamond P Lawn and Garden',
    'test_mode' => true, // Keep true on staging. This does not simulate decisions; use test tickets only.
];
