import { randomUUID } from 'node:crypto';
import { initializeIdentity, identityPool, createSession, csrfForSession } from '../../server/pgIdentity';

/**
 * Disposable PostgreSQL identities for HTTP integration tests.
 * No external auth provider, credentials or production account data.
 */
export async function createTestSession() {
  await initializeIdentity();
  const pool = identityPool();
  const users = ['owner', 'new-user'];
  const tokenByUser = new Map<string, { token: string; csrf: string }>();
  const req = { get: (key: string) => key === 'User-Agent' ? 'h00k-http-fixture' : '', ip: '127.0.0.1' } as any;
  try {
    for (const id of users) {
      const email = id + '-' + randomUUID() + '@example.invalid';
      await pool.query(
        'INSERT INTO auth_users (id, email, password_hash, display_name, email_verified_at) VALUES ($1, $2, $3, $4, now())',
        [id, email, 'http-test-login-disabled', id],
      );
      const session = await createSession(id, req);
      tokenByUser.set(id, { token: session.token, csrf: csrfForSession(session.token) });
    }
  } catch (error) {
    await pool.query('DELETE FROM auth_users WHERE id = ANY($1::text[])', [users]).catch(() => {});
    throw error;
  }
  return {
    env: {},
    headers(userId: string): Record<string, string> {
      const session = tokenByUser.get(userId);
      if (!session) return {};
      // The spawned test server runs with NODE_ENV=production.
      return {
        Cookie: '__Host-h00k-session=' + session.token,
        'X-CSRF-Token': session.csrf,
      };
    },
    async cleanup() {
      await pool.query('DELETE FROM auth_users WHERE id = ANY($1::text[])', [users]);
      await pool.end();
    },
  };
}
