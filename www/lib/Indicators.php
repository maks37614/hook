<?php
declare(strict_types=1);
final class Indicators
{
    public static function ema(array $values, int $period): ?float
    {
        if (count($values)<$period) return null;
        $ema=array_sum(array_slice($values,0,$period))/$period;
        $alpha=2/($period+1);
        foreach (array_slice($values,$period) as $v) $ema=$alpha*$v+(1-$alpha)*$ema;
        return $ema;
    }
    public static function rsi(array $closes, int $period): ?float
    {
        if (count($closes)<$period+1) return null;
        $gain=0.0;$loss=0.0;
        for($i=1;$i<=$period;$i++){ $d=$closes[$i]-$closes[$i-1];$gain+=max(0,$d);$loss+=max(0,-$d); }
        $gain/=$period;$loss/=$period;
        for($i=$period+1;$i<count($closes);$i++){ $d=$closes[$i]-$closes[$i-1];$gain=($gain*($period-1)+max(0,$d))/$period;$loss=($loss*($period-1)+max(0,-$d))/$period; }
        if ($loss==0) return $gain==0 ? 50.0 : 100.0;
        return 100-100/(1+$gain/$loss);
    }
    public static function atr(array $bars, int $period): ?float
    {
        if(count($bars)<$period+1)return null;
        $trs=[];
        for($i=1;$i<count($bars);$i++)$trs[]=max($bars[$i]['high']-$bars[$i]['low'],abs($bars[$i]['high']-$bars[$i-1]['close']),abs($bars[$i]['low']-$bars[$i-1]['close']));
        $atr=array_sum(array_slice($trs,0,$period))/$period;
        foreach(array_slice($trs,$period) as $tr)$atr=($atr*($period-1)+$tr)/$period;
        return $atr;
    }
    public static function contiguous(array $bars, int $seconds): bool
    {
        foreach($bars as $i=>$bar)if($i && $bar['time']!==$bars[$i-1]['time']+$seconds)return false;
        return true;
    }
}
