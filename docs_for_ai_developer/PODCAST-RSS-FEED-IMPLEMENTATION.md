# Podcast RSS Feed Integration Plan

## Overview

This document outlines how to integrate podcast RSS feed support into the Podcast-to-Content Pipeline. This feature will allow users to:

1. **Import their podcast history** from an RSS feed
2. **See which episodes** have already been transcribed/processed
3. **Transcribe episodes directly** from the feed's audio URLs
4. **Auto-populate podcast metadata** from the feed

---

## Why RSS Feeds?

Every podcast has an RSS feed - it's the foundation of podcast distribution. Apple Podcasts, Spotify, Google Podcasts, and all podcast apps consume RSS feeds. This makes RSS the universal, free, standardized way to access podcast data.

**What's in a Podcast RSS Feed:**
- Show metadata (title, description, author, artwork URL, website)
- Episode list with full history
- Per-episode data: title, description, audio URL, duration, publish date
- iTunes-specific tags (categories, explicit flag, keywords)

---

## User Experience Goals

### Problem: Users Don't Know Their RSS Feed URL

Most podcasters don't interact with their RSS feed directly. They use hosting platforms (Buzzsprout, Anchor/Spotify, Libsyn, Podbean) or directories (Apple Podcasts, Spotify).

### Solution: Multiple Discovery Methods

```
┌─────────────────────────────────────────────────────────────────────┐
│  Connect Your Podcast                                                │
│                                                                      │
│  Choose how to find your podcast:                                   │
│                                                                      │
│  [🔍 Search by Name]  [🍎 Apple Podcasts Link]  [📋 Paste RSS URL]  │
│                                                                      │
│  ════════════════════════════════════════════════════════════════════│
│                                                                      │
│  Search by Podcast Name:                                            │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ The Mindful Therapist                                 [Search] │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Results:                                                           │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 🎙️ The Mindful Therapist                                       │ │
│  │    Dr. Emily Carter • 156 episodes • Health & Wellness         │ │
│  │    [Connect This Podcast]                                       │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ 🎙️ Mindful Therapy Sessions                                    │ │
│  │    John Smith • 42 episodes • Mental Health                    │ │
│  │    [Connect This Podcast]                                       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  💡 Can't find your podcast? Try pasting your Apple Podcasts link   │
│     or RSS feed URL directly.                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Free APIs & Tools

### 1. PodcastIndex.org API (Recommended - Primary)

**What it is:** A free, open-source podcast database with 4M+ podcasts.

**Pricing:** 100% Free (requires free API key)

**Features:**
- Search by podcast name → returns RSS feed URL
- Search by iTunes ID → returns RSS feed URL
- Search by RSS URL → returns podcast metadata
- Full episode data available

**Get API Key:** https://api.podcastindex.org (free developer account)

**Example Search:**
```javascript
// Search by title
GET https://api.podcastindex.org/api/1.0/search/byterm?q=The+Mindful+Therapist

// Search by iTunes ID (extracted from Apple Podcasts URL)
GET https://api.podcastindex.org/api/1.0/podcasts/byitunesid?id=1234567890

// Response includes feedUrl, title, description, artwork, episodeCount, etc.
```

**Authentication:**
```javascript
const crypto = require('crypto');

function getPodcastIndexHeaders(apiKey, apiSecret) {
  const authDate = Math.floor(Date.now() / 1000);
  const authHeader = crypto
    .createHash('sha1')
    .update(apiKey + apiSecret + authDate)
    .digest('hex');

  return {
    'X-Auth-Key': apiKey,
    'X-Auth-Date': authDate,
    'Authorization': authHeader,
    'User-Agent': 'PodcastContentPipeline/1.0'
  };
}
```

### 2. iTunes Search API (Fallback - No Auth Required)

**What it is:** Apple's free API for searching iTunes/Apple Podcasts.

**Pricing:** 100% Free (no API key needed)

**Use case:** When user pastes an Apple Podcasts URL, extract the ID and get the RSS feed.

**Example:**
```javascript
// Search by name
GET https://itunes.apple.com/search?term=mindful+therapist&media=podcast&limit=10

// Lookup by ID (from Apple Podcasts URL)
GET https://itunes.apple.com/lookup?id=1234567890

// Response includes feedUrl, trackName, artistName, artworkUrl100, etc.
```

**Extracting iTunes ID from Apple Podcasts URL:**
```javascript
// URL format: https://podcasts.apple.com/us/podcast/the-mindful-therapist/id1234567890
function extractItunesId(url) {
  const match = url.match(/\/id(\d+)/);
  return match ? match[1] : null;
}
```

### 3. Direct RSS Feed Parsing

When user provides RSS URL directly, parse it using `podcast-feed-parser` npm package.

---

## RSS Feed Parsing

### Recommended Package: `podcast-feed-parser`

```bash
npm install podcast-feed-parser
```

**Why this package:**
- Podcast-specific (handles iTunes tags, enclosures)
- Returns clean JavaScript objects
- Handles various RSS feed formats
- Works with URLs or XML strings

**Example Usage:**
```javascript
import { getPodcastFromURL } from 'podcast-feed-parser';

const podcast = await getPodcastFromURL('https://example.com/feed.xml');

console.log(podcast.meta);
// {
//   title: 'The Mindful Therapist',
//   description: 'Real conversations about mental health',
//   author: 'Dr. Emily Carter',
//   imageURL: 'https://example.com/artwork.jpg',
//   link: 'https://dremilycarter.com',
//   language: 'en',
//   categories: ['Health & Fitness', 'Mental Health']
// }

console.log(podcast.episodes[0]);
// {
//   title: 'Understanding Anxiety in Modern Life',
//   description: 'Today we explore practical strategies...',
//   pubDate: '2025-01-10T10:00:00Z',
//   enclosure: {
//     url: 'https://example.com/episodes/ep123.mp3',
//     type: 'audio/mpeg',
//     length: '45000000'
//   },
//   duration: 2700, // seconds
//   guid: 'unique-episode-id',
//   explicit: false
// }
```

### Alternative: `rss-parser`

```bash
npm install rss-parser
```

Simpler but less podcast-specific. Good as a fallback.

---

## Feature Design

### Database Schema Changes

#### New Table: `podcast_feeds`

Stores connected podcast RSS feeds for users.

```sql
CREATE TABLE podcast_feeds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Feed identification
  feed_url TEXT NOT NULL,
  itunes_id TEXT,                    -- Apple Podcasts ID if known
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

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique feed per user
  UNIQUE(user_id, feed_url)
);

CREATE INDEX idx_podcast_feeds_user ON podcast_feeds(user_id);
```

#### New Table: `feed_episodes`

Stores episode metadata from RSS feed (lightweight, for display).

```sql
CREATE TABLE feed_episodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feed_id UUID NOT NULL REFERENCES podcast_feeds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Episode identification
  guid TEXT NOT NULL,                -- Unique ID from RSS feed

  -- Episode metadata
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT NOT NULL,
  duration_seconds INTEGER,
  published_at TIMESTAMP WITH TIME ZONE,
  artwork_url TEXT,                  -- Episode-specific artwork if different

  -- Processing status
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,  -- Link to processed episode
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'transcribing', 'processed', 'error')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique episode per feed
  UNIQUE(feed_id, guid)
);

CREATE INDEX idx_feed_episodes_feed ON feed_episodes(feed_id);
CREATE INDEX idx_feed_episodes_user ON feed_episodes(user_id);
CREATE INDEX idx_feed_episodes_status ON feed_episodes(status);
CREATE INDEX idx_feed_episodes_published ON feed_episodes(published_at DESC);
```

### API Endpoints

#### Podcast Search & Discovery

```
POST /api/podcasts/search
  Search for podcasts by name using PodcastIndex/iTunes APIs
  Body: { query: "The Mindful Therapist" }
  Returns: Array of podcast results with feedUrl, title, artworkUrl, episodeCount

POST /api/podcasts/lookup
  Look up podcast by Apple Podcasts URL or RSS URL
  Body: { url: "https://podcasts.apple.com/..." } or { url: "https://feed.xml" }
  Returns: Podcast metadata with feedUrl

GET /api/podcasts/feeds
  List user's connected podcast feeds
  Returns: Array of podcast_feeds with episode counts and sync status
```

#### Feed Connection & Sync

```
POST /api/podcasts/feeds
  Connect a new podcast feed
  Body: { feed_url: "https://...", itunes_id?: "123" }
  Returns: Created feed with initial episode list

GET /api/podcasts/feeds/:id
  Get single feed with all episodes
  Returns: Feed details + episodes with processing status

POST /api/podcasts/feeds/:id/sync
  Manually trigger feed sync (fetch latest episodes)
  Returns: Updated episode list

DELETE /api/podcasts/feeds/:id
  Disconnect a podcast feed (doesn't delete processed episodes)
```

#### Episode Processing from Feed

```
POST /api/podcasts/episodes/:feedEpisodeId/transcribe
  Start transcription for a feed episode
  Downloads audio from feed, transcribes, creates episode
  Returns: Created episode with transcription status

POST /api/podcasts/episodes/:feedEpisodeId/transcribe-and-process
  Transcribe AND start full content generation pipeline
  Returns: Created episode in processing state
```

---

## User Interface

### Settings Page: "Connect Your Podcast"

New section in Settings page after "Podcast Information":

```
┌─────────────────────────────────────────────────────────────────────┐
│  Connect Your Podcast RSS Feed                                       │
│                                                                      │
│  Connect your podcast's RSS feed to import episode history and      │
│  easily transcribe past episodes.                                    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 🎙️ The Mindful Therapist                                       │ │
│  │    156 episodes • Last synced: 2 hours ago                     │ │
│  │    [Sync Now] [View Episodes] [Disconnect]                      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [+ Connect Another Podcast]                                         │
│                                                                      │
│  ────────────────────────────────────────────────────────────────── │
│                                                                      │
│  💡 Don't know your RSS feed URL?                                   │
│                                                                      │
│  Most podcast hosts provide this in your dashboard:                 │
│  • Buzzsprout: Settings → Directories → RSS Feed                    │
│  • Spotify for Podcasters: Settings → Availability → RSS Feed       │
│  • Anchor: Click "..." → Copy RSS feed link                         │
│  • Libsyn: Destinations → Your Website → RSS Feed URL               │
│                                                                      │
│  Or paste your Apple Podcasts link and we'll find it for you!       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### New Episode Page: "Import from Feed"

Add tab alongside existing "Paste Transcript" / "Upload Audio":

```
┌─────────────────────────────────────────────────────────────────────┐
│  Step 1: Add Your Content                                            │
│                                                                      │
│  [📝 Paste Transcript] [🎙️ Upload Audio] [📡 Import from Feed]     │
│                                            ▲ selected                │
│                                                                      │
│  ════════════════════════════════════════════════════════════════════│
│                                                                      │
│  Your Podcast Episodes                                               │
│  The Mindful Therapist • 156 episodes                               │
│                                                                      │
│  [Filter: All ▼] [Search episodes...]                               │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ ✅ Understanding Anxiety in Modern Life                       │  │
│  │    Jan 10, 2025 • 45 min • PROCESSED                         │  │
│  │    [View Content]                                             │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ ⭕ Building Healthy Boundaries                                │  │
│  │    Jan 3, 2025 • 38 min • NOT PROCESSED                      │  │
│  │    [Transcribe & Generate] [Transcribe Only]                  │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ ⭕ The Power of Self-Compassion                               │  │
│  │    Dec 27, 2024 • 42 min • NOT PROCESSED                     │  │
│  │    [Transcribe & Generate] [Transcribe Only]                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Showing 3 of 156 episodes                        [Load More]       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Episode Status Indicators

| Status | Icon | Description |
|--------|------|-------------|
| Available | ⭕ | Episode in feed, not yet processed |
| Transcribing | 🔄 | Currently transcribing audio |
| Processed | ✅ | Transcribed and content generated |
| Error | ⚠️ | Transcription or processing failed |

---

## Implementation Phases

### Phase 1: Core Infrastructure

1. **Database migrations** for `podcast_feeds` and `feed_episodes` tables
2. **PodcastIndex API client** (`backend/lib/podcastindex-client.js`)
3. **RSS feed parser service** (`backend/lib/rss-feed-parser.js`)
4. **API endpoints** for search, lookup, and feed management

**Files to create:**
```
backend/
├── lib/
│   ├── podcastindex-client.js      (~200 lines)
│   └── rss-feed-parser.js          (~150 lines)
├── api/routes/
│   └── podcasts.js                 (~350 lines)
```

### Phase 2: Feed Connection UI

1. **Connect Podcast modal** component
2. **Podcast search results** component
3. **Settings page integration** (add "Connect Your Podcast" section)
4. **Feed management** (sync, disconnect)

**Files to create/modify:**
```
frontend/
├── components/
│   ├── podcast/
│   │   ├── ConnectPodcastModal.jsx    (~300 lines)
│   │   ├── PodcastSearchResults.jsx   (~150 lines)
│   │   └── ConnectedFeedCard.jsx      (~150 lines)
├── pages/
│   └── Settings.jsx                   (modify - add section)
```

### Phase 3: Episode Import & Transcription

1. **Feed episodes list** component
2. **"Import from Feed" tab** on New Episode page
3. **Transcribe from feed endpoint** (downloads audio, transcribes)
4. **Episode status tracking** in feed_episodes table

**Files to create/modify:**
```
frontend/
├── components/
│   ├── podcast/
│   │   ├── FeedEpisodesList.jsx       (~250 lines)
│   │   └── FeedEpisodeCard.jsx        (~150 lines)
├── pages/
│   └── NewEpisode.jsx                 (modify - add tab)

backend/
├── api/routes/
│   └── podcasts.js                    (add transcribe endpoint)
├── lib/
│   └── feed-transcription-service.js  (~200 lines)
```

### Phase 4: Auto-Populate & Polish

1. **Auto-populate podcast info** from feed metadata on first connect
2. **Background sync** for new episodes (optional scheduled job)
3. **Episode matching** (detect if transcript pasted matches feed episode)

---

## Cost Considerations

### API Costs

| Service | Cost | Notes |
|---------|------|-------|
| PodcastIndex API | **Free** | Requires free API key |
| iTunes API | **Free** | No API key needed |
| RSS Feed Parsing | **Free** | Local parsing |

### Transcription Costs (from existing implementation)

When user transcribes from feed:
- **OpenAI Whisper**: $0.006/minute
- **AssemblyAI (with speakers)**: $0.015/minute

45-minute episode:
- Basic transcription: ~$0.27
- With speaker diarization: ~$0.68

---

## Environment Variables

```bash
# Add to .env
PODCASTINDEX_API_KEY=your-api-key
PODCASTINDEX_API_SECRET=your-api-secret
```

Get free API credentials at: https://api.podcastindex.org

---

## Security Considerations

1. **Rate limiting** on search endpoints to prevent abuse
2. **Validate RSS URLs** before fetching (prevent SSRF)
3. **Sanitize feed content** (descriptions may contain HTML/scripts)
4. **Audio URL validation** before transcription (only allow audio/* MIME types)

---

## Finding Your RSS Feed URL - User Guide

### Paste Your Apple Podcasts Link

If you have your Apple Podcasts URL, we can find your RSS feed automatically:
1. Open Apple Podcasts app
2. Find your podcast
3. Click the "..." menu → "Copy Link"
4. Paste it here

### Find It In Your Hosting Dashboard

**Buzzsprout:**
Settings → Directories → "Your Buzzsprout RSS Feed"

**Spotify for Podcasters (Anchor):**
Settings → Availability → Enable RSS → Copy URL

**Libsyn:**
Destinations → Your Website → "RSS Feed URL"

**Podbean:**
Settings → Basic Settings → RSS Feed URL

**Transistor:**
Settings → RSS Feed → Copy URL

**Simplecast:**
Settings → RSS Feed → Copy URL

**Captivate:**
Settings → Distribution → RSS Feed

**Spreaker:**
Your show → Settings → RSS Feed

---

## Sources & References

- [PodcastIndex.org API Docs](https://podcastindex-org.github.io/docs-api/)
- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)
- [podcast-feed-parser npm](https://www.npmjs.com/package/podcast-feed-parser)
- [rss-parser npm](https://www.npmjs.com/package/rss-parser)
- [Castos RSS Feed Finder](https://castos.com/tools/find-podcast-rss-feed/)
- [GetRSSFeed.com](https://getrssfeed.com/)
- [Spotify RSS Feed Guide](https://support.spotify.com/us/creators/article/finding-and-enabling-your-rss-feed/)

---

*Last updated: 2025-01-23*
*Related: PROJECT-OVERVIEW.md, AUDIO-TRANSCRIPTION-IMPLEMENTATION.md, PAGE-SPECIFICATIONS.md*
