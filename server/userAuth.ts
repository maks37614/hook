import { requirePostgresSession } from './pgIdentityRoutes';

/** One identity provider: PostgreSQL sessions only. */
export const requireUserAuth = requirePostgresSession;
