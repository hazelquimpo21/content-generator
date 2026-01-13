-- ==============================================================================
-- USER AUTHENTICATION & AUTHORIZATION SCHEMA
-- ==============================================================================
-- Version: 1.0.0
-- Description: Adds multi-user support with Supabase Magic Link authentication
--              and superadmin role for hazel@theclever.io
--
-- This migration creates:
-- - user_profiles: User profile data linked to auth.users
-- - user_settings: Per-user settings (therapist profile, podcast info, etc.)
-- - Adds user_id to episodes for data isolation
-- - Updates RLS policies for user-scoped access
-- - Creates helper function for superadmin checks
-- ==============================================================================

-- ==============================================================================
-- TABLE: user_profiles
-- ==============================================================================
-- Extends Supabase auth.users with application-specific profile data.
-- Created automatically via trigger when user signs up via magic link.
--
-- Role Types:
-- - 'user': Standard user, can only access own data
-- - 'superadmin': hazel@theclever.io, can access all data and admin features
-- ==============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  -- Primary key matches Supabase auth.users.id for easy joins
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- User email (denormalized from auth.users for convenience in queries)
  email TEXT NOT NULL,

  -- Display name (optional, can be set by user in settings)
  display_name TEXT,

  -- Role: 'user' (default) or 'superadmin'
  -- Only hazel@theclever.io should have 'superadmin' role
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- Index for role-based queries (useful for admin lookups)
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Apply updated_at trigger to user_profiles
-- (reuses the update_updated_at function created in 001_initial_schema.sql)
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ==============================================================================
-- FUNCTION: handle_new_user
-- ==============================================================================
-- This trigger function fires when a new user is created in auth.users.
-- It automatically creates a corresponding user_profiles row.
-- The superadmin role is assigned if the email matches hazel@theclever.io.
-- ==============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    -- Assign superadmin role if email matches, otherwise 'user'
    CASE WHEN LOWER(NEW.email) = 'hazel@theclever.io' THEN 'superadmin' ELSE 'user' END,
    -- Default display name from email prefix (e.g., "hazel" from "hazel@example.com")
    SPLIT_PART(NEW.email, '@', 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ==============================================================================
-- TABLE: user_settings
-- ==============================================================================
-- Per-user settings for content generation (therapist profile, podcast info, etc.)
-- Each user has their own settings that customize AI-generated content.
-- Settings are automatically created when user profile is created.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign key to user_profiles
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Therapist/creator profile information
  -- Example: { "name": "Dr. Emily Carter", "credentials": "PhD, LMFT", "bio": "...", "website": "..." }
  therapist_profile JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Podcast/show information
  -- Example: { "name": "The Mindful Therapist", "tagline": "...", "target_audience": "..." }
  podcast_info JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Voice and tone guidelines for AI generation
  -- Example: { "tone": ["warm", "professional"], "examples": ["..."], "avoid": ["..."] }
  voice_guidelines JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- SEO and marketing preferences
  -- Example: { "default_hashtags": ["#therapy"], "cta_preferences": ["..."] }
  seo_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Each user can only have one settings row
  UNIQUE(user_id)
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Apply updated_at trigger to user_settings
CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ==============================================================================
-- FUNCTION: handle_new_user_settings
-- ==============================================================================
-- When a user profile is created, automatically create default settings.
-- Optionally copies from evergreen_content as defaults if available.
-- ==============================================================================

CREATE OR REPLACE FUNCTION handle_new_user_settings()
RETURNS TRIGGER AS $$
DECLARE
  default_settings RECORD;
BEGIN
  -- Try to get defaults from evergreen_content (system defaults)
  SELECT
    therapist_profile,
    podcast_info,
    voice_guidelines,
    seo_defaults
  INTO default_settings
  FROM public.evergreen_content
  LIMIT 1;

  -- Insert user settings with defaults (or empty if no system defaults exist)
  INSERT INTO public.user_settings (user_id, therapist_profile, podcast_info, voice_guidelines, seo_defaults)
  VALUES (
    NEW.id,
    COALESCE(default_settings.therapist_profile, '{}'::jsonb),
    COALESCE(default_settings.podcast_info, '{}'::jsonb),
    COALESCE(default_settings.voice_guidelines, '{}'::jsonb),
    COALESCE(default_settings.seo_defaults, '{}'::jsonb)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on user_profiles insert to auto-create settings
DROP TRIGGER IF EXISTS on_user_profile_created ON user_profiles;
CREATE TRIGGER on_user_profile_created
  AFTER INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_settings();

-- ==============================================================================
-- UPDATE EPISODES TABLE
-- ==============================================================================
-- Add user_id column to episodes table to enable per-user data isolation.
-- Each episode will be owned by the user who created it.
-- ==============================================================================

-- Add user_id column to episodes (nullable initially for migration compatibility)
ALTER TABLE episodes
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE;

-- Index for user-scoped queries
CREATE INDEX IF NOT EXISTS idx_episodes_user_id ON episodes(user_id);

-- Composite index for common query pattern (user + status)
CREATE INDEX IF NOT EXISTS idx_episodes_user_status ON episodes(user_id, status);

-- ==============================================================================
-- HELPER FUNCTION: is_superadmin
-- ==============================================================================
-- Checks if the current authenticated user has superadmin role.
-- Used in RLS policies to grant superadmins access to all data.
-- ==============================================================================

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'superadmin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- HELPER FUNCTION: get_user_id
-- ==============================================================================
-- Returns the current authenticated user's ID.
-- Convenience function for RLS policies.
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- ROW-LEVEL SECURITY POLICIES
-- ==============================================================================
-- These policies enforce data isolation:
-- - Users can only access their own data
-- - Superadmins can access all data
-- - Service role bypasses RLS (for backend operations)
-- ==============================================================================

-- ============================================================================
-- USER_PROFILES POLICIES
-- ============================================================================

-- Enable RLS on user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (clean slate)
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Superadmin can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Service role full access profiles" ON user_profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile (but cannot change role)
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM user_profiles WHERE id = auth.uid())
  );

-- Superadmins can view all profiles
CREATE POLICY "Superadmin can view all profiles" ON user_profiles
  FOR SELECT USING (is_superadmin());

-- Service role has full access (backend operations)
CREATE POLICY "Service role full access profiles" ON user_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- USER_SETTINGS POLICIES
-- ============================================================================

-- Enable RLS on user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
DROP POLICY IF EXISTS "Superadmin can view all settings" ON user_settings;
DROP POLICY IF EXISTS "Service role full access settings" ON user_settings;

-- Users can view their own settings
CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can insert their own settings (shouldn't be needed due to trigger, but safe)
CREATE POLICY "Users can insert own settings" ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Superadmins can view all settings
CREATE POLICY "Superadmin can view all settings" ON user_settings
  FOR SELECT USING (is_superadmin());

-- Service role has full access
CREATE POLICY "Service role full access settings" ON user_settings
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- EPISODES POLICIES (UPDATED)
-- ============================================================================
-- Update episodes policies to be user-scoped

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON episodes;
DROP POLICY IF EXISTS "Allow all for service role" ON episodes;

-- Users can view their own episodes
CREATE POLICY "Users can view own episodes" ON episodes
  FOR SELECT USING (
    auth.uid() = user_id
    OR is_superadmin()
    OR user_id IS NULL  -- Allow viewing episodes without user_id (migration compatibility)
  );

-- Users can insert episodes (with their user_id)
CREATE POLICY "Users can insert own episodes" ON episodes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR user_id IS NULL
  );

-- Users can update their own episodes
CREATE POLICY "Users can update own episodes" ON episodes
  FOR UPDATE USING (
    auth.uid() = user_id
    OR is_superadmin()
    OR user_id IS NULL
  );

-- Users can delete their own episodes
CREATE POLICY "Users can delete own episodes" ON episodes
  FOR DELETE USING (
    auth.uid() = user_id
    OR is_superadmin()
    OR user_id IS NULL
  );

-- Service role has full access (backend operations)
CREATE POLICY "Service role full access episodes" ON episodes
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- STAGE_OUTPUTS POLICIES (UPDATED)
-- ============================================================================
-- Update stage_outputs policies to be user-scoped (via episode ownership)

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON stage_outputs;
DROP POLICY IF EXISTS "Allow all for service role" ON stage_outputs;

-- Users can view stages for their own episodes
CREATE POLICY "Users can view own stage outputs" ON stage_outputs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = stage_outputs.episode_id
      AND (episodes.user_id = auth.uid() OR is_superadmin() OR episodes.user_id IS NULL)
    )
  );

-- Users can update stages for their own episodes
CREATE POLICY "Users can update own stage outputs" ON stage_outputs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = stage_outputs.episode_id
      AND (episodes.user_id = auth.uid() OR episodes.user_id IS NULL)
    )
  );

-- Users can insert stages for their own episodes
CREATE POLICY "Users can insert own stage outputs" ON stage_outputs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = stage_outputs.episode_id
      AND (episodes.user_id = auth.uid() OR episodes.user_id IS NULL)
    )
  );

-- Users can delete stages for their own episodes
CREATE POLICY "Users can delete own stage outputs" ON stage_outputs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = stage_outputs.episode_id
      AND (episodes.user_id = auth.uid() OR is_superadmin() OR episodes.user_id IS NULL)
    )
  );

-- Service role has full access
CREATE POLICY "Service role full access stages" ON stage_outputs
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- API_USAGE_LOG POLICIES (UPDATED)
-- ============================================================================
-- Update api_usage_log policies to be user-scoped (via episode ownership)

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON api_usage_log;
DROP POLICY IF EXISTS "Allow all for service role" ON api_usage_log;

-- Users can view usage logs for their own episodes
CREATE POLICY "Users can view own api usage" ON api_usage_log
  FOR SELECT USING (
    episode_id IS NULL  -- Allow viewing logs without episode_id
    OR EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = api_usage_log.episode_id
      AND (episodes.user_id = auth.uid() OR episodes.user_id IS NULL)
    )
    OR is_superadmin()
  );

-- Only superadmin can view all usage logs (for admin dashboard)
CREATE POLICY "Superadmin can view all api usage" ON api_usage_log
  FOR SELECT USING (is_superadmin());

-- Service role has full access (for logging)
CREATE POLICY "Service role full access api_usage" ON api_usage_log
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- EVERGREEN_CONTENT POLICIES (UPDATED)
-- ============================================================================
-- System defaults - readable by all authenticated users, editable by superadmin only

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON evergreen_content;
DROP POLICY IF EXISTS "Allow all for service role" ON evergreen_content;

-- Anyone authenticated can read system defaults
CREATE POLICY "Authenticated users can read evergreen" ON evergreen_content
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Only superadmin can update system defaults
CREATE POLICY "Superadmin can update evergreen" ON evergreen_content
  FOR UPDATE USING (is_superadmin());

-- Service role has full access
CREATE POLICY "Service role full access evergreen" ON evergreen_content
  FOR ALL USING (auth.role() = 'service_role');

-- ==============================================================================
-- ENABLE REALTIME FOR NEW TABLES
-- ==============================================================================
-- Allow frontend to subscribe to changes in user-related tables

ALTER PUBLICATION supabase_realtime ADD TABLE user_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;

-- ==============================================================================
-- VERIFICATION QUERIES
-- ==============================================================================
-- Run these to verify the schema was created correctly:
--
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT * FROM user_profiles;
-- SELECT * FROM user_settings;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'episodes';
-- ==============================================================================
