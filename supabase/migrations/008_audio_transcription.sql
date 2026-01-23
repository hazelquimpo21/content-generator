-- ==============================================================================
-- MIGRATION: Audio Transcription Support
-- ==============================================================================
-- Purpose: Add columns to track audio source and transcription metadata
-- Related: AUDIO-TRANSCRIPTION-IMPLEMENTATION.md
-- ==============================================================================

-- Add source_type column to track whether episode came from transcript or audio
ALTER TABLE episodes
ADD COLUMN source_type TEXT DEFAULT 'transcript'
CHECK (source_type IN ('transcript', 'audio'));

-- Add audio_metadata column to store transcription details
-- Structure:
-- {
--   "original_filename": "episode-42.mp3",
--   "duration_seconds": 2700,
--   "file_size_bytes": 15000000,
--   "transcription_cost_usd": 0.135,
--   "transcription_model": "whisper-1",
--   "transcribed_at": "2025-01-20T10:30:00Z"
-- }
ALTER TABLE episodes
ADD COLUMN audio_metadata JSONB DEFAULT NULL;

-- Add audio_duration_seconds to api_usage_log for transcription tracking
ALTER TABLE api_usage_log
ADD COLUMN audio_duration_seconds INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN episodes.source_type IS 'Whether episode was created from pasted transcript or audio file upload';
COMMENT ON COLUMN episodes.audio_metadata IS 'Metadata about audio file and transcription (if source_type = audio)';
COMMENT ON COLUMN api_usage_log.audio_duration_seconds IS 'Duration of audio file for transcription API calls';
