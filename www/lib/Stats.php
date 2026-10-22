<?php
declare(strict_types=1);
final class Stats
{
    public static function events(array $state): array
    {
        $events=[];
        foreach(array_merge($state['history'],array_values($state['positions'])) as $p){
            $events[]=['time'=>$p['openedAt'],'amount'=>-$p['entryFee'],'fee'=>$p['entryFee'],'kind'=>'entry','trade'=>$p];
            if(isset($p['closedAt']))$events[]=['time'=>$p['closedAt'],'amount'=>$p['grossPnl']-$p['exitFee'],'fee'=>$p['exitFee'],'kind'=>'exit','trade'=>$p];
        }
        usort($events,static function($a,$b){return ($a['time']<=>$b['time'])?:strcmp($a['kind'],$b['kind']);});
        return $events;
    }
    public static function cashBefore(array $state,int $time): float
    {
        $cash=(float)$state['settings']['initialBalance'];
        foreach(self::events($state) as $e)if($e['time']<$time)$cash+=$e['amount'];
        return $cash;
    }
    public static function periods(array $state,string $period,string $strategy='all'): array
    {
        if(!in_array($period,['hour','day','week','month'],true))throw new RuntimeException('Невідомий період');
        $timezone=new DateTimeZone($state['reportTimezone']);$rows=[];$cash=(float)$state['settings']['initialBalance'];
        foreach(self::events($state) as $e){
            $date=(new DateTimeImmutable('@'.$e['time']))->setTimezone($timezone);
            switch($period){case 'hour':$key=$date->format('Y-m-d H:00 P');break;case 'day':$key=$date->format('Y-m-d');break;case 'week':$key=$date->format('o-\WW');break;default:$key=$date->format('Y-m');}
            $p=$e['trade'];$matches=$strategy==='all'||($strategy==='reverse'?(!empty($p['reversed'])&&($p['strategy']??'formations')==='formations'):($p['strategy']??'formations')===$strategy);
            if(!isset($rows[$key]))$rows[$key]=['period'=>$key,'opened'=>0,'closed'=>0,'wins'=>0,'losses'=>0,'breakeven'=>0,'grossPnl'=>0.0,'netPnl'=>0.0,'fees'=>0.0,'cashChange'=>0.0,'cashStart'=>$cash,'cashEnd'=>$cash,'profit'=>0.0,'loss'=>0.0,'duration'=>0.0,'rSum'=>0.0,'best'=>null,'worst'=>null,'ambiguous'=>0];
            $cash+=$e['amount'];$rows[$key]['cashEnd']=$cash;
            if(!$matches)continue;
            $r=&$rows[$key];$r['fees']+=$e['fee'];$r['cashChange']+=$e['amount'];
            if($e['kind']==='entry')$r['opened']++;
            else{
                $r['closed']++;$r['grossPnl']+=$p['grossPnl'];$r['netPnl']+=$p['netPnl'];$r['profit']+=max(0,$p['netPnl']);$r['loss']+=max(0,-$p['netPnl']);
                $r[$p['netPnl']>1e-8?'wins':($p['netPnl']< -1e-8?'losses':'breakeven')]++;
                $r['duration']+=max(0,$p['closedAt']-$p['openedAt']);$r['rSum']+=$p['netPnl']/max(1e-12,$p['risk']);
                $r['best']=$r['best']===null?$p['netPnl']:max($r['best'],$p['netPnl']);$r['worst']=$r['worst']===null?$p['netPnl']:min($r['worst'],$p['netPnl']);$r['ambiguous']+=(!empty($p['ambiguous'])||!empty($p['dataGapExit']))?1:0;
            }
            unset($r);
        }
        foreach($rows as &$r){$r['winRate']=$r['closed']?$r['wins']/$r['closed']*100:0;$r['profitFactor']=$r['loss']>0?$r['profit']/$r['loss']:null;$r['expectancy']=$r['closed']?$r['netPnl']/$r['closed']:0;$r['averageR']=$r['closed']?$r['rSum']/$r['closed']:0;$r['averageMinutes']=$r['closed']?$r['duration']/$r['closed']/60:0;}
        unset($r);return array_reverse(array_values($rows));
    }
}
