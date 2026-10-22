<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
// Indicators and aggregation have independently known numeric expectations.
near(Indicators::ema([1,2,3,4,5],3),4,'EMA recurrence');
near(Indicators::rsi(range(1,20),14),100,'RSI with only gains');near(Indicators::rsi(array_reverse(range(1,20)),14),0,'RSI with only losses');near(Indicators::rsi(array_fill(0,20,100),14),50,'RSI of a flat series');
$bars=[];$t=intdiv($now,300)*300-600;
for($i=0;$i<10;$i++)$bars[]=[$t+$i*60,100+$i,102+$i,99+$i,101+$i,10];
$market=new Market();$market->ingest([$q],[['instrument'=>'binance:futures:BTCUSDT','timeframe'=>'1m','candles'=>$bars]],$now);
$agg=$market->bars($coin,'5m',$now);check(count($agg)===2,'two complete 5m candles from real minutes');near($agg[0]['open'],100,'aggregated open');near($agg[0]['high'],106,'aggregated high');near($agg[0]['low'],99,'aggregated low');near($agg[0]['close'],105,'aggregated close');near($agg[0]['volume'],50,'aggregated volume');
$missing=$bars;array_splice($missing,2,1);$market=new Market();$market->ingest([], [['instrument'=>'binance:futures:BTCUSDT','timeframe'=>'1m','candles'=>$missing]],$now);check(count($market->bars($coin,'5m',$now))===1,'missing minute cannot fabricate higher timeframe');
$future=[intdiv($now,60)*60,100,110,90,101,10];$bad=[$t,100,90,99,101,10];
$market=new Market();$market->ingest([], [['instrument'=>'binance:futures:BTCUSDT','timeframe'=>'1m','candles'=>[$future,$bad]]],$now);check(!$market->bars($coin,'1m',$now),'live and impossible bars rejected');
$old=$q;$old['updatedAt']=($now-121)*1000;$market->ingest([$old],[],$now);
try{$market->quoteInfo($coin,$now,90);check(false,'stale quote');}catch(RuntimeException $e){check(true,'stale quote rejected');}

foreach([false,true] as $short){
    [$c,$formation]=fixture($now,$short);$state=account(['reverse'=>true]);check(Engine::open($state,$c,$formation,100,$now)===null,'reverse still accepts the original valid signal');
    $p=reset($state['positions']);check($p['direction']===($short?1:-1)&&$p['reversed'],'reverse flips execution direction');
    near($p['stop'],$formation['levels']['targetPrice'],'reverse stop uses original real target');near($p['target'],$formation['levels']['stopLossPrice'],'reverse target uses original real stop');near($p['rr'],1/3,'reverse RR is reciprocal and not secretly inflated');
    $state=account(['reverse'=>true]);$formation['validation']['filters']['volume']=false;check(Engine::open($state,$c,$formation,100,$now)!==null,'reverse preserves original volume validation');
}
[$c,$formation]=fixture($now);$c['marketType']='spot';$state=account(['reverse'=>true,'marketType'=>'all']);check(Engine::open($state,$c,$formation,100,$now)!==null,'reverse cannot create naked spot short');
$state=account(['feePct'=>2]);$tiny=$f;$tiny['levels']=['entryPrice'=>100,'stopLossPrice'=>99.9,'targetPrice'=>100.3];check(Engine::open($state,$coin,$tiny,100,$now)!==null,'gross-profit targets cannot hide net loss after fees');

// Closed-candle range fixture: level window is independent of the reversal candle.
$sc=Scalping::defaults();$sc=array_replace($sc,['enabled'=>true,'rsiMode'=>'off','trendMode'=>'off','minVolumeUsd'=>0,'minRvol'=>0,'maxAtrPct'=>10,'maxStopPct'=>5,'minRR'=>1,'minNetProfitPct'=>0,'feePct'=>0,'slippagePct'=>0,'maxEntryDeviationPct'=>1]);
$entryCoin=$coin;$entryCoin['timeframe']='1m';$entryCoin['volume24hUsd']=50000000;
$signalBars=[];$base=intdiv($now,60)*60-50*60;
for($i=0;$i<50;$i++)$signalBars[]=['time'=>$base+$i*60,'open'=>103,'high'=>110,'low'=>100,'close'=>103,'volume'=>100];
$signalBars[48]=array_replace($signalBars[48],['open'=>102,'high'=>103,'low'=>100,'close'=>101]);
$signalBars[49]=array_replace($signalBars[49],['open'=>101,'high'=>103,'low'=>99.8,'close'=>102,'volume'=>150]);
$result=Scalping::signal($entryCoin,$signalBars,[],$sc,$now);
check($result['signal']!==null,'closed reversal near historical low creates long candidate');
check($result['signal']['direction']===1&&$result['signal']['stop']<99.8&&$result['signal']['target']<110,'ATR-buffered real levels');
$state=account(['enabled'=>false]);$state['scalpSettings']=$sc;
check(Engine::openScalp($state,$entryCoin,$result['signal'],102,$now)===null,'scalper runs while formations are paused');
$p=reset($state['positions']);check($p['strategy']==='scalping'&&!$p['reversed'],'strategy attribution');
$id=$p['id'];$time=$p['cursor'];Engine::monitor($state,$id,[],102,$time);check(isset($state['positions'][$id]),'first partial minute does not fabricate extrema');
$signalLater=$result['signal'];$signalLater['id'].='another';check(Engine::openScalp($state,$entryCoin,$signalLater,102,$now)!==null,'shared position lock and cooldown');
$cursor=$state['positions'][$id]['cursor'];$neutral=[];for($i=0;$i<31;$i++)$neutral[]=['time'=>$cursor+$i*60,'open'=>102,'high'=>103,'low'=>101,'close'=>102];
Engine::monitor($state,$id,$neutral,102,$cursor+31*60);check($state['history'][0]['reason']==='TIME_EXIT','time exit follows validated candle history');

$fall=$signalBars;$fall[49]=array_replace($fall[49],['open'=>101,'close'=>100.1]);check(Scalping::signal($entryCoin,$fall,[],$sc,$now)['signal']===null,'touching low while still falling is not a long entry');
$gap=$signalBars;array_splice($gap,30,1);check(Scalping::signal($entryCoin,$gap,[],$sc,$now)['signal']===null,'signal refuses history gaps');
$future=$signalBars;$future[49]['time']=intdiv($now,60)*60;check(Scalping::signal($entryCoin,$future,[],$sc,$now)['signal']===null,'live candle cannot trigger');
$volumeSc=$sc;$volumeSc['minRvol']=2;check(Scalping::signal($entryCoin,$signalBars,[],$volumeSc,$now)['signal']===null,'relative volume gate');
$rsiSc=$sc;$rsiSc['rsiMode']='recovery';$rsiSc['rsiLow']=49;check(Scalping::signal($entryCoin,$signalBars,[],$rsiSc,$now)['signal']===null,'RSI recovery not manufactured');
$trendSc=$sc;$trendSc['trendMode']='range';check(Scalping::signal($entryCoin,$signalBars,[],$trendSc,$now)['signal']===null,'missing higher timeframe blocks filtered entry');
$shortBars=array_map(static function($b){return array_replace($b,['open'=>210-$b['open'],'high'=>210-$b['low'],'low'=>210-$b['high'],'close'=>210-$b['close']]);},$signalBars);
$shortResult=Scalping::signal($entryCoin,$shortBars,[],$sc,$now);check($shortResult['signal']&&$shortResult['signal']['direction']===-1,'symmetric reversal near highs creates short');
$spot=$entryCoin;$spot['marketType']='spot';check(!Scalping::signal($spot,$shortBars,[],$sc,$now)['signal'],'scalping short excluded on spot');
check(Scalping::settings($sc,$sc)==$sc,'all detailed scalping settings round-trip');
try{Scalping::settings(array_replace($sc,['timeframes'=>['1m','1m']]),$sc);check(false,'duplicate frames');}catch(RuntimeException $e){check(true,'duplicate frames rejected');}
try{Scalping::settings(array_replace($sc,['contextTimeframe'=>'1m','timeframes'=>['5m']]),$sc);check(false,'lower context');}catch(RuntimeException $e){check(true,'lower context rejected');}

// Cash timing across periods must not double-charge fees or move them to the closing month.
$state=account(['feePct'=>0.06]);$state['reportTimezone']='UTC';$openTime=strtotime('2025-12-31 23:59:10 UTC');[$cc,$ff]=fixture($openTime);Engine::open($state,$cc,$ff,100,$openTime);$id=array_key_first($state['positions']);Engine::close($state,$id,106,strtotime('2026-01-01 00:01:00 UTC'),'TARGET');
$monthly=Stats::periods($state,'month');check($monthly[0]['period']==='2026-01'&&$monthly[1]['period']==='2025-12','monthly boundaries use event times');
near(array_sum(array_column($monthly,'cashChange')),$state['balance']-1000,'period cash changes reconcile ledger');near(array_sum(array_column($monthly,'netPnl')),$state['history'][0]['netPnl'],'net trade pnl counted once');
check($monthly[1]['opened']===1&&$monthly[1]['closed']===0&&$monthly[0]['closed']===1,'open and close belong to their real periods');
near($monthly[1]['fees'],$state['history'][0]['entryFee'],'entry fee stays in opening month');near($monthly[0]['fees'],$state['history'][0]['exitFee'],'exit fee stays in closing month');
near($monthly[0]['cashEnd'],$state['balance'],'closing cash matches balance');
$weekly=Stats::periods($state,'week');check(count($weekly)===1&&$weekly[0]['period']==='2026-W01','ISO year week across calendar year');
$state['reportTimezone']='Europe/Warsaw';$hourly=Stats::periods($state,'hour');check(strpos($hourly[0]['period'],'+01:00')!==false,'hour bucket includes UTC offset');
$state['reportTimezone']='UTC';check(Stats::periods($state,'day','scalping')[0]['closed']===0,'strategy-specific stats do not import other bot trades');
$legacy=$state;unset($legacy['scalpSettings'],$legacy['reportTimezone'],$legacy['marketBars'],$legacy['history'][0]['strategy'],$legacy['history'][0]['reversed']);$up=Engine::upgrade($legacy);check($up['balance']===$legacy['balance']&&$up['history'][0]['strategy']==='formations'&&!$up['scalpSettings']['enabled'],'migration preserves ledger and does not enable new bot');

$state=account(['enabled'=>false]);$state['reportTimezone']='UTC';$state['scalpSettings']=$sc;$state['scalpSettings']['maxTradesDay']=1;
$long=Scalping::signal($entryCoin,$signalBars,[],$sc,$now)['signal'];Engine::openScalp($state,$entryCoin,$long,102,$now);
check(Scalping::guard($state,$now)==='Ліміт угод за день','daily entry count includes open positions');
$state['scalpSettings']['maxTradesDay']=20;$id=array_key_first($state['positions']);Engine::close($state,$id,$state['positions'][$id]['stop'],$now+1,'STOP');
$state['scalpSettings']['maxDailyLossPct']=0.1;check(Scalping::guard($state,$now+2)==='Денний ліміт збитку','daily loss circuit breaker includes actual fee-adjusted pnl');
$state['scalpSettings']['maxDailyLossPct']=20;$state['scalpSettings']['maxConsecutiveLosses']=1;
check(Scalping::guard($state,$now+2)==='Пауза після серії збитків','consecutive loss pause');
$state['scalpSettings']['maxConsecutiveLosses']=3;$state['scalpSettings']['maxDrawdownPct']=0.1;
check(Scalping::guard($state,$now+2)==='Ліміт просадки рахунку','account drawdown breaker');
$state=account(['enabled'=>false]);$state['scalpSettings']=$sc;$state['reportTimezone']='UTC';$state['scalpSettings']['sessionStart']=23;$state['scalpSettings']['sessionEnd']=24;
check(Scalping::guard($state,strtotime('2026-10-22 05:00:00 UTC'))==='Поза торговими годинами','session hours use selected timezone');
$state=account(['reverse'=>true,'reverseMinRR'=>1]);check(Engine::open($state,$coin,$f,100,$now)!==null,'reverse minimum RR is enforced without relocating measured target');

$state=account();$state['reportTimezone']='Europe/Warsaw';
foreach(['2026-10-25 00:05:00 UTC','2026-10-25 01:05:00 UTC'] as $i=>$instant){$when=strtotime($instant);[$co,$fo]=fixture($when);$fo['id'].=$i;Engine::open($state,$co,$fo,100,$when);$id=array_key_first($state['positions']);Engine::close($state,$id,106,$when+60,'TARGET');}
$fold=Stats::periods($state,'hour');check(count($fold)===2&&strpos($fold[0]['period'],'02:00 +01:00')!==false&&strpos($fold[1]['period'],'02:00 +02:00')!==false,'repeated DST hour is never merged into one bucket');
$state['history'][0]['reversed']=true;check(array_sum(array_column(Stats::periods($state,'day','reverse'),'closed'))===1,'reverse-only reporting');

$market=new FixtureMarket();$market->feed=$feed;$market->feed['market']['series']=[];$state=account();$state['sourceToken']=str_repeat('x',64);$state['scalpSettings']['enabled']=true;
$waiting=Runner::run($state,['source_url'=>'https://h00k.top/api/paper/formations'],$market,$now);
check(!$state['positions']&&$waiting['status']==='degraded'&&strpos($state['scalpStatus'],'Очікування')!==false,'no minute data blocks both entry types and reports waiting');
$market=new FixtureMarket();$market->feed=$feed;$market->feed['market']['quotes'][0]['price']=102;$market->feed['market']['quotes'][0]['volumeUsd']=50000000;
$market->feed['market']['series']=[['instrument'=>'binance:futures:BTCUSDT','timeframe'=>'1m','updatedAt'=>$now*1000,'candles'=>array_map(static function($b){return [$b['time'],$b['open'],$b['high'],$b['low'],$b['close'],$b['volume']];},$signalBars)]];
$state=account(['enabled'=>false]);$state['sourceToken']=str_repeat('x',64);$state['scalpSettings']=$sc;$state['scalpSettings']['timeframes']=['1m'];$state['scalpSettings']['symbols']='BTCUSDT';
$result=Runner::run($state,['source_url'=>'https://h00k.top/api/paper/formations'],$market,$now);
check($result['opened']===1&&reset($state['positions'])['strategy']==='scalping','full scalp path from single real-shaped h00k snapshot to persisted virtual position');
check(count($market->calls)===1&&count($state['periodStats']['day'])===1,'one snapshot refresh also updates automatic period reports');
$state=account();Engine::open($state,$coin,$f,100,$now);$id=array_key_first($state['positions']);$p=$state['positions'][$id];$state['positions'][$id]['closeRequested']='force';
Engine::monitor($state,$id,[],null,$p['cursor']+180);check(isset($state['positions'][$id]),'manual gap exit still requires a fresh quote');
Engine::monitor($state,$id,[],101,$p['cursor']+180);check($state['history'][0]['reason']==='MANUAL_DATA_GAP'&&$state['history'][0]['dataGapExit'],'explicit manual gap exit retains uncertainty instead of inventing a historical fill');
near($state['balance'],1000+$state['history'][0]['netPnl'],'manual gap exit ledger reconciles');
$state=account();$state['sourceToken']=str_repeat('x',64);$market=new FixtureMarket();$market->feed=$feed;$market->feed['market']['quotes'][0]['updatedAt']=($now-30)*1000;
Runner::run($state,['source_url'=>'https://h00k.top/api/paper/formations'],$market,$now);$id=array_key_first($state['positions']);
check($id!==null&&$state['positions'][$id]['markAt']===$now-30&&$state['positions'][$id]['quoteAt']===$now-30,'entry retains actual source quote time rather than relabeling it as now');
$state['settings']['enabled']=false;$market->feed['market']['quotes'][0]['price']=110;
Runner::run($state,['source_url'=>'https://h00k.top/api/paper/formations'],$market,$now+10);
check(isset($state['positions'][$id])&&!$state['history'],'a quote collected before entry cannot create a post-entry target exit');
