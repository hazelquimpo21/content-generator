-- ============================================================================
-- MIGRATION 010: Podcast RSS Feed Integration
-- ============================================================================
-- Adds support for connecting podcast RSS feeds to import episode history,
-- track which episodes have been processed, and transcribe directly from feed.
--
-- Changes:
-- 1. Create podcast_feeds table for connected RSS feeds
-- 2. Create feed_episodes table for episode metadata from feeds
-- 3. Add RLS policies for both tables
-- 4. Add indexes for efficient querying
-- ============================================================================

-- ============================================================================
-- STEP 1: Create podcast_feeds table
-- ============================================================================
-- Stores connected podcast RSS feeds for users

CREATE TABLE IF NOT EXISTS podcast_feeds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Feed identification
  feed_url TEXT NOT NULL,
  podcastindex_id TEXT,              -- PodcastIndex ID if known

  -- Cached metadata (updated on sync)
  title TEXT NOT NULL,
  description TEXT,
  author TEXT,
  artwork_url TEXT,
  website_url TEXT,
  language TEXT DEFAULT 'en',
  categories TEXT[] DEFAULT '{}',

  -- Sync tracking
  last_synced_at TIMESTAMP WITH TIME ZONE,
  episode_count INTEGER DEFAULT 0,
  sync_error TEXT,                   -- Last sync error message if any

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique feed per user
  UNIQUE(user_id, feed_url)
);

-- Indexes for podcast_feeds
CREATE INDEX IF NOT EXISTS idx_podcast_feeds_user ON podcast_feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_podcast_feeds_podcastindex ON podcast_feeds(podcastindex_id) WHERE podcastindex_id IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER podcast_feeds_updated_at
  BEFORE UPDATE ON podcast_feeds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE podcast_feeds IS
'Stores connected podcast RSS feeds for users.
Users can connect their podcast feed to import episode history and transcribe directly.';

-- ============================================================================
-- STEP 2: Create feed_episodes table
-- ============================================================================
-- Stores episode metadata from RSS feed (lightweight, for display)

CREATE TABLE IF NOT EXISTS feed_episodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feed_id UUID NOT NULL REFERENCES podcast_feeds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Episode identification (from RSS)
  guid TEXT NOT NULL,                -- Unique ID from RSS feed

  -- Episode metadata
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT NOT NULL,
  duration_seconds INTEGER,
  published_at TIMESTAMP WITH TIME ZONE,
  artwork_url TEXT,                  -- Episode-specific artwork if different
  episode_number TEXT,               -- Episode number/season info if available

  -- Processing status - links to our episodes table
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'transcribing', 'processed', 'error')),
  error_message TEXT,                -- Error message if transcription failed

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique episode per feed
  UNIQUE(feed_id, guid)
);

-- Indexes for feed_episodes
CREATE INDEX IF NOT EXISTS idx_feed_episodes_feed ON feed_episodes(feed_id);
CREATE INDEX IF NOT EXISTS idx_feed_episodes_user ON feed_episodes(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_episodes_status ON feed_episodes(status);
CREATE INDEX IF NOT EXISTS idx_feed_episodes_published ON feed_episodes(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_episodes_episode ON feed_episodes(episode_id) WHERE episode_id IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER feed_episodes_updated_at
  BEFORE UPDATE ON feed_episodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE feed_episodes IS
'Stores episode metadata from podcast RSS feeds.
Tracks which episodes have been transcribed/processed and links to the episodes table.';

-- ============================================================================
-- STEP 3: Enable RLS and create policies
-- ============================================================================

-- Enable RLS
ALTER TABLE podcast_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_episodes ENABLE ROW LEVEL SECURITY;

-- podcast_feeds policies
CREATE POLICY "Users can view own podcast feeds" ON podcast_feeds
  FOR SELECT USING (user_id = auth.uid() OR is_superadmin());

CREATE POLICY "Users can insert own podcast feeds" ON podcast_feeds
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own podcast feeds" ON podcast_feeds
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own podcast feeds" ON podcast_feeds
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Service role full access to podcast feeds" ON podcast_feeds
  FOR ALL USING (auth.role() = 'service_role');

-- feed_episodes policies
CREATE POLICY "Users can view own feed episodes" ON feed_episodes
  FOR SELECT USING (user_id = auth.uid() OR is_superadmin());

CREATE POLICY "Users can insert own feed episodes" ON feed_episodes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own feed episodes" ON feed_episodes
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own feed episodes" ON feed_episodes
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Service role full access to feed episodes" ON feed_episodes
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 4: Add source tracking to episodes table
-- ============================================================================
-- Track which episodes came from RSS feed import

ALTER TABLE episodes
ADD COLUMN IF NOT EXISTS feed_episode_id UUID REFERENCES feed_episodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_episodes_feed_episode ON episodes(feed_episode_id) WHERE feed_episode_id IS NOT NULL;

COMMENT ON COLUMN episodes.feed_episode_id IS
'References the feed_episode this episode was created from (if imported from RSS feed)';

-- ============================================================================
-- HELPFUL QUERIES (for reference, not executed)
-- ============================================================================

-- Get all feeds for a user with episode counts:
-- SELECT
--   pf.*,
--   (SELECT COUNT(*) FROM feed_episodes fe WHERE fe.feed_id = pf.id) as total_episodes,
--   (SELECT COUNT(*) FROM feed_episodes fe WHERE fe.feed_id = pf.id AND fe.status = 'processed') as processed_episodes
-- FROM podcast_feeds pf
-- WHERE pf.user_id = $1;

-- Get feed episodes with processing status:
-- SELECT
--   fe.*,
--   e.title as processed_title,
--   e.status as episode_status,
--   e.current_stage
-- FROM feed_episodes fe
-- LEFT JOIN episodes e ON e.id = fe.episode_id
-- WHERE fe.feed_id = $1
-- ORDER BY fe.published_at DESC;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
