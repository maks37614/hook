/** Local-only visual preference: one explicit choice per formation and chart market.
 * Reading/writing this never triggers a server request or recalculates patterns.
 */
export const CHART_NECKLINE_VISIBILITY_EVENT = 'h00k:neckline-visibility-change';
const MAX_OVERRIDES = 200;

export const chartNecklineStorageKey = (uid?: string | null) =>
  'h00k:neckline-visibility:v1:' + (uid || 'guest');

export function chartNecklineScopeKey(scope: {
  exchange: string; marketType: string; symbol: string; timeframe: string;
  formationId?: string | null; patternKey?: string | null;
}): string {
  return [scope.exchange, scope.marketType, scope.symbol.toUpperCase(), scope.timeframe,
    scope.formationId || scope.patternKey || 'custom'].join('|');
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
function browserStorage(): StorageLike | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; }
  catch { return null; }
}

function readRows(storage: StorageLike, key: string): Record<string, boolean> {
  try {
    const data: unknown = JSON.parse(storage.getItem(key) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter((pair): pair is [string, boolean] =>
      typeof pair[1] === 'boolean'));
  } catch { return {}; }
}

export function readChartNecklineOverride(
  key: string, scope: string, storage: StorageLike | null = browserStorage(),
): boolean | null {
  if (!storage) return null;
  const value = readRows(storage, key)[scope];
  return typeof value === 'boolean' ? value : null;
}

export function saveChartNecklineOverride(
  key: string, scope: string, visible: boolean, storage: StorageLike | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    const entries = Object.entries(readRows(storage, key))
      .filter(([entry]) => entry !== scope).slice(-(MAX_OVERRIDES - 1));
    storage.setItem(key, JSON.stringify(Object.fromEntries([...entries, [scope, visible]])));
    return true;
  } catch { return false; }
}
