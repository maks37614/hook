<?php
declare(strict_types=1);

class Market
{
    private array $quotes = [];
    private array $bars = [];
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
                    if (preg_match('/^Retry-After:\s*(.+)/i', $line, $match)) {
                        $value = trim($match[1]);
                        $seconds = preg_match('/^\d+$/D', $value) ? (int)$value : max(0, (int)strtotime($value) - time());
                        $this->retryAfter = max($this->retryAfter, min(86400, $seconds));
                    }
                    return strlen($line);
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
            foreach ($http_response_header ?? [] as $header) if (preg_match('/^HTTP\/\S+ (\d{3})/', $header, $m)) $status = (int)$m[1];
            if ($body === false || strlen($body) > $maxBytes) throw new RuntimeException('Помилка HTTPS / завелика відповідь');
        }
        if (in_array($status, [403, 418, 429, 451], true)) $this->rateLimited = true;
        if ($status !== 200) throw new RuntimeException('HTTP ' . $status . ' від джерела даних');
        $result = json_decode($body, true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($result)) throw new RuntimeException('Некоректна JSON-відповідь');
        if (isset($result['retCode']) && $result['retCode'] !== 0) {
            if (in_array($result['retCode'], [10006, 10009, 10018], true)) $this->rateLimited = true;
            throw new RuntimeException('Bybit API відхилив запит');
        }
        if (isset($result['code']) && is_numeric($result['code']) && $result['code'] < 0) {
            if (in_array($result['code'], [-1003, -1015], true)) $this->rateLimited = true;
            throw new RuntimeException('Binance API відхилив запит');
        }
        return $result;
    }

    private function prefix(string $exchange, string $market): string
    {
        if (!in_array($exchange, ['binance', 'bybit'], true) || !in_array($market, ['spot', 'futures'], true)) throw new RuntimeException('Невідома біржа');
        return $exchange === 'bybit' ? 'https://api.bybit.com/v5/market/'
            : ($market === 'spot' ? 'https://api.binance.com/api/v3/' : 'https://fapi.binance.com/fapi/v1/');
    }

    public function quote(array $instrument): float
    {
        $exchange = $instrument['exchange']; $market = $instrument['marketType'];
        $key = $exchange . ':' . $market;
        if (!array_key_exists($key, $this->quotes)) {
            // Cache failures for this run too: no repeat requests on every candidate.
            $this->quotes[$key] = [];
            $prefix = $this->prefix($exchange, $market);
            $data = $this->json($prefix . ($exchange === 'bybit'
                ? 'tickers?category=' . ($market === 'spot' ? 'spot' : 'linear') : 'ticker/price'));
            if ($exchange === 'bybit') {
                if (($data['retCode'] ?? -1) !== 0) {
                    if (in_array($data['retCode'] ?? 0, [10006, 10009, 10018], true)) $this->rateLimited = true;
                    throw new RuntimeException('Bybit відхилив запит котирувань');
                }
                if (abs((float)($data['time'] ?? 0) / 1000 - time()) > 90) throw new RuntimeException('Застаріла відповідь Bybit');
                $rows = $data['result']['list'] ?? [];
            } else $rows = $data;
            foreach ($rows as $row) {
                $price = $row['lastPrice'] ?? $row['price'] ?? null;
                if (Engine::positive($price) && isset($row['symbol'])) $this->quotes[$key][$row['symbol']] = (float)$price;
            }
        }
        if (!isset($this->quotes[$key][$instrument['symbol']])) throw new RuntimeException('Немає свіжої ціни для ' . $instrument['symbol']);
        return $this->quotes[$key][$instrument['symbol']];
    }

    public function candles(array $p, int $now): array
    {
        $end = min(intdiv($now, 60) * 60, $p['cursor'] + 1000 * 60) - 1;
        if ($end < $p['cursor']) return [];
        if (!preg_match('/^[\p{L}\p{N}]{3,60}$/uD', $p['symbol'])) throw new RuntimeException('Некоректний символ');
        $key = $p['instrument'] . ':' . $p['cursor'];
        if (isset($this->bars[$key])) return $this->bars[$key];
        $base = $this->prefix($p['exchange'], $p['marketType']);
        $params = ['symbol' => $p['symbol'], 'limit' => 1000];
        if ($p['exchange'] === 'bybit') {
            $params += ['category' => $p['marketType'] === 'spot' ? 'spot' : 'linear', 'interval' => '1', 'start' => $p['cursor'] * 1000, 'end' => $end * 1000];
            $data = $this->json($base . 'kline?' . http_build_query($params));
            if (($data['retCode'] ?? -1) !== 0) throw new RuntimeException('Bybit відхилив запит свічок');
            $rows = $data['result']['list'] ?? [];
        } else {
            $params += ['interval' => '1m', 'startTime' => $p['cursor'] * 1000, 'endTime' => $end * 1000];
            $rows = $this->json($base . 'klines?' . http_build_query($params));
        }
        $bars = [];
        foreach ($rows as $row) {
            if (!is_array($row) || count($row) < 5) throw new RuntimeException('Некоректні дані свічок');
            $bars[] = ['time' => (int)floor((float)$row[0] / 1000), 'open' => (float)$row[1], 'high' => (float)$row[2], 'low' => (float)$row[3], 'close' => (float)$row[4]];
        }
        return $this->bars[$key] = $bars;
    }
}
