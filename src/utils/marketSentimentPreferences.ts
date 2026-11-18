import type { UserProfile } from '../types';

/**
 * First visit / legacy profile: expanded.
 * Only accept the saved preference from the currently signed-in account.
 * Guests also start expanded; no other user's preference can leak to them.
 */
export function getMarketSentimentExpanded(
  accountUid: string | null | undefined,
  profile: Pick<UserProfile, 'uid' | 'marketSentimentExpanded'> | null | undefined,
): boolean {
  if (!accountUid || !profile || profile.uid !== accountUid) return true;
  return profile.marketSentimentExpanded !== false;
}
