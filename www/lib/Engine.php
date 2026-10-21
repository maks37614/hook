<?php
declare(strict_types=1);

final class Engine
{
    public static function defaults(): array
    {
        return [
            'enabled' => false, 'initialBalance' => 1000.0, 'riskPct' => 1.0,
            'maxOpenRiskPct' => 5.0, 'maxPositions' => 5, 'leverage' => 1.0,
            'feePct' => 0.06, 'slippagePct' => 0.03, 'maxEntryDeviationPct' => 0.3,
            'exchange' => 'all', 'marketType' => 'futures', 'timeframe' => '1h',
            'category' => 'all', 'bias' => 'all', 'status' => 'all',
            'minVolumeUsd' => 100000.0, 'searchQuery' => '',
            'sortBy' => 'confidence', 'sortOrder' => 'desc',
            'minConfidence' => 0.0, 'minRR' => 2.0, 'entryMode' => 'all',
            'minConfluence' => 0.0, 'requireExtreme' => false,
        ];
    }

    public static function fresh(array $settings = []): array
    {
        $settings = array_replace(self::defaults(), $settings);
        return ['schema' => 1, 'settings' => $settings, 'balance' => $settings['initialBalance'],
            'peakEquity' => $settings['initialBalance'], 'maxDrawdownPct' => 0.0,
            'positions' => [], 'history' => [], 'seen' => [], 'events' => [],
            'equityCurve' => [], 'lastRun' => 0, 'lastSource' => 0, 'sourceError' => '', 'sourceWarnings' => [],
            'lastError' => '', 'coverage' => [], 'rejections' => [], 'marketCooldownUntil' => 0];
    }

    public static function key(array $coin): string
    {
        return $coin['exchange'] . ':' . $coin['marketType'] . ':' . $coin['symbol'];
    }

    public static function positive($v): bool
    {
        return is_numeric($v) && is_finite((float)$v) && (float)$v > 0;
    }

    public static function reject(array $coin, array $formation, array $s, int $now): ?string
    {
        if (!in_array($coin['exchange'] ?? '', ['binance', 'bybit'], true)
            || !in_array($coin['marketType'] ?? '', ['futures', 'spot'], true)
            || !preg_match('/^[\p{L}\p{N}]{3,60}$/uD', $coin['symbol'] ?? '')) return 'Некоректний інструмент';
        if (!is_string($formation['id'] ?? null) || $formation['id'] === '' || strlen($formation['id']) > 300) return 'Немає стабільного ID формації';
        if (($coin['quoteAsset'] ?? '') !== 'USDT') return 'Підтримуються лише USDT-пари';
        $updated = (float)($coin['lastUpdated'] ?? 0) / 1000;
        if ($updated < $now - 180 || $updated > $now + 30) return 'Застаріла формація';
        foreach (['exchange', 'marketType', 'timeframe'] as $key) {
            if ($s[$key] !== 'all' && ($coin[$key] ?? null) !== $s[$key]) return 'Фільтр ' . $key;
        }
        if ((float)($coin['volume24hUsd'] ?? 0) < $s['minVolumeUsd']) return 'Фільтр обсягу';
        $query = strtolower(trim($s['searchQuery']));
        if ($query !== '' && strpos(strtolower(($coin['symbol'] ?? '') . ' ' . ($coin['baseAsset'] ?? '')), $query) === false) return 'Пошук';
        foreach (['category', 'bias', 'status'] as $key) {
            if ($s[$key] !== 'all' && ($formation[$key] ?? '') !== $s[$key]) return 'Фільтр ' . $key;
        }
        if (!in_array($formation['bias'] ?? '', ['bullish', 'bearish'], true)) return 'Нейтральний напрямок';
        if (($formation['status'] ?? '') === 'target_reached') return 'Ціль уже досягнута';
        if ($coin['marketType'] === 'spot' && $formation['bias'] === 'bearish') return 'Short на spot не підтримується';
        if (!self::positive($formation['confidence'] ?? 0) || $formation['confidence'] < $s['minConfidence']) return 'Confidence';
        $v = $formation['validation'] ?? [];
        foreach (['passed', 'confirmed', 'closedCandleOnly', 'lookAheadSafe', 'enoughData', 'finiteData', 'breakoutConfirmed'] as $key) {
            if (($v[$key] ?? null) !== true) return 'Validation: ' . $key;
        }
        foreach (['volume', 'volatility', 'nearbyLevel', 'structure'] as $key) {
            if (($v['filters'][$key] ?? null) !== true) return 'Validation filter: ' . $key;
        }
        if (!in_array($v['entryMode'] ?? '', ['BREAKOUT', 'RETEST'], true)) return 'Очікування входу';
        if ($s['entryMode'] !== 'all' && $s['entryMode'] !== $v['entryMode']) return 'Режим входу';
        if (($v['confluence']['total'] ?? 0) < $s['minConfluence']) return 'Confluence';
        if ($s['requireExtreme'] && ($formation['extremeContext']['aligned'] ?? false) !== true) return 'Екстремум не підтверджено';
        foreach (['entryPrice', 'stopLossPrice', 'targetPrice'] as $key) {
            if (!self::positive($formation['levels'][$key] ?? null)) return 'Некоректні рівні';
        }
        return null;
    }

    public static function equity(array $state): float
    {
        return $state['balance'] + array_sum(array_map(function ($p) {
            return ($p['mark'] - $p['entry']) * $p['qty'] * $p['direction'];
        }, $state['positions']));
    }

    public static function event(array &$state, string $message, int $now): void
    {
        $state['events'][] = ['time' => $now, 'message' => $message];
        $state['events'] = array_slice($state['events'], -150);
    }

    public static function open(array &$state, array $coin, array $f, float $quote, int $now): ?string
    {
        $s = $state['settings'];
        $rejected = self::reject($coin, $f, $s, $now);
        if ($rejected !== null) return $rejected;
        if (!$s['enabled']) return 'Бот на паузі';
        if (count($state['positions']) >= $s['maxPositions']) return 'Ліміт позицій';
        if (count($state['history']) + count($state['positions']) >= 1000 || count($state['seen']) >= 5000) return 'Ліміт сховища: експортуйте історію та створіть нову інсталяцію';
        $key = self::key($coin);
        foreach ($state['positions'] as $p) if ($p['instrument'] === $key) return 'Інструмент уже відкритий';
        // The site ID contains the timeframe and anchored candle timestamps.
        // A later independent formation at the same prices is a different signal.
        $identity = hash('sha256', $key . '|' . $coin['timeframe'] . '|' . $f['id']);
        if (isset($state['seen'][$identity])) return 'Цей сигнал уже виконано';
        if (!self::positive($quote)) return 'Немає свіжої ціни';
        $planned = (float)$f['levels']['entryPrice'];
        if (abs($quote - $planned) / $planned * 100 > $s['maxEntryDeviationPct']) return 'Ціна відійшла від входу';
        $direction = $f['bias'] === 'bullish' ? 1 : -1;
        $entry = $quote * (1 + $direction * $s['slippagePct'] / 100);
        $stop = (float)$f['levels']['stopLossPrice'];
        $target = (float)$f['levels']['targetPrice'];
        $distance = ($entry - $stop) * $direction;
        $reward = ($target - $entry) * $direction;
        if ($distance <= 0 || $reward <= 0 || $reward / $distance < $s['minRR']) return 'Некоректний напрямок рівнів / фактичний R:R';
        $equity = self::equity($state);
        if ($equity <= 0) return 'Баланс вичерпаний';
        $reserved = array_sum(array_column($state['positions'], 'margin'));
        $openRisk = array_sum(array_column($state['positions'], 'risk'));
        // Include both fees and adverse stop slippage in sizing.
        $stopFill = $stop * (1 - $direction * $s['slippagePct'] / 100);
        $riskPerUnit = abs($entry - $stopFill) + ($entry + $stopFill) * $s['feePct'] / 100;
        $riskBudget = min($equity * $s['riskPct'] / 100, $equity * $s['maxOpenRiskPct'] / 100 - $openRisk);
        $leverage = $coin['marketType'] === 'spot' ? 1 : $s['leverage'];
        $available = max(0, $equity - $reserved);
        $qty = min($riskBudget / $riskPerUnit, $available / ($entry / $leverage + $entry * $s['feePct'] / 100));
        if (!is_finite($qty) || $qty * $entry < 1) return 'Недостатньо вільного балансу / ризику';
        $fee = $qty * $entry * $s['feePct'] / 100;
        $id = bin2hex(random_bytes(12));
        $p = ['id' => $id, 'signalKey' => $identity, 'instrument' => $key,
            'exchange' => $coin['exchange'], 'marketType' => $coin['marketType'], 'symbol' => $coin['symbol'],
            'timeframe' => $coin['timeframe'], 'pattern' => $f['name'] ?? $f['patternKey'],
            'direction' => $direction, 'plannedEntry' => $planned, 'entry' => $entry, 'stop' => $stop,
            'target' => $target, 'qty' => $qty, 'margin' => $qty * $entry / $leverage, 'leverage' => $leverage,
            'risk' => $qty * $riskPerUnit, 'entryFee' => $fee, 'feePct' => $s['feePct'], 'slippagePct' => $s['slippagePct'],
            'openedAt' => $now, 'mark' => $quote, 'markAt' => $now,
            'cursor' => (intdiv($now, 60) + 1) * 60, 'monitorError' => '',
            'validation' => $f['validation'], 'confidence' => $f['confidence'], 'rr' => $reward / $distance];
        $state['balance'] -= $fee;
        $state['positions'][$id] = $p;
        $state['seen'][$identity] = $now;
        self::event($state, 'Відкрито ' . $p['symbol'] . ($direction === 1 ? ' LONG' : ' SHORT'), $now);
        return null;
    }

    public static function close(array &$state, string $id, float $price, int $time, string $reason, bool $ambiguous = false): void
    {
        $p = $state['positions'][$id];
        $exit = $price * (1 - $p['direction'] * $p['slippagePct'] / 100);
        $gross = ($exit - $p['entry']) * $p['qty'] * $p['direction'];
        $exitFee = $exit * $p['qty'] * $p['feePct'] / 100;
        $state['balance'] += $gross - $exitFee;
        $p += ['exit' => $exit, 'closedAt' => $time, 'reason' => $reason, 'ambiguous' => $ambiguous,
            'grossPnl' => $gross, 'exitFee' => $exitFee, 'netPnl' => $gross - $exitFee - $p['entryFee']];
        $state['history'][] = $p;
        unset($state['positions'][$id]);
        self::event($state, 'Закрито ' . $p['symbol'] . ' · ' . $reason . ' · ' . number_format($p['netPnl'], 2) . ' USDT', $time);
    }

    /** Only candles entirely after entry, in chronological order. No fabricated gap fills. */
    public static function monitor(array &$state, string $id, array $bars, ?float $quote, int $now): void
    {
        if (!isset($state['positions'][$id])) return;
        $p =& $state['positions'][$id];
        $p['monitorError'] = '';
        usort($bars, function ($a, $b) { return $a['time'] <=> $b['time']; });
        foreach ($bars as $bar) {
            $time = (int)$bar['time'];
            if ($time < $p['cursor'] || $time + 60 > $now) continue;
            if ($time !== $p['cursor']) { $p['monitorError'] = 'Прогалина в 1m-свічках; нові входи призупинено'; return; }
            foreach (['open', 'high', 'low', 'close'] as $field) {
                if (!self::positive($bar[$field] ?? null)) throw new RuntimeException('Некоректна свічка');
            }
            if ($bar['low'] > min($bar['open'], $bar['close']) || $bar['high'] < max($bar['open'], $bar['close']) || $bar['high'] < $bar['low']) throw new RuntimeException('Некоректний OHLC');
            $long = $p['direction'] === 1;
            $stop = $long ? $bar['low'] <= $p['stop'] : $bar['high'] >= $p['stop'];
            $target = $long ? $bar['high'] >= $p['target'] : $bar['low'] <= $p['target'];
            $openStop = $long ? $bar['open'] <= $p['stop'] : $bar['open'] >= $p['stop'];
            $openTarget = $long ? $bar['open'] >= $p['target'] : $bar['open'] <= $p['target'];
            if ($openStop) { self::close($state, $id, (float)$bar['open'], $time, 'STOP_GAP'); return; }
            if ($openTarget) { self::close($state, $id, $p['target'], $time, 'TARGET'); return; }
            if ($stop || $target) {
                // OHLC cannot order intrabar touches; use stop first and flag uncertainty.
                self::close($state, $id, $stop ? $p['stop'] : $p['target'], $time + 59,
                    $stop ? 'STOP' : 'TARGET', $stop && $target);
                return;
            }
            $p['cursor'] = $time + 60;
        }
        if ($p['cursor'] + 60 <= $now) {
            $p['monitorError'] = 'Очікування історії 1m; перевірка продовжиться наступним запуском';
            return;
        }
        if ($quote !== null && self::positive($quote)) {
            $p['mark'] = $quote; $p['markAt'] = $now;
            $long = $p['direction'] === 1;
            if ($long ? $quote <= $p['stop'] : $quote >= $p['stop']) self::close($state, $id, $quote, $now, 'STOP_OBSERVED');
            elseif ($long ? $quote >= $p['target'] : $quote <= $p['target']) self::close($state, $id, $p['target'], $now, 'TARGET_OBSERVED');
            elseif (!empty($p['closeRequested'])) self::close($state, $id, $quote, $now, 'MANUAL');
        } else $p['monitorError'] = 'Немає свіжої ціни';
    }

    public static function sample(array &$state, int $now): void
    {
        $equity = self::equity($state);
        $state['peakEquity'] = max($state['peakEquity'], $equity);
        $state['maxDrawdownPct'] = max($state['maxDrawdownPct'],
            ($state['peakEquity'] - $equity) / max(0.000001, $state['peakEquity']) * 100);
        $point = ['time' => $now, 'equity' => $equity];
        $last = count($state['equityCurve']) - 1;
        if ($last >= 0 && intdiv($state['equityCurve'][$last]['time'], 3600) === intdiv($now, 3600)) $state['equityCurve'][$last] = $point;
        else $state['equityCurve'][] = $point;
        $state['equityCurve'] = array_slice($state['equityCurve'], -2160);
    }
}
