import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeLoadSample, summarizeLoad, formatLoadReports } from '../scripts/desktop-ws-load';

function response(at:number, values:{
  pid?:number; cpu?:number; rss?:number; klineClients?:number;
  klineUpstreams?:number; klineSent?:number; klineBytes?:number;
  klineReceived?:number; depthClients?:number; depthPackets?:number;
  depthBytes?:number; liqViewers?:number;
}={}) {
  return {
    recordedAt:at,pid:values.pid??12345,
    processPerformance:{cpuPercentOneCore:values.cpu??35,eventLoopDelayP95Ms:4},
    memory:{rssBytes:values.rss??120*1024*1024},
    hookChartKlineRelay:{clients:values.klineClients??1,
      upstreamSockets:values.klineUpstreams??1,sent:values.klineSent??10,
      sentBytes:values.klineBytes??1000,upstreamCandles:values.klineReceived??5,
      byInstrument:[{symbol:'SHOULD_NOT_APPEAR'}]},
    hookChartDepth:{clients:values.depthClients??1,activeMarkets:1,
      sentPackets:values.depthPackets??10,sentBytes:values.depthBytes??1000},
    liquidationFeed:{viewers:values.liqViewers??1,connectedMarkets:1,
      byInstrument:[{source:'BTCUSDT'}]},
    authorization:'sensitive-token',
  };
}

test('operator WS load output preserves only counters and never stores tokens or instrument names',()=>{
  const sample=sanitizeLoadSample(response(1000));
  assert.equal(sample.rssMiB,120);
  assert.equal(sample.klineClients,1);
  assert.equal(sample.depthClients,1);
  assert.ok(!JSON.stringify(sample).includes('SHOULD_NOT_APPEAR'));
  assert.ok(!JSON.stringify(sample).includes('BTCUSDT'));
  assert.ok(!JSON.stringify(sample).includes('sensitive-token'));
  assert.deepEqual(Object.keys(sample).sort(),[
    'at','pid','cpu','eventLoopP95Ms','rssMiB','klineClients','klineUpstreams',
    'klineSent','klineSentBytes','klineReceived','depthClients','depthMarkets',
    'depthSent','depthSentBytes','liquidationViewers','liquidationMarkets',
  ].sort());
});

test('two samples calculate exact actual delivered WS bytes/sec, CPU and connected fanout',()=>{
  const one=sanitizeLoadSample(response(1_000,{cpu:30,klineClients:1,klineSent:100,
    klineBytes:1000,klineReceived:50,depthPackets:100,depthBytes:5000}));
  const two=sanitizeLoadSample(response(3_000,{cpu:50,klineClients:3,klineSent:110,
    klineBytes:5000,klineReceived:53,depthPackets:106,depthBytes:8000}));
  const report=summarizeLoad(2,2000,[one,two]);
  assert.equal(report.summary.avgCpuOneCorePercent,40);
  assert.equal(report.summary.avgKlineClients,2);
  assert.equal(report.summary.klineBytesPerSecond,2000);
  assert.equal(report.summary.depthBytesPerSecond,1500);
  assert.equal(report.summary.klineUpstreamFramesPerSecond,1.5);
  assert.equal(report.durationSeconds,2);
  assert.match(formatLoadReports([report]),/Kline bytes\/s\s+2000\.00/);
});

test('counter resets and process restarts cannot create false VPS savings',()=>{
  const first=sanitizeLoadSample(response(1_000,{klineSent:100,klineBytes:3000}));
  const reset=sanitizeLoadSample(response(3_000,{klineSent:10,klineBytes:500}));
  const report=summarizeLoad(4,2000,[first,reset]);
  assert.equal(report.summary.klineSentPerSecond,null);
  assert.equal(report.summary.klineBytesPerSecond,null);
  const reboot=sanitizeLoadSample(response(3_000,{pid:678}));
  assert.throws(()=>summarizeLoad(4,2000,[first,reboot]),/restarted/);
  assert.throws(()=>summarizeLoad(3,2000,[first,reboot]),/phase/);
  assert.throws(()=>summarizeLoad(1,2000,[first,{...first,at:1000}]),/Non-monotonic/);
});

test('redacted diagnostics reject missing response identity or invalid reports',()=>{
  assert.throws(()=>sanitizeLoadSample({recordedAt:123,pid:null}),/Invalid/);
  assert.throws(()=>summarizeLoad(0,2000,[]),/No operator samples/);
});
