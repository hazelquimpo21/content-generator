-- ==============================================================================
-- FIX STAGE_OUTPUTS CONSTRAINT FOR 10-STAGE PIPELINE (0-9)
-- ==============================================================================
-- Version: 1.0.1
-- Description: Updates the stage_number constraint to allow stage 0
--              (Transcript Preprocessing with Claude Haiku)
--
-- Problem:
-- --------
-- The original schema only allowed stage_number values 1-9, but the pipeline
-- was updated to include Stage 0 (Transcript Preprocessing). This caused
-- database constraint violations when trying to insert stage 0 records:
--
--   ERROR: new row for relation "stage_outputs" violates check constraint
--          "stage_outputs_stage_number_check"
--
-- Solution:
-- ---------
-- This migration drops the old constraint and creates a new one that allows
-- stage_number values from 0-9 (10 stages total).
--
-- Stage Pipeline (after fix):
-- ---------------------------
-- Stage 0: Transcript Preprocessing (Claude Haiku) - for long transcripts
-- Stage 1: Transcript Analysis (GPT-5 mini)
-- Stage 2: Quote Extraction (GPT-5 mini)
-- Stage 3: Blog Outline - High Level (GPT-5 mini)
-- Stage 4: Paragraph-Level Outlines (GPT-5 mini)
-- Stage 5: Headlines & Copy Options (GPT-5 mini)
-- Stage 6: Draft Generation (GPT-5 mini)
-- Stage 7: Refinement Pass (Claude Sonnet)
-- Stage 8: Social Content (Claude Sonnet)
-- Stage 9: Email Campaign (Claude Sonnet)
--
-- Migration Safety:
-- -----------------
-- - This is a non-destructive change (only widens the constraint)
-- - Existing data with stage_number 1-9 will remain valid
-- - No data migration required
-- ==============================================================================

-- Log migration start
DO $$
BEGIN
  RAISE NOTICE 'Starting migration: Fix stage_outputs constraint for 10-stage pipeline (0-9)';
END $$;

-- ==============================================================================
-- STEP 1: Drop the existing constraint
-- ==============================================================================
-- The constraint name follows PostgreSQL's naming convention:
-- {table_name}_{column_name}_check
--
-- Note: We use IF EXISTS to make this migration idempotent (can be run multiple times safely)

ALTER TABLE stage_outputs
  DROP CONSTRAINT IF EXISTS stage_outputs_stage_number_check;

-- Log progress
DO $$
BEGIN
  RAISE NOTICE 'Dropped old constraint: stage_outputs_stage_number_check';
END $$;

-- ==============================================================================
-- STEP 2: Add the new constraint allowing stage 0-9
-- ==============================================================================
-- The new constraint allows stage_number values from 0 to 9 inclusive
-- This supports the full 10-stage pipeline:
--   - Stage 0: Transcript Preprocessing (optional, skipped for short transcripts)
--   - Stages 1-9: Main content generation pipeline

ALTER TABLE stage_outputs
  ADD CONSTRAINT stage_outputs_stage_number_check
  CHECK (stage_number >= 0 AND stage_number <= 9);

-- Log progress
DO $$
BEGIN
  RAISE NOTICE 'Added new constraint: stage_outputs_stage_number_check (0-9)';
END $$;

-- ==============================================================================
-- STEP 3: Update table comment to reflect 10-stage pipeline
-- ==============================================================================

COMMENT ON TABLE stage_outputs IS
  'Stores output and metadata for each of the 10 processing stages (0-9). '
  'Stage 0 is Transcript Preprocessing (Claude Haiku), '
  'Stages 1-6 use GPT-5 mini, '
  'Stages 7-9 use Claude Sonnet.';

COMMENT ON COLUMN stage_outputs.stage_number IS
  'Stage number in the 10-stage pipeline (0-9). '
  'Stage 0: Transcript Preprocessing (optional, for long transcripts). '
  'Stages 1-9: Main content generation pipeline.';

-- ==============================================================================
-- VERIFICATION
-- ==============================================================================
-- Run these queries to verify the migration was successful:
--
-- Check constraint exists with correct definition:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname = 'stage_outputs_stage_number_check';
--
-- Should return:
--   stage_outputs_stage_number_check | CHECK ((stage_number >= 0) AND (stage_number <= 9))
--
-- Test inserting stage 0 (should succeed now):
--   INSERT INTO stage_outputs (episode_id, stage_number, stage_name, status, model_used, provider)
--   VALUES ('test-uuid', 0, 'Transcript Preprocessing', 'pending', 'claude-3-5-haiku-20241022', 'anthropic');
-- ==============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration complete: stage_outputs now allows stage_number 0-9';
END $$;
