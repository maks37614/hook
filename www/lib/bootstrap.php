<?php
declare(strict_types=1);
require_once __DIR__ . '/Engine.php';
require_once __DIR__ . '/Store.php';
require_once __DIR__ . '/Market.php';
require_once __DIR__ . '/Runner.php';

function bot_config(): array
{
    $file = dirname(__DIR__) . '/config.local.php';
    if (!is_file($file)) throw new RuntimeException('Скопіюйте config.example.php у config.local.php та встановіть власний setup_key (32+ випадкові символи).');
    $config = require $file;
    if (!is_array($config) || empty($config['data_dir'])) throw new RuntimeException('Некоректний config.local.php');
    $config += ['source_url' => 'https://h00k.top/api/paper/formations', 'require_https' => true, 'min_interval_seconds' => 60, 'setup_key' => ''];
    if (!filter_var($config['source_url'], FILTER_VALIDATE_URL) || parse_url($config['source_url'], PHP_URL_SCHEME) !== 'https'
        || parse_url($config['source_url'], PHP_URL_USER) !== null || parse_url($config['source_url'], PHP_URL_QUERY) !== null) throw new RuntimeException('source_url має бути HTTPS без пароля або query');
    return $config;
}

function bot_https(): bool { return !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off'; }
function bot_session(array $config): void
{
    if ($config['require_https'] && !bot_https()) { http_response_code(400); exit('Для роботи потрібен HTTPS. Увімкніть SSL на хостингу.'); }
    ini_set('session.use_strict_mode', '1'); ini_set('session.use_only_cookies', '1');
    session_name('hook_paper');
    session_set_cookie_params(['httponly' => true, 'secure' => bot_https(), 'samesite' => 'Strict', 'path' => '/']);
    session_start();
    header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    header('Referrer-Policy: no-referrer');
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
}
function bot_authenticated(array $state): bool
{
    return isset($_SESSION['auth'], $state['passwordHash'])
        && hash_equals($state['passwordHash'], (string)$_SESSION['auth'])
        && ($_SESSION['lastActivity'] ?? 0) > time() - 1800
        && ($_SESSION['signedIn'] ?? 0) > time() - 43200;
}
function bot_csrf(): void
{
    if (!isset($_POST['csrf']) || !is_string($_POST['csrf']) || !hash_equals($_SESSION['csrf'], $_POST['csrf'])) throw new RuntimeException('Сесію форми втрачено. Оновіть сторінку.');
}
function bot_escape($value): string { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
