-- The monthly liquidation purge marker is stored transactionally in the
-- SAME PostgreSQL database so server restarts and replicas cannot repeat it.
-- This table contains no user records.
CREATE TABLE IF NOT EXISTS h00k_liquidation_archive_maintenance (
  task_name TEXT PRIMARY KEY CHECK (task_name = 'monthly'),
  last_completed_month CHAR(7) NOT NULL
    CHECK (last_completed_month ~ '^[0-9]{4}-[0-9]{2}$'),
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reset_count BIGINT NOT NULL DEFAULT 0 CHECK (reset_count >= 0)
);
