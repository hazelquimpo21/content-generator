-- ============================================================================
-- Migration 011: Profile Enrichment (Madlibs Profile Module)
-- ============================================================================
-- Extends brand_discovery modules to include a "profile" module for
-- structured business profile data captured through the Madlibs onboarding flow.
--
-- Also creates scrape_jobs table for tracking website/content analysis jobs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Add profile module to existing brand_discovery records
-- ----------------------------------------------------------------------------
-- New records will need the default modules JSONB updated in application code
-- This backfills existing records with the new profile module
-- ----------------------------------------------------------------------------

UPDATE brand_discovery
SET modules = modules || '{"profile": {"status": "not_started", "completed_at": null, "data": null}}'::jsonb
WHERE NOT (modules ? 'profile');

-- ----------------------------------------------------------------------------
-- Update the completion calculation function to include profile module
-- ----------------------------------------------------------------------------
-- New weights:
--   profile: 20 (new - captures core business facts)
--   sources: 10 (reduced - now partially covered by profile import)
--   vibe: 20 (reduced from 25)
--   values: 20 (reduced from 25)
--   method: 15 (unchanged)
--   audience: 10 (unchanged)
--   channels: 5 (reduced - least critical)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION calculate_brand_discovery_completion(modules_data JSONB)
RETURNS INTEGER AS $$
DECLARE
  weights JSONB := '{
    "profile": 20,
    "sources": 10,
    "vibe": 20,
    "values": 20,
    "method": 15,
    "audience": 10,
    "channels": 5
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
  'Weights: profile=20, vibe=20, values=20, method=15, sources=10, audience=10, channels=5.';

-- ----------------------------------------------------------------------------
-- Table: scrape_jobs
-- ----------------------------------------------------------------------------
-- Tracks asynchronous scraping and content analysis jobs for profile enrichment.
-- Jobs can be for websites, podcast RSS feeds, or pasted bio text.
-- ----------------------------------------------------------------------------

CREATE TABLE scrape_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Job type and target
  job_type TEXT NOT NULL CHECK (job_type IN ('website', 'podcast_rss', 'bio_text')),
  target_url TEXT,          -- URL for website/RSS jobs
  input_text TEXT,          -- Pasted text for bio_text jobs

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Scraped content (raw)
  raw_content JSONB DEFAULT '{}'::jsonb,
  -- Example for website:
  -- {
  --   "homepage": { "url": "...", "title": "...", "content": "...", "wordCount": 1234 },
  --   "about": { "url": "...", "title": "...", "content": "...", "wordCount": 567 },
  --   "services": { "url": "...", "title": "...", "content": "...", "wordCount": 890 }
  -- }

  -- AI analysis results
  extracted_data JSONB DEFAULT NULL,
  -- Example:
  -- {
  --   "identity": { "name": { "value": "Dr. Jane", "confidence": 0.9 }, ... },
  --   "clients": { "client_types": { "value": [...], "confidence": 0.8 }, ... },
  --   "tone_signals": { "clinical_relatable": { "value": 65, "confidence": 0.7 } }
  -- }

  -- Error handling
  error_message TEXT,
  error_code TEXT,          -- e.g., 'BLOCKED', 'TIMEOUT', 'PARSE_ERROR'

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Can store: retry_count, duration_ms, ai_model_used, tokens_used, etc.

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE scrape_jobs IS
  'Tracks asynchronous scraping and AI analysis jobs for profile enrichment. '
  'Supports website scraping, podcast RSS analysis, and bio text analysis.';

COMMENT ON COLUMN scrape_jobs.raw_content IS
  'Raw scraped content organized by page type (homepage, about, services).';

COMMENT ON COLUMN scrape_jobs.extracted_data IS
  'AI-analyzed profile data with confidence scores for each field.';

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------

-- Fast lookup by user
CREATE INDEX idx_scrape_jobs_user ON scrape_jobs(user_id);

-- Query active/pending jobs
CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status)
  WHERE status IN ('pending', 'processing');

-- Query by creation time
CREATE INDEX idx_scrape_jobs_created ON scrape_jobs(created_at DESC);

-- Composite for user's recent jobs
CREATE INDEX idx_scrape_jobs_user_created ON scrape_jobs(user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Trigger: Update updated_at timestamp
-- ----------------------------------------------------------------------------

CREATE TRIGGER scrape_jobs_updated_at
  BEFORE UPDATE ON scrape_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ----------------------------------------------------------------------------

ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own scrape jobs
CREATE POLICY "Users can view own scrape jobs" ON scrape_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own scrape jobs
CREATE POLICY "Users can insert own scrape jobs" ON scrape_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own scrape jobs (for cancellation)
CREATE POLICY "Users can update own scrape jobs" ON scrape_jobs
  FOR UPDATE USING (auth.uid() = user_id);

-- Superadmin can view all scrape jobs (for debugging)
CREATE POLICY "Superadmin can view all scrape jobs" ON scrape_jobs
  FOR SELECT USING (is_superadmin());

-- Service role full access for backend processing
CREATE POLICY "Service role full access to scrape jobs" ON scrape_jobs
  FOR ALL USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- End of migration
-- ----------------------------------------------------------------------------
