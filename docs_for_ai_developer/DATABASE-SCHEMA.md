# Database Schema

## Overview

This application uses Supabase (PostgreSQL) with eight main tables plus RLS policies for security. The database supports multi-user authentication with user-scoped data isolation.

## Tables

### `episodes`

Stores metadata for each podcast episode being processed.

```sql
CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Core data
  title TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'paused', 'completed', 'error')),
  current_stage INTEGER DEFAULT 0 CHECK (current_stage >= 0 AND current_stage <= 9),
  
  -- Input
  transcript TEXT NOT NULL,
  episode_context JSONB DEFAULT '{}'::jsonb,
  
  -- Computed/aggregated fields
  total_cost_usd DECIMAL(10, 4) DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,
  
  -- Metadata
  error_message TEXT,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_episodes_status ON episodes(status);
CREATE INDEX idx_episodes_created_at ON episodes(created_at DESC);
CREATE INDEX idx_episodes_current_stage ON episodes(current_stage);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER episodes_updated_at
  BEFORE UPDATE ON episodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**Field Descriptions:**

- `id`: Unique identifier (UUID v4)
- `title`: Episode title (extracted in Stage 1, or null)
- `status`: Current processing status
  - `draft`: Created but not yet processing
  - `processing`: AI pipeline running
  - `paused`: User paused processing
  - `completed`: All stages finished
  - `error`: Failed with unrecoverable error
- `current_stage`: Which stage (0-9) is currently running
- `transcript`: Full podcast transcript (text)
- `episode_context`: Optional JSON object with user-provided context
  ```json
  {
    "guest_name": "Dr. Jane Smith",
    "target_keywords": ["anxiety", "coping"],
    "special_notes": "Focus on practical tips"
  }
  ```
- `total_cost_usd`: Sum of all API costs for this episode
- `total_duration_seconds`: Total time to process all stages
- `error_message`: If status='error', description of failure
- `processing_started_at`: When processing began
- `processing_completed_at`: When all 9 stages finished
- `user_id`: Foreign key to user_profiles (links episode to creating user)

---

### `user_profiles`

Stores user profile information linked to Supabase auth.users.

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
```

**Field Descriptions:**

- `id`: UUID matching Supabase auth.users.id
- `email`: User's email address (denormalized from auth.users)
- `display_name`: User's display name (optional)
- `role`: Either 'user' (default) or 'superadmin'
- `created_at`: When profile was created
- `updated_at`: Last update timestamp
- `last_login_at`: Most recent login timestamp

**Auto-Creation Trigger:**

A trigger automatically creates a user_profile when a new user signs up via Supabase Auth. The superadmin role is assigned if email matches `hazel@theclever.io`.

---

### `user_settings`

Stores per-user settings (therapist profile, podcast info, etc.) for content generation.

```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  therapist_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  podcast_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  voice_guidelines JSONB NOT NULL DEFAULT '{}'::jsonb,
  seo_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Index
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);
```

**Field Descriptions:**

- `id`: Unique identifier (UUID v4)
- `user_id`: Foreign key to user_profiles
- `therapist_profile`: JSON containing therapist/creator profile info
  ```json
  {
    "name": "Dr. Jane Smith",
    "credentials": "PhD, LMFT",
    "bio": "Licensed therapist...",
    "website": "drjanesmith.com"
  }
  ```
- `podcast_info`: JSON containing podcast details
  ```json
  {
    "name": "The Mindful Therapist",
    "tagline": "Real conversations about mental health",
    "target_audience": "Adults seeking mental health insights"
  }
  ```
- `voice_guidelines`: JSON containing writing style preferences
- `seo_defaults`: JSON containing SEO/marketing settings

**Auto-Creation Trigger:**

A trigger automatically creates user_settings when a new user_profile is created, optionally copying defaults from evergreen_content.

---

### `stage_outputs`

Stores the output and metadata for each of the 10 stages of processing (Stage 0-9).

```sql
CREATE TABLE stage_outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,

  -- Stage identification
  -- NOTE: Stage 0 = Transcript Preprocessing (Claude Haiku, skipped for short transcripts)
  -- Stages 1-6 = Analysis & Drafting (GPT-5 mini)
  -- Stages 7-9 = Refinement & Distribution (Claude Sonnet)
  stage_number INTEGER NOT NULL CHECK (stage_number >= 0 AND stage_number <= 9),
  stage_name TEXT NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  
  -- AI model info
  model_used TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  
  -- Token usage
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd DECIMAL(10, 6),
  
  -- Output data
  output_data JSONB,
  output_text TEXT,
  
  -- Error handling
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(episode_id, stage_number)
);

-- Indexes
CREATE INDEX idx_stage_outputs_episode ON stage_outputs(episode_id);
CREATE INDEX idx_stage_outputs_stage ON stage_outputs(stage_number);
CREATE INDEX idx_stage_outputs_status ON stage_outputs(status);
CREATE INDEX idx_stage_outputs_created_at ON stage_outputs(created_at DESC);
```

**Field Descriptions:**

- `episode_id`: Foreign key to episodes table
- `stage_number`: 0-9 (which stage this represents, 10 stages total)
- `stage_name`: Human-readable name
  - 0: "Transcript Preprocessing" (Claude Haiku - skipped for short transcripts)
  - 1: "Transcript Analysis" (GPT-5 mini)
  - 2: "Quote Extraction" (GPT-5 mini)
  - 3: "Blog Outline - High Level" (GPT-5 mini)
  - 4: "Paragraph-Level Outlines" (GPT-5 mini)
  - 5: "Headlines & Copy Options" (GPT-5 mini)
  - 6: "Draft Generation" (GPT-5 mini)
  - 7: "Refinement Pass" (Claude Sonnet)
  - 8: "Social Content" (Claude Sonnet)
  - 9: "Email Campaign" (Claude Sonnet)
- `status`: Current status of this stage
- `model_used`: e.g., "gpt-5-mini", "claude-3-5-haiku-20241022", or "claude-sonnet-4-20250514"
- `provider`: "openai" or "anthropic"
- `input_tokens`: Tokens sent to AI
- `output_tokens`: Tokens received from AI
- `cost_usd`: Cost in USD (calculated from tokens + pricing)
- `output_data`: Structured JSON from function calling (for stages 0-5)
- `output_text`: Markdown or text output (for stages 6-9)
- `error_message`: If status='failed', error description
- `error_details`: Full error object as JSON
- `retry_count`: How many times this stage has been retried

**Example `output_data` for Stage 1:**
```json
{
  "episode_basics": {
    "title": "Understanding Anxiety in Modern Life",
    "date": "2025-01-10",
    "duration_estimate": "45 minutes",
    "main_topics": ["anxiety", "coping strategies", "work-life balance"]
  },
  "guest_info": {
    "name": "Dr. Sarah Johnson",
    "credentials": "PhD, Clinical Psychologist",
    "expertise": "Anxiety disorders and CBT",
    "website": "drsarahjohnson.com"
  },
  "episode_crux": "Anxiety in the workplace often stems from unclear boundaries and unrealistic expectations. Practical strategies like time-blocking and communication frameworks can help."
}
```

---

### `evergreen_content`

Stores the therapist's profile, podcast info, and writing guidelines used in all episodes.

```sql
CREATE TABLE evergreen_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  therapist_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  podcast_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  voice_guidelines JSONB NOT NULL DEFAULT '{}'::jsonb,
  seo_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Only allow one row (singleton table)
CREATE UNIQUE INDEX idx_evergreen_singleton ON evergreen_content ((id IS NOT NULL));

-- Trigger to update updated_at
CREATE TRIGGER evergreen_updated_at
  BEFORE UPDATE ON evergreen_content
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Insert default row
INSERT INTO evergreen_content (id) VALUES ('00000000-0000-0000-0000-000000000000');
```

**Field Descriptions:**

- `therapist_profile`: Therapist's professional information
  ```json
  {
    "name": "Dr. Emily Carter",
    "credentials": "PhD, LMFT",
    "bio": "Licensed therapist specializing in couples therapy and anxiety treatment...",
    "website": "dremilycarter.com",
    "social_links": {
      "instagram": "@dremilycarter",
      "linkedin": "linkedin.com/in/emilycarter"
    }
  }
  ```

- `podcast_info`: Podcast details
  ```json
  {
    "name": "The Mindful Therapist",
    "tagline": "Real conversations about mental health",
    "description": "A weekly podcast exploring therapy concepts...",
    "target_audience": "Adults seeking practical mental health insights",
    "content_pillars": ["anxiety", "relationships", "self-compassion", "boundaries"]
  }
  ```

- `voice_guidelines`: Writing style preferences
  ```json
  {
    "tone": ["warm", "professional", "accessible", "conversational"],
    "perspective": "first-person plural (we, us)",
    "sentence_style": "Mix of short and medium sentences, avoid run-ons",
    "examples": [
      "Anxiety doesn't announce itself politely. It shows up unannounced...",
      "Here's what I notice in my practice: most people underestimate..."
    ],
    "avoid": [
      "Don't use therapy jargon without explanation",
      "Avoid 'just' (minimizing)",
      "No 'simple' or 'easy' when discussing change"
    ]
  }
  ```

- `seo_defaults`: SEO and marketing preferences
  ```json
  {
    "meta_description_template": "{{title}} - Insights from therapist Dr. Emily Carter on The Mindful Therapist podcast",
    "default_hashtags": ["#therapy", "#mentalhealth", "#mindfulness"],
    "email_signature": "Dr. Emily Carter, LMFT\nHost of The Mindful Therapist\ndremilycarter.com",
    "cta_preferences": ["Visit my website", "Listen to more episodes", "Book a consultation"]
  }
  ```

---

### `api_usage_log`

Logs every AI API call for cost tracking and debugging.

```sql
CREATE TABLE api_usage_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- API details
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  
  -- Token usage
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  
  -- Cost
  cost_usd DECIMAL(10, 6) NOT NULL,
  
  -- Context
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
  stage_number INTEGER,
  
  -- Performance
  response_time_ms INTEGER,
  
  -- Status
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT
);

-- Indexes
CREATE INDEX idx_api_usage_timestamp ON api_usage_log(timestamp DESC);
CREATE INDEX idx_api_usage_episode ON api_usage_log(episode_id);
CREATE INDEX idx_api_usage_provider ON api_usage_log(provider);
CREATE INDEX idx_api_usage_date ON api_usage_log(DATE(timestamp));
```

**Field Descriptions:**

- `provider`: "openai" or "anthropic"
- `model`: Full model name (e.g., "gpt-5-mini")
- `endpoint`: API endpoint called (e.g., "/v1/chat/completions")
- `input_tokens`: Tokens sent
- `output_tokens`: Tokens received
- `total_tokens`: Auto-calculated sum
- `cost_usd`: Cost in USD
- `episode_id`: Associated episode (null for non-episode calls)
- `stage_number`: Associated stage (1-9, or null)
- `response_time_ms`: How long the API call took
- `success`: Whether call succeeded
- `error_message`: If success=false, error description

---

### `content_library`

Stores saved content pieces from episodes for later use or scheduling.

```sql
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

-- Indexes
CREATE INDEX idx_content_library_user ON content_library(user_id);
CREATE INDEX idx_content_library_type ON content_library(content_type);
CREATE INDEX idx_content_library_platform ON content_library(platform) WHERE platform IS NOT NULL;
CREATE INDEX idx_content_library_episode ON content_library(episode_id) WHERE episode_id IS NOT NULL;
CREATE INDEX idx_content_library_favorite ON content_library(user_id, is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX idx_content_library_created ON content_library(created_at DESC);
CREATE INDEX idx_content_library_tags ON content_library USING GIN(tags);

-- Trigger to update updated_at
CREATE TRIGGER content_library_updated_at
  BEFORE UPDATE ON content_library
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**Field Descriptions:**

- `id`: Unique identifier (UUID v4)
- `user_id`: Foreign key to user_profiles (data owner)
- `episode_id`: Optional reference to source episode (null if episode deleted)
- `title`: User-provided title for the content piece
- `content_type`: Type of content
  - `blog`: Full blog post
  - `social`: Social media post
  - `email`: Email campaign content
  - `headline`: Title/headline options
  - `quote`: Extracted quotes
- `platform`: For social content, the target platform
- `content`: The actual content text
- `metadata`: Additional JSON data (hashtags, character counts, etc.)
- `source_stage`: Which pipeline stage generated this (0-9)
- `source_sub_stage`: For social content, which platform variant
- `tags`: User-defined tags for organization (array)
- `is_favorite`: Whether user marked as favorite
- `created_at`: When saved to library
- `updated_at`: Last modification timestamp

**Example `metadata` for social content:**
```json
{
  "hashtags": ["#anxiety", "#mentalhealth", "#therapy"],
  "character_count": 142,
  "post_type": "short"
}
```

---

### `content_calendar`

Stores scheduled content items with dates for organized publishing.

```sql
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

  -- Metadata for platform-specific info
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_content_calendar_user ON content_calendar(user_id);
CREATE INDEX idx_content_calendar_date ON content_calendar(scheduled_date);
CREATE INDEX idx_content_calendar_user_date ON content_calendar(user_id, scheduled_date);
CREATE INDEX idx_content_calendar_status ON content_calendar(status);
CREATE INDEX idx_content_calendar_type ON content_calendar(content_type);
CREATE INDEX idx_content_calendar_platform ON content_calendar(platform) WHERE platform IS NOT NULL;
CREATE INDEX idx_content_calendar_library ON content_calendar(library_item_id) WHERE library_item_id IS NOT NULL;
CREATE INDEX idx_content_calendar_episode ON content_calendar(episode_id) WHERE episode_id IS NOT NULL;

-- Trigger to update updated_at
CREATE TRIGGER content_calendar_updated_at
  BEFORE UPDATE ON content_calendar
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**Field Descriptions:**

- `id`: Unique identifier (UUID v4)
- `user_id`: Foreign key to user_profiles (data owner)
- `library_item_id`: Optional reference to source library item
- `episode_id`: Optional reference to source episode
- `scheduled_date`: Target publication date (required)
- `scheduled_time`: Target publication time (optional)
- `title`: Content title for calendar display
- `content_type`: Type of content (blog, social, email)
- `platform`: For social content, target platform
- `content_preview`: Short preview (first 200 chars) for calendar view
- `full_content`: Complete content text (copied for independence)
- `status`: Publishing workflow status
  - `draft`: Not finalized, needs work
  - `scheduled`: Ready to publish at scheduled time
  - `published`: Successfully published
  - `cancelled`: Skipped/cancelled
- `published_at`: Actual publication timestamp
- `publish_url`: Link to published content
- `notes`: User notes about this scheduled item
- `metadata`: Platform-specific data (hashtags, etc.)
- `created_at`: When scheduled
- `updated_at`: Last modification timestamp

**Example scheduled item:**
```json
{
  "id": "abc123...",
  "scheduled_date": "2025-01-20",
  "scheduled_time": "10:00:00",
  "title": "Understanding Anxiety - Instagram",
  "content_type": "social",
  "platform": "instagram",
  "content_preview": "Anxiety doesn't announce itself politely...",
  "status": "scheduled",
  "metadata": {
    "hashtags": ["#anxiety", "#mentalhealth"]
  }
}
```

---

## Relationships

```
auth.users (1) ─────< (1) user_profiles
                           │
                           ├───< (1) user_settings
                           │
                           ├───< (many) content_library ─────> (optional) episodes
                           │         │
                           │         └───< (many) content_calendar
                           │
                           ├───< (many) content_calendar ─────> (optional) episodes
                           │
                           └───< (many) episodes (1) ─────< (many) stage_outputs
                                                              │
                                                              │ (logs each stage)
                                                              │
                                                              └─────< (many) api_usage_log

evergreen_content (singleton) ──> (system defaults, used as seed for user_settings)
```

### Content Library & Calendar Relationships

- `content_library.user_id` → `user_profiles.id` (owner)
- `content_library.episode_id` → `episodes.id` (optional source)
- `content_calendar.user_id` → `user_profiles.id` (owner)
- `content_calendar.library_item_id` → `content_library.id` (optional source)
- `content_calendar.episode_id` → `episodes.id` (optional source)

### User Data Isolation

- Each user can only see and modify their own episodes
- User settings are scoped to individual users
- Superadmin (hazel@theclever.io) can view all users' episodes
- The `user_id` column on episodes enforces data ownership

---

## Row-Level Security (RLS)

RLS policies enforce multi-user data isolation at the database level. Users can only access their own data, while superadmins can view all data.

### Helper Functions

```sql
-- Check if current user is superadmin
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

-- Get current user's ID
CREATE OR REPLACE FUNCTION get_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### User Profiles Policies

```sql
-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile (except role)
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Superadmin can view all profiles
CREATE POLICY "Superadmin can view all profiles" ON user_profiles
  FOR SELECT USING (is_superadmin());
```

### User Settings Policies

```sql
-- Users can view their own settings
CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE USING (auth.uid() = user_id);
```

### Episodes Policies

```sql
-- Users can view their own episodes (superadmin can view all)
CREATE POLICY "Users can view own episodes" ON episodes
  FOR SELECT USING (auth.uid() = user_id OR is_superadmin());

-- Users can insert their own episodes
CREATE POLICY "Users can insert own episodes" ON episodes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own episodes
CREATE POLICY "Users can update own episodes" ON episodes
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own episodes
CREATE POLICY "Users can delete own episodes" ON episodes
  FOR DELETE USING (auth.uid() = user_id);
```

### Stage Outputs Policies

```sql
-- Users can view stages for their own episodes
CREATE POLICY "Users can view own stage outputs" ON stage_outputs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = stage_outputs.episode_id
      AND (episodes.user_id = auth.uid() OR is_superadmin())
    )
  );
```

### Content Library Policies

```sql
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
```

### Content Calendar Policies

```sql
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
```

### Service Role Bypass

The backend uses a service role key that bypasses RLS for administrative operations:

```sql
-- Service role bypasses all RLS policies
CREATE POLICY "Allow all for service role" ON episodes
  FOR ALL USING (auth.role() = 'service_role');
```

---

## Real-Time Subscriptions

### Frontend Subscription Setup

To listen for stage updates in real-time:

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Subscribe to stage updates for specific episode
const channel = supabase
  .channel('stage-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'stage_outputs',
      filter: `episode_id=eq.${episodeId}`
    },
    (payload) => {
      console.log('Stage updated:', payload.new);
      updateUIWithNewStageData(payload.new);
    }
  )
  .subscribe();

// Cleanup
return () => {
  supabase.removeChannel(channel);
};
```

---

## Common Queries

### Get Episode with All Stage Outputs

```sql
SELECT 
  e.*,
  json_agg(
    json_build_object(
      'stage_number', so.stage_number,
      'stage_name', so.stage_name,
      'status', so.status,
      'output_data', so.output_data,
      'output_text', so.output_text,
      'cost_usd', so.cost_usd,
      'duration_seconds', so.duration_seconds
    ) ORDER BY so.stage_number
  ) as stages
FROM episodes e
LEFT JOIN stage_outputs so ON so.episode_id = e.id
WHERE e.id = $1
GROUP BY e.id;
```

### Get Cost Summary for Date Range

```sql
SELECT 
  DATE(timestamp) as date,
  provider,
  COUNT(*) as api_calls,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(cost_usd) as total_cost
FROM api_usage_log
WHERE timestamp >= $1 AND timestamp < $2
GROUP BY DATE(timestamp), provider
ORDER BY date DESC, provider;
```

### Get Average Processing Time by Stage

```sql
SELECT 
  stage_number,
  stage_name,
  AVG(duration_seconds) as avg_duration_seconds,
  MIN(duration_seconds) as min_duration_seconds,
  MAX(duration_seconds) as max_duration_seconds,
  COUNT(*) as completed_count
FROM stage_outputs
WHERE status = 'completed'
GROUP BY stage_number, stage_name
ORDER BY stage_number;
```

### Get Recent Errors

```sql
SELECT 
  e.title,
  so.stage_name,
  so.error_message,
  so.retry_count,
  so.created_at
FROM stage_outputs so
JOIN episodes e ON e.id = so.episode_id
WHERE so.status = 'failed'
ORDER BY so.created_at DESC
LIMIT 20;
```

### `content_pillars`

High-level brand themes for organizing content strategy. User-scoped.

```sql
CREATE TABLE content_pillars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Pillar details
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280', -- For UI badges

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique pillar names per user
  UNIQUE(user_id, name)
);

-- Indexes
CREATE INDEX idx_content_pillars_user ON content_pillars(user_id);
CREATE INDEX idx_content_pillars_name ON content_pillars(user_id, name);
```

### `topics`

Granular content tags. User-scoped. Topics can belong to multiple pillars (many-to-many).

```sql
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
```

### `topic_pillar_associations`

Junction table for many-to-many relationship between topics and pillars.

```sql
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
```

**Note:** The `content_library` and `content_calendar` tables have a `topic_ids UUID[]` column to store which topics are associated with each content item. This enables filtering content by topic.

---

### `episode_speakers`

Stores speaker information for episodes with speaker diarization. User-scoped via episode ownership.

```sql
CREATE TABLE episode_speakers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,

  -- Speaker identification
  speaker_id TEXT NOT NULL,  -- 'A', 'B', 'C', etc. from diarization
  label TEXT NOT NULL,        -- User-friendly name, e.g., "Dr. Smith"

  -- Optional speaker metadata
  role TEXT,                  -- 'host', 'guest', 'interviewer', etc.
  description TEXT,           -- Additional notes about the speaker

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique speaker IDs per episode
  UNIQUE(episode_id, speaker_id)
);

-- Indexes
CREATE INDEX idx_episode_speakers_episode ON episode_speakers(episode_id);
CREATE INDEX idx_episode_speakers_label ON episode_speakers(label);
```

**Field Descriptions:**

- `id`: Unique identifier (UUID v4)
- `episode_id`: Foreign key to episodes table
- `speaker_id`: Speaker label from diarization ('A', 'B', 'C', etc.)
- `label`: Human-readable name (e.g., "Dr. Smith", "Host")
- `role`: Optional role descriptor (host, guest, interviewer, etc.)
- `description`: Optional notes about the speaker

---

### `episode_utterances`

Stores timestamped utterances from speaker diarization. Each row is one continuous speech segment.

```sql
CREATE TABLE episode_utterances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,

  -- Speaker reference
  speaker_id TEXT NOT NULL,   -- 'A', 'B', etc.

  -- Timing (in milliseconds from start)
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,

  -- Content
  text TEXT NOT NULL,

  -- Optional metadata
  confidence DECIMAL(5, 4),   -- 0.0000 to 1.0000
  word_count INTEGER GENERATED ALWAYS AS (
    array_length(regexp_split_to_array(trim(text), '\s+'), 1)
  ) STORED,

  -- Ordering
  sequence_number INTEGER NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_episode_utterances_episode ON episode_utterances(episode_id);
CREATE INDEX idx_episode_utterances_speaker ON episode_utterances(episode_id, speaker_id);
CREATE INDEX idx_episode_utterances_sequence ON episode_utterances(episode_id, sequence_number);
CREATE INDEX idx_episode_utterances_timing ON episode_utterances(episode_id, start_ms);
```

**Field Descriptions:**

- `id`: Unique identifier (UUID v4)
- `episode_id`: Foreign key to episodes table
- `speaker_id`: Which speaker said this ('A', 'B', etc.)
- `start_ms`: Start time in milliseconds from audio start
- `end_ms`: End time in milliseconds from audio start
- `text`: The spoken text content
- `confidence`: Confidence score from diarization (0-1)
- `word_count`: Automatically computed word count
- `sequence_number`: Order of utterance in transcript

**Example query - Get transcript with speaker labels:**
```sql
SELECT
  eu.start_ms, eu.end_ms, eu.text,
  COALESCE(es.label, 'Speaker ' || eu.speaker_id) as speaker_label
FROM episode_utterances eu
LEFT JOIN episode_speakers es ON es.episode_id = eu.episode_id
  AND es.speaker_id = eu.speaker_id
WHERE eu.episode_id = $1
ORDER BY eu.sequence_number;
```

---

### Episodes Table - Speaker Columns

The `episodes` table has been extended with speaker diarization columns:

```sql
ALTER TABLE episodes
ADD COLUMN speaker_data JSONB DEFAULT NULL,
ADD COLUMN transcript_format TEXT DEFAULT 'plain'
  CHECK (transcript_format IN ('plain', 'speaker_labeled'));
```

- `speaker_data`: JSON containing speaker metadata from AssemblyAI
  ```json
  {
    "speakers": [
      { "id": "A", "label": "Dr. Smith (Host)" },
      { "id": "B", "label": "Jane Doe (Guest)" }
    ],
    "provider": "assemblyai",
    "transcriptId": "abc123",
    "hasSpeakerDiarization": true
  }
  ```
- `transcript_format`: Format of the transcript text
  - `plain`: Basic text without speaker labels
  - `speaker_labeled`: Formatted with timestamps and speaker IDs

---

## Migration Strategy

### Initial Migration

Create a single migration file to set up all tables:

```sql
-- migrations/001_initial_schema.sql

-- Create episodes table
CREATE TABLE episodes (...);
CREATE INDEX ...;
CREATE TRIGGER ...;

-- Create stage_outputs table
CREATE TABLE stage_outputs (...);
CREATE INDEX ...;

-- Create evergreen_content table
CREATE TABLE evergreen_content (...);
CREATE INDEX ...;
INSERT INTO evergreen_content ...;

-- Create api_usage_log table
CREATE TABLE api_usage_log (...);
CREATE INDEX ...;

-- Enable RLS
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
CREATE POLICY ...;
```

### Running Migrations

Use Supabase CLI or Dashboard:

```bash
# If using Supabase CLI
supabase db push

# Or execute SQL directly in Supabase Dashboard
```

---

## Backup Strategy

### What to Backup

- **Critical**: `episodes`, `stage_outputs` (user content)
- **Important**: `evergreen_content` (settings)
- **Optional**: `api_usage_log` (for analytics, can be truncated)

### Backup Frequency

- **Daily**: Automated backups via Supabase
- **Before Major Changes**: Manual backup before schema migrations
- **User-Initiated**: Allow user to export their data

### Restore Process

```sql
-- Restore from backup
pg_restore -d database_name backup_file.dump

-- Or for JSON exports
COPY episodes FROM 'episodes.csv' CSV HEADER;
```

---

## Data Retention Policy

### Production

- **episodes**: Keep forever (or until user deletes)
- **stage_outputs**: Keep forever (linked to episode)
- **evergreen_content**: Keep forever (single row)
- **api_usage_log**: Keep 90 days, then archive or delete

### Development

- Truncate all tables between tests
- Use seed data for consistent testing

---

**This schema is designed for clarity, performance, and real-time updates. All tables support the full episode processing pipeline.**
