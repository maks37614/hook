-- Private simulator data owned by PostgreSQL authentication.
-- Binary screenshots never appear in JSONB; managed by per-account IndexedDB.
CREATE TABLE IF NOT EXISTS auth_replay_state (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
