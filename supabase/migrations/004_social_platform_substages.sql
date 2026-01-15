-- ==============================================================================
-- MIGRATION 004: SOCIAL PLATFORM SUB-STAGES
-- ==============================================================================
-- Adds support for platform-specific social content generation.
-- Stage 8 (Social) is split into 4 parallel sub-stages:
--   - instagram
--   - twitter
--   - linkedin
--   - facebook
--
-- Each platform runs as a focused analyzer with its own prompt,
-- enabling better quality output through specialization.
-- ==============================================================================

-- Add sub_stage column to identify platform-specific outputs
-- NULL for stages 0-7 and 9, platform name for stage 8 sub-stages
ALTER TABLE stage_outputs
ADD COLUMN sub_stage TEXT DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN stage_outputs.sub_stage IS
  'Platform identifier for Stage 8 sub-stages (instagram, twitter, linkedin, facebook). NULL for all other stages.';

-- Drop the existing unique constraint
ALTER TABLE stage_outputs
DROP CONSTRAINT IF EXISTS stage_outputs_episode_id_stage_number_key;

-- Create new unique constraint that includes sub_stage
-- Uses COALESCE to handle NULL values (treats NULL as empty string for uniqueness)
CREATE UNIQUE INDEX idx_stage_outputs_episode_stage_substage
ON stage_outputs (episode_id, stage_number, COALESCE(sub_stage, ''));

-- Add check constraint to ensure sub_stage is only used for stage 8
ALTER TABLE stage_outputs
ADD CONSTRAINT chk_substage_only_stage8
CHECK (
  (stage_number = 8 AND sub_stage IN ('instagram', 'twitter', 'linkedin', 'facebook'))
  OR
  (stage_number != 8 AND sub_stage IS NULL)
);

-- Add index for querying by sub_stage
CREATE INDEX idx_stage_outputs_substage ON stage_outputs(sub_stage) WHERE sub_stage IS NOT NULL;

-- ==============================================================================
-- DATA MIGRATION: Convert existing Stage 8 records
-- ==============================================================================
-- If there are existing Stage 8 records with combined platform data,
-- we need to handle them. For now, we'll delete them since they'll be
-- regenerated with the new structure.
--
-- In production, you might want to split the data instead.
-- ==============================================================================

-- Mark any existing Stage 8 records for re-processing by resetting them
-- (Only affects completed Stage 8 records that have the old combined format)
UPDATE stage_outputs
SET
  status = 'pending',
  output_data = NULL,
  output_text = NULL,
  input_tokens = NULL,
  output_tokens = NULL,
  cost_usd = NULL,
  started_at = NULL,
  completed_at = NULL,
  duration_seconds = NULL
WHERE stage_number = 8
  AND sub_stage IS NULL
  AND status = 'completed';

-- ==============================================================================
-- VERIFICATION QUERIES (run manually to verify migration)
-- ==============================================================================
--
-- Check the new column:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'stage_outputs' AND column_name = 'sub_stage';
--
-- Check the constraint:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'stage_outputs'::regclass;
--
-- Check unique index:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'stage_outputs';
-- ==============================================================================
