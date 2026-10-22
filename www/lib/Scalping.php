<?php
declare(strict_types=1);
final class Scalping
{
    public static function defaults(): array
    {
        return ['enabled'=>false,'exchange'=>'binance','marketType'=>'futures','symbols'=>'BTCUSDT,ETHUSDT,SOLUSDT',
            'timeframes'=>['1m','5m'],'contextTimeframe'=>'15m','direction'=>'both','lookback'=>30,
            'zonePct'=>15.0,'confirmation'=>'rejection','rsiMode'=>'recovery','rsiPeriod'=>14,'rsiLow'=>35.0,'rsiHigh'=>65.0,
            'atrPeriod'=>14,'minAtrPct'=>0.05,'maxAtrPct'=>2.0,'minRangePct'=>0.5,'maxRangePct'=>10.0,
            'minVolumeUsd'=>10000000.0,'minRvol'=>1.0,'trendMode'=>'range','emaFast'=>9,'emaSlow'=>21,'maxTrendAtr'=>1.5,
            'stopBufferAtr'=>0.25,'targetBufferAtr'=>0.1,'minStopPct'=>0.1,'maxStopPct'=>2.0,
            'minRR'=>1.5,'minNetProfitPct'=>0.15,'maxEntryDeviationPct'=>0.2,'maxSignalAge'=>120,'maxQuoteAge'=>90,
            'riskPct'=>0.5,'maxPositions'=>3,'leverage'=>1.0,'feePct'=>0.06,'slippagePct'=>0.03,
            'maxDailyLossPct'=>3.0,'maxDrawdownPct'=>10.0,'maxTradesDay'=>20,'maxConsecutiveLosses'=>3,
            'lossPauseMinutes'=>60,'cooldownMinutes'=>5,'maxHoldMinutes'=>30,'maxWatch'=>8,'sessionStart'=>0,'sessionEnd'=>24];
    }
    public static function settings(array $input,array $previous): array
    {
        $s=$previous;
        $enums=['exchange'=>['binance','bybit','all'],'marketType'=>['futures','spot'], 'direction'=>['both','long','short'],
            'contextTimeframe'=>['1m','5m','15m','1h','4h'],'confirmation'=>['rejection','break_previous'],
            'rsiMode'=>['recovery','extreme','off'],'trendMode'=>['range','trend','off']];
        foreach($enums as $k=>$values){if(!in_array($input[$k]??'', $values,true))throw new RuntimeException('Некоректне поле скальпінгу: '.$k);$s[$k]=$input[$k];}
        $ranges=['lookback'=>[10,100],'zonePct'=>[1,30],'rsiPeriod'=>[5,30],'rsiLow'=>[10,49],'rsiHigh'=>[51,90],
            'atrPeriod'=>[5,30],'minAtrPct'=>[0.001,10],'maxAtrPct'=>[0.01,20],'minRangePct'=>[0.01,20],'maxRangePct'=>[0.1,50],
            'minVolumeUsd'=>[0,10000000000],'minRvol'=>[0,10],'emaFast'=>[3,30],'emaSlow'=>[5,100],'maxTrendAtr'=>[0.1,10],
            'stopBufferAtr'=>[0.01,3],'targetBufferAtr'=>[0,3],'minStopPct'=>[0.01,5],'maxStopPct'=>[0.05,10],
            'minRR'=>[0.2,10],'minNetProfitPct'=>[0,10],'maxEntryDeviationPct'=>[0.01,2], 'maxSignalAge'=>[30,600],'maxQuoteAge'=>[15,120],
            'riskPct'=>[0.01,3],'maxPositions'=>[1,10],'leverage'=>[1,10],'feePct'=>[0,2],'slippagePct'=>[0,2],
            'maxDailyLossPct'=>[0.1,20],'maxDrawdownPct'=>[0.1,50],'maxTradesDay'=>[1,200], 'maxConsecutiveLosses'=>[1,20],
            'lossPauseMinutes'=>[1,1440],'cooldownMinutes'=>[1,1440],'maxHoldMinutes'=>[1,1440], 'maxWatch'=>[1,8],'sessionStart'=>[0,23],'sessionEnd'=>[1,24]];
        $integers=['lookback','rsiPeriod','atrPeriod','emaFast','emaSlow','maxSignalAge','maxQuoteAge','maxPositions','maxTradesDay','maxConsecutiveLosses','lossPauseMinutes','cooldownMinutes','maxHoldMinutes','maxWatch','sessionStart','sessionEnd'];
        foreach($ranges as $k=>[$min,$max]){
            $v=$input[$k]??null;
            if(!is_scalar($v)||!is_numeric($v)||!is_finite((float)$v)||$v<$min||$v>$max)throw new RuntimeException('Діапазон скальпінгу: '.$k);
            if(in_array($k,$integers,true)&&floor((float)$v)!==(float)$v)throw new RuntimeException('Потрібне ціле значення: '.$k);
            $s[$k]=in_array($k,$integers,true)?(int)$v:(float)$v;
        }
        $frames=$input['timeframes']??[];
        if(!is_array($frames)||!$frames||count($frames)>3||count(array_unique($frames))!==count($frames))throw new RuntimeException('Виберіть 1–3 різні таймфрейми');
        foreach($frames as $tf)if(!is_string($tf)||!in_array($tf,['1m','5m','15m','1h'],true))throw new RuntimeException('Невідомий таймфрейм входу');
        $s['timeframes']=array_values($frames);
        if($s['emaFast']>=$s['emaSlow']||$s['minAtrPct']>$s['maxAtrPct']||$s['minRangePct']>$s['maxRangePct']||$s['minStopPct']>$s['maxStopPct']||$s['sessionStart']===$s['sessionEnd'])throw new RuntimeException('Суперечливі межі скальпінгу');
        foreach($frames as $tf)if(Market::seconds($tf)>Market::seconds($s['contextTimeframe']))throw new RuntimeException('Контекст має бути не нижчим за таймфрейм входу');
        if(!is_string($input['symbols']??null)||strlen($input['symbols'])>500)throw new RuntimeException('Некоректний список монет');
        $symbols=array_filter(array_map('trim',explode(',',strtoupper($input['symbols']))));
        if(count($symbols)>8)throw new RuntimeException('Максимум 8 монет');
        foreach($symbols as $symbol)if(!preg_match('/^[\p{L}\p{N}]{1,56}USDT$/uD',$symbol))throw new RuntimeException('Потрібні USDT-символи через кому');
        $s['symbols']=implode(',',array_unique($symbols));
        return $s;
    }
    public static function watch(array $state): array
    {
        $s=$state['scalpSettings'];$watch=[];
        $symbols=array_filter(explode(',',$s['symbols']));
        if($symbols){foreach($s['exchange']==='all'?['binance','bybit']:[$s['exchange']] as $exchange)foreach($symbols as $symbol)$watch[]=$exchange.':'.$s['marketType'].':'.$symbol;}
        else{
            $coins=$state['marketQuotes']??[];usort($coins,static function($a,$b){return ($b['volumeUsd']??0)<=>($a['volumeUsd']??0);});
            foreach($coins as $c)if(($s['exchange']==='all'||$s['exchange']===$c['exchange'])&&$s['marketType']===$c['marketType']&&($c['quoteAsset']??'')==='USDT')$watch[]=Engine::key($c);
        }
        return array_slice(array_values(array_unique($watch)),0,$s['maxWatch']);
    }
    public static function guard(array $state,int $now): ?string
    {
        $s=$state['scalpSettings'];
        if(!$s['enabled'])return 'АвтоСкальпінг вимкнено';
        $zone=new DateTimeZone($state['reportTimezone']);$date=(new DateTimeImmutable('@'.$now))->setTimezone($zone);$hour=(int)$date->format('G');
        $inside=$s['sessionStart']<$s['sessionEnd']?($hour>=$s['sessionStart']&&$hour<$s['sessionEnd']):($hour>=$s['sessionStart']||$hour<$s['sessionEnd']);
        if(!$inside)return 'Поза торговими годинами';
        $start=$date->setTime(0,0)->getTimestamp();$trades=[];$day=0.0;$consecutive=0;$lastLoss=0;
        foreach($state['history'] as $p)if(($p['strategy']??'formations')==='scalping')$trades[]=$p;
        usort($trades,static function($a,$b){return $b['closedAt']<=>$a['closedAt'];});
        foreach($trades as $p){if($p['closedAt']>=$start)$day+=$p['netPnl'];}
        foreach($state['positions'] as $p)if(($p['strategy']??'formations')==='scalping')$day+=($p['mark']-$p['entry'])*$p['qty']*$p['direction']-$p['entryFee'];
        $count=0;foreach(array_merge($trades,array_values($state['positions'])) as $p)if(($p['strategy']??'formations')==='scalping'&&$p['openedAt']>=$start)$count++;
        if($count>=$s['maxTradesDay'])return 'Ліміт угод за день';
        $baseline=Stats::cashBefore($state,$start);
        if($day<=-max(1,$baseline)*$s['maxDailyLossPct']/100)return 'Денний ліміт збитку';
        if((1-Engine::equity($state)/max(1,$state['peakEquity']))*100>=$s['maxDrawdownPct'])return 'Ліміт просадки рахунку';
        foreach($trades as $p){if($p['netPnl']>=0)break;$consecutive++;$lastLoss=max($lastLoss,$p['closedAt']);}
        if($consecutive>=$s['maxConsecutiveLosses']&&$lastLoss+$s['lossPauseMinutes']*60>$now)return 'Пауза після серії збитків';
        return null;
    }
    public static function signal(array $coin,array $bars,array $context,array $s,int $now): array
    {
        $fail=static function(string $reason,array $metrics=[],bool $ready=true){return ['reason'=>$reason,'signal'=>null,'metrics'=>$metrics,'dataReady'=>$ready];};
        $seconds=Market::seconds($coin['timeframe']);$need=max($s['lookback']+2,$s['atrPeriod']+2,$s['rsiPeriod']+3,22);
        $bars=array_slice($bars,-max($need,100));
        if(count($bars)<$need)return $fail('Прогрів: потрібно '.$need.' закритих свічок, є '.count($bars),[],false);
        if(!Indicators::contiguous($bars,$seconds))return $fail('Прогалина у свічках входу',[],false);
        $last=$bars[count($bars)-1];$prev=$bars[count($bars)-2];
        if($last['time']+$seconds>$now||$now-($last['time']+$seconds)>$s['maxSignalAge'])return $fail('Сигнальна свічка застаріла або не закрита',[],false);
        $window=array_slice($bars,-$s['lookback']-1,$s['lookback']);
        $low=min(array_column($window,'low'));$high=max(array_column($window,'high'));$range=$high-$low;
        $atr=Indicators::atr($bars,$s['atrPeriod']);$closes=array_column($bars,'close');
        $rsi=Indicators::rsi($closes,$s['rsiPeriod']);$previousRsi=Indicators::rsi(array_slice($closes,0,-1),$s['rsiPeriod']);
        $volume=array_column(array_slice($bars,-21,20),'volume');$avg=array_sum($volume)/max(1,count($volume));$rvol=$avg>0?$last['volume']/$avg:0;
        $atrPct=$atr/$last['close']*100;$rangePct=$range/$last['close']*100;
        $metrics=compact('low','high','atr','atrPct','rangePct','rsi','previousRsi','rvol');
        if($range<=0||$atr<=0||$atrPct<$s['minAtrPct']||$atrPct>$s['maxAtrPct']||$rangePct<$s['minRangePct']||$rangePct>$s['maxRangePct'])return $fail('Діапазон / ATR поза налаштуваннями',$metrics);
        if($rvol<$s['minRvol'])return $fail('Недостатній відносний обсяг',$metrics);
        if(($coin['volume24hUsd']??0)<$s['minVolumeUsd'])return $fail('Недостатня ліквідність за 24h',$metrics);
        $long=$last['low']<=$low+$range*$s['zonePct']/100&&$last['close']>$low&&$last['close']>$last['open']&&$last['close']>$prev['close'];
        $short=$last['high']>=$high-$range*$s['zonePct']/100&&$last['close']<$high&&$last['close']<$last['open']&&$last['close']<$prev['close'];
        if($s['confirmation']==='break_previous'){$long=$long&&$last['close']>$prev['high'];$short=$short&&$last['close']<$prev['low'];}
        if(!$long&&!$short)return $fail('Немає підтвердженого відскоку від лою / хаю',$metrics);
        $direction=$long?1:-1;
        if(($direction===1&&$s['direction']==='short')||($direction===-1&&($s['direction']==='long'||$coin['marketType']==='spot')))return $fail('Напрямок / spot-short заборонений',$metrics);
        if($s['rsiMode']==='recovery'&&!($direction===1?($previousRsi<$s['rsiLow']&&$rsi>=$s['rsiLow']):($previousRsi>$s['rsiHigh']&&$rsi<=$s['rsiHigh'])))return $fail('RSI ще не повернувся з екстремальної зони',$metrics);
        if($s['rsiMode']==='extreme'&&!($direction===1?($rsi<=$s['rsiLow']&&$rsi>$previousRsi):($rsi>=$s['rsiHigh']&&$rsi<$previousRsi)))return $fail('RSI не підтверджує розворот',$metrics);
        if($s['trendMode']!=='off'){
            $context=array_slice($context,-max(60,$s['emaSlow']+1));$ctxSec=Market::seconds($s['contextTimeframe']);
            if(count($context)<$s['emaSlow']+1||!Indicators::contiguous($context,$ctxSec))return $fail('Прогрів / прогалина старшого таймфрейму',$metrics,false);
            $ctxLast=$context[count($context)-1];if($ctxLast['time']+$ctxSec>$now||$now-($ctxLast['time']+$ctxSec)>$ctxSec+120)return $fail('Застарілий старший таймфрейм',$metrics,false);
            $ctxAtr=Indicators::atr($context,min(14,count($context)-1));$fast=Indicators::ema(array_column($context,'close'),$s['emaFast']);$slow=Indicators::ema(array_column($context,'close'),$s['emaSlow']);
            $trend=($fast-$slow)/max(1e-12,$ctxAtr);$metrics['trendAtr']=$trend;
            if(($s['trendMode']==='range'&&abs($trend)>$s['maxTrendAtr'])||($s['trendMode']==='trend'&&$trend*$direction<0))return $fail('Фільтр тренду старшого таймфрейму',$metrics);
        }
        $stop=$direction===1?min($low,$last['low'])-$atr*$s['stopBufferAtr']:max($high,$last['high'])+$atr*$s['stopBufferAtr'];
        $target=$direction===1?$high-$atr*$s['targetBufferAtr']:$low+$atr*$s['targetBufferAtr'];
        return ['reason'=>'Готовий підтверджений сигнал','metrics'=>$metrics,'dataReady'=>true,'signal'=>[
            'id'=>'range:'.$coin['timeframe'].':'.$last['time'].':'.$direction,'entry'=>$last['close'],'stop'=>$stop,'target'=>$target,'direction'=>$direction,
            'signalAt'=>$last['time']+$seconds,'metrics'=>$metrics,'maxHoldMinutes'=>$s['maxHoldMinutes']]];
    }
}
