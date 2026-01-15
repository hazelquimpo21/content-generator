-- ============================================================================
-- Migration 007: Brand Discovery System
-- ============================================================================
-- Creates the brand_discovery table for the gamified onboarding experience
-- that helps users define their brand identity through 6 modules.
--
-- Modules:
--   1. sources  - Website content analysis (manual paste, future: scraping)
--   2. vibe     - 6 brand personality sliders
--   3. values   - 30-card selection + Power Five ranking + AI "why"
--   4. method   - Modalities and specialties selection
--   5. audience - Target audience archetype selection
--   6. channels - Platform priority ranking
--
-- The synthesized Brand DNA feeds into the content pipeline prompts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: brand_discovery
-- ----------------------------------------------------------------------------
-- Stores brand discovery progress and data for each user.
-- Uses JSONB for flexibility in module data structure.
-- ----------------------------------------------------------------------------

CREATE TABLE brand_discovery (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- User ownership (one brand_discovery per user)
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Overall completion tracking (0-100)
  -- Calculated from weighted module completion
  overall_completion_percent INTEGER DEFAULT 0 CHECK (
    overall_completion_percent >= 0 AND overall_completion_percent <= 100
  ),

  -- Module states and data
  -- Each module has: { status, completed_at, data }
  -- Status: "not_started" | "partial" | "complete"
  modules JSONB NOT NULL DEFAULT '{
    "sources": {"status": "not_started", "completed_at": null, "data": null},
    "vibe": {"status": "not_started", "completed_at": null, "data": null},
    "values": {"status": "not_started", "completed_at": null, "data": null},
    "method": {"status": "not_started", "completed_at": null, "data": null},
    "audience": {"status": "not_started", "completed_at": null, "data": null},
    "channels": {"status": "not_started", "completed_at": null, "data": null}
  }'::jsonb,

  -- Inference tracking
  -- Tracks AI-inferred values and user confirmations/rejections
  -- Structure: { "field.path": { value, source, confidence, confirmed, rejected, ... } }
  inferences JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Synthesized Brand DNA
  -- Generated when >=2 modules are complete
  -- Contains: archetype, brand_promise, voice_characteristics, ai_directives, etc.
  brand_dna JSONB DEFAULT NULL,
  brand_dna_generated_at TIMESTAMP WITH TIME ZONE,

  -- Version history for tracking changes
  -- Array of { timestamp, trigger, modules_snapshot, brand_dna_snapshot, notes }
  history JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one record per user
  UNIQUE(user_id)
);

-- Add comment for documentation
COMMENT ON TABLE brand_discovery IS
  'Stores brand discovery progress and synthesized Brand DNA for each user. '
  'Modules can be completed in any order. Brand DNA synthesizes when >=2 modules complete.';

COMMENT ON COLUMN brand_discovery.modules IS
  'JSONB object with 6 modules (sources, vibe, values, method, audience, channels). '
  'Each module has status (not_started/partial/complete), completed_at timestamp, and data.';

COMMENT ON COLUMN brand_discovery.inferences IS
  'Tracks AI-inferred values from source analysis. '
  'Users can confirm or reject each inference.';

COMMENT ON COLUMN brand_discovery.brand_dna IS
  'Synthesized brand identity including archetype, brand promise, voice traits, and AI directives. '
  'Regenerated when module data changes.';

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------

-- Fast lookup by user
CREATE INDEX idx_brand_discovery_user ON brand_discovery(user_id);

-- Query by completion for admin analytics
CREATE INDEX idx_brand_discovery_completion ON brand_discovery(overall_completion_percent);

-- Query by Brand DNA existence
CREATE INDEX idx_brand_discovery_has_dna ON brand_discovery(brand_dna_generated_at)
  WHERE brand_dna_generated_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Trigger: Update updated_at timestamp
-- ----------------------------------------------------------------------------

CREATE TRIGGER brand_discovery_updated_at
  BEFORE UPDATE ON brand_discovery
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ----------------------------------------------------------------------------

ALTER TABLE brand_discovery ENABLE ROW LEVEL SECURITY;

-- Users can view their own brand discovery
CREATE POLICY "Users can view own brand discovery" ON brand_discovery
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own brand discovery
CREATE POLICY "Users can update own brand discovery" ON brand_discovery
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can insert their own brand discovery (normally auto-created by trigger)
CREATE POLICY "Users can insert own brand discovery" ON brand_discovery
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own brand discovery (reset)
CREATE POLICY "Users can delete own brand discovery" ON brand_discovery
  FOR DELETE USING (auth.uid() = user_id);

-- Superadmin can view all brand discovery records (for analytics)
CREATE POLICY "Superadmin can view all brand discovery" ON brand_discovery
  FOR SELECT USING (is_superadmin());

-- Service role full access for backend operations
CREATE POLICY "Service role full access to brand discovery" ON brand_discovery
  FOR ALL USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- Auto-creation trigger
-- ----------------------------------------------------------------------------
-- Automatically creates a brand_discovery record when a user_profile is created.
-- This ensures every user has a brand_discovery record ready for use.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_brand_discovery_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO brand_discovery (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on user_profile creation
CREATE TRIGGER on_user_profile_created_brand_discovery
  AFTER INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_brand_discovery_for_user();

-- ----------------------------------------------------------------------------
-- Create brand_discovery records for existing users
-- ----------------------------------------------------------------------------
-- Backfill for any users created before this migration.
-- ----------------------------------------------------------------------------

INSERT INTO brand_discovery (user_id)
SELECT id FROM user_profiles
WHERE id NOT IN (SELECT user_id FROM brand_discovery)
ON CONFLICT (user_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Helper function: Calculate module completion percentage
-- ----------------------------------------------------------------------------
-- Weighted completion calculation based on module importance.
-- Called by backend after module updates.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION calculate_brand_discovery_completion(modules_data JSONB)
RETURNS INTEGER AS $$
DECLARE
  weights JSONB := '{
    "sources": 15,
    "vibe": 25,
    "values": 25,
    "method": 15,
    "audience": 10,
    "channels": 10
  }'::jsonb;
  total_weight INTEGER := 0;
  completed_weight NUMERIC := 0;
  module_id TEXT;
  module_weight INTEGER;
  module_status TEXT;
BEGIN
  -- Iterate through each module
  FOR module_id IN SELECT jsonb_object_keys(weights)
  LOOP
    module_weight := (weights->>module_id)::INTEGER;
    total_weight := total_weight + module_weight;

    -- Get module status (default to 'not_started' if missing)
    module_status := COALESCE(modules_data->module_id->>'status', 'not_started');

    -- Add weight based on status
    IF module_status = 'complete' THEN
      completed_weight := completed_weight + module_weight;
    ELSIF module_status = 'partial' THEN
      completed_weight := completed_weight + (module_weight * 0.5);
    END IF;
  END LOOP;

  -- Return percentage (0-100)
  IF total_weight = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND((completed_weight / total_weight) * 100)::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_brand_discovery_completion IS
  'Calculates weighted completion percentage for brand discovery. '
  'Weights: vibe=25, values=25, sources=15, method=15, audience=10, channels=10.';

-- ----------------------------------------------------------------------------
-- Helper function: Check if Brand DNA should be regenerated
-- ----------------------------------------------------------------------------
-- Returns true if at least 2 modules are complete.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION should_regenerate_brand_dna(modules_data JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  complete_count INTEGER := 0;
  module_id TEXT;
  module_status TEXT;
BEGIN
  FOR module_id IN SELECT jsonb_object_keys(modules_data)
  LOOP
    module_status := modules_data->module_id->>'status';
    IF module_status = 'complete' THEN
      complete_count := complete_count + 1;
    END IF;
  END LOOP;

  RETURN complete_count >= 2;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION should_regenerate_brand_dna IS
  'Returns true if at least 2 modules are complete, triggering Brand DNA regeneration.';

-- ----------------------------------------------------------------------------
-- End of migration
-- ----------------------------------------------------------------------------
