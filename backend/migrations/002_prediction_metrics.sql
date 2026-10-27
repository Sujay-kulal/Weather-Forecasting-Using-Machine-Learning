-- Additive prediction audit fields and idempotency key.
-- Existing rows are intentionally left unchanged: model_version and actual_temp
-- remain NULL until an operator approves a historical backfill.
BEGIN;

ALTER TABLE predictions
    ADD COLUMN IF NOT EXISTS model_version VARCHAR(100);

ALTER TABLE predictions
    ADD COLUMN IF NOT EXISTS actual_temp DOUBLE PRECISION;

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'predictions'::regclass
          AND conname = 'uq_prediction_state_location_date_model_version'
    ) THEN
        ALTER TABLE predictions
            ADD CONSTRAINT uq_prediction_state_location_date_model_version
            UNIQUE (state, district, location, forecast_date, model_version);
    END IF;
END;
$migration$;

COMMIT;
