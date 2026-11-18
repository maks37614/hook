-- Personal staged/runtime records must not outlive their authentication owner.
-- Add in a separate migration because 002 was already deployed as a staging
-- schema. The entire DO block runs atomically: NO orphan is silently deleted,
-- and a failed validation leaves the preceding schema unchanged.
--
-- IMPORTANT: run this against a quiesced, backed-up PostgreSQL database.
-- A pre-existing orphan causes an error so operators can reconcile it against
-- a verified JSON backup instead of accidentally erasing personal records.
DO $h00k_privacy$
DECLARE
  info RECORD;
  existing RECORD;
BEGIN
  FOR info IN
    SELECT * FROM (VALUES
      ('h00k_surveillance_state', 'h00k_surveillance_user_fk'),
      ('h00k_price_alert_state', 'h00k_price_alert_user_fk'),
      ('h00k_alert_history_state', 'h00k_alert_history_user_fk')
    ) AS tables(table_name, constraint_name)
  LOOP
    -- Both identifiers come from a fixed literal list above, never from
    -- application or user input.
    EXECUTE format(
      'SELECT count(*) FROM %I t WHERE NOT EXISTS (SELECT 1 FROM auth_users u WHERE u.id = t.user_id)',
      info.table_name
    ) INTO existing;
    IF existing.count > 0 THEN
      RAISE EXCEPTION 'Personal state owner FK migration blocked: % has % orphan rows; reconcile before retrying',
        info.table_name, existing.count;
    END IF;

    SELECT c.contype, c.confdeltype, c.confrelid INTO existing
      FROM pg_constraint c
      WHERE c.conrelid = to_regclass(info.table_name)
        AND c.conname = info.constraint_name;
    IF FOUND AND (existing.contype <> 'f' OR existing.confdeltype <> 'c' OR
                   existing.confrelid <> 'auth_users'::regclass) THEN
      RAISE EXCEPTION 'Existing personal state FK % has incompatible delete policy', info.constraint_name;
    END IF;

    IF NOT FOUND THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE NOT VALID',
        info.table_name, info.constraint_name
      );
    END IF;
    EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I',
      info.table_name, info.constraint_name);
  END LOOP;
END
$h00k_privacy$;
