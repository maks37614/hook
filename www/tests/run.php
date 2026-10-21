<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/Settings.php';
$tests = 0;
function check(bool $value, string $message): void { global $tests; $tests++; if (!$value) throw new RuntimeException('FAIL: ' . $message); }
function near(float $actual, float $expected, string $message): void { check(abs($actual - $expected) < 0.000001, $message . ' (' . $actual . ' vs ' . $expected . ')'); }
function fixture(int $now, bool $short = false): array {
    $coin = ['symbol'=>'BTCUSDT','baseAsset'=>'BTC','quoteAsset'=>'USDT','exchange'=>'binance','marketType'=>'futures','timeframe'=>'1h','volume24hUsd'=>500000,'lastUpdated'=>$now*1000, 'priceChange24h'=>3];
    $f = ['id'=>'test','patternKey'=>'double_bottom','name'=>'Test','category'=>'reversal','bias'=>$short?'bearish':'bullish','status'=>'breakout','confidence'=>85,'riskRewardRatio'=>3,
        'levels'=>['entryPrice'=>100,'stopLossPrice'=>$short?102:98,'targetPrice'=>$short?94:106],
        'validation'=>['passed'=>true,'confirmed'=>true,'closedCandleOnly'=>true,'lookAheadSafe'=>true,'enoughData'=>true,'finiteData'=>true,'breakoutConfirmed'=>true,'entryMode'=>'BREAKOUT',
            'filters'=>['volume'=>true,'volatility'=>true,'nearbyLevel'=>true,'structure'=>true],'confluence'=>['total'=>85]]];
    return [$coin,$f];
}
function account(array $settings = []): array { return Engine::fresh(array_replace(['enabled'=>true,'feePct'=>0,'slippagePct'=>0],$settings)); }
function bar(int $time, float $open = 100, float $high = 101, float $low = 99, float $close = 100): array { return compact('time','open','high','low','close'); }
$now = intdiv(time(),3600)*3600+610;
[$coin,$f] = fixture($now);
$state = account();
check(Engine::open($state,$coin,$f,100,$now) === null,'valid signal opens');
$id = array_key_first($state['positions']); $p = $state['positions'][$id];
near($p['qty'],5,'risk-based quantity'); near($p['margin'],500,'margin'); near($state['balance'],1000,'margin is reserved, not an expense');
check(Engine::open($state,$coin,$f,100,$now) !== null,'no duplicate concurrent instrument');
Engine::monitor($state,$id,[bar($p['cursor'],100,106,99,105)],105,$p['cursor']+60);
check(!$state['positions'] && count($state['history'])===1,'target closes'); near($state['balance'],1030,'target pnl balance');
near($state['history'][0]['netPnl'],30,'target net pnl'); check(Engine::open($state,$coin,$f,100,$now) !== null,'closed signal is not reentered');
$f2=$f; $f2['id']='independent-later-anchored-signal'; check(Engine::open($state,$coin,$f2,100,$now)===null,'independent later formation at the same levels is allowed');

$state=account(['feePct'=>0.06,'slippagePct'=>0.03]); Engine::open($state,$coin,$f,100,$now); $id=array_key_first($state['positions']);$p=$state['positions'][$id];
check($p['entry']>100 && $state['balance']<1000,'entry slippage and fee charged');
Engine::close($state,$id,98,$now+60,'STOP'); $closed=$state['history'][0];
near($state['balance'],1000+$closed['netPnl'],'no double-counting entry fee'); near($closed['netPnl'],-10,'stop risk includes fees and adverse slippage');

foreach ([false,true] as $short) {
    [$c,$signal]=fixture($now,$short); $state=account();Engine::open($state,$c,$signal,100,$now);$id=array_key_first($state['positions']);$p=$state['positions'][$id];
    Engine::monitor($state,$id,[bar($p['cursor'],100,107,93,100)],100,$p['cursor']+60);
    check($state['history'][0]['reason']==='STOP' && $state['history'][0]['ambiguous'],'ambiguous bar uses stop for both sides');
    near($state['history'][0]['netPnl'],-10,'ambiguous result');
    $state=account();Engine::open($state,$c,$signal,100,$now);$id=array_key_first($state['positions']);$p=$state['positions'][$id];
    $open=$short?104:96;
    Engine::monitor($state,$id,[bar($p['cursor'],$open,$open+1,$open-1,$open)],$open,$p['cursor']+60);
    check($state['history'][0]['reason']==='STOP_GAP','gap through stop');near($state['history'][0]['netPnl'],-20,'gap exit uses adverse open');
    $state=account();Engine::open($state,$c,$signal,100,$now);$id=array_key_first($state['positions']);$p=$state['positions'][$id];
    $open=$short?93:107;
    Engine::monitor($state,$id,[bar($p['cursor'],$open,max(108,$open),min(92,$open),$open)],$open,$p['cursor']+60);
    check($state['history'][0]['reason']==='TARGET' && !$state['history'][0]['ambiguous'],'open beyond target proves target first');
    near($state['history'][0]['netPnl'],30,'no windfall from favorable target gap');
}

$state=account();Engine::open($state,$coin,$f,100,$now);$id=array_key_first($state['positions']);$p=$state['positions'][$id];
Engine::monitor($state,$id,[bar($p['cursor']-60,100,110,90,100)],100,$p['cursor']);
check(isset($state['positions'][$id]),'ignore pre-entry minute extremes');
Engine::monitor($state,$id,[bar($p['cursor']+60)],107,$p['cursor']+120);
check(isset($state['positions'][$id]) && $state['positions'][$id]['monitorError']!=='','missing history blocks quote-based false exits');
Engine::monitor($state,$id,[bar($p['cursor']),bar($p['cursor']+60)],100,$p['cursor']+120);
check($state['positions'][$id]['monitorError']==='','chronological catch-up repairs monitor');
$state['positions'][$id]['closeRequested']=true;
Engine::monitor($state,$id,[],101,$p['cursor']+120);
check($state['history'][0]['reason']==='MANUAL','manual close at fresh quote after history');

$state=account(['maxOpenRiskPct'=>1]);Engine::open($state,$coin,$f,100,$now);
$c=$coin;$c['symbol']='ETHUSDT';check(Engine::open($state,$c,$f,100,$now)!==null,'aggregate risk budget');
$state=account(['riskPct'=>5,'maxOpenRiskPct'=>20]);$fWide=$f;$fWide['levels']['stopLossPrice']=99.99;
Engine::open($state,$coin,$fWide,100,$now);$p=reset($state['positions']);near($p['margin'],1000,'notional capped by available margin');
$c=$coin;$c['symbol']='ETHUSDT';check(Engine::open($state,$c,$fWide,100,$now)!==null,'no reuse of reserved margin');
$state=account(['enabled'=>false]);check(Engine::open($state,$coin,$f,100,$now)!==null,'pause stops entries');

foreach (['passed','confirmed','closedCandleOnly','lookAheadSafe','enoughData','finiteData','breakoutConfirmed'] as $flag) {
    $signal=$f;$signal['validation'][$flag]=false;check(Engine::reject($coin,$signal,Engine::defaults(),$now)!==null,'reject failed '.$flag);
}
foreach (['volume','volatility','nearbyLevel','structure'] as $flag) {
    $signal=$f;unset($signal['validation']['filters'][$flag]);check(Engine::reject($coin,$signal,Engine::defaults(),$now)!==null,'reject absent '.$flag);
}
$c=$coin;$c['lastUpdated']=($now-181)*1000;check(Engine::reject($c,$f,Engine::defaults(),$now)!==null,'stale source');
$c=$coin;$c['lastUpdated']=($now+60)*1000;check(Engine::reject($c,$f,Engine::defaults(),$now)!==null,'future source');
$c=$coin;$c['quoteAsset']='BTC';check(Engine::reject($c,$f,Engine::defaults(),$now)!==null,'no unconverted currencies');
$c=$coin;$c['marketType']='spot';$signal=$f;$signal['bias']='bearish';check(Engine::reject($c,$signal,array_replace(Engine::defaults(),['marketType'=>'all']),$now)!==null,'no naked spot short');
foreach (['exchange'=>'bybit','marketType'=>'spot','timeframe'=>'15m','category'=>'continuation','bias'=>'bearish','status'=>'retest','minVolumeUsd'=>99999999,'minConfidence'=>99,'entryMode'=>'RETEST','minConfluence'=>99,'requireExtreme'=>true,'searchQuery'=>'XYZ'] as $key=>$value) {
    check(Engine::reject($coin,$f,array_replace(Engine::defaults(),[$key=>$value]),$now)!==null,'filter '.$key);
}
$state=account();check(Engine::open($state,$coin,$f,101,$now)!==null,'no chase entry');
$state=account();$signal=$f;$signal['levels']['targetPrice']=101;check(Engine::open($state,$coin,$signal,100,$now)!==null,'measured poor RR not inflated');
$state=account();$signal=$f;$signal['levels']['entryPrice']=NAN;check(Engine::open($state,$coin,$signal,100,$now)!==null,'reject NaN');

$state=account();Engine::open($state,$coin,$f,100,$now);$id=array_key_first($state['positions']);
$state['positions'][$id]['mark']=90;Engine::sample($state,$now);near($state['maxDrawdownPct'],5,'equity drawdown includes unrealized pnl');
Engine::sample($state,$now+60);check(count($state['equityCurve'])===1,'equity samples bounded by hour');
$input=Engine::defaults();$validated=bot_settings(array_replace($input,['maxPositions'=>'5','searchQuery'=>' btc ']),$input,false);
check($validated['searchQuery']==='btc' && $validated['maxPositions']===5,'settings validation');
try { bot_settings(array_replace($input,['initialBalance'=>'2000']),$input,true);check(false,'initial balance locked'); } catch (RuntimeException $e) { check(true,'initial balance locked'); }
try { bot_settings(array_replace($input,['riskPct'=>'NaN']),$input,false);check(false,'reject bad numeric'); } catch (RuntimeException $e) { check(true,'reject bad numeric'); }

$directory=__DIR__.'/.tmp-'.bin2hex(random_bytes(6));
try {
    $store=new Store($directory); check($store->acquire(),'store lock'); $state=account(); $store->write($state);
    check($store->read()===$state,'atomic store round-trip');
    $other=new Store($directory);check(!$other->acquire(),'concurrent writer excluded');$other->release();
    $raw=file_get_contents($directory.'/state.php');check(strpos($raw,'<?php http_response_code(404); exit; ?>')===0,'stored data is guarded PHP');
    $store->release();
    $_SERVER['DOCUMENT_ROOT']=__DIR__;
    try { new Store($directory);check(false,'public data dir rejected'); } catch (RuntimeException $e) { check(true,'public data dir rejected'); }
    unset($_SERVER['DOCUMENT_ROOT']);
} finally { foreach (glob($directory.'/*') ?: [] as $file) unlink($file);rmdir($directory); }

class FixtureMarket extends Market {
    public array $calls=[]; public bool $sourceFails=false; public array $feed=[]; public array $history=[];
    public function json(string $url, ?string $token=null): array { $this->calls[]=$url; if($this->sourceFails)throw new RuntimeException('source offline');return $this->feed; }
    public function quote(array $instrument): float { return 100; }
    public function candles(array $p,int $now): array { return $this->history; }
}
$now=time();[$coin,$f]=fixture($now);
$feed=['success'=>true,'generatedAt'=>$now*1000,'snapshots'=>[['key'=>'all_futures_1h_100000','generatedAt'=>$now*1000,'data'=>[array_replace($coin,['formations'=>[$f]])]]],
    'sources'=>[['exchange'=>'binance','marketType'=>'futures','status'=>'live','updatedAt'=>$now*1000]]];
$market=new FixtureMarket();$market->feed=$feed;$state=account();$state['sourceToken']=str_repeat('x',64);
$result=Runner::run($state,['source_url'=>'https://example.test/feed'],$market,$now);
check($result['opened']===1 && $result['status']==='ok','runner opens from exact existing feed contract');check(count($market->calls)===1,'one VPS request');
$state['settings']['enabled']=false;$market->sourceFails=true;$id=array_key_first($state['positions']);$cursor=$state['positions'][$id]['cursor'];
$market->history=[bar($cursor,100,110,99,106)];
Runner::run($state,['source_url'=>'https://example.test/feed'],$market,$cursor+60);
check(count($state['history'])===1 && !$state['positions'],'open position managed while paused and feed down');
$market=new FixtureMarket();$market->feed=$feed;$state=account(['timeframe'=>'15m']);$state['sourceToken']=str_repeat('x',64);
$result=Runner::run($state,['source_url'=>'https://example.test/feed'],$market,$now);
check($result['opened']===0 && $result['status']==='degraded','unsupported timeframe does not silently use 1h');
$market=new FixtureMarket();$market->feed=$feed;$market->feed['sources'][0]['status']='unavailable';$state=account();$state['sourceToken']=str_repeat('x',64);
$result=Runner::run($state,['source_url'=>'https://example.test/feed'],$market,$now);
check(!$state['positions'],'unavailable market source cannot create entry');
$market=new FixtureMarket();$market->feed=$feed;$market->feed['generatedAt']=($now-200)*1000;$state=account();$state['sourceToken']=str_repeat('x',64);
$result=Runner::run($state,['source_url'=>'https://example.test/feed'],$market,$now);
check(!$state['positions'] && $state['sourceError']!=='','stale feed blocks entries');
class QuoteFixtureMarket extends Market {
    public array $responses=[]; public array $requests=[];
    public function json(string $url, ?string $token=null): array {
        $this->requests[]=$url;
        return array_shift($this->responses) ?? [];
    }
}
$market=new QuoteFixtureMarket();$market->responses=[[['symbol'=>'BTCUSDT','price'=>'100'],['symbol'=>'ETHUSDT','price'=>'50']]];
near($market->quote($coin),100,'Binance quote parser');$other=$coin;$other['symbol']='ETHUSDT';near($market->quote($other),50,'bulk quotes reused');check(count($market->requests)===1,'one ticker request per source');
$market=new QuoteFixtureMarket();$market->responses=[[]];
for($i=0;$i<2;$i++) { try { $market->quote($coin);check(false,'empty quote must fail'); } catch(RuntimeException $e) { check(true,'empty quote fails'); } }
check(count($market->requests)===1,'failed source not repeatedly requested');
$market=new QuoteFixtureMarket();$market->responses=[['retCode'=>0,'time'=>time()*1000,'result'=>['list'=>[['symbol'=>'BTCUSDT','lastPrice'=>'101']]]]];
$bybit=$coin;$bybit['exchange']='bybit';near($market->quote($bybit),101,'Bybit lastPrice parser');
$market=new QuoteFixtureMarket();$market->responses=[['retCode'=>0,'time'=>(time()-200)*1000,'result'=>['list'=>[['symbol'=>'BTCUSDT','lastPrice'=>'101']]]]];
try { $market->quote($bybit);check(false,'stale ticker rejected'); } catch(RuntimeException $e) { check(true,'stale ticker rejected'); }
$international=$coin;$international['symbol']='测试USDT';$international['baseAsset']='测试';
check(Engine::reject($international,$f,Engine::defaults(),$now)===null,'international exchange symbols accepted');
$position=['instrument'=>'bybit:futures:测试USDT','exchange'=>'bybit','marketType'=>'futures','symbol'=>'测试USDT','cursor'=>intdiv($now,60)*60-120];
$market=new QuoteFixtureMarket();$market->responses=[['retCode'=>0,'result'=>['list'=>[[($position['cursor']+60)*1000,'100','102','99','101'],[$position['cursor']*1000,'100','101','99','100']]]]];
$bars=$market->candles($position,$now);check(count($bars)===2 && $bars[0]['open']===100.0,'Bybit reverse-order bars parsed');
check(strpos($market->requests[0],rawurlencode('测试USDT'))!==false,'international symbols URL encoded');
$market=new QuoteFixtureMarket();$market->responses=[[]];$position['exchange']='binance';$position['cursor']-=2000*60;
$market->candles($position,$now);parse_str(parse_url($market->requests[0],PHP_URL_QUERY),$query);
check((int)$query['endTime'] < ($position['cursor']+1000*60)*1000,'catch-up bounded to 1000 minutes');
$market=new FixtureMarket();$market->feed=$feed;$market->feed['sources'][]=['exchange'=>'bybit','marketType'=>'futures','status'=>'unavailable','updatedAt'=>null];
$state=account();$state['sourceToken']=str_repeat('x',64);$result=Runner::run($state,['source_url'=>'https://example.test/feed'],$market,$now);
check($result['opened']===1 && $result['status']==='degraded' && count($state['sourceWarnings'])===1,'partial source failure is visible while healthy exchange remains actionable');
echo "OK: $tests checks\n";
