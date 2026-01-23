# Audio Transcription Implementation Plan

## Overview

This document outlines the research, API comparison, and implementation plan for adding audio file upload and transcription to the Podcast-to-Content Pipeline. This feature allows users to upload audio files directly instead of pasting transcripts.

---

## API Research Summary

### Evaluated Providers

| Provider | Model | Price/Minute | Price/Hour | Notes |
|----------|-------|--------------|------------|-------|
| **OpenAI** | GPT-4o Mini Transcribe | **$0.003** | $0.18 | Cheapest, 99+ languages |
| OpenAI | Whisper / GPT-4o Transcribe | $0.006 | $0.36 | Higher accuracy |
| Deepgram | Nova-2 | $0.0043 | $0.26 | Good for batch processing |
| Deepgram | Nova-3 | $0.0077 | $0.46 | Highest accuracy |
| AssemblyAI | Universal | $0.0025 | $0.15 | Cheapest base, but add-ons stack |
| Google Cloud | Chirp 2 | $0.016 | $0.96 | Most expensive |

### Cost Estimates for Typical Podcast Episode (45 minutes)

| Provider/Model | Cost per Episode |
|----------------|------------------|
| AssemblyAI Universal | $0.11 |
| **OpenAI GPT-4o Mini** | **$0.135** |
| Deepgram Nova-2 | $0.19 |
| OpenAI Whisper | $0.27 |
| Deepgram Nova-3 | $0.35 |

---

## Recommendation: OpenAI GPT-4o Mini Transcribe

### Why OpenAI GPT-4o Mini Transcribe?

1. **Single Vendor Simplicity**: Already using OpenAI APIs in the pipeline (GPT-5 mini for stages 1-6). One API key, one billing relationship, simpler architecture.

2. **Excellent Price/Performance**: At $0.003/minute, it's cheaper than Deepgram and only slightly more than AssemblyAI's base rate (which increases with add-ons).

3. **No Add-On Costs**: Unlike AssemblyAI where features like speaker ID add $0.02/hr, OpenAI's pricing is all-inclusive.

4. **99+ Language Support**: Excellent for podcasts with guests from various backgrounds.

5. **Simple Integration**: Same API client pattern as existing OpenAI calls.

6. **25MB File Limit**: Sufficient for most podcast episodes (~1 hour of compressed MP3).

### Alternative Consideration

If transcription quality becomes an issue with `gpt-4o-mini-transcribe`, upgrade to `gpt-4o-transcribe` at $0.006/min for improved accuracy.

---

## Speaker Diarization (AssemblyAI)

### Overview

Speaker diarization identifies and labels different speakers in audio, outputting a transcript with timestamps and speaker attribution:

```
[00:00:12] Speaker A: Welcome back to the podcast. Today we have a special guest.

[00:00:18] Speaker B: Thanks for having me. I'm excited to be here.

[00:00:25] Speaker A: Let's start with the basics. Can you tell us about your background?
```

### Why AssemblyAI for Speaker Diarization?

1. **Native Support**: Speaker labels are built into their transcription API (no separate processing step)
2. **Competitive Pricing**: $0.015/minute base includes speaker diarization
3. **Accuracy**: Industry-leading speaker separation accuracy
4. **Simple Integration**: Single API call returns both transcript and speaker labels

### Pricing Comparison for Speaker-Labeled Transcripts

| Provider | Base Cost (45 min) | Speaker Add-on | Total |
|----------|-------------------|----------------|-------|
| **AssemblyAI** | $0.68 | Included | **$0.68** |
| OpenAI + Manual | $0.14 | N/A (not supported) | N/A |

*Note: OpenAI Whisper does NOT support speaker diarization natively.*

### Technical Implementation

**File**: `backend/lib/speaker-transcription.js`

```javascript
import { transcribeWithSpeakers } from './lib/speaker-transcription.js';

const result = await transcribeWithSpeakers(audioBuffer, {
  filename: 'podcast.mp3',
  speakersExpected: 2,  // Optional: hint for better accuracy
});

console.log(result.speakers);
// [{ id: 'A', label: 'Speaker A' }, { id: 'B', label: 'Speaker B' }]

console.log(result.utterances);
// [{ speaker: 'A', start: 12000, end: 18000, text: 'Welcome...' }, ...]

console.log(result.formattedTranscript);
// "[00:00:12] Speaker A: Welcome back..."
```

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/transcription/speaker` | Transcribe with speaker diarization |
| `POST /api/transcription/speaker/with-episode` | Transcribe + create episode |
| `POST /api/transcription/speaker/label` | Apply custom speaker names |
| `GET /api/transcription/speaker/requirements` | Get availability and limits |
| `POST /api/transcription/speaker/estimate` | Estimate cost |

### Database Schema

New tables for speaker metadata:

```sql
-- Episode-level speaker settings
ALTER TABLE episodes ADD COLUMN speaker_data JSONB;
ALTER TABLE episodes ADD COLUMN transcript_format TEXT DEFAULT 'plain';

-- Detailed speaker storage
CREATE TABLE episode_speakers (
  id UUID PRIMARY KEY,
  episode_id UUID REFERENCES episodes(id),
  speaker_id TEXT NOT NULL,  -- 'A', 'B', etc.
  label TEXT NOT NULL,       -- 'Dr. Smith', 'Host', etc.
  role TEXT                  -- 'host', 'guest', 'interviewer'
);

-- Timestamped utterances
CREATE TABLE episode_utterances (
  id UUID PRIMARY KEY,
  episode_id UUID REFERENCES episodes(id),
  speaker_id TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  text TEXT NOT NULL
);
```

### User Flow

1. User uploads audio and toggles "Identify speakers" option
2. AssemblyAI transcribes with speaker diarization
3. User sees transcript with "Speaker A", "Speaker B" labels
4. User can rename speakers (e.g., "Speaker A" → "Dr. Jane Smith")
5. Formatted transcript with names is saved with episode

### Environment Variables

```bash
# Add to .env
ASSEMBLYAI_API_KEY=your-assemblyai-key-here
```

---

## Technical Specifications

### OpenAI Transcription API

**Endpoint**: `POST https://api.openai.com/v1/audio/transcriptions`

**Supported Formats**: mp3, mp4, mpeg, mpga, m4a, wav, webm

**Max File Size**: 25 MB

**Models Available**:
- `whisper-1` (legacy)
- `gpt-4o-transcribe` (standard)
- `gpt-4o-mini-transcribe` (cost-optimized) - **Recommended**

### API Request Example

```javascript
const OpenAI = require('openai');
const fs = require('fs');

const openai = new OpenAI();

async function transcribeAudio(filePath) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'gpt-4o-mini-transcribe',
    response_format: 'text', // or 'json', 'verbose_json', 'srt', 'vtt'
    language: 'en', // optional: auto-detect if omitted
  });

  return transcription.text;
}
```

### Response Formats

- **text**: Plain text transcript
- **json**: `{ "text": "..." }`
- **verbose_json**: Includes word-level timestamps and confidence
- **srt/vtt**: Subtitle formats with timestamps

---

## Implementation Plan

### Phase 1: Backend Infrastructure

#### 1.1 New API Endpoint

**File**: `backend/api/routes/transcription.js` (~200 lines)

```
POST /api/transcription/upload
- Accept multipart/form-data with audio file
- Validate file type and size
- Store temporarily
- Call OpenAI transcription API
- Return transcript text with metadata

Response:
{
  "success": true,
  "transcript": "Full transcript text...",
  "metadata": {
    "duration_seconds": 2700,
    "language": "en",
    "model": "gpt-4o-mini-transcribe",
    "cost_usd": 0.135
  }
}
```

#### 1.2 Transcription Service

**File**: `backend/lib/transcription-service.js` (~250 lines)

- Handle file validation (type, size)
- Chunk large files if needed (>25MB)
- Call OpenAI API with retry logic
- Calculate and log costs
- Clean up temporary files

#### 1.3 Cost Tracking

Update `api_usage_log` to track transcription costs:
- Provider: 'openai'
- Model: 'gpt-4o-mini-transcribe'
- Endpoint: '/v1/audio/transcriptions'
- New field: `audio_duration_seconds`

### Phase 2: Frontend Changes

#### 2.1 Update New Episode Page (`/new`)

**File**: `frontend/pages/NewEpisode.jsx`

Add a toggle/tab system:
```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Add Your Content                                    │
│                                                              │
│  [📝 Paste Transcript] [🎙️ Upload Audio]                    │
│                                                              │
│  ═══════════════════════════════════════════════════════════│
│                                                              │
│  If "Paste Transcript" selected:                            │
│  [Existing textarea for transcript]                         │
│                                                              │
│  If "Upload Audio" selected:                                │
│  ┌─────────────────────────────────────────────────┐       │
│  │                                                  │       │
│  │       🎙️ Drop audio file here                   │       │
│  │       or click to browse                        │       │
│  │                                                  │       │
│  │       Supported: MP3, M4A, WAV, MP4            │       │
│  │       Max size: 25 MB                          │       │
│  │                                                  │       │
│  └─────────────────────────────────────────────────┘       │
│                                                              │
│  Estimated transcription cost: ~$0.14                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 2.2 Audio Upload Component

**File**: `frontend/components/shared/AudioUpload.jsx` (~200 lines)

- Drag-and-drop zone
- File type validation
- Progress indicator during upload
- Transcription progress/status
- Error handling

#### 2.3 Processing States

```
1. IDLE: "Drop audio file here or click to browse"
2. UPLOADING: "Uploading... 45%" with progress bar
3. TRANSCRIBING: "Transcribing audio... This may take 1-2 minutes"
4. COMPLETE: Show transcript preview + "Continue to next step"
5. ERROR: "Transcription failed. [Try Again]"
```

### Phase 3: Database Updates

#### 3.1 Episodes Table

Add optional field to track source type:

```sql
ALTER TABLE episodes
ADD COLUMN source_type TEXT DEFAULT 'transcript'
CHECK (source_type IN ('transcript', 'audio'));

ALTER TABLE episodes
ADD COLUMN audio_metadata JSONB DEFAULT NULL;
```

**audio_metadata** structure:
```json
{
  "original_filename": "episode-42.mp3",
  "duration_seconds": 2700,
  "file_size_bytes": 15000000,
  "transcription_cost_usd": 0.135,
  "transcription_model": "gpt-4o-mini-transcribe",
  "transcribed_at": "2025-01-20T10:30:00Z"
}
```

### Phase 4: Large File Handling (Future Enhancement)

For files > 25MB:

1. **Client-side compression**: Use browser APIs to compress audio
2. **Chunking**: Split into segments, transcribe separately, merge
3. **Alternative**: Accept video files, extract audio server-side

---

## Cost Tracking Updates

### Admin Dashboard Additions

Update `/api/admin/costs` to include:
- Transcription costs by day/week/month
- Average transcription cost per episode
- Total audio minutes transcribed

### New API Usage Log Fields

```sql
-- Optional: Add to api_usage_log for transcription tracking
ALTER TABLE api_usage_log
ADD COLUMN audio_duration_seconds INTEGER DEFAULT NULL;
```

---

## User Flow

### Happy Path

1. User navigates to `/new`
2. User clicks "Upload Audio" tab
3. User drops MP3 file (15 MB, 45 minutes)
4. System shows upload progress (2-3 seconds)
5. System shows "Transcribing..." with spinner
6. After ~30-60 seconds, transcript appears
7. Auto-analysis runs (existing feature)
8. User reviews transcript, makes edits if needed
9. User clicks "Generate Content"
10. Normal 10-stage pipeline runs

### Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| File too large | "File exceeds 25 MB limit. Please compress or trim." | Link to compression tips |
| Invalid format | "Unsupported format. Use MP3, M4A, WAV, or MP4." | List supported formats |
| Transcription fails | "Transcription failed. Please try again." | Retry button |
| API rate limit | "Service busy. Please wait and try again." | Auto-retry with backoff |

---

## Security Considerations

1. **File Validation**: Verify MIME type matches extension
2. **Temporary Storage**: Delete audio files after transcription
3. **Size Limits**: Enforce 25 MB max on both client and server
4. **Rate Limiting**: Limit transcription requests per user/hour
5. **Content Scanning**: Consider audio content moderation (future)

---

## Testing Plan

### Unit Tests

- File validation (type, size)
- Cost calculation accuracy
- API response parsing
- Error handling

### Integration Tests

- Full upload → transcribe → episode creation flow
- Large file handling
- Retry logic on API failures

### Manual Testing

- Various audio formats (MP3, M4A, WAV)
- Different audio qualities (64kbps - 320kbps)
- Long files (approaching 25 MB limit)
- Non-English audio

---

## Implementation Timeline

### Milestone 1: Backend (Core)
- Create transcription service
- Add API endpoint
- Update cost tracking
- Database migration

### Milestone 2: Frontend
- Add upload component
- Update New Episode page
- Progress indicators
- Error handling UI

### Milestone 3: Polish
- Admin dashboard updates
- Performance optimization
- Documentation updates

---

## File Structure

```
backend/
├── api/routes/
│   └── transcription.js          # Upload & speaker endpoints
├── lib/
│   ├── audio-transcription.js    # OpenAI Whisper transcription
│   └── speaker-transcription.js  # AssemblyAI speaker diarization
└── types/
    └── transcription.ts          # TypeScript types

frontend/
├── components/shared/
│   ├── AudioUpload.jsx           # Upload with speaker toggle
│   └── SpeakerLabeling.jsx       # Speaker name editor
└── pages/
    └── NewEpisode.jsx            # Audio tab

supabase/migrations/
└── 009_speaker_diarization.sql   # Speaker tables
```

---

## Environment Variables

```bash
# Required for basic transcription
OPENAI_API_KEY=sk-...

# Optional: Required for speaker diarization feature
# Get from: https://www.assemblyai.com/app/account
ASSEMBLYAI_API_KEY=your-assemblyai-key-here
```

---

## Sources & References

- [OpenAI Transcribe & Whisper API Pricing](https://costgoat.com/pricing/openai-transcription)
- [Whisper API Pricing 2026 Breakdown](https://brasstranscripts.com/blog/openai-whisper-api-pricing-2025-self-hosted-vs-managed)
- [Speech-to-Text API Pricing Comparison (Deepgram)](https://deepgram.com/learn/speech-to-text-api-pricing-breakdown-2025)
- [Deepgram Pricing](https://deepgram.com/pricing)
- [AssemblyAI Pricing](https://www.assemblyai.com/pricing)
- [AssemblyAI Pricing Real Costs](https://brasstranscripts.com/blog/assemblyai-pricing-per-minute-2025-real-costs)

---

*Last updated: 2025-01-23*
*Related: PROJECT-OVERVIEW.md, API-ENDPOINTS.md, PAGE-SPECIFICATIONS.md*
