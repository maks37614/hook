-- Optional 7-day observed liquidation event archive. Not an exchange-complete ledger.
-- Only the public liquidation events actually received by h00k are stored.
-- Unique event ID prevents reconnect/snapshot double-counting; cumulative
-- Binance fills may increase a row's notional but never reduce it.
CREATE TABLE IF NOT EXISTS h00k_liquidation_events (
  exchange TEXT NOT NULL CHECK (exchange IN ('binance','bybit')),
  symbol TEXT NOT NULL CHECK (length(symbol) BETWEEN 3 AND 80),
  event_id TEXT NOT NULL CHECK (length(event_id) BETWEEN 1 AND 180),
  event_time TIMESTAMPTZ NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG','SHORT')),
  price DOUBLE PRECISION NOT NULL CHECK (price > 0 AND price < 'Infinity'::float8),
  quantity DOUBLE PRECISION NOT NULL CHECK (quantity > 0 AND quantity < 'Infinity'::float8),
  observed_notional DOUBLE PRECISION NOT NULL CHECK (observed_notional > 0 AND observed_notional < 'Infinity'::float8),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exchange,symbol,event_id)
);
CREATE INDEX IF NOT EXISTS idx_h00k_liq_events_time
  ON h00k_liquidation_events(event_time);
CREATE INDEX IF NOT EXISTS idx_h00k_liq_events_symbol_time
  ON h00k_liquidation_events(exchange,symbol,event_time DESC);
