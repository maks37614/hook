<?php
declare(strict_types=1);

final class Runner
{
    public static function run(array &$state, array $config, Market $market, int $now): array
    {
        $state['lastRun'] = $now; $state['lastError'] = ''; $state['rejections'] = [];
        if (($state['marketCooldownUntil'] ?? 0) > $now) {
            $state['lastError'] = 'Пауза після обмеження API до ' . gmdate('H:i:s', $state['marketCooldownUntil']) . ' UTC';
            return ['status' => 'cooldown'];
        }
        $before = count($state['history']); $opened = 0;
        // Always manage existing positions, even with entry pause or unavailable formation source.
        foreach (array_keys($state['positions']) as $id) {
            try {
                $p = $state['positions'][$id];
                $bars = $market->candles($p, $now);
                $quote = null;
                try { $quote = $market->quote($p); } catch (Throwable $error) { $state['lastError'] = $error->getMessage(); }
                Engine::monitor($state, $id, $bars, $quote, max($now, time()));
            } catch (Throwable $error) {
                $state['positions'][$id]['monitorError'] = $error->getMessage();
                $state['lastError'] = $error->getMessage();
            }
        }
        $candidates = []; $state['coverage'] = []; $state['sourceWarnings'] = [];
        try {
            if (empty($state['sourceToken'])) throw new RuntimeException('Задайте токен каналу формацій у налаштуваннях');
            $feed = $market->json($config['source_url'], $state['sourceToken']);
            if (($feed['success'] ?? false) !== true || !is_array($feed['snapshots'] ?? null)) throw new RuntimeException('Канал формацій не готовий');
            $generated = (float)($feed['generatedAt'] ?? 0) / 1000;
            if ($generated < $now - 180 || $generated > $now + 30) throw new RuntimeException('Застаріла відповідь каналу формацій');
            $freshSources = 0;
            foreach ($feed['sources'] ?? [] as $source) {
                $s = $state['settings'];
                if (($s['exchange'] !== 'all' && $s['exchange'] !== ($source['exchange'] ?? ''))
                    || ($s['marketType'] !== 'all' && $s['marketType'] !== ($source['marketType'] ?? ''))) continue;
                if (in_array($source['status'] ?? '', ['live', 'stale'], true)
                    && (float)($source['updatedAt'] ?? 0) / 1000 >= $now - 120
                    && (float)($source['updatedAt'] ?? 0) / 1000 <= $now + 30) $freshSources++;
                else $state['sourceWarnings'][] = ($source['exchange'] ?? '?') . ' / ' . ($source['marketType'] ?? '?') . ': немає свіжого джерела VPS';
            }
            if ($freshSources === 0) throw new RuntimeException('Біржові джерела вибраного ринку на VPS недоступні або застаріли');
            $covered = false;
            foreach ($feed['snapshots'] as $snapshot) {
                $timestamp = (float)($snapshot['generatedAt'] ?? 0) / 1000;
                if ($timestamp < $now - 180 || $timestamp > $now + 30) continue;
                $parts = explode('_', $snapshot['key'] ?? '');
                if (count($parts) !== 4) continue;
                [$exchange, $marketType, $timeframe, $minVolume] = $parts;
                $state['coverage'][] = [$exchange, $marketType, $timeframe, $minVolume];
                $s = $state['settings'];
                $matches = $s['timeframe'] === $timeframe && (float)$minVolume <= $s['minVolumeUsd']
                    && ($exchange === 'all' || $exchange === $s['exchange'])
                    && ($marketType === 'all' || $marketType === $s['marketType']);
                if ($matches) $covered = true;
                // Only use complete selected universe; never pretend a narrower top-75 scan is the all-exchange universe.
                if (!$matches) continue;
                foreach ($snapshot['data'] ?? [] as $coin) {
                    if (($coin['timeframe'] ?? '') !== $timeframe) continue;
                    $live = false;
                    foreach ($feed['sources'] ?? [] as $source) {
                        if (($source['exchange'] ?? '') === ($coin['exchange'] ?? '') && ($source['marketType'] ?? '') === ($coin['marketType'] ?? '')
                            && in_array($source['status'] ?? '', ['live', 'stale'], true)
                            && (float)($source['updatedAt'] ?? 0) / 1000 >= $now - 120 && (float)($source['updatedAt'] ?? 0) / 1000 <= $now + 30) $live = true;
                    }
                    if (!$live) continue;
                    foreach ($coin['formations'] ?? [] as $f) {
                        $reason = Engine::reject($coin, $f, $s, $now);
                        if ($reason !== null) { self::rejection($state, $reason); continue; }
                        $key = Engine::key($coin) . ':' . ($f['id'] ?? '') . ':' . $timeframe;
                        if (!isset($candidates[$key]) || $timestamp > $candidates[$key]['timestamp']) $candidates[$key] = ['coin' => $coin, 'formation' => $f, 'timestamp' => $timestamp];
                    }
                }
            }
            if (!$covered) throw new RuntimeException('Немає свіжого кешу для вибраного ринку/таймфрейму/мінімального обсягу. Типовий фоновий кеш: all / futures / 1h / 100000.');
            $state['lastSource'] = $now; $state['sourceError'] = '';
        } catch (Throwable $error) { $state['sourceError'] = $error->getMessage(); }
        $monitorBlocked = false;
        foreach ($state['positions'] as $p) if ($p['monitorError'] !== '' || $p['markAt'] < $now - 90) $monitorBlocked = true;
        $s = $state['settings'];
        usort($candidates, static function ($a, $b) use ($s) {
            $score = static function ($item) use ($s) {
                switch ($s['sortBy']) {
                    case 'volume': return $item['coin']['volume24hUsd'];
                    case 'priceChange': return abs($item['coin']['priceChange24h']);
                    case 'profitPotential': return $item['formation']['riskRewardRatio'];
                    default: return $item['formation']['confidence'];
                }
            };
            return ($s['sortOrder'] === 'asc' ? 1 : -1) * ($score($a) <=> $score($b));
        });
        if ($s['enabled'] && !$monitorBlocked && $state['sourceError'] === '' && $state['lastError'] === '') {
            foreach ($candidates as $candidate) {
                if (count($state['positions']) >= $s['maxPositions']) break;
                try {
                    $quote = $market->quote($candidate['coin']);
                    $reason = Engine::open($state, $candidate['coin'], $candidate['formation'], $quote, max($now, time()));
                    if ($reason !== null) self::rejection($state, $reason); else $opened++;
                } catch (Throwable $error) { $state['lastError'] = $error->getMessage(); break; }
            }
        }
        if ($market->rateLimited) $state['marketCooldownUntil'] = $now + $market->retryAfter;
        Engine::sample($state, $now);
        return ['status' => $state['sourceError'] || $state['lastError'] || $monitorBlocked || $state['sourceWarnings'] ? 'degraded' : 'ok',
            'opened' => $opened, 'closed' => count($state['history']) - $before,
            'positions' => count($state['positions']), 'balance' => $state['balance']];
    }
    private static function rejection(array &$state, string $reason): void
    {
        $state['rejections'][$reason] = ($state['rejections'][$reason] ?? 0) + 1;
    }
}
