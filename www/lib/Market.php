<?php
declare(strict_types=1);

class Market
{
    private array $quotes = [];
    private array $bars = [];
    private array $blockedSources = [];
    private float $deadline;
    public bool $rateLimited = false;
    public int $retryAfter = 120;

    public function __construct(float $seconds = 24) { $this->deadline = microtime(true) + $seconds; }

    public function json(string $url, ?string $token = null): array
    {
        $remaining = $this->deadline - microtime(true);
        if ($remaining < 1 || $this->rateLimited) throw new RuntimeException('Ліміт часу/запитів запуску; продовжимо наступного разу');
        if (parse_url($url, PHP_URL_SCHEME) !== 'https') throw new RuntimeException('Дозволено лише HTTPS');
        $headers = ['Accept: application/json', 'User-Agent: HookPaperBot/1.0'];
        if ($token !== null) {
            if (preg_match('/[\r\n]/', $token)) throw new RuntimeException('Некоректний токен');
            $headers[] = 'Authorization: Bearer ' . $token;
        }
        $timeout = min(7, (int)floor($remaining));
        $maxBytes = 6 * 1024 * 1024;
        if (function_exists('curl_init')) {
            $curl = curl_init($url); $body = '';
            curl_setopt_array($curl, [CURLOPT_HTTPHEADER => $headers, CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_TIMEOUT => $timeout, CURLOPT_FOLLOWLOCATION => false, CURLOPT_ENCODING => '',
                CURLOPT_HEADERFUNCTION => function ($handle, $line) {
                    $this->rememberRetry($line); return strlen($line);
                },
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_WRITEFUNCTION => static function ($handle, $chunk) use (&$body, $maxBytes) {
                    if (strlen($body) + strlen($chunk) > $maxBytes) return 0;
                    $body .= $chunk; return strlen($chunk);
                }]);
            $ok = curl_exec($curl); $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE); curl_close($curl);
            if ($ok === false) throw new RuntimeException('Помилка HTTPS / завелика відповідь');
        } else {
            $context = stream_context_create(['http' => ['timeout' => $timeout, 'header' => implode("\r\n", $headers), 'follow_location' => 0, 'ignore_errors' => true],
                'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
            $body = @file_get_contents($url, false, $context, 0, $maxBytes + 1);
            $status = 0;
            foreach ($http_response_header ?? [] as $header) {
                $this->rememberRetry($header);
                if (preg_match('/^HTTP\/\S+ (\d{3})/', $header, $m)) $status = (int)$m[1];
            }
            if ($body === false || strlen($body) > $maxBytes) throw new RuntimeException('Помилка HTTPS / завелика відповідь');
        }
        if (in_array($status, [403, 418, 429, 451], true)) $this->rateLimited = true;
        if ($status !== 200) throw new RuntimeException('HTTP ' . $status . ' від джерела даних');
        $result = json_decode($body, true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($result)) throw new RuntimeException('Некоректна JSON-відповідь');
        return $result;
    }

    private function rememberRetry(string $line): void
    {
        if (preg_match('/^Retry-After:\s*(.+)/i',$line,$match)) {
            $value=trim($match[1]);
            $seconds=preg_match('/^\d+$/D',$value)?(int)$value:max(0,(int)strtotime($value)-time());
            $this->retryAfter=max($this->retryAfter,min(86400,$seconds));
        }
    }

    public static function seconds(string $tf): int
    {
        $map = ['1m'=>60,'5m'=>300,'15m'=>900,'1h'=>3600,'4h'=>14400,'1d'=>86400];
        if (!isset($map[$tf])) throw new RuntimeException('Невідомий таймфрейм');
        return $map[$tf];
    }

    public function prepare(array &$state, array $config, int $now): array
    {
        $this->bars = $state['marketBars'] ?? [];
        $this->quotes=[]; $this->blockedSources=[];
        if (empty($state['sourceToken'])) throw new RuntimeException('Задайте токен каналу формацій у налаштуваннях');
        $watch = [];
        foreach ($state['positions'] as $p) $watch[$p['instrument']] = true;
        foreach (Scalping::watch($state) as $instrument) $watch[$instrument] = true;
        foreach ($state['watchlist'] ?? [] as $instrument) $watch[$instrument] = true;
        $watch = array_slice(array_keys($watch), 0, 12);
        $tfs = array_values(array_unique(array_merge(['1m', $state['settings']['timeframe']],
            $state['scalpSettings']['timeframes'], [$state['scalpSettings']['contextTimeframe']])));
        $url = $config['source_url'] . '?' . http_build_query(['watch'=>implode(',', $watch), 'tfs'=>implode(',', $tfs),'formationTf'=>$state['settings']['timeframe']]);
        $feed = $this->json($url, $state['sourceToken']);
        if (($feed['version'] ?? 0) < 2) throw new RuntimeException('Оновіть канал h00k.top до версії 2: потрібні кешовані котирування та свічки');
        if (($feed['success'] ?? false) !== true || !isset($feed['market']['quotes'], $feed['market']['series'])) throw new RuntimeException('Канал ринкових даних h00k.top не готовий');
        $time = (float)($feed['generatedAt'] ?? 0) / 1000;
        if ($time < $now - 180 || $time > $now + 30) throw new RuntimeException('Застаріла відповідь h00k.top');
        foreach ($feed['sources'] ?? [] as $source) {
            if (($source['status'] ?? '') === 'unavailable') $this->blockedSources[($source['exchange']??'') . ':' . ($source['marketType']??'')] = true;
        }
        foreach ($feed['market']['quotes'] as $q) {
            if (!is_array($q) || !isset($q['exchange'],$q['marketType'],$q['symbol'])) continue;
            if (!Engine::positive($q['price'] ?? null) || !is_numeric($q['updatedAt'] ?? null)) continue;
            $this->quotes[Engine::key($q)] = $q;
        }
        foreach ($feed['market']['series'] as $series) {
            $instrument = $series['instrument'] ?? '';
            $tf = $series['timeframe'] ?? '';
            if (!in_array($instrument,$watch,true) || !in_array($tf,$tfs,true) || !is_array($series['candles'] ?? null)) continue;
            $this->merge($instrument, $tf, $series['candles'], $now);
        }
        // Keep only requested instruments; minute history also serves open positions and recovery.
        foreach ($this->bars as $key => $rows) {
            $parts = explode(':',$key); array_pop($parts);
            if (!in_array(implode(':',$parts), $watch, true)) unset($this->bars[$key]);
        }
        $state['marketBars'] = $this->bars;
        $state['marketQuotes'] = array_values($this->quotes);
        $state['feedVersion'] = 2;
        return $feed;
    }

    public function ingest(array $quotes, array $series, int $now): void
    {
        // Pure data ingestion is also used by deterministic replay tests.
        foreach ($quotes as $q) $this->quotes[Engine::key($q)] = $q;
        foreach ($series as $s) $this->merge($s['instrument'],$s['timeframe'],$s['candles'],$now);
    }

    private function merge(string $instrument, string $tf, array $rows, int $now): void
    {
        $seconds = self::seconds($tf); $key = $instrument . ':' . $tf;
        $merged = [];
        foreach ($this->bars[$key] ?? [] as $row) $merged[(int)$row[0]] = $row;
        foreach ($rows as $row) {
            if (!is_array($row) || count($row) !== 6) continue;
            foreach ($row as $value) if (!is_numeric($value) || !is_finite((float)$value)) continue 2;
            $row = array_map('floatval',$row); $time = (int)$row[0];
            if ($row[0] !== (float)$time || $time % $seconds !== 0 || $time <= 0 || $time+$seconds > $now) continue;
            if (min($row[1],$row[2],$row[3],$row[4]) <= 0 || $row[5] < 0
                || $row[3] > min($row[1],$row[4]) || $row[2] < max($row[1],$row[4]) || $row[2] < $row[3]) continue;
            $row[0] = $time; $merged[$time] = $row;
        }
        ksort($merged,SORT_NUMERIC);
        $this->bars[$key] = array_slice(array_values($merged), $tf === '1m' ? -2160 : -200);
    }

    public function quote(array $instrument): float
    {
        $q = $this->quoteInfo($instrument);
        return (float)$q['price'];
    }

    public function quoteInfo(array $instrument, int $now = 0, int $maxAge = 90): array
    {
        $now = $now ?: time();
        if (isset($this->blockedSources[$instrument['exchange'].':'.$instrument['marketType']])) throw new RuntimeException('Джерело h00k.top тимчасово недоступне');
        $q = $this->quotes[Engine::key($instrument)] ?? null;
        if (!$q || !Engine::positive($q['price'] ?? null) || (float)($q['updatedAt'] ?? 0)/1000 < $now-$maxAge
            || (float)$q['updatedAt']/1000 > $now+30) throw new RuntimeException('Немає свіжої ціни h00k.top для ' . $instrument['symbol']);
        return $q;
    }

    public function bars(array $instrument, string $tf, int $now): array
    {
        $key = Engine::key($instrument);
        $seconds = self::seconds($tf);
        $native = $this->bars[$key . ':' . $tf] ?? [];
        if ($tf === '1m') return self::objects($native);
        // Derive higher frames on OVH, only from complete, contiguous real minute bars.
        $groups = [];
        foreach ($this->bars[$key . ':1m'] ?? [] as $row) $groups[intdiv($row[0],$seconds)*$seconds][] = $row;
        $derived = [];
        foreach ($groups as $start => $rows) {
            if ($start+$seconds > $now || count($rows) !== intdiv($seconds,60)) continue;
            foreach ($rows as $i=>$row) if ($row[0] !== $start+$i*60) continue 2;
            $derived[$start] = [$start,$rows[0][1],max(array_column($rows,2)),min(array_column($rows,3)),$rows[count($rows)-1][4],array_sum(array_column($rows,5))];
        }
        foreach ($native as $row) if (!isset($derived[$row[0]])) $derived[$row[0]] = $row;
        ksort($derived,SORT_NUMERIC);
        return self::objects(array_slice(array_values($derived),-200));
    }

    private static function objects(array $rows): array
    {
        return array_map(static function ($r) { return ['time'=>(int)$r[0],'open'=>$r[1],'high'=>$r[2],'low'=>$r[3],'close'=>$r[4],'volume'=>$r[5]]; },$rows);
    }

    public function candles(array $p, int $now): array
    {
        return array_values(array_filter($this->bars($p,'1m',$now), static function ($bar) use ($p,$now) {
            return $bar['time'] >= $p['cursor'] && $bar['time']+60 <= $now;
        }));
    }
}
