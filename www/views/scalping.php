<?php if (!isset($authenticated) || !$authenticated) { http_response_code(404); exit; } $sc=$state['scalpSettings']; ?>
<section class="panel"><div class="section-title"><div><h2>АвтоСкальпінг · <?=$sc['enabled']?'увімкнено':'вимкнено'?></h2><p><?=e($state['scalpStatus'])?></p></div><span class="badge">Джерело: h00k.top · кеш v<?=e($state['feedVersion'])?></span></div>
<p class="muted">Пошук відскоку біля попередніх лоїв / хаїв на закритих свічках. Ціль — протилежна межа реального діапазону, стоп — за екстремумом із буфером ATR. Індикатори рахуються тут. Вхід дозволений тільки зі свіжою ціною та 1m-історією.</p>
<details open><summary>Детальні налаштування АвтоСкальпінгу</summary><form method="post"><?=csrf()?><input type="hidden" name="action" value="scalp_settings"><div class="form-grid">
<?php
option_field('exchange','Біржа',['binance'=>'Binance','bybit'=>'Bybit','all'=>'Обидві'],$sc);
option_field('marketType','Ринок',['futures'=>'Futures','spot'=>'Spot (тільки LONG)'],$sc);
option_field('direction','Напрямок',['both'=>'LONG / SHORT','long'=>'Тільки LONG','short'=>'Тільки SHORT'],$sc);
?><label>Монети через кому (порожньо = автоматично з h00k.top)<input name="symbols" maxlength="500" value="<?=e($sc['symbols'])?>" placeholder="BTCUSDT,ETHUSDT,SOLUSDT"></label>
<div><span class="muted">Таймфрейми входу (до трьох)</span><div class="checks"><?php foreach(['1m','5m','15m','1h'] as $tf): ?><label class="check"><input type="checkbox" name="timeframes[]" value="<?=e($tf)?>" <?=in_array($tf,$sc['timeframes'],true)?'checked':''?>><?=e($tf)?></label><?php endforeach; ?></div></div>
<?php
option_field('contextTimeframe','Старший таймфрейм',['1m'=>'1m','5m'=>'5m','15m'=>'15m','1h'=>'1h','4h'=>'4h'],$sc);
option_field('confirmation','Підтвердження відскоку',['rejection'=>'Спрямована свічка відскоку','break_previous'=>'Закриття за попередньою свічкою'],$sc);
option_field('rsiMode','Фільтр RSI',['recovery'=>'Повернення з екстремальної зони','extreme'=>'Екстремум + розворот RSI','off'=>'Вимкнений'],$sc);
option_field('trendMode','Старший тренд',['range'=>'Лише помірний тренд / діапазон','trend'=>'Тільки за напрямком EMA','off'=>'Не перевіряти EMA'],$sc);
$fields=[
'lookback'=>['Свічок для лою / хаю',10,100],'zonePct'=>['Зона входу, % діапазону',1,30],
'rsiPeriod'=>['Період RSI',5,30],'rsiLow'=>['RSI: нижня межа',10,49],'rsiHigh'=>['RSI: верхня межа',51,90],
'atrPeriod'=>['Період ATR',5,30],'minAtrPct'=>['Мін. ATR, % ціни',0.001,10],'maxAtrPct'=>['Макс. ATR, % ціни',0.01,20],
'minRangePct'=>['Мін. ширина діапазону, %',0.01,20],'maxRangePct'=>['Макс. ширина діапазону, %',0.1,50],
'minVolumeUsd'=>['Мін. обсяг 24h, USDT',0,10000000000],'minRvol'=>['Мін. RVOL (0 = без фільтра)',0,10],
'emaFast'=>['Швидка EMA',3,30],'emaSlow'=>['Повільна EMA',5,100],'maxTrendAtr'=>['Макс. розходження EMA, ATR',0.1,10],
'stopBufferAtr'=>['Буфер стопа, ATR',0.01,3],'targetBufferAtr'=>['Відступ цілі від межі, ATR',0,3],
'minStopPct'=>['Мін. стоп, %',0.01,5],'maxStopPct'=>['Макс. стоп, %',0.05,10],
'minRR'=>['Мін. чистий R:R після витрат',0.2,10],'minNetProfitPct'=>['Мін. чистий потенціал цілі, %',0,10],
'maxEntryDeviationPct'=>['Макс. відхилення від сигналу, %',0.01,2], 'maxSignalAge'=>['Макс. вік сигналу, секунд',30,600],'maxQuoteAge'=>['Макс. вік котирування, секунд',15,120],
'riskPct'=>['Ризик угоди, % еквіті',0.01,3],'maxPositions'=>['Ліміт позицій скальпінгу',1,10],'leverage'=>['Плече futures',1,10],
'feePct'=>['Комісія за бік, %',0,2],'slippagePct'=>['Несприятливе прослизання, %',0,2],
'maxDailyLossPct'=>['Денний ліміт збитку, %',0.1,20],'maxDrawdownPct'=>['Ліміт просадки рахунку, %',0.1,50],
'maxTradesDay'=>['Макс. нових угод на день',1,200],'maxConsecutiveLosses'=>['Збитків поспіль до паузи',1,20],
'lossPauseMinutes'=>['Пауза після серії збитків, хв',1,1440],'cooldownMinutes'=>['Пауза між угодами монети, хв',1,1440],
'maxHoldMinutes'=>['Макс. тривалість угоди, хв',1,1440],'maxWatch'=>['Монет у спостереженні',1,8],
'sessionStart'=>['Початок торгів: година',0,23],'sessionEnd'=>['Кінець торгів: година (24 = до опівночі)',1,24]];
foreach($fields as $key=>[$label,$min,$max])number_field($key,$label,$sc,(string)$min,(string)$max);
?></div><p class="muted">Торгові години: <?=e($state['reportTimezone'])?>. Загальні ліміти позицій і відкритого ризику задаються на вкладці «Формації» та діють для обох ботів. Зміна налаштувань не рухає рівні відкритих позицій.</p><button class="primary" type="submit">Зберегти АвтоСкальпінг</button></form></details></section>
<section class="panel"><h2>Стан монет і причини очікування</h2><p class="muted">Старші свічки можуть збиратися з повних реальних 1m-свічок на цьому хостингу. Під час прогріву бот очікує. Для 30 свічок 15m потрібно до 7,5 годин хвилинної історії, якщо готового кешу 15m немає.</p><div class="table-wrap"><table><thead><tr><th>Інструмент</th><th>TF</th><th>Лой / хай</th><th>ATR / RSI / RVOL</th><th>Рішення</th></tr></thead><tbody>
<?php foreach($state['scalpDiagnostics'] as $d):$m=$d['metrics'];?><tr><td><?=e($d['instrument'])?></td><td><?=e($d['timeframe'])?></td><td><?=isset($m['low'])?n($m['low'],8):'—'?><small><?=isset($m['high'])?n($m['high'],8):'—'?></small></td><td>ATR <?=isset($m['atrPct'])?n($m['atrPct'],3).'%':'—'?><small>RSI <?=isset($m['rsi'])?n($m['rsi'],1):'—'?> · RVOL <?=isset($m['rvol'])?n($m['rvol']):'—'?></small></td><td class="decision"><?=e($d['reason'])?><small><?=e(stamp($d['time']))?></small></td></tr><?php endforeach; ?>
<?php if(!$state['scalpDiagnostics']):?><tr><td colspan="5" class="empty">Діагностика з’явиться після першого cron-запуску оновленого бота.</td></tr><?php endif;?></tbody></table></div></section>
<section class="panel"><details><summary>Методика і джерела дослідження</summary><p>Підтримка та опір — зони, які можуть бути пробиті. Потрібні відскок на закритій свічці, перевірка контексту й достатній потенціал після витрат. RSI може довго залишатися в екстремальній зоні. Значення налаштувань — перевірювані припущення, а не доведені оптимальні параметри. Тестуйте на нових даних і порівнюйте результат після комісій, не підбирайте лише красиву історію.</p><ul><li><a href="https://www.cmegroup.com/education/courses/technical-analysis/support-and-resistance" target="_blank" rel="noopener noreferrer">CME: підтримка та опір</a></li><li><a href="https://www.cmegroup.com/education/courses/trade-and-risk-management/the-2-percent-rule" target="_blank" rel="noopener noreferrer">CME: обмеження ризику і розмір позиції</a></li><li><a href="https://www.schwab.com/learn/story/3-strength-indicators-assessing-stock-momentum" target="_blank" rel="noopener noreferrer">Schwab: RSI, підтвердження та сила тренду</a></li><li><a href="https://www.finra.org/investors/insights/frequent-intraday-trading" target="_blank" rel="noopener noreferrer">FINRA: ризики та витрати частих угод</a></li></ul><p class="muted">Спред не підміняється вигаданим значенням: поточний кеш його не містить. Є налаштоване несприятливе прослизання. Стратегія працює з хвилинним cron; тикового виконання немає.</p></details></section>
