/** Read-only h00k Desktop WS load sampler. Run against localhost on the VPS:
 * H00K_OPS_TOKEN must be provided through the existing server environment.
 *
 * node --import tsx scripts/desktop-ws-load.ts --phase=2 --seconds=40 --out=/tmp/h00k-ws-2.json
 * node --import tsx scripts/desktop-ws-load.ts --compare=/tmp/h00k-ws-1.json,/tmp/h00k-ws-2.json
 *
 * Output contains only aggregate diagnostics, never bearer tokens,
 * liquidation instruments, account IDs or private request data.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

type Numbers = Record<string, number | null>;
export type LoadSample = {
  at: number; pid: number;
  cpu: number | null; eventLoopP95Ms: number | null; rssMiB: number;
  klineClients: number; klineUpstreams: number; klineSent: number;
  klineSentBytes: number; klineReceived: number;
  depthClients: number; depthMarkets: number; depthSent: number; depthSentBytes: number;
  liquidationViewers: number; liquidationMarkets: number;
};
export type LoadReport = {
  phase: number; intervalMs: number; durationSeconds: number;
  startedAt: number; finishedAt: number; samples: LoadSample[];
  summary: Numbers;
};
const finite = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
const optional = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const mean = (values: number[]): number | null =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null;
const peak = (values: number[]): number | null =>
  values.length ? Math.max(...values) : null;
const samplesOf = (samples: LoadSample[], key: keyof LoadSample): number[] =>
  samples.map(s => s[key]).filter((v): v is number =>
    typeof v === 'number' && Number.isFinite(v));
function rate(samples: LoadSample[], key: keyof LoadSample): number | null {
  if (samples.length < 2) return null;
  const first = samples[0], last = samples[samples.length - 1];
  // Never treat a process restart/counter reset as an actual reduction.
  if (first.pid !== last.pid || last.at <= first.at) return null;
  const start = first[key], end = last[key];
  if (typeof start !== 'number' || typeof end !== 'number' || end < start) return null;
  return Math.round((end - start) * 1000 / (last.at - first.at) * 100) / 100;
}

/** Strip per-instrument and user-associated fields from operator API samples. */
export function sanitizeLoadSample(payload: Record<string, any>): LoadSample {
  if (!Number.isSafeInteger(payload.pid) || !Number.isFinite(payload.recordedAt)) {
    throw new Error('Invalid operator metrics response');
  }
  return {
    at: payload.recordedAt, pid: payload.pid,
    cpu: optional(payload.processPerformance?.cpuPercentOneCore),
    eventLoopP95Ms: optional(payload.processPerformance?.eventLoopDelayP95Ms),
    rssMiB: Math.round(finite(payload.memory?.rssBytes) / 1024 / 1024 * 100) / 100,
    klineClients: finite(payload.hookChartKlineRelay?.clients),
    klineUpstreams: finite(payload.hookChartKlineRelay?.upstreamSockets),
    klineSent: finite(payload.hookChartKlineRelay?.sent),
    klineSentBytes: finite(payload.hookChartKlineRelay?.sentBytes),
    klineReceived: finite(payload.hookChartKlineRelay?.upstreamCandles),
    depthClients: finite(payload.hookChartDepth?.clients),
    depthMarkets: finite(payload.hookChartDepth?.activeMarkets),
    depthSent: finite(payload.hookChartDepth?.sentPackets),
    depthSentBytes: finite(payload.hookChartDepth?.sentBytes),
    liquidationViewers: finite(payload.liquidationFeed?.viewers),
    liquidationMarkets: finite(payload.liquidationFeed?.connectedMarkets),
  };
}
export function summarizeLoad(phase: number, intervalMs: number, samples: LoadSample[]): LoadReport {
  if (![0,1,2,4,6].includes(phase)) throw new Error('Use phase 0, 1, 2, 4 or 6');
  if (!samples.length) throw new Error('No operator samples');
  if (samples.some(s => s.pid !== samples[0].pid)) {
    throw new Error('App restarted during capture: repeat phase to avoid misleading rates');
  }
  if (samples.some((s,i) => i && s.at <= samples[i-1].at)) {
    throw new Error('Non-monotonic operator timestamps: repeat capture');
  }
  const summary: Numbers = {
    avgCpuOneCorePercent: mean(samplesOf(samples,'cpu')),
    peakCpuOneCorePercent: peak(samplesOf(samples,'cpu')),
    avgRssMiB: mean(samplesOf(samples,'rssMiB')),
    peakRssMiB: peak(samplesOf(samples,'rssMiB')),
    avgLoopDelayP95Ms: mean(samplesOf(samples,'eventLoopP95Ms')),
    avgKlineClients: mean(samplesOf(samples,'klineClients')),
    peakKlineClients: peak(samplesOf(samples,'klineClients')),
    avgKlineUpstreams: mean(samplesOf(samples,'klineUpstreams')),
    avgDepthClients: mean(samplesOf(samples,'depthClients')),
    avgDepthMarkets: mean(samplesOf(samples,'depthMarkets')),
    avgLiqViewers: mean(samplesOf(samples,'liquidationViewers')),
    avgLiqMarkets: mean(samplesOf(samples,'liquidationMarkets')),
    klineSentPerSecond: rate(samples,'klineSent'),
    klineBytesPerSecond: rate(samples,'klineSentBytes'),
    klineUpstreamFramesPerSecond: rate(samples,'klineReceived'),
    depthSentPerSecond: rate(samples,'depthSent'),
    depthBytesPerSecond: rate(samples,'depthSentBytes'),
  };
  return { phase, intervalMs, durationSeconds: (samples[samples.length-1].at - samples[0].at)/1000,
    startedAt: samples[0].at, finishedAt: samples[samples.length-1].at,
    samples, summary };
}
export function formatLoadReports(reports: LoadReport[]): string {
  const fields: Array<[keyof Numbers, string]> = [
    ['avgCpuOneCorePercent','CPU % of 1 core'], ['avgRssMiB','RSS MiB'],
    ['avgKlineClients','Kline WS clients'], ['avgKlineUpstreams','Kline exchange WS'],
    ['avgDepthClients','Depth WS clients'], ['avgLiqViewers','Liq WS viewers'],
    ['klineBytesPerSecond','Kline bytes/s'], ['depthBytesPerSecond','Depth bytes/s'],
    ['avgLoopDelayP95Ms','Event-loop P95 ms'],
  ];
  const fmt = (n: number | null | undefined) => n == null ? 'n/a' : n.toFixed(2);
  return ['Metric'.padEnd(23) + reports.map(r=>String(r.phase)+' panes').map(s=>s.padStart(12)).join(''),
    ...fields.map(([key,label])=>label.padEnd(23) + reports.map(r=>fmt(r.summary[key]).padStart(12)).join('')),
    'Note: other site users/bots affect shared VPS metrics. Test the SAME coin/TF and compare stable windows.',
  ].join('\n');
}
export async function main(args: string[] = process.argv.slice(2)) {
  const params = Object.fromEntries(args.filter(x=>x.startsWith('--')&&x.includes('='))
    .map(arg=>{ const pos=arg.indexOf('=');return [arg.slice(2,pos),arg.slice(pos+1)]; }));
  if (params.compare) {
    const reports:LoadReport[] = [];
    for (const name of params.compare.split(',')) reports.push(JSON.parse(await readFile(name,'utf8')));
    console.log(formatLoadReports(reports.sort((a,b)=>a.phase-b.phase)));
    return;
  }
  const phase = Number(params.phase ?? '-1');
  const seconds = Number(params.seconds ?? '40');
  const intervalMs = Number(params.interval ?? '2000');
  if (![0,1,2,4,6].includes(phase) || !Number.isInteger(seconds) ||
      seconds < 10 || seconds > 600 || !Number.isInteger(intervalMs) ||
      intervalMs < 1000 || intervalMs > 10_000) {
    throw new Error('Use --phase=0|1|2|4|6 --seconds=10..600 --interval=1000..10000');
  }
  const secret = process.env.H00K_OPS_TOKEN;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('Set H00K_OPS_TOKEN (strong operator-only token); never put it in command arguments');
  }
  const origin = params.origin || 'http://127.0.0.1:3000';
  const endpoint = new URL('/api/ops/market-data',origin);
  if (!['127.0.0.1','localhost','::1'].includes(endpoint.hostname) ||
      endpoint.protocol !== 'http:') {
    throw new Error('Load snapshots may only be retrieved over localhost HTTP');
  }
  const samples:LoadSample[] = [];
  const deadline = Date.now() + seconds * 1000;
  const sleep = (ms:number) => new Promise<void>(resolve=>setTimeout(resolve,ms));
  console.log('Capturing phase '+phase+' for '+seconds+'s; token is never stored or printed.');
  while (Date.now() < deadline || samples.length < 2) {
    const started = Date.now();
    const response = await fetch(endpoint,{headers: {Authorization:'Bearer '+secret},
      cache:'no-store',signal:AbortSignal.timeout(4_000)});
    if (!response.ok) throw new Error('Operator endpoint returned '+response.status+
      ' (confirm token on the VPS; endpoint is disabled unless configured)');
    const payload = await response.json() as Record<string,any>;
    samples.push(sanitizeLoadSample(payload));
    const remaining = deadline-Date.now();
    if (remaining <= 0 && samples.length >= 2) break;
    await sleep(Math.min(intervalMs,Math.max(0,remaining || intervalMs)) || intervalMs);
    if (Date.now() - started > 8_000) throw new Error('Sampling stalled; repeat phase');
  }
  const report = summarizeLoad(phase,intervalMs,samples);
  const output = params.out || '/tmp/h00k-desktop-ws-'+phase+'.json';
  await writeFile(output, JSON.stringify(report,null,2),{mode:0o600,flag:'w'});
  console.log(formatLoadReports([report]));
  console.log('Saved aggregate-only report: '+output);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(err=>{ console.error(err instanceof Error ? err.message : String(err));process.exitCode=1; });
}
