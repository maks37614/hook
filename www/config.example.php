<?php
// Copy to config.local.php. Never commit real keys.
return [
    // Choose a random 32+ character installation key. Required once, in the setup form.
    'setup_key' => 'REPLACE_WITH_A_RANDOM_KEY_AT_LEAST_32_CHARACTERS',
    // This directory MUST be writable and outside the public web root.
    'data_dir' => dirname(__DIR__) . '/.hook-paper-private',
    'source_url' => 'https://h00k.top/api/paper/formations',
    'require_https' => true,
    'min_interval_seconds' => 60,
];
