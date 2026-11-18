import type { SurveillanceCoin } from '../../src/types';

/** Signals a partial manual 24/7 check without claiming success. */
export class SurveillanceCheckIncompleteError extends Error {
  constructor(public readonly failedChecks: number) {
    super(`Не вдалося завершити перевірку ${failedChecks} монет. Спробуйте пізніше.`);
    this.name = 'SurveillanceCheckIncompleteError';
  }
}

/**
 * A successful manual check needs newly calculated market state, not just a
 * previously saved snapshot. An exchange outage returns an unchanged coin.
 */
export function hasFreshSurveillanceCheck(
  previous: Pick<SurveillanceCoin, 'lastCheckedAt'>,
  candidate: Pick<SurveillanceCoin, 'lastCheckedAt' | 'state'>,
): boolean {
  const stamp = candidate.lastCheckedAt;
  return Boolean(candidate.state && stamp && Number.isFinite(Date.parse(stamp))
    && stamp !== previous.lastCheckedAt);
}

/**
 * An analysis result computed before an owner edited/removed the instrument
 * must not be reported as a successfully committed manual check.
 */
export function wasSurveillanceCheckCommitted(
  checked: Pick<SurveillanceCoin, 'lastCheckedAt'>,
  committed: Pick<SurveillanceCoin, 'lastCheckedAt'> | null,
): boolean {
  return Boolean(committed && checked.lastCheckedAt
    && committed.lastCheckedAt === checked.lastCheckedAt);
}
