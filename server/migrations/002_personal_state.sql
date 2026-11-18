-- Optional second-stage migration of personal notification state.
-- Run only after PostgreSQL and SMTP have been configured and verified.
-- JSON remains authoritative until a separate, explicit cutover.
CREATE TABLE IF NOT EXISTS h00k_surveillance_state (
  user_id TEXT NOT NULL,
  coin_id TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('binance','bybit')),
  market_type TEXT NOT NULL CHECK (market_type IN ('spot','futures')),
  symbol TEXT NOT NULL,
  is_active BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, coin_id)
);
CREATE INDEX IF NOT EXISTS h00k_surveillance_active_market_idx
  ON h00k_surveillance_state (exchange, market_type, symbol)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS h00k_surveillance_by_user_idx
  ON h00k_surveillance_state (user_id, is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS h00k_price_alert_state (
  user_id TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('binance','bybit')),
  market_type TEXT NOT NULL CHECK (market_type IN ('spot','futures')),
  symbol TEXT NOT NULL,
  is_active BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, alert_id)
);
CREATE INDEX IF NOT EXISTS h00k_alerts_active_market_idx
  ON h00k_price_alert_state(exchange, market_type, symbol) WHERE is_active;
CREATE INDEX IF NOT EXISTS h00k_alerts_by_user_idx
  ON h00k_price_alert_state(user_id, is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS h00k_alert_history_state (
  user_id TEXT NOT NULL,
  history_id TEXT NOT NULL,
  triggered_at BIGINT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, history_id)
);
CREATE INDEX IF NOT EXISTS h00k_alert_history_recent_idx
  ON h00k_alert_history_state(user_id, triggered_at DESC);

-- A migration marker prevents accidental re-staging of an older JSON
-- snapshot after PostgreSQL has been changed. This is not live cutover.
CREATE TABLE IF NOT EXISTS h00k_personal_state_staging_runs (
  stage_key TEXT PRIMARY KEY CHECK (length(stage_key) BETWEEN 1 AND 128),
  snapshot_sha256 TEXT NOT NULL CHECK (length(snapshot_sha256) = 64),
  staged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
