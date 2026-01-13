# Database Schema

## Overview

This application uses Supabase (PostgreSQL) with six main tables plus RLS policies for security. The database supports multi-user authentication with user-scoped data isolation.

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

Stores the output and metadata for each of the 9 stages of processing.

```sql
CREATE TABLE stage_outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  
  -- Stage identification
  stage_number INTEGER NOT NULL CHECK (stage_number >= 1 AND stage_number <= 9),
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
- `stage_number`: 1-9 (which stage this represents)
- `stage_name`: Human-readable name
  - 1: "Transcript Analysis"
  - 2: "Quote Extraction"
  - 3: "Blog Outline - High Level"
  - 4: "Paragraph-Level Outlines"
  - 5: "Headlines & Copy Options"
  - 6: "Draft Generation"
  - 7: "Refinement Pass"
  - 8: "Social Content"
  - 9: "Email Campaign"
- `status`: Current status of this stage
- `model_used`: e.g., "gpt-4o-mini-2024-07-18" or "claude-sonnet-4-20250514"
- `provider`: "openai" or "anthropic"
- `input_tokens`: Tokens sent to AI
- `output_tokens`: Tokens received from AI
- `cost_usd`: Cost in USD (calculated from tokens + pricing)
- `output_data`: Structured JSON from function calling (for stages 1-5)
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
- `model`: Full model name (e.g., "gpt-4o-mini-2024-07-18")
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

## Relationships

```
auth.users (1) ─────< (1) user_profiles
                           │
                           ├───< (1) user_settings
                           │
                           └───< (many) episodes (1) ─────< (many) stage_outputs
                                                              │
                                                              │ (logs each stage)
                                                              │
                                                              └─────< (many) api_usage_log

evergreen_content (singleton) ──> (system defaults, used as seed for user_settings)
```

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
