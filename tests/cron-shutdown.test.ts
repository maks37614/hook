import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CronManager } from '../server/cronService';

test('cron shutdown cancels all queued startup checks and suppresses stale callbacks', async () => {
  const originalTimeout=globalThis.setTimeout;
  const originalClear=globalThis.clearTimeout;
  const callbacks=new Map<ReturnType<typeof setTimeout>,()=>void>();
  let id=0;
  try {
    globalThis.setTimeout=((handler: (...args:any[])=>void)=>{
      const timer={id:++id} as unknown as ReturnType<typeof setTimeout>;
      callbacks.set(timer,()=>handler());
      return timer;
    }) as typeof setTimeout;
    globalThis.clearTimeout=((timer: ReturnType<typeof setTimeout>)=>{
      callbacks.delete(timer);
    }) as typeof clearTimeout;
    const scheduler = new CronManager();
    const schedule = scheduler as unknown as {
      scheduleStartup(job:string,run:()=>Promise<void>,delay:number):void;
    };
    let runs=0;
    schedule.scheduleStartup('price_alerts',async()=>{runs++},1500);
    schedule.scheduleStartup('surveillance',async()=>{runs++},3000);
    schedule.scheduleStartup('screener_patterns',async()=>{runs++},10000);
    assert.equal(callbacks.size,3);
    const stale=[...callbacks.values()];
    // A double init replaces the previous startup timer, not adds a fourth.
    schedule.scheduleStartup('price_alerts',async()=>{runs++},1500);
    assert.equal(callbacks.size,3);
    scheduler.stop();
    assert.equal(callbacks.size,0);
    for(const call of stale)call();
    assert.equal(runs,0,'cancelled callbacks must not run after shutdown');
    assert.equal(scheduler.getOperatorJobStats().length,3);
  } finally {
    globalThis.setTimeout=originalTimeout;
    globalThis.clearTimeout=originalClear;
  }
});

test('all cron entrypoints use cancellable startup timers',()=>{
  const source=readFileSync(new URL('../server/cronService.ts',import.meta.url),'utf8');
  for(const [job,delay] of [['price_alerts','1500'],['surveillance','3000'],
    ['screener_patterns','10000']]) {
    const pattern=new RegExp('this\\.scheduleStartup\\(job\\.id, run, '+delay+'\\)');
    assert.match(source,pattern,'startup check for '+job+' must be cancellable');
  }
  assert.match(source,/this\.startupTimers\.clear\(\)/);
  assert.match(source,/if \(this\.stopped \|\| job\.isRunning \|\| !job\.enabled\) return/);
});
