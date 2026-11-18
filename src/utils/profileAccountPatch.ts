import type { UserProfile } from '../types';

/** Fields exposed in the account section of the profile modal. */
export interface ProfileAccountDraft {
  displayName: string;
  defaultExchange: NonNullable<UserProfile['defaultExchange']>;
  defaultMarketType: NonNullable<UserProfile['defaultMarketType']>;
  defaultTimeframe: NonNullable<UserProfile['defaultTimeframe']>;
  timeZone: string;
}

export type ProfileAccountDirtyFields = Record<keyof ProfileAccountDraft, boolean>;

export function emptyProfileAccountDirtyFields(): ProfileAccountDirtyFields {
  return {
    displayName: false,
    defaultExchange: false,
    defaultMarketType: false,
    defaultTimeframe: false,
    timeZone: false,
  };
}

/**
 * PATCH only the values the account owner actually edited.
 * A stale profile modal must not overwrite unrelated defaults saved from
 * another tab/device while the modal was left open.
 */
export function buildProfileAccountPatch(
  draft: ProfileAccountDraft,
  dirty: ProfileAccountDirtyFields,
  fallbackDisplayName: string,
): Partial<UserProfile> {
  const patch: Partial<UserProfile> = {};
  if (dirty.displayName) patch.displayName = draft.displayName.trim() || fallbackDisplayName;
  if (dirty.defaultExchange) patch.defaultExchange = draft.defaultExchange;
  if (dirty.defaultMarketType) patch.defaultMarketType = draft.defaultMarketType;
  if (dirty.defaultTimeframe) patch.defaultTimeframe = draft.defaultTimeframe;
  if (dirty.timeZone) patch.timeZone = draft.timeZone;
  return patch;
}
