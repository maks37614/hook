-- Explicit, opt-in phase of personal-state PostgreSQL runtime integration.
-- Does NOT migrate data or enable PostgreSQL in the app by itself.
-- An operator must verify a quiesced JSON snapshot, restore order/tombstones,
-- and separately activate each registered owner after a full cutover audit.
ALTER TABLE h00k_surveillance_state ADD COLUMN IF NOT EXISTS position INTEGER;
ALTER TABLE h00k_price_alert_state ADD COLUMN IF NOT EXISTS position INTEGER;
ALTER TABLE h00k_alert_history_state ADD COLUMN IF NOT EXISTS position INTEGER;

CREATE INDEX IF NOT EXISTS h00k_surveillance_order_idx
  ON h00k_surveillance_state(user_id, position);
CREATE INDEX IF NOT EXISTS h00k_price_alert_order_idx
  ON h00k_price_alert_state(user_id, position);
CREATE INDEX IF NOT EXISTS h00k_alert_history_order_idx
  ON h00k_alert_history_state(user_id, position);

CREATE TABLE IF NOT EXISTS h00k_personal_state_runtime_owners (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  source_snapshot_sha256 TEXT NOT NULL CHECK (length(source_snapshot_sha256)=64),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
