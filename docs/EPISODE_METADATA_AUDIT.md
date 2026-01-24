# Episode Metadata Audit Report

**Audit Date:** 2026-01-24
**Auditor:** Claude (Automated Audit)

## Executive Summary

This audit traces how episode metadata flows from source to database storage and into analysis prompts. Overall, the system has **good metadata capture** but **significant gaps in utilization**, particularly around speaker diarization data.

---

## 1. Metadata Fields Captured

### Episodes Table (Primary Storage)
| Field | Type | Description |
|-------|------|-------------|
| `title` | TEXT | Episode title (AI-generated or user-provided) |
| `transcript` | TEXT | Full podcast transcript |
| `episode_context` | JSONB | User-provided context/metadata |
| `source_type` | TEXT | 'transcript' or 'audio' |
| `audio_metadata` | JSONB | Original filename, duration, file size, transcription details |
| `speaker_data` | JSONB | Speaker diarization from AssemblyAI |
| `transcript_format` | TEXT | 'plain' or 'speaker_labeled' |
| `feed_episode_id` | UUID | Link to RSS feed episode |

### Feed Episodes Table (RSS Import)
| Field | Type | Description |
|-------|------|-------------|
| `title` | TEXT | Episode title from RSS |
| `description` | TEXT | Episode description/summary |
| `audio_url` | TEXT | Audio file URL |
| `duration_seconds` | INTEGER | Episode duration |
| `published_at` | TIMESTAMP | Publication date |
| `artwork_url` | TEXT | Episode artwork |
| `episode_number` | TEXT | Episode/season info |

### Stage Outputs Table
Stage 0 extracts and stores:
- `episode_name`, `episode_subtitle`
- `host_name`, `guest_name`, `guest_bio`
- `date_released`, `seo_overview`
- `themes[]`, `tags[]`
- `promotion_details`

---

## 2. Metadata Flow Through Analysis Pipeline

```
┌─────────────────┐
│ Source Input    │
│ (Transcript,    │
│  Audio, RSS)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐
│ Stage 0         │◄───│ evergreen       │
│ Content Brief   │    │ podcast_info    │
│                 │    │ therapist_profile│
└────────┬────────┘    └─────────────────┘
         │ episode_name, themes, tags
         ▼
┌─────────────────┐
│ Stage 1         │
│ Episode Summary │
│ → episode_crux  │  ← CANONICAL SUMMARY
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Stage 2         │
│ Quotes & Tips   │  ← CANONICAL QUOTES
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Stages 3-9                              │
│ (Outline → Blog → Social → Email)       │
│                                         │
│ Uses: episode_crux, quotes, themes      │
└─────────────────────────────────────────┘
```

---

## 3. Gaps Identified

### 🔴 CRITICAL: Speaker Diarization Data Unused

**Status:** Data is collected and stored but COMPLETELY IGNORED in analysis.

| Available Data | Current Usage |
|----------------|---------------|
| `speaker_data.speakers[]` | ❌ Not used |
| `episode_speakers` table | ❌ Not used |
| `episode_utterances` table | ❌ Not used |

**Impact:** Stage 2 quote extraction guesses speaker attribution instead of using accurate speaker labels and timestamps.

**Recommendation:** Integrate speaker diarization into Stage 2 for precise quote attribution.

---

### ⚠️ MODERATE: RSS Feed Metadata Underutilized

| Field | Status |
|-------|--------|
| `description` | Available but NOT passed to analysis |
| `published_at` | Stored but NOT used in prompts |
| `episode_number` | Available but NOT extracted |
| `categories` | Available but NOT used for theme validation |

**Recommendation:** Use RSS description alongside transcript for better context. Use published date for seasonal/recency analysis.

---

### ⚠️ MODERATE: Evergreen Content Inconsistently Applied

| Field | Usage |
|-------|-------|
| `target_audience` | Used in Stages 0-1 only, NOT in Stages 8-9 |
| `content_pillars` | Defined but NOT used to validate themes |

**Recommendation:** Propagate audience profile through ALL stages. Validate themes against content pillars.

---

### ℹ️ LOW: Audio Metadata Not Leveraged

| Field | Potential Use |
|-------|---------------|
| `duration_seconds` | Could scale analysis depth by episode length |
| `episode_type` | Could optimize analysis approach |

---

## 4. Verification: Metadata IS Being Pulled

### ✅ Confirmed: Database Storage
- All episode data stored in `episodes` table
- Stage outputs stored in `stage_outputs` table
- RSS metadata stored in `feed_episodes` table
- Speaker data stored in `speaker_data` JSONB column

### ✅ Confirmed: Used in Analysis Prompts
- `transcript` → All stages
- `episode_context` → Stage 0
- `evergreen.podcast_info` → Stages 0, 1, 3, 6
- `evergreen.therapist_profile` → Stages 0, 1, 6
- `evergreen.voice_guidelines` → Stages 3, 6, 7
- Stage 0 `themes` → Stages 1, 2, 3, 5
- Stage 1 `episode_crux` → Stages 3, 4, 5, 6, 8, 9
- Stage 2 `quotes` → Stages 6, 8, 9

---

## 5. Priority Recommendations

| Priority | Issue | Action |
|----------|-------|--------|
| **HIGH** | Speaker diarization unused | Integrate into Stage 2 quote extraction |
| **HIGH** | Theme validation missing | Validate against content_pillars in Stage 0 |
| **MEDIUM** | Audience not propagated | Pass target_audience to Stages 8-9 |
| **MEDIUM** | RSS description ignored | Include in Stage 0 analysis |
| **LOW** | Duration unused | Scale analysis depth by episode length |
| **LOW** | Published date unused | Enable seasonal/recency analysis |

---

## 6. Files Reviewed

### Database Schemas
- `/supabase/migrations/001_initial_schema.sql` - Core tables
- `/supabase/migrations/008_audio_metadata.sql` - Audio fields
- `/supabase/migrations/009_speaker_diarization.sql` - Speaker data
- `/supabase/migrations/010_podcast_feeds.sql` - RSS integration

### Analysis Stages
- `/lib/stages/stage-00-content-brief.js` - Metadata extraction
- `/lib/stages/stage-01-episode-summary.js` - Episode crux generation
- `/lib/stages/stage-02-extract-quotes.js` - Quote extraction
- `/lib/stages/stage-03-outline-high-level.js` through `/lib/stages/stage-09-generate-email.js`

### Prompt Templates
- `/prompts/stage-00-content-brief.md`
- `/prompts/stage-01-episode-summary.md`
- `/prompts/stage-02-extract-quotes.md`
- `/prompts/stage-03-blog-outline.md`
- `/prompts/stage-08-social-platform.md`
