-- ==============================================================================
-- MIGRATION: Topics and Content Pillars
-- ==============================================================================
-- Version: 006
-- Description: Adds normalized tables for topics and content pillars with
--              many-to-many relationships, enabling organized content tagging
-- ==============================================================================

-- ==============================================================================
-- TABLE: content_pillars
-- Purpose: Stores user-defined content pillars (high-level brand themes)
-- ==============================================================================
CREATE TABLE content_pillars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Pillar details
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280', -- Default gray, for UI badges

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique pillar names per user
  UNIQUE(user_id, name)
);

-- Indexes
CREATE INDEX idx_content_pillars_user ON content_pillars(user_id);
CREATE INDEX idx_content_pillars_name ON content_pillars(user_id, name);

-- Apply updated_at trigger
CREATE TRIGGER content_pillars_updated_at
  BEFORE UPDATE ON content_pillars
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ==============================================================================
-- TABLE: topics
-- Purpose: Stores user-defined topics (granular content tags)
-- ==============================================================================
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Topic details
  name TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique topic names per user
  UNIQUE(user_id, name)
);

-- Indexes
CREATE INDEX idx_topics_user ON topics(user_id);
CREATE INDEX idx_topics_name ON topics(user_id, name);

-- Apply updated_at trigger
CREATE TRIGGER topics_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ==============================================================================
-- TABLE: topic_pillar_associations
-- Purpose: Many-to-many junction table linking topics to pillars
-- ==============================================================================
CREATE TABLE topic_pillar_associations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  pillar_id UUID NOT NULL REFERENCES content_pillars(id) ON DELETE CASCADE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique associations
  UNIQUE(topic_id, pillar_id)
);

-- Indexes for efficient lookups in both directions
CREATE INDEX idx_topic_pillar_topic ON topic_pillar_associations(topic_id);
CREATE INDEX idx_topic_pillar_pillar ON topic_pillar_associations(pillar_id);

-- ==============================================================================
-- ALTER: content_library
-- Purpose: Add topic_ids array for tagging library items with topics
-- ==============================================================================
ALTER TABLE content_library
  ADD COLUMN IF NOT EXISTS topic_ids UUID[] DEFAULT '{}';

-- GIN index for efficient array containment queries
CREATE INDEX IF NOT EXISTS idx_content_library_topics ON content_library USING GIN(topic_ids);

-- ==============================================================================
-- ALTER: content_calendar
-- Purpose: Add topic_ids array for tagging calendar items with topics
-- ==============================================================================
ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS topic_ids UUID[] DEFAULT '{}';

-- GIN index for efficient array containment queries
CREATE INDEX IF NOT EXISTS idx_content_calendar_topics ON content_calendar USING GIN(topic_ids);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- Enable RLS on new tables
ALTER TABLE content_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_pillar_associations ENABLE ROW LEVEL SECURITY;

-- Content Pillars policies
CREATE POLICY "Users can view own pillars" ON content_pillars
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pillars" ON content_pillars
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pillars" ON content_pillars
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pillars" ON content_pillars
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to pillars" ON content_pillars
  FOR ALL USING (auth.role() = 'service_role');

-- Topics policies
CREATE POLICY "Users can view own topics" ON topics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own topics" ON topics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own topics" ON topics
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own topics" ON topics
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to topics" ON topics
  FOR ALL USING (auth.role() = 'service_role');

-- Topic-Pillar associations policies (users can manage associations for their own topics/pillars)
CREATE POLICY "Users can view own associations" ON topic_pillar_associations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM topics WHERE topics.id = topic_id AND topics.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own associations" ON topic_pillar_associations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM topics WHERE topics.id = topic_id AND topics.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM content_pillars WHERE content_pillars.id = pillar_id AND content_pillars.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own associations" ON topic_pillar_associations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM topics WHERE topics.id = topic_id AND topics.user_id = auth.uid())
  );

CREATE POLICY "Service role full access to associations" ON topic_pillar_associations
  FOR ALL USING (auth.role() = 'service_role');

-- ==============================================================================
-- HELPER FUNCTIONS
-- ==============================================================================

-- Function to get topics with their associated pillars
CREATE OR REPLACE FUNCTION get_topics_with_pillars(p_user_id UUID)
RETURNS TABLE (
  topic_id UUID,
  topic_name TEXT,
  pillar_ids UUID[],
  pillar_names TEXT[],
  content_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as topic_id,
    t.name as topic_name,
    COALESCE(array_agg(DISTINCT tpa.pillar_id) FILTER (WHERE tpa.pillar_id IS NOT NULL), '{}') as pillar_ids,
    COALESCE(array_agg(DISTINCT cp.name) FILTER (WHERE cp.name IS NOT NULL), '{}') as pillar_names,
    (SELECT COUNT(*) FROM content_library cl WHERE t.id = ANY(cl.topic_ids)) as content_count
  FROM topics t
  LEFT JOIN topic_pillar_associations tpa ON t.id = tpa.topic_id
  LEFT JOIN content_pillars cp ON tpa.pillar_id = cp.id
  WHERE t.user_id = p_user_id
  GROUP BY t.id, t.name
  ORDER BY t.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pillars with their associated topics
CREATE OR REPLACE FUNCTION get_pillars_with_topics(p_user_id UUID)
RETURNS TABLE (
  pillar_id UUID,
  pillar_name TEXT,
  pillar_description TEXT,
  pillar_color TEXT,
  topic_ids UUID[],
  topic_names TEXT[],
  content_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.id as pillar_id,
    cp.name as pillar_name,
    cp.description as pillar_description,
    cp.color as pillar_color,
    COALESCE(array_agg(DISTINCT tpa.topic_id) FILTER (WHERE tpa.topic_id IS NOT NULL), '{}') as topic_ids,
    COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') as topic_names,
    (
      SELECT COUNT(DISTINCT cl.id)
      FROM content_library cl
      WHERE cl.topic_ids && (
        SELECT COALESCE(array_agg(tpa2.topic_id), '{}')
        FROM topic_pillar_associations tpa2
        WHERE tpa2.pillar_id = cp.id
      )
    ) as content_count
  FROM content_pillars cp
  LEFT JOIN topic_pillar_associations tpa ON cp.id = tpa.pillar_id
  LEFT JOIN topics t ON tpa.topic_id = t.id
  WHERE cp.user_id = p_user_id
  GROUP BY cp.id, cp.name, cp.description, cp.color
  ORDER BY cp.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- MIGRATE EXISTING DATA
-- Purpose: Migrate existing content_pillars from evergreen_content/user_settings
-- ==============================================================================

-- Note: This migration creates the structure. Existing content_pillars data
-- stored in evergreen_content.podcast_info.content_pillars (as string array)
-- should be migrated via application code or a separate data migration script
-- to preserve the new normalized structure with proper user associations.

-- ==============================================================================
-- VERIFICATION
-- ==============================================================================
-- Run these to verify:
-- SELECT * FROM content_pillars;
-- SELECT * FROM topics;
-- SELECT * FROM topic_pillar_associations;
-- SELECT get_topics_with_pillars('user-uuid-here');
-- SELECT get_pillars_with_topics('user-uuid-here');
