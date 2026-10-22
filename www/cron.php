<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
$store = null;
try {
    $config = bot_config();
    if (PHP_SAPI !== 'cli' && $config['require_https'] && !bot_https()) { http_response_code(400); exit('{"error":"HTTPS required"}'); }
    $store = new Store($config['data_dir']);
    $state = $store->read();
    if (!$state || empty($state['passwordHash']) || empty($state['cronToken'])) { http_response_code(503); exit('{"error":"Setup required"}'); }
    if (PHP_SAPI !== 'cli') {
        if (!in_array($_SERVER['REQUEST_METHOD'], ['GET','POST'], true)) { http_response_code(405); exit('{"error":"Method not allowed"}'); }
        $received = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (!is_string($received) || !hash_equals('Bearer ' . $state['cronToken'], $received)) { http_response_code(401); exit('{"error":"Unauthorized"}'); }
    }
    if (!$store->acquire()) { http_response_code(409); exit('{"status":"already_running"}'); }
    $state = $store->read();
    if (PHP_SAPI !== 'cli' && !hash_equals('Bearer ' . $state['cronToken'], $received)) { http_response_code(401); exit('{"error":"Unauthorized"}'); }
    $now = time();
    if ($now - $state['lastRun'] < max(60, (int)$config['min_interval_seconds'])) { http_response_code(200); exit('{"status":"too_soon"}'); }
    $result = Runner::run($state, $config, new Market(), $now);
    $store->write($state);
    if ($result['status'] === 'degraded' || $result['status'] === 'cooldown') http_response_code(503);
    echo json_encode($result, JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    http_response_code(500);
    // Never return filesystem paths, credentials or response bodies to scheduler clients.
    echo '{"error":"Bot failed; check setup, storage permissions and authenticated dashboard"}';
} finally { if ($store) $store->release(); }
