-- ============================================================================
-- MIGRATION 009: Speaker Diarization Support
-- ============================================================================
-- Adds support for speaker-labeled transcripts from AssemblyAI.
-- Stores speaker metadata, utterances with timestamps, and speaker labels.
--
-- Changes:
-- 1. Add speaker_data JSONB column to episodes for speaker metadata
-- 2. Add transcript_format column to track transcript type
-- 3. Create episode_speakers table for detailed speaker storage
-- 4. Create episode_utterances table for timestamped utterances
-- ============================================================================

-- ============================================================================
-- STEP 1: Add speaker_data column to episodes
-- ============================================================================
-- This stores speaker metadata alongside the episode for quick access

ALTER TABLE episodes
ADD COLUMN IF NOT EXISTS speaker_data JSONB DEFAULT NULL;

COMMENT ON COLUMN episodes.speaker_data IS
'Speaker diarization metadata from AssemblyAI. Contains speakers array and settings.
Example: {
  "speakers": [
    { "id": "A", "label": "Dr. Smith (Host)" },
    { "id": "B", "label": "Jane Doe (Guest)" }
  ],
  "provider": "assemblyai",
  "transcriptId": "abc123",
  "hasSpeakerDiarization": true
}';

-- ============================================================================
-- STEP 2: Add transcript_format column to episodes
-- ============================================================================
-- Indicates whether the transcript is plain text or speaker-formatted

ALTER TABLE episodes
ADD COLUMN IF NOT EXISTS transcript_format TEXT DEFAULT 'plain'
CHECK (transcript_format IN ('plain', 'speaker_labeled'));

COMMENT ON COLUMN episodes.transcript_format IS
'Format of the transcript text: plain (basic text) or speaker_labeled (with timestamps and speaker IDs)';

-- ============================================================================
-- STEP 3: Create episode_speakers table
-- ============================================================================
-- Stores individual speaker details for an episode (for more complex use cases)

CREATE TABLE IF NOT EXISTS episode_speakers (
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

-- Indexes for episode_speakers
CREATE INDEX IF NOT EXISTS idx_episode_speakers_episode ON episode_speakers(episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_speakers_label ON episode_speakers(label);

-- Trigger for updated_at
CREATE TRIGGER episode_speakers_updated_at
  BEFORE UPDATE ON episode_speakers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE episode_speakers IS
'Stores speaker information for episodes with speaker diarization.
Allows users to label and describe each speaker detected in the audio.';

-- ============================================================================
-- STEP 4: Create episode_utterances table
-- ============================================================================
-- Stores individual utterances with timestamps and speaker attribution
-- Useful for advanced features like jumping to specific moments or speaker analysis

CREATE TABLE IF NOT EXISTS episode_utterances (
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

-- Indexes for episode_utterances
CREATE INDEX IF NOT EXISTS idx_episode_utterances_episode ON episode_utterances(episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_utterances_speaker ON episode_utterances(episode_id, speaker_id);
CREATE INDEX IF NOT EXISTS idx_episode_utterances_sequence ON episode_utterances(episode_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_episode_utterances_timing ON episode_utterances(episode_id, start_ms);

COMMENT ON TABLE episode_utterances IS
'Stores individual utterances from speaker diarization with timestamps.
Each row represents one continuous speech segment from a single speaker.';

-- ============================================================================
-- STEP 5: Add RLS policies for new tables
-- ============================================================================

-- Enable RLS
ALTER TABLE episode_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_utterances ENABLE ROW LEVEL SECURITY;

-- episode_speakers policies
CREATE POLICY "Users can view speakers for own episodes" ON episode_speakers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = episode_speakers.episode_id
      AND (episodes.user_id = auth.uid() OR is_superadmin())
    )
  );

CREATE POLICY "Users can insert speakers for own episodes" ON episode_speakers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = episode_speakers.episode_id
      AND episodes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update speakers for own episodes" ON episode_speakers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = episode_speakers.episode_id
      AND episodes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete speakers for own episodes" ON episode_speakers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = episode_speakers.episode_id
      AND episodes.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to speakers" ON episode_speakers
  FOR ALL USING (auth.role() = 'service_role');

-- episode_utterances policies
CREATE POLICY "Users can view utterances for own episodes" ON episode_utterances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = episode_utterances.episode_id
      AND (episodes.user_id = auth.uid() OR is_superadmin())
    )
  );

CREATE POLICY "Users can insert utterances for own episodes" ON episode_utterances
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = episode_utterances.episode_id
      AND episodes.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to utterances" ON episode_utterances
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 6: Add provider tracking to api_usage_log
-- ============================================================================
-- Update the provider check constraint to include assemblyai

ALTER TABLE api_usage_log
DROP CONSTRAINT IF EXISTS api_usage_log_provider_check;

ALTER TABLE api_usage_log
ADD CONSTRAINT api_usage_log_provider_check
CHECK (provider IN ('openai', 'anthropic', 'assemblyai'));

-- ============================================================================
-- HELPFUL QUERIES (for reference, not executed)
-- ============================================================================

-- Get episode with all speaker info:
-- SELECT
--   e.id, e.title, e.speaker_data,
--   json_agg(
--     json_build_object(
--       'speaker_id', es.speaker_id,
--       'label', es.label,
--       'role', es.role
--     )
--   ) as speakers
-- FROM episodes e
-- LEFT JOIN episode_speakers es ON es.episode_id = e.id
-- WHERE e.id = $1
-- GROUP BY e.id;

-- Get utterances for an episode with speaker labels:
-- SELECT
--   eu.start_ms, eu.end_ms, eu.text,
--   COALESCE(es.label, 'Speaker ' || eu.speaker_id) as speaker_label
-- FROM episode_utterances eu
-- LEFT JOIN episode_speakers es ON es.episode_id = eu.episode_id
--   AND es.speaker_id = eu.speaker_id
-- WHERE eu.episode_id = $1
-- ORDER BY eu.sequence_number;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
