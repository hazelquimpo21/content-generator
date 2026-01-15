-- ==============================================================================
-- MIGRATION 005: CONTENT LIBRARY & CONTENT CALENDAR
-- ==============================================================================
-- Adds support for saving generated content to a library and scheduling
-- content on a calendar for organized publishing.
--
-- New Tables:
--   - content_library: Store saved content pieces from episodes
--   - content_calendar: Schedule content for publishing
--
-- Features:
--   - Save blog posts, social content, emails to library
--   - Schedule any content piece on a specific date/time
--   - Track publishing status (draft, scheduled, published, cancelled)
--   - Full RLS policies for user-scoped data
-- ==============================================================================

-- ============================================================================
-- TABLE: content_library
-- ============================================================================
-- Stores saved content pieces that can be scheduled later or kept for reference.

CREATE TABLE content_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,

  -- Content details
  title TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('blog', 'social', 'email', 'headline', 'quote')),
  platform TEXT CHECK (platform IN ('generic', 'instagram', 'twitter', 'linkedin', 'facebook')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Source reference (which stage this came from)
  source_stage INTEGER CHECK (source_stage >= 0 AND source_stage <= 9),
  source_sub_stage TEXT CHECK (source_sub_stage IN ('instagram', 'twitter', 'linkedin', 'facebook') OR source_sub_stage IS NULL),

  -- Organization
  tags TEXT[] DEFAULT '{}',
  is_favorite BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment explaining the table
COMMENT ON TABLE content_library IS
  'Stores saved content pieces from episodes for later use or scheduling.';

COMMENT ON COLUMN content_library.content_type IS
  'Type of content: blog (full post), social (platform posts), email (campaigns), headline (titles), quote (extracted quotes)';

COMMENT ON COLUMN content_library.source_stage IS
  'The pipeline stage this content originated from (e.g., 7 for refined blog, 8 for social)';

-- ============================================================================
-- TABLE: content_calendar
-- ============================================================================
-- Stores scheduled content with date/time slots for publishing.

CREATE TABLE content_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Content reference (optional - can link to library item or episode)
  library_item_id UUID REFERENCES content_library(id) ON DELETE SET NULL,
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,

  -- Scheduling
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,

  -- Content details (copied at schedule time for independence)
  title TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('blog', 'social', 'email')),
  platform TEXT CHECK (platform IN ('generic', 'instagram', 'twitter', 'linkedin', 'facebook')),
  content_preview TEXT,
  full_content TEXT,

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'published', 'cancelled')),

  -- Publishing tracking
  published_at TIMESTAMP WITH TIME ZONE,
  publish_url TEXT,
  notes TEXT,

  -- Metadata for platform-specific info (hashtags, etc.)
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments explaining the table
COMMENT ON TABLE content_calendar IS
  'Stores scheduled content items with dates for organized publishing.';

COMMENT ON COLUMN content_calendar.content_preview IS
  'Short preview of content (first 200 chars) for calendar display';

COMMENT ON COLUMN content_calendar.full_content IS
  'Full content text - copied at schedule time so calendar item is independent';

COMMENT ON COLUMN content_calendar.status IS
  'Publishing status: draft (not finalized), scheduled (ready to publish), published (done), cancelled (skipped)';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Content Library indexes
CREATE INDEX idx_content_library_user ON content_library(user_id);
CREATE INDEX idx_content_library_type ON content_library(content_type);
CREATE INDEX idx_content_library_platform ON content_library(platform) WHERE platform IS NOT NULL;
CREATE INDEX idx_content_library_episode ON content_library(episode_id) WHERE episode_id IS NOT NULL;
CREATE INDEX idx_content_library_favorite ON content_library(user_id, is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX idx_content_library_created ON content_library(created_at DESC);
CREATE INDEX idx_content_library_tags ON content_library USING GIN(tags);

-- Content Calendar indexes
CREATE INDEX idx_content_calendar_user ON content_calendar(user_id);
CREATE INDEX idx_content_calendar_date ON content_calendar(scheduled_date);
CREATE INDEX idx_content_calendar_user_date ON content_calendar(user_id, scheduled_date);
CREATE INDEX idx_content_calendar_status ON content_calendar(status);
CREATE INDEX idx_content_calendar_type ON content_calendar(content_type);
CREATE INDEX idx_content_calendar_platform ON content_calendar(platform) WHERE platform IS NOT NULL;
CREATE INDEX idx_content_calendar_library ON content_calendar(library_item_id) WHERE library_item_id IS NOT NULL;
CREATE INDEX idx_content_calendar_episode ON content_calendar(episode_id) WHERE episode_id IS NOT NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp for content_library
CREATE TRIGGER content_library_updated_at
  BEFORE UPDATE ON content_library
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-update updated_at timestamp for content_calendar
CREATE TRIGGER content_calendar_updated_at
  BEFORE UPDATE ON content_calendar
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on both tables
ALTER TABLE content_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Content Library RLS Policies
-- ============================================================================

-- Users can view their own library items
CREATE POLICY "Users can view own library items" ON content_library
  FOR SELECT USING (auth.uid() = user_id OR is_superadmin());

-- Users can insert their own library items
CREATE POLICY "Users can insert own library items" ON content_library
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own library items
CREATE POLICY "Users can update own library items" ON content_library
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own library items
CREATE POLICY "Users can delete own library items" ON content_library
  FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass for backend operations
CREATE POLICY "Service role full access to library" ON content_library
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- Content Calendar RLS Policies
-- ============================================================================

-- Users can view their own calendar items
CREATE POLICY "Users can view own calendar items" ON content_calendar
  FOR SELECT USING (auth.uid() = user_id OR is_superadmin());

-- Users can insert their own calendar items
CREATE POLICY "Users can insert own calendar items" ON content_calendar
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own calendar items
CREATE POLICY "Users can update own calendar items" ON content_calendar
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own calendar items
CREATE POLICY "Users can delete own calendar items" ON content_calendar
  FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass for backend operations
CREATE POLICY "Service role full access to calendar" ON content_calendar
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get calendar items for a date range
CREATE OR REPLACE FUNCTION get_calendar_items(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  id UUID,
  scheduled_date DATE,
  scheduled_time TIME,
  title TEXT,
  content_type TEXT,
  platform TEXT,
  content_preview TEXT,
  status TEXT,
  episode_id UUID,
  library_item_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.scheduled_date,
    cc.scheduled_time,
    cc.title,
    cc.content_type,
    cc.platform,
    cc.content_preview,
    cc.status,
    cc.episode_id,
    cc.library_item_id
  FROM content_calendar cc
  WHERE cc.user_id = p_user_id
    AND cc.scheduled_date >= p_start_date
    AND cc.scheduled_date <= p_end_date
  ORDER BY cc.scheduled_date, cc.scheduled_time NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get library statistics
CREATE OR REPLACE FUNCTION get_library_stats(p_user_id UUID)
RETURNS TABLE (
  total_items BIGINT,
  blog_count BIGINT,
  social_count BIGINT,
  email_count BIGINT,
  headline_count BIGINT,
  quote_count BIGINT,
  favorite_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_items,
    COUNT(*) FILTER (WHERE content_type = 'blog')::BIGINT as blog_count,
    COUNT(*) FILTER (WHERE content_type = 'social')::BIGINT as social_count,
    COUNT(*) FILTER (WHERE content_type = 'email')::BIGINT as email_count,
    COUNT(*) FILTER (WHERE content_type = 'headline')::BIGINT as headline_count,
    COUNT(*) FILTER (WHERE content_type = 'quote')::BIGINT as quote_count,
    COUNT(*) FILTER (WHERE is_favorite = TRUE)::BIGINT as favorite_count
  FROM content_library
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VERIFICATION QUERIES (run manually to verify migration)
-- ============================================================================
--
-- Check tables created:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('content_library', 'content_calendar');
--
-- Check indexes:
-- SELECT indexname FROM pg_indexes
-- WHERE tablename IN ('content_library', 'content_calendar');
--
-- Check RLS policies:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename IN ('content_library', 'content_calendar');
--
-- Check RLS enabled:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename IN ('content_library', 'content_calendar');
-- ==============================================================================
