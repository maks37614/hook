<?php
declare(strict_types=1);
final class Runner
{
    public static function run(array &$state,array $config,Market $market,int $now): array
    {
        $state=Engine::upgrade($state);$state['lastRun']=$now;$state['lastError']='';$state['sourceError']='';
        $state['sourceWarnings']=[];$state['rejections']=[];$state['scalpDiagnostics']=[];$state['formationError']='';
        if(($state['marketCooldownUntil']??0)>$now){$state['lastError']='Пауза джерела після обмеження запитів';return ['status'=>'cooldown'];}
        $before=count($state['history']);$opened=0;$feed=null;
        try{$feed=$market->prepare($state,$config,$now);$state['lastSource']=$now;}
        catch(Throwable $e){$state['sourceError']=$e->getMessage();}
        // Both strategies share the same account and immutable, independently monitored positions.
        foreach(array_keys($state['positions']) as $id){
            $p=$state['positions'][$id];$quote=null;$quoteAt=0;
            try{$q=$market->quoteInfo($p,$now,90);$quote=(float)$q['price'];$quoteAt=(int)floor($q['updatedAt']/1000);if($quoteAt<$p['openedAt'])throw new RuntimeException('Ще немає котирування після входу');}
            catch(Throwable $e){$quote=null;$quoteAt=0;$state['lastError']=$e->getMessage();}
            try{
                Engine::monitor($state,$id,$market->candles($p,$now),$quote,$now);
                if(isset($state['positions'][$id])&&$quoteAt&&$state['positions'][$id]['monitorError']==='')$state['positions'][$id]['markAt']=$quoteAt;
            }catch(Throwable $e){$state['positions'][$id]['monitorError']=$e->getMessage();$state['lastError']=$e->getMessage();}
        }
        $blocked=false;foreach($state['positions'] as $p)if($p['monitorError']!==''||$p['markAt']<$now-90)$blocked=true;
        $state['dataBudgetExceeded']=strlen(json_encode($state,JSON_INVALID_UTF8_SUBSTITUTE))>7*1024*1024;
        $candidates=[];
        if($feed){try{$candidates=self::formations($state,$feed,$now);}catch(Throwable $e){$state['formationError']=$e->getMessage();}}
        $nextWatch=[];foreach($candidates as $candidate)$nextWatch[Engine::key($candidate['coin'])]=true;
        $state['watchlist']=array_slice(array_keys($nextWatch),0,12);
        if($state['settings']['enabled']&&!$blocked&&$state['sourceError']===''&&$state['formationError']===''){
            foreach($candidates as $candidate){
                if(count($state['positions'])>=$state['settings']['maxPositions'])break;
                try{
                    $q=$market->quoteInfo($candidate['coin'],$now,90);
                    self::requireMinute($market,$candidate['coin'],$now);
                    $reason=Engine::open($state,$candidate['coin'],$candidate['formation'],(float)$q['price'],$now);
                    if($reason!==null)self::reject($state,$reason);else {$opened++;$id=array_key_last($state['positions']);$state['positions'][$id]['quoteAt']=(int)floor($q['updatedAt']/1000);$state['positions'][$id]['markAt']=$state['positions'][$id]['quoteAt'];}
                }catch(Throwable $e){self::reject($state,$e->getMessage());}
            }
        }
        $scalpGuard=Scalping::guard($state,$now);$state['scalpStatus']=$scalpGuard??'Аналіз реального ринку';
        $scalpDataReady=false;
        foreach(Scalping::watch($state) as $instrument){
            [$exchange,$type,$symbol]=explode(':',$instrument);$coin=['exchange'=>$exchange,'marketType'=>$type,'symbol'=>$symbol];
            foreach($state['scalpSettings']['timeframes'] as $tf){
                $coin['timeframe']=$tf;$result=['reason'=>'Немає даних','metrics'=>[]];
                try{
                    $q=$market->quoteInfo($coin,$now,$state['scalpSettings']['maxQuoteAge']);
                    $coin+=['baseAsset'=>$q['baseAsset'],'quoteAsset'=>$q['quoteAsset'],'volume24hUsd'=>(float)$q['volumeUsd']];
                    self::requireMinute($market,$coin,$now);
                    $result=Scalping::signal($coin,$market->bars($coin,$tf,$now),$market->bars($coin,$state['scalpSettings']['contextTimeframe'],$now),$state['scalpSettings'],$now);
                    if(!empty($result['dataReady']))$scalpDataReady=true;
                    if($result['signal']){
                        $guard=Scalping::guard($state,$now);
                        if($blocked)$result['reason']='Є позиція з прогалиною даних; нові входи заблоковані';
                        elseif($guard!==null)$result['reason']=$guard;
                        elseif($state['sourceError']===''){
                            $reason=Engine::openScalp($state,$coin,$result['signal'],(float)$q['price'],$now);
                            if($reason===null){$opened++;$id=array_key_last($state['positions']);$state['positions'][$id]['quoteAt']=(int)floor($q['updatedAt']/1000);$state['positions'][$id]['markAt']=$state['positions'][$id]['quoteAt'];$result['reason']='Позицію відкрито';}else $result['reason']=$reason;
                        }
                    }
                }catch(Throwable $e){$result['reason']=$e->getMessage();}
                $state['scalpDiagnostics'][]=['instrument'=>$instrument,'timeframe'=>$tf,'time'=>$now,'reason'=>$result['reason'],'metrics'=>$result['metrics']??[]];
            }
        }
        if($state['scalpSettings']['enabled']&&!$scalpDataReady)$state['scalpStatus']='Очікування достатніх свіжих даних h00k.top';
        if($market->rateLimited)$state['marketCooldownUntil']=$now+$market->retryAfter;
        Engine::sample($state,$now);
        // Derived reports are refreshed by cron and can always be rebuilt from the durable ledger.
        foreach(['hour','day','week','month'] as $period)$state['periodStats'][$period]=array_slice(Stats::periods($state,$period),0,200);
        $degraded=$state['sourceError']!==''||$state['lastError']!==''||$blocked||($state['settings']['enabled']&&$state['formationError']!=='')||($state['scalpSettings']['enabled']&&!$scalpDataReady);
        return ['status'=>$degraded?'degraded':'ok','opened'=>$opened,'closed'=>count($state['history'])-$before,'positions'=>count($state['positions']),'balance'=>$state['balance']];
    }
    private static function requireMinute(Market $market,array $coin,int $now): void
    {
        $bars=$market->bars($coin,'1m',$now);$last=$bars?end($bars):null;
        if(!$last||$last['time']+60<$now-90)throw new RuntimeException('Немає свіжих 1m-свічок h00k.top. Очікування кешу; входи заборонені');
    }
    private static function reject(array &$state,string $reason): void{$state['rejections'][$reason]=($state['rejections'][$reason]??0)+1;}
    private static function formations(array &$state,array $feed,int $now): array
    {
        $state['coverage']=[];$candidates=[];$covered=false;$s=$state['settings'];
        foreach($feed['snapshots']??[] as $snapshot){
            $stamp=(float)($snapshot['generatedAt']??0)/1000;
            if($stamp<$now-180||$stamp>$now+30)continue;
            $parts=explode('_',$snapshot['key']??'');if(count($parts)!==4)continue;
            [$exchange,$type,$tf,$min]=$parts;$state['coverage'][]=$parts;
            if($s['timeframe']!==$tf||(float)$min>$s['minVolumeUsd']||($exchange!=='all'&&$exchange!==$s['exchange'])||($type!=='all'&&$type!==$s['marketType']))continue;
            $covered=true;
            foreach($snapshot['data']??[] as $coin)foreach($coin['formations']??[] as $f){
                $reason=Engine::reject($coin,$f,$s,$now);if($reason!==null){self::reject($state,$reason);continue;}
                $key=Engine::key($coin).':'.$tf.':'.$f['id'];
                if(!isset($candidates[$key])||$stamp>$candidates[$key]['time'])$candidates[$key]=['coin'=>$coin,'formation'=>$f,'time'=>$stamp];
            }
        }
        if(!$covered)throw new RuntimeException('Немає свіжого кешу формацій для вибраних фільтрів');
        usort($candidates,static function($a,$b)use($s){
            $score=static function($c)use($s){switch($s['sortBy']){case 'volume':return $c['coin']['volume24hUsd'];case 'priceChange':return abs($c['coin']['priceChange24h']);case 'profitPotential':return $c['formation']['riskRewardRatio'];default:return $c['formation']['confidence'];}};
            return ($s['sortOrder']==='asc'?1:-1)*($score($a)<=>$score($b));
        });
        return $candidates;
    }
}
