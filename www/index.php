<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/Settings.php';
$error = ''; $notice = ''; $state = null; $authenticated = false;
try {
    $config = bot_config(); bot_session($config);
    $store = new Store($config['data_dir']); $state = $store->read();
    $authenticated = $state && bot_authenticated($state);
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        bot_csrf();
        if (!$store->acquire()) throw new RuntimeException('Бот обробляє ринок. Спробуйте знову за кілька секунд.');
        try {
            $state = $store->read();
            $authenticated = $state && bot_authenticated($state);
            $action = $_POST['action'] ?? '';
            if (!$state || !$authenticated) {
                $key = $config['setup_key'];
                if (empty($state['passwordHash']) && (strlen($key) < 32 || strpos($key, 'REPLACE_') === 0)) throw new RuntimeException('Спочатку задайте випадковий setup_key у config.local.php');
                // Persistent throttling, including setup; bounded to 100 IP hashes.
                $gate = $state ?? Engine::fresh();
                $gate['attempts'] = array_filter($gate['attempts'] ?? [], static function ($a) { return $a['until'] > time(); });
                $ip = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
                $attempt = $gate['attempts'][$ip] ?? ['count' => 0, 'until' => time() + 600];
                if ($attempt['count'] >= 8 || count($gate['attempts']) >= 100 && !isset($gate['attempts'][$ip])) throw new RuntimeException('Забагато спроб. Повторіть через 10 хвилин.');
                $attempt['count']++; $gate['attempts'][$ip] = $attempt;
                // A setup gate is not an initialized installation: no passwordHash until setup succeeds.
                $store->write($gate);
                $password = $_POST['password'] ?? '';
                if (!is_string($password) || strlen($password) > 72) throw new RuntimeException('Некоректний пароль');
                if (empty($state['passwordHash'])) {
                    $setup = $_POST['setup_key'] ?? '';
                    if (!is_string($setup) || !hash_equals($key, $setup)) throw new RuntimeException('Неправильний ключ інсталяції');
                    if (strlen($password) < 12) throw new RuntimeException('Пароль: щонайменше 12 символів');
                    if (!hash_equals($password, (string)($_POST['password_confirm'] ?? ''))) throw new RuntimeException('Паролі не збігаються');
                    $state = $gate;
                    $state['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
                    $state['cronToken'] = bin2hex(random_bytes(32)); $state['sourceToken'] = '';
                    $state['createdAt'] = time(); $state['attempts'] = [];
                    $store->write($state);
                } else {
                    if (!password_verify($password, $state['passwordHash'])) throw new RuntimeException('Неправильний пароль');
                    $state = $gate; unset($state['attempts'][$ip]); $store->write($state);
                }
                session_regenerate_id(true);
                $_SESSION['auth'] = $state['passwordHash']; $_SESSION['signedIn'] = time(); $_SESSION['lastActivity'] = time();
                $_SESSION['csrf'] = bin2hex(random_bytes(24));
                header('Location: index.php'); exit;
            }
            if ($action === 'logout') { $_SESSION = []; session_destroy(); header('Location: index.php'); exit; }
            if ($action === 'settings') {
                $s = bot_settings($_POST, $state['settings'], count($state['positions']) + count($state['history']) > 0);
                if (count($state['positions']) + count($state['history']) === 0) { $state['balance'] = $s['initialBalance']; $state['peakEquity'] = $s['initialBalance']; $state['equityCurve'] = []; $state['maxDrawdownPct'] = 0; }
                $state['settings'] = $s;
                $token = $_POST['sourceToken'] ?? '';
                if (!is_string($token)) throw new RuntimeException('Некоректний токен');
                if ($token !== '') {
                    if (!preg_match('/^[A-Za-z0-9_.-]{32,256}$/D', $token)) throw new RuntimeException('Токен: 32–256 символів A–Z, a–z, 0–9, _, -, .');
                    $state['sourceToken'] = $token;
                }
                $notice = 'Налаштування збережено. Відкриті угоди зберігають свої рівні та комісії.';
            } elseif ($action === 'toggle') {
                if (!$state['settings']['enabled'] && empty($state['sourceToken'])) throw new RuntimeException('Спочатку збережіть токен каналу формацій');
                $state['settings']['enabled'] = !$state['settings']['enabled'];
                $notice = $state['settings']['enabled'] ? 'Нові входи дозволено.' : 'Нові входи вимкнено; відкриті угоди продовжують перевірятися cron-запусками.';
            } elseif ($action === 'close') {
                $id = $_POST['id'] ?? '';
                if (!is_string($id) || !isset($state['positions'][$id])) throw new RuntimeException('Позицію не знайдено');
                $state['positions'][$id]['closeRequested'] = true;
                $notice = 'Запит закриття збережено. Бот спершу перевірить історію стопа/цілі, потім закриє за свіжою ціною наступного запуску.';
            } elseif ($action === 'rotate') {
                $state['cronToken'] = bin2hex(random_bytes(32));
                $notice = 'Ключ cron змінено. Оновіть Authorization у планувальнику.';
            } elseif ($action === 'password') {
                if (!password_verify((string)($_POST['current_password'] ?? ''), $state['passwordHash'])) throw new RuntimeException('Неправильний поточний пароль');
                $password = (string)($_POST['new_password'] ?? '');
                if (strlen($password) < 12 || strlen($password) > 72) throw new RuntimeException('Пароль: 12–72 байти');
                $state['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
                $_SESSION['auth'] = $state['passwordHash']; session_regenerate_id(true);
                $notice = 'Пароль змінено; інші сесії втратили доступ.';
            } else throw new RuntimeException('Невідома дія');
            $store->write($state);
            $_SESSION['notice'] = $notice;
            header('Location: index.php'); exit;
        } finally { $store->release(); }
    }
    $authenticated = $state && !empty($state['passwordHash']) && bot_authenticated($state);
    if ($authenticated) {
        $_SESSION['lastActivity'] = time();
        if (($_GET['export'] ?? '') === 'csv') {
            header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="hook-paper-history.csv"');
            $out = fopen('php://output', 'w'); fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['id','exchange','market','symbol','timeframe','formation','direction','opened_utc','closed_utc','entry','stop','target','exit','qty','gross_pnl','entry_fee','exit_fee','net_pnl','reason','ambiguous'], ',', '"', '');
            foreach ($state['history'] as $p) {
                $row = [$p['id'],$p['exchange'],$p['marketType'],$p['symbol'],$p['timeframe'],$p['pattern'],$p['direction'] === 1 ? 'LONG' : 'SHORT',gmdate('c',$p['openedAt']),gmdate('c',$p['closedAt']),$p['entry'],$p['stop'],$p['target'],$p['exit'],$p['qty'],$p['grossPnl'],$p['entryFee'],$p['exitFee'],$p['netPnl'],$p['reason'],$p['ambiguous'] ? 'yes' : 'no'];
                foreach ($row as &$cell) if (is_string($cell) && preg_match('/^[=+@\-\t\r\n]/', $cell)) $cell = "'" . $cell;
                unset($cell); fputcsv($out, $row, ',', '"', '');
            }
            fclose($out); exit;
        }
    }
    $notice = $_SESSION['notice'] ?? ''; unset($_SESSION['notice']);
} catch (Throwable $exception) { $error = $exception->getMessage(); }
function e($v): string { return bot_escape($v); }
function n($v, int $decimals = 2): string { return number_format((float)$v, $decimals, '.', ' '); }
function stamp($v): string { return $v ? gmdate('d.m.Y H:i:s', (int)$v) . ' UTC' : 'ще не було'; }
function csrf(): string { return '<input type="hidden" name="csrf" value="' . e($_SESSION['csrf'] ?? '') . '">'; }
function option_field(string $key, string $label, array $options, array $s): void {
    echo '<label>' . e($label) . '<select name="' . e($key) . '">';
    foreach ($options as $value => $text) echo '<option value="' . e($value) . '"' . ((string)$s[$key] === (string)$value ? ' selected' : '') . '>' . e($text) . '</option>';
    echo '</select></label>';
}
function number_field(string $key, string $label, array $s, string $min, string $max, string $step = 'any'): void {
    echo '<label>' . e($label) . '<input type="number" required name="' . e($key) . '" min="' . e($min) . '" max="' . e($max) . '" step="' . e($step) . '" value="' . e($s[$key]) . '"></label>';
}
?>
<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>HOOK · Paper Bot</title><link rel="stylesheet" href="assets/style.css"></head><body>
<div class="shell"><header><a class="brand" href="index.php"><span class="logo">H</span> HOOK <span class="sub">PAPER BOT</span></a><span class="badge">Віртуальний рахунок · USDT</span></header>
<?php if ($error): ?><div class="alert error"><?=e($error)?></div><?php endif; ?>
<?php if (!$authenticated): $setup = empty($state['passwordHash']); ?>
<main class="auth"><p class="eyebrow">ВАШ ОКРЕМИЙ ТОРГОВИЙ ЖУРНАЛ</p><h1><?=$setup ? 'Перший запуск' : 'Вхід до бота'?></h1><p class="muted">Формації з h00k.top. Віртуальні угоди. Контроль кожного входу.</p>
<?php if (isset($config)): ?><form method="post"><?=csrf()?>
<?php if ($setup): ?><label>Ключ інсталяції з config.local.php<input name="setup_key" type="password" required autocomplete="off"></label><?php endif; ?>
<label><?=$setup ? 'Створіть пароль (від 12 символів)' : 'Пароль'?><input name="password" type="password" required minlength="<?=$setup ? 12 : 1?>" maxlength="72" autocomplete="<?=$setup ? 'new-password' : 'current-password'?>"></label>
<?php if ($setup): ?><label>Повторіть пароль<input name="password_confirm" type="password" required minlength="12" maxlength="72" autocomplete="new-password"></label><?php endif; ?>
<button class="primary" type="submit"><?=$setup ? 'Створити захищений кабінет' : 'Увійти'?></button></form><?php endif; ?></main>
<?php else:
$s = $state['settings']; $equity = Engine::equity($state); $history = $state['history'];
$net = array_sum(array_column($history, 'netPnl')); $wins = count(array_filter($history, static function ($p) { return $p['netPnl'] > 0; }));
$profit = array_sum(array_map(static function ($p) { return max(0, $p['netPnl']); }, $history));
$loss = -array_sum(array_map(static function ($p) { return min(0, $p['netPnl']); }, $history));
$fees = array_sum(array_column($history, 'entryFee')) + array_sum(array_column($history, 'exitFee')) + array_sum(array_column($state['positions'], 'entryFee'));
$late = $state['lastRun'] < time() - 180;
?>
<?php if ($notice): ?><div class="alert success"><?=e($notice)?></div><?php endif; ?>
<section class="hero"><div><p class="eyebrow">ФОРМАЦІЇ → СИГНАЛ → ВІРТУАЛЬНА УГОДА</p><h1>Ринок. Рішення. Результат.</h1><p class="muted">Бот <?=$s['enabled'] ? 'приймає нові сигнали' : 'на паузі для нових входів'?> · оновлення через cron · усі суми в USDT</p></div><div class="actions"><form method="post"><?=csrf()?><input type="hidden" name="action" value="toggle"><button class="<?=$s['enabled'] ? '' : 'primary'?>" type="submit"><?=$s['enabled'] ? 'Пауза входів' : 'Увімкнути входи'?></button></form><a class="button" href="index.php">Оновити</a><form method="post"><?=csrf()?><input type="hidden" name="action" value="logout"><button type="submit">Вийти</button></form></div></section>
<div class="status <?=$late ? 'warning' : 'healthy'?>"><span class="dot"></span><?=$late ? 'Cron не запускався понад 3 хвилини — перевірте планувальник' : 'Останній запуск: ' . e(stamp($state['lastRun']))?><span>Свіжий канал формацій: <?=e(stamp($state['lastSource']))?></span></div>
<?php foreach ($state['sourceWarnings'] ?? [] as $warning): ?><div class="alert error"><?=e($warning)?></div><?php endforeach; ?>
<?php foreach (['sourceError','lastError'] as $key): if ($state[$key]): ?><div class="alert error"><?=e($state[$key])?></div><?php endif; endforeach; ?>
<section class="metrics"><article><p>Еквіті <small>із відкритим P&amp;L</small></p><strong><?=n($equity)?></strong><span class="<?=($equity - $s['initialBalance']) >= 0 ? 'positive' : 'negative'?>"><?=n(($equity / $s['initialBalance'] - 1) * 100)?>% від старту</span></article><article><p>Баланс</p><strong><?=n($state['balance'])?></strong><span>Старт: <?=n($s['initialBalance'])?></span></article><article><p>Чистий P&amp;L закритих</p><strong class="<?=$net >= 0 ? 'positive' : 'negative'?>"><?=n($net)?></strong><span>Комісії всіх угод: <?=n($fees)?></span></article><article><p>Win rate</p><strong><?=count($history) ? n($wins / count($history) * 100, 1) : '0'?>%</strong><span><?=count($history)?> завершених · PF <?=$loss > 0 ? n($profit / $loss) : ($profit > 0 ? '∞' : '—')?></span></article><article><p>Макс. просадка</p><strong><?=n($state['maxDrawdownPct'])?>%</strong><span>За спостереженнями cron</span></article><article><p>Відкрито позицій</p><strong><?=count($state['positions'])?><small> / <?=e($s['maxPositions'])?></small></strong><span>Нереалізований P&amp;L: <?=n($equity - $state['balance'])?></span></article></section>
<section class="panel"><div class="section-title"><div><h2>Відкриті позиції</h2><p>Рівні входу, стопа й цілі фіксуються під час відкриття.</p></div><span class="badge"><?=e($s['timeframe'])?> · <?=e($s['exchange'])?> · <?=e($s['marketType'])?></span></div><div class="table-wrap"><table><thead><tr><th>Інструмент / формація</th><th>Напрямок</th><th>Вхід / кількість</th><th>Стоп / ціль</th><th>Ціна / P&amp;L</th><th>Відкриття / статус</th><th></th></tr></thead><tbody>
<?php foreach ($state['positions'] as $p): $pnl = ($p['mark'] - $p['entry']) * $p['qty'] * $p['direction']; ?><tr><td><b><?=e($p['symbol'])?></b><small><?=e($p['exchange'] . ' · ' . $p['marketType'])?></small><small><?=e($p['pattern'])?></small></td><td><span class="<?=$p['direction'] === 1 ? 'positive' : 'negative'?>"><?=$p['direction'] === 1 ? 'LONG' : 'SHORT'?></span><small>R:R <?=n($p['rr'])?></small></td><td><?=n($p['entry'], 8)?><small>Qty <?=n($p['qty'], 8)?></small></td><td><span class="negative"><?=n($p['stop'], 8)?></span><small class="positive"><?=n($p['target'], 8)?></small></td><td><?=n($p['mark'], 8)?><small class="<?=$pnl >= 0 ? 'positive' : 'negative'?>"><?=n($pnl)?></small><small><?=e(stamp($p['markAt']))?></small></td><td><?=e(stamp($p['openedAt']))?><small class="negative"><?=e($p['monitorError'])?></small><?php if (!empty($p['closeRequested'])): ?><small>Очікує закриття</small><?php endif; ?></td><td><form method="post"><?=csrf()?><input type="hidden" name="action" value="close"><input type="hidden" name="id" value="<?=e($p['id'])?>"><button type="submit">Закрити</button></form></td></tr><?php endforeach; ?>
<?php if (!$state['positions']): ?><tr><td colspan="7" class="empty">Позицій ще немає. Бот відкриває лише підтверджені сигнали біля ціни входу.</td></tr><?php endif; ?></tbody></table></div></section>
<section class="panel"><div class="section-title"><div><h2>Історія угод</h2><p>Прибуток: <?=n($profit)?> · збитки: <?=n($loss)?> · <?=count($history)?> / 1000 угод</p></div><a class="button" href="?export=csv">Експорт CSV</a></div><div class="table-wrap"><table><thead><tr><th>Інструмент / формація</th><th>Напрямок</th><th>Вхід → вихід</th><th>Стоп / ціль</th><th>Результат</th><th>Чистий P&amp;L</th><th>Період, UTC</th></tr></thead><tbody>
<?php $pages = max(1, (int)ceil(count($history) / 40)); $page = max(1, min($pages, (int)($_GET['page'] ?? 1)));
foreach (array_slice(array_reverse($history), ($page - 1) * 40, 40) as $p): ?><tr><td><b><?=e($p['symbol'])?></b><small><?=e($p['exchange'] . ' · ' . $p['timeframe'])?></small><small><?=e($p['pattern'])?></small></td><td><?=$p['direction'] === 1 ? 'LONG' : 'SHORT'?></td><td><?=n($p['entry'], 8)?><small>→ <?=n($p['exit'], 8)?></small></td><td><?=n($p['stop'], 8)?><small><?=n($p['target'], 8)?></small></td><td><?=e($p['reason'])?><small><?=$p['ambiguous'] ? 'Стоп і ціль в одній свічці' : ''?></small></td><td class="<?=$p['netPnl'] >= 0 ? 'positive' : 'negative'?>"><?=n($p['netPnl'])?><small>Комісії <?=n($p['entryFee'] + $p['exitFee'], 4)?></small></td><td><?=e(stamp($p['openedAt']))?><small><?=e(stamp($p['closedAt']))?></small></td></tr><?php endforeach; ?>
<?php if (!$history): ?><tr><td colspan="7" class="empty">Тут з’являться закриті угоди зі стопами, цілями та результатом після комісій.</td></tr><?php endif; ?></tbody></table></div><nav><?php if ($page > 1): ?><a href="?page=<?=$page-1?>">← Попередні</a><?php endif; ?> <span><?=$page?> / <?=$pages?></span> <?php if ($page < $pages): ?><a href="?page=<?=$page+1?>">Наступні →</a><?php endif; ?></nav></section>
<section class="panel"><details><summary>Налаштування стратегії та фільтрів</summary><p class="muted">Типовий фоновий сканер VPS: усі біржі, futures, 1h, обсяг від 100 000 USDT, до 75 найліквідніших пар. Інші таймфрейми доступні, лише якщо їх уже сканує сайт. Вибір тут не запускає додаткових сканувань VPS.</p>
<form method="post"><?=csrf()?><input type="hidden" name="action" value="settings"><div class="form-grid">
<?php
option_field('exchange','Біржа',['all'=>'Усі','binance'=>'Binance','bybit'=>'Bybit'],$s);
option_field('marketType','Ринок',['all'=>'Усі','futures'=>'Futures','spot'=>'Spot'],$s);
option_field('timeframe','Таймфрейм',array_combine(['1m','5m','15m','1h','4h','1d'],['1m','5m','15m','1h','4h','1d']),$s);
option_field('category','Категорія',['all'=>'Усі','reversal'=>'Розворот','continuation'=>'Продовження','breakout'=>'Пробій','compression'=>'Стиснення','candlestick'=>'Свічкові'],$s);
option_field('bias','Напрямок',['all'=>'Усі','bullish'=>'Long','bearish'=>'Short','neutral'=>'Neutral (без входів)'],$s);
option_field('status','Статус формації',['all'=>'Усі','forming'=>'Формується','breakout'=>'Пробій','ready_to_break'=>'Готова до пробою','retest'=>'Ретест','target_reached'=>'Ціль досягнута (без входів)'],$s);
option_field('entryMode','Режим входу',['all'=>'Breakout / Retest','BREAKOUT'=>'Лише Breakout','RETEST'=>'Лише Retest'],$s);
option_field('sortBy','Пріоритет сигналів',['confidence'=>'Confidence','volume'=>'Обсяг','priceChange'=>'Зміна ціни','profitPotential'=>'R:R'],$s);
option_field('sortOrder','Порядок',['desc'=>'За спаданням','asc'=>'За зростанням'],$s);
number_field('minVolumeUsd','Мін. обсяг за 24h, USDT',$s,'0','10000000000');
number_field('minConfidence','Мін. confidence, %',$s,'0','100');
number_field('minConfluence','Мін. confluence, балів',$s,'0','100');
number_field('minRR','Мін. фактичний R:R',$s,'2','20');
number_field('maxEntryDeviationPct','Макс. відстань ціни від входу, %',$s,'0.01','5');
number_field('initialBalance','Початковий баланс, USDT',$s,'10','10000000');
number_field('riskPct','Ризик на угоду, % еквіті',$s,'0.01','5');
number_field('maxOpenRiskPct','Макс. загальний ризик, %',$s,'0.01','20');
number_field('maxPositions','Макс. відкритих позицій',$s,'1','10','1');
number_field('leverage','Плече futures (spot = 1)',$s,'1','10');
number_field('feePct','Комісія за кожен бік, %',$s,'0','2');
number_field('slippagePct','Несприятливе прослизання, %',$s,'0','2');
?>
<label>Пошук символу<input name="searchQuery" maxlength="64" value="<?=e($s['searchQuery'])?>"></label><label>Токен формацій VPS<input type="password" name="sourceToken" maxlength="72" autocomplete="new-password" placeholder="<?=empty($state['sourceToken']) ? 'Ще не заданий' : 'Збережений · порожньо = залишити'?>"></label>
<label class="check"><input type="checkbox" name="requireExtreme" <?=$s['requireExtreme'] ? 'checked' : ''?>> Лише підтверджений екстремум</label></div><p class="muted">Завжди обов’язкові: passed, confirmed, closedCandleOnly, lookAheadSafe, enoughData, finiteData, breakoutConfirmed та всі чотири validation.filters. Фільтри не можуть дозволити вхід у непідтверджений сигнал.</p><button class="primary" type="submit">Зберегти налаштування</button></form></details></section>
<section class="panel"><details><summary>Планувальник, доступ і діагностика</summary><p>Зовнішній cron має викликати <code>https://ваш-домен/cron.php</code> щохвилини, методом GET або POST, із заголовком:</p><pre>Authorization: Bearer <?=e($state['cronToken'])?></pre><p class="muted">Не додавайте ключ до URL. Без cron бот не працює у фоні. Кнопка «Оновити» лише перечитує журнал. Якщо бот лежить у підпапці, додайте її до URL. Локально: <code>php /повний/шлях/www/cron.php</code>.</p><form method="post"><?=csrf()?><input type="hidden" name="action" value="rotate"><button type="submit">Змінити ключ cron</button></form><h3>Доступне покриття кешу</h3><ul><?php foreach ($state['coverage'] as $coverage): ?><li><?=e(implode(' / ', $coverage))?></li><?php endforeach; ?><?php if (!$state['coverage']): ?><li>Ще не отримано</li><?php endif; ?></ul><h3>Причини відхилення сигналів останнього запуску</h3><ul><?php foreach ($state['rejections'] as $reason => $count): ?><li><?=e($reason)?>: <?=e($count)?></li><?php endforeach; ?></ul><h3>Змінити пароль</h3><form method="post" class="form-grid"><?=csrf()?><input type="hidden" name="action" value="password"><label>Поточний пароль<input name="current_password" type="password" required maxlength="72" autocomplete="current-password"></label><label>Новий пароль<input name="new_password" type="password" required minlength="12" maxlength="72" autocomplete="new-password"></label><div><button type="submit">Змінити пароль</button></div></form></details></section>
<section class="panel"><details><summary>Журнал подій</summary><ul class="events"><?php foreach (array_reverse(array_slice($state['events'], -40)) as $event): ?><li><time><?=e(stamp($event['time']))?></time> <?=e($event['message'])?></li><?php endforeach; ?></ul></details></section>
<p class="footnote">Симуляція за котируваннями й 1m OHLC, без реальних ордерів. Стоп і ціль в одній свічці → стоп першим, якщо порядок не доведений ціною відкриття. Усередині хвилини входу враховуються лише спостережені ціни. Funding, ліквідації та черга виконання не моделюються. Просадка враховує лише спостережені значення. Застарілі ціни позначені часом.</p>
<?php endif; ?><footer>HOOK PAPER BOT <span>Незалежний PHP-журнал · без API-ключів для торгівлі</span></footer></div></body></html>
