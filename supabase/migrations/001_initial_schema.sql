-- ==============================================================================
-- PODCAST CONTENT PIPELINE - DATABASE SCHEMA
-- ==============================================================================
-- Version: 1.0.0
-- Description: Complete database schema for the 9-stage AI content pipeline
-- Run this in your Supabase SQL Editor or via CLI: supabase db push
-- ==============================================================================

-- Enable UUID extension (usually enabled by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- TABLE: episodes
-- Purpose: Stores metadata for each podcast episode being processed
-- ==============================================================================
CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Core episode data
  title TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processing', 'paused', 'completed', 'error')),
  current_stage INTEGER DEFAULT 0
    CHECK (current_stage >= 0 AND current_stage <= 9),

  -- Input content
  transcript TEXT NOT NULL,
  episode_context JSONB DEFAULT '{}'::jsonb,

  -- Computed/aggregated metrics
  total_cost_usd DECIMAL(10, 4) DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,

  -- Processing timestamps
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for episodes table
CREATE INDEX idx_episodes_status ON episodes(status);
CREATE INDEX idx_episodes_created_at ON episodes(created_at DESC);
CREATE INDEX idx_episodes_current_stage ON episodes(current_stage);

-- Trigger function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to episodes
CREATE TRIGGER episodes_updated_at
  BEFORE UPDATE ON episodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ==============================================================================
-- TABLE: stage_outputs
-- Purpose: Stores output and metadata for each of the 9 processing stages
-- ==============================================================================
CREATE TABLE stage_outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,

  -- Stage identification
  stage_number INTEGER NOT NULL CHECK (stage_number >= 1 AND stage_number <= 9),
  stage_name TEXT NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,

  -- AI model information
  model_used TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),

  -- Token usage and cost
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd DECIMAL(10, 6),

  -- Output storage (structured JSON or text)
  output_data JSONB,
  output_text TEXT,

  -- Error handling
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique stage per episode
  UNIQUE(episode_id, stage_number)
);

-- Indexes for stage_outputs table
CREATE INDEX idx_stage_outputs_episode ON stage_outputs(episode_id);
CREATE INDEX idx_stage_outputs_stage ON stage_outputs(stage_number);
CREATE INDEX idx_stage_outputs_status ON stage_outputs(status);
CREATE INDEX idx_stage_outputs_created_at ON stage_outputs(created_at DESC);

-- ==============================================================================
-- TABLE: evergreen_content
-- Purpose: Singleton table for therapist profile, podcast info, voice guidelines
-- ==============================================================================
CREATE TABLE evergreen_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Therapist professional information
  therapist_profile JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Podcast details
  podcast_info JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Writing style preferences
  voice_guidelines JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- SEO and marketing defaults
  seo_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Singleton constraint: only one row allowed
CREATE UNIQUE INDEX idx_evergreen_singleton ON evergreen_content ((id IS NOT NULL));

-- Apply updated_at trigger to evergreen_content
CREATE TRIGGER evergreen_updated_at
  BEFORE UPDATE ON evergreen_content
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Insert default row with sample data structure
INSERT INTO evergreen_content (id, therapist_profile, podcast_info, voice_guidelines, seo_defaults)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '{
    "name": "",
    "credentials": "",
    "bio": "",
    "website": "",
    "social_links": {}
  }'::jsonb,
  '{
    "name": "",
    "tagline": "",
    "description": "",
    "target_audience": "",
    "content_pillars": []
  }'::jsonb,
  '{
    "tone": [],
    "perspective": "",
    "sentence_style": "",
    "examples": [],
    "avoid": []
  }'::jsonb,
  '{
    "meta_description_template": "",
    "default_hashtags": [],
    "email_signature": "",
    "cta_preferences": []
  }'::jsonb
);

-- ==============================================================================
-- TABLE: api_usage_log
-- Purpose: Logs every AI API call for cost tracking and debugging
-- ==============================================================================
CREATE TABLE api_usage_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- API provider details
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model TEXT NOT NULL,
  endpoint TEXT NOT NULL,

  -- Token usage
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,

  -- Cost tracking
  cost_usd DECIMAL(10, 6) NOT NULL,

  -- Context linking
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
  stage_number INTEGER,

  -- Performance metrics
  response_time_ms INTEGER,

  -- Success/failure tracking
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT
);

-- Indexes for api_usage_log table
CREATE INDEX idx_api_usage_timestamp ON api_usage_log(timestamp DESC);
CREATE INDEX idx_api_usage_episode ON api_usage_log(episode_id);
CREATE INDEX idx_api_usage_provider ON api_usage_log(provider);
CREATE INDEX idx_api_usage_date ON api_usage_log(DATE(timestamp));

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Purpose: Secure tables for authenticated users and service role
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evergreen_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Allow all for authenticated users" ON episodes
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON stage_outputs
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON evergreen_content
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON api_usage_log
  FOR ALL USING (auth.role() = 'authenticated');

-- Policies for service role (backend operations)
CREATE POLICY "Allow all for service role" ON episodes
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow all for service role" ON stage_outputs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow all for service role" ON evergreen_content
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow all for service role" ON api_usage_log
  FOR ALL USING (auth.role() = 'service_role');

-- ==============================================================================
-- ENABLE REALTIME
-- Purpose: Allow frontend to subscribe to database changes
-- ==============================================================================
-- Run these in Supabase Dashboard > Database > Replication
-- Or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE episodes;
ALTER PUBLICATION supabase_realtime ADD TABLE stage_outputs;

-- ==============================================================================
-- VERIFICATION QUERIES
-- Run these to verify the schema was created correctly
-- ==============================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT * FROM evergreen_content;
-- \dt  -- (in psql)
