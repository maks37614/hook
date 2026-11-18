import type { Kline } from '../../types';
import { contextSnapshot, type ContextSnapshot } from './context';
import { boundedBars, validBar } from './geometry';
import { scanContextScenarios, type Candidate } from './scenarios';
import { CONTEXT_SECONDS } from './model';
import type { AnalysisTf, ContextNotice, ContextUpdate, ContextResult } from './model';

type Tracked = { signal: Candidate; delivered: Set<ContextNotice['stage']>; lastSeen: number; firstDeliveredAt: number };
const EMPTY_EVIDENCE = { manualLevels: [], densityEnabled: false, densities: [], oi: [] };

/** One engine per unique exchange/market/symbol, inside ONE Terminal worker. */
export class TerminalContextEngine {
  private series: Record<AnalysisTf, Kline[]> = { '5m': [], '1m': [] };
  private received: Record<AnalysisTf, number> = { '5m': 0, '1m': 0 };
  private snapshot: ContextSnapshot | null = null;
  private revision = '';
  private startedAt: Record<AnalysisTf, number> = { '5m': 0, '1m': 0 };
  private lastNoticeAt = 0;
  private tracked = new Map<string, Tracked>();

  seed(tf: AnalysisTf, rows: Kline[], at: number): void {
    const seconds = tf === '5m' ? 300 : 60;
    const accepted = boundedBars(rows, seconds, at);
    const last = accepted.at(-1);
    if (!last) return;
    const bucket = Math.floor(at / 1000 / seconds) * seconds;
    // Historical closes replace a partial bar retained across a disconnect.
    const liveTail = this.series[tf].filter(b => b.time > last.time ||
      (b.time === last.time && b.time === bucket && b.volume >= last.volume));
    const merged = boundedBars([...accepted, ...liveTail], seconds, at);
    this.series[tf] = tf === '1m' ? merged.slice(-181) : merged;
    this.startedAt[tf] = at;
    if (tf === '5m') this.revision = '';
  }

  update(request: ContextUpdate): ContextResult {
    const { at, scope } = request;
    const empty = { scope, notices: [], needFast: false };
    if (!Number.isFinite(at) || at <= 0) return empty;
    for (const tf of ['5m', '1m'] as const) {
      const seconds = tf === '5m' ? 300 : 60;
      const bucket = Math.floor(at / 1000 / seconds) * seconds;
      const final = request.closedCandles?.[tf];
      if (final && final.time === bucket - seconds && validBar(final)) {
        // The exchange can close the preceding bar during the same one-second
        // dispatch window as the first tick of the new bar.
        this.series[tf] = boundedBars([...this.series[tf], final], seconds, at);
        if (tf === '5m') this.revision = '';
      }
      const candle = request.candles[tf];
      if (!candle || !validBar(candle)) continue;
      // An old cached WS replay is not proof that a market is live.
      if (candle.time !== bucket) continue;
      const series = this.series[tf], tail = series.at(-1);
      if (tail && candle.time < tail.time) continue;
      if (tail?.time === bucket) {
        series[series.length - 1] = candle;
        if (series[0].time < Math.floor(at / 1000) - CONTEXT_SECONDS) series.shift();
      } else {
        const updated = boundedBars([...series, candle], seconds, at);
        this.series[tf] = tf === '1m' ? updated.slice(-181) : updated;
      }
      this.received[tf] = at;
      if (!this.startedAt[tf]) this.startedAt[tf] = at;
    }
    const five = this.series['5m'], latest = five.at(-1);
    if (!latest || at - this.received['5m'] > 15_000 || latest.time !== Math.floor(at / 300_000) * 300) return empty;
    const revision = `${five[0].time}:${latest.time}:${five.length}`;
    if (revision !== this.revision) { this.snapshot = contextSnapshot(five.slice(0, -1)); this.revision = revision; }
    if (!this.snapshot) return empty;
    const s = this.snapshot, closed = s.rows;
    const fast = this.series['1m'].filter(b => (b.time + 60) * 1000 <= at).slice(-180);
    const lastFast = this.series['1m'].at(-1);
    const fastLive = lastFast && lastFast.time === Math.floor(at / 60_000) * 60
      && at - this.received['1m'] <= 15_000 ? lastFast : undefined;
    let needFast = Math.abs((latest.close / latest.open - 1) * 100) >= 5
      || ['pump', 'dump', 'post_pump'].includes(s.context.regime)
      || (s.upper > 0 && latest.close > s.upper && s.rows.slice(-12).some(b => b.open < s.upper && b.close > s.upper));
    const candidates = scanContextScenarios({ snapshot: s, live: latest, fast, fastLive,
      evidence: request.evidence || EMPTY_EVIDENCE, at });

    // Contradictory, equally supported directions are a reason to wait.
    const eligible = candidates.filter(c => {
      if (s.context.regime === 'chop' && /^z[34]_/.test(c.scenario) && c.scenario !== 'z4_reverse') return false;
      if (c.side !== 'neutral' && ['z3_line', 'z4_line', 'z4_cascade'].includes(c.scenario)) {
        const history = s.behavior[c.scenario === 'z4_cascade' ? 'horizontal' : 'trendline'][c.side];
        if (history.tests >= 4 && history.failures / history.tests >= .75) return false;
      }
      if (c.side === 'up' && s.context.h1 === 'down' && s.context.h4 === 'down'
          && ['z1_first', 'z1_continue', 'z3_local'].includes(c.scenario)) return false;
      return true;
    }).sort((a, b) => Number(b.stage === 'confirmed') - Number(a.stage === 'confirmed') || b.rank - a.rank);
    const top = eligible[0];
    if (top?.stage === 'watch' && ['z3_line', 'z4_line', 'z4_trend', 'pump', 'dump', 'post_pump'].includes(top.scenario)) needFast = true;
    const conflicted = top && eligible.some(c => c !== top && c.rank === top.rank && c.stage === top.stage
      && c.side !== 'neutral' && top.side !== 'neutral' && c.side !== top.side);

    const ready: Array<{ signal: Candidate; track: Tracked }> = [];
    if (!conflicted) for (const candidate of eligible) {
      // Rolling bases keep the same scenario identity while they remain at the
      // same location. A shifted candle window must not create notification spam.
      let key = candidate.key;
      const existing = [...this.tracked.entries()].find(([, t]) => t.signal.scenario === candidate.scenario
        && t.signal.side === candidate.side && t.signal.expiresAt > at
        && Math.abs(t.signal.level - candidate.level) <= s.tolerance
        && !t.delivered.has('cancelled'));
      if (existing) key = existing[0];
      let track = this.tracked.get(key);
      if (candidate.stage === 'confirmed' && candidate.triggerAt <= this.startedAt[candidate.triggerTf]) continue;
      if (candidate.stage === 'confirmed' && /^temka/.test(candidate.scenario) && !track?.delivered.has('watch')) continue;
      if (!track) {
        track = { signal: { ...candidate, key }, delivered: new Set(), lastSeen: at, firstDeliveredAt: 0 };
        this.tracked.set(key, track);
      }
      if (track.delivered.has('cancelled') || track.delivered.has('confirmed') && candidate.stage === 'watch') continue;
      track.signal = { ...candidate, key }; track.lastSeen = at;
      if (!track.delivered.has(candidate.stage)) ready.push({ signal: track.signal, track });
    }

    for (const [key, track] of this.tracked) {
      const c = track.signal;
      if (c.expiresAt < at) { this.tracked.delete(key); continue; }
      if (!track.delivered.size || track.delivered.has('cancelled') || c.stage === 'info') continue;
      if (c.triggerTf === '1m' && !fastLive) continue;
      const seconds = c.triggerTf === '1m' ? 60 : 300;
      const since = Math.max(track.firstDeliveredAt, this.startedAt[c.triggerTf]);
      const bars = (c.triggerTf === '1m' ? fast : closed)
        .filter(b => (b.time + seconds) * 1000 > since);
      const invalid = bars.length >= 2 && bars.slice(-2).every(b =>
        c.invalidateSide === 'below' ? b.close < c.invalidateLevel : b.close > c.invalidateLevel);
      if (invalid) ready.unshift({ signal: { ...c, stage: 'cancelled', observedAt: at, rank: 10 }, track });
    }
    while (this.tracked.size > 96) this.tracked.delete(this.tracked.keys().next().value!);
    const next = ready[0];
    if (!next) return { scope, notices: [], needFast };
    const upgrade = next.signal.stage === 'cancelled' || next.signal.stage === 'confirmed' && next.track.delivered.has('watch');
    if (at - this.lastNoticeAt < (upgrade ? 2_000 : 30_000)) return { scope, notices: [], needFast };
    this.lastNoticeAt = at; next.track.delivered.add(next.signal.stage);
    if (!next.track.firstDeliveredAt) next.track.firstDeliveredAt = at;
    const { triggerAt: _trigger, expiresAt: _expires, rank: _rank, ...notice } = next.signal;
    return { scope, notices: [notice], needFast };
  }
}
