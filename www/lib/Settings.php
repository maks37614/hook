<?php
declare(strict_types=1);
function bot_settings(array $input, array $previous, bool $hasTrades): array
{
    $next = $previous;
    $enums = [
        'exchange' => ['all','binance','bybit'], 'marketType' => ['all','futures','spot'],
        'timeframe' => ['1m','5m','15m','1h','4h','1d'],
        'category' => ['all','reversal','continuation','breakout','compression','candlestick'],
        'bias' => ['all','bullish','bearish','neutral'],
        'status' => ['all','forming','breakout','ready_to_break','retest','target_reached'],
        'sortBy' => ['confidence','volume','priceChange','profitPotential'],
        'sortOrder' => ['desc','asc'], 'entryMode' => ['all','BREAKOUT','RETEST'],
    ];
    foreach ($enums as $key => $values) {
        if (!in_array($input[$key] ?? '', $values, true)) throw new RuntimeException('Некоректне поле: ' . $key);
        $next[$key] = $input[$key];
    }
    $numbers = ['initialBalance' => [10, 10000000], 'riskPct' => [0.01, 5], 'maxOpenRiskPct' => [0.01, 20],
        'maxPositions' => [1, 10], 'leverage' => [1, 10], 'feePct' => [0, 2], 'slippagePct' => [0, 2],
        'maxEntryDeviationPct' => [0.01, 5], 'minVolumeUsd' => [0, 10000000000],
        'minConfidence' => [0, 100], 'minConfluence' => [0, 100], 'minRR' => [2, 20], 'reverseMinRR' => [0.01, 10]];
    foreach ($numbers as $key => [$min, $max]) {
        $raw = $input[$key] ?? null;
        if (!is_scalar($raw) || !is_numeric($raw) || !is_finite((float)$raw) || (float)$raw < $min || (float)$raw > $max) throw new RuntimeException('Некоректний діапазон: ' . $key);
        $next[$key] = (float)$raw;
    }
    if (floor($next['maxPositions']) !== $next['maxPositions']) throw new RuntimeException('Кількість позицій має бути цілим числом');
    $next['maxPositions'] = (int)$next['maxPositions'];
    if ($hasTrades && $next['initialBalance'] !== (float)$previous['initialBalance']) throw new RuntimeException('Початковий баланс не можна змінити після першої угоди');
    if ($next['riskPct'] > $next['maxOpenRiskPct']) throw new RuntimeException('Ризик угоди перевищує загальний ліміт');
    if (!is_string($input['searchQuery'] ?? null) || strlen($input['searchQuery']) > 64) throw new RuntimeException('Пошуковий запит завеликий');
    $next['searchQuery'] = trim($input['searchQuery']);
    $next['reverse'] = isset($input['reverse']);
    $next['requireExtreme'] = isset($input['requireExtreme']);
    return $next;
}
