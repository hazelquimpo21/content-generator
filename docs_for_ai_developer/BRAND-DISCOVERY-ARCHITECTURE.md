# Brand Discovery System - Architecture & Data Model

## Overview

The Brand Discovery System is a modular, gamified onboarding experience that helps therapists and coaches define their brand identity. It lives within Settings and can be completed incrementally over time. The system scrapes existing web presence, facilitates interactive exercises, and synthesizes a "Brand DNA" that enhances AI content generation.

### Core Principles

1. **Nothing is required** - Users can skip everything and enter data manually
2. **Modular completion** - Each module saves independently, can be done in any order
3. **AI assists, human confirms** - AI infers and suggests, users approve identity decisions
4. **Progressive enhancement** - More modules completed = richer Brand DNA = better content

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SETTINGS PAGE                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    BRAND DISCOVERY STUDIO                        │   │
│  │                                                                   │   │
│  │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │   │
│  │   │ SOURCES │ │  VIBE   │ │ VALUES  │ │ METHOD  │ │AUDIENCE │  │   │
│  │   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │   │
│  │        │           │           │           │           │        │   │
│  │        └───────────┴─────┬─────┴───────────┴───────────┘        │   │
│  │                          │                                       │   │
│  │                          ▼                                       │   │
│  │              ┌─────────────────────┐                            │   │
│  │              │   BRAND DNA ENGINE  │                            │   │
│  │              │   (AI Synthesis)    │                            │   │
│  │              └──────────┬──────────┘                            │   │
│  │                         │                                        │   │
│  │                         ▼                                        │   │
│  │              ┌─────────────────────┐                            │   │
│  │              │  BRAND DNA OUTPUT   │                            │   │
│  │              │  - Archetype        │                            │   │
│  │              │  - Brand Promise    │                            │   │
│  │              │  - Voice Traits     │                            │   │
│  │              │  - AI Directives    │                            │   │
│  │              └─────────────────────┘                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    MANUAL SETTINGS (existing)                    │   │
│  │   Therapist Profile | Podcast Info | Voice Guidelines | Topics  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │    CONTENT PIPELINE       │
                    │  (uses Brand DNA + Manual │
                    │   Settings in prompts)    │
                    └───────────────────────────┘
```

---

## Database Schema

### New Table: `brand_discovery`

```sql
CREATE TABLE brand_discovery (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Overall completion tracking
  overall_completion_percent INTEGER DEFAULT 0,

  -- Module states (JSONB for flexibility)
  modules JSONB NOT NULL DEFAULT '{
    "sources": {"status": "not_started", "completed_at": null, "data": null},
    "vibe": {"status": "not_started", "completed_at": null, "data": null},
    "values": {"status": "not_started", "completed_at": null, "data": null},
    "method": {"status": "not_started", "completed_at": null, "data": null},
    "audience": {"status": "not_started", "completed_at": null, "data": null},
    "channels": {"status": "not_started", "completed_at": null, "data": null}
  }'::jsonb,

  -- Inference tracking (what AI guessed vs user confirmed)
  inferences JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Synthesized Brand DNA (regenerated when modules change)
  brand_dna JSONB DEFAULT NULL,
  brand_dna_generated_at TIMESTAMP WITH TIME ZONE,

  -- Version history for tracking changes over time
  history JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Indexes
CREATE INDEX idx_brand_discovery_user ON brand_discovery(user_id);
CREATE INDEX idx_brand_discovery_completion ON brand_discovery(overall_completion_percent);

-- RLS Policies
ALTER TABLE brand_discovery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brand discovery" ON brand_discovery
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own brand discovery" ON brand_discovery
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brand discovery" ON brand_discovery
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create trigger (creates brand_discovery when user_profile is created)
CREATE OR REPLACE FUNCTION create_brand_discovery_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO brand_discovery (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_user_profile_created_brand_discovery
  AFTER INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_brand_discovery_for_user();
```

---

## Module Data Structures

### Module Status Enum

```
"not_started" | "partial" | "complete"
```

### Sources Module

```typescript
interface SourcesModuleData {
  websites: Array<{
    url: string;
    added_at: string;        // ISO timestamp
    scrape_status: "pending" | "processing" | "completed" | "failed";
    scrape_completed_at: string | null;
    scrape_error: string | null;
    raw_content: {
      homepage: string | null;
      about: string | null;
      services: string | null;
    };
    extracted_data: {
      name: string | null;
      credentials: string | null;
      bio: string | null;
      modalities: string[];
      specialties: string[];
      audience_signals: string[];
      tone_analysis: {
        formal_casual: number;      // 1-10
        clinical_relatable: number; // 1-10
        scientific_holistic: number; // 1-10
      };
      sample_phrases: string[];
    } | null;
  }>;
  // Future expansion
  podcast_rss: string | null;
  linkedin_url: string | null;
  instagram_handle: string | null;
}
```

### Vibe Module

```typescript
interface VibeModuleData {
  sliders: {
    clinical_relatable: number | null;    // 0-100, 0=Clinical, 100=Relatable
    quiet_energetic: number | null;       // 0-100, 0=Quiet, 100=High-Energy
    minimalist_eclectic: number | null;   // 0-100, 0=Minimalist, 100=Eclectic
    scientific_holistic: number | null;   // 0-100, 0=Scientific, 100=Holistic
    formal_playful: number | null;        // 0-100, 0=Formal, 100=Playful
    expert_guide: number | null;          // 0-100, 0=Expert, 100=Guide
  };
}
```

### Values Module

```typescript
interface ValuesModuleData {
  // Step A: Swipe results
  swipe_results: {
    me: string[];          // Values swiped right
    not_me: string[];      // Values swiped left
    skipped: string[];     // Values not shown (if deck was personalized)
  };

  // Step B: Power Five (ranked)
  power_five: Array<{
    value: string;
    rank: number;          // 1-5
  }>;

  // Step C: AI "Why" nuances
  nuances: {
    [value: string]: {
      selected_nuance: string;
      available_options: Array<{
        id: string;
        label: string;
        description: string;
      }>;
    };
  };
}
```

### Method Module

```typescript
interface MethodModuleData {
  // Selected from predefined lists
  modalities: string[];
  specialties: string[];

  // User-added custom entries
  custom_modalities: string[];
  custom_specialties: string[];

  // Source tracking
  inferred_modalities: string[];   // Pre-checked from scrape
  inferred_specialties: string[];  // Pre-checked from scrape
  confirmed: boolean;              // User explicitly confirmed
}
```

### Audience Module

```typescript
interface AudienceModuleData {
  // Selected archetypes
  selected_archetypes: string[];   // IDs from predefined list

  // Custom archetypes user added
  custom_archetypes: Array<{
    name: string;
    description: string;
  }>;

  // Nuance selections (optional deepening)
  archetype_nuances: {
    [archetypeId: string]: string;  // e.g., "overwhelmed_achiever": "startup_founder"
  };
}
```

### Channels Module

```typescript
interface ChannelsModuleData {
  // Ranked priorities (1 = highest)
  priorities: Array<{
    platform: "linkedin" | "instagram" | "twitter" | "facebook" | "email" | "tiktok" | "threads";
    rank: number;
  }>;

  // Platforms explicitly marked as not using
  not_using: string[];
}
```

---

## Inference Tracking Structure

```typescript
interface InferenceRecord {
  [fieldPath: string]: {
    value: any;
    source: "scraped" | "ai_generated";
    source_url: string | null;
    confidence: number;        // 0-1
    confirmed: boolean;        // User said "yes"
    confirmed_at: string | null;
    rejected: boolean;         // User said "no"
    rejected_at: string | null;
  };
}

// Example:
{
  "therapist_profile.name": {
    "value": "Dr. Jane Smith",
    "source": "scraped",
    "source_url": "https://example.com/about",
    "confidence": 0.95,
    "confirmed": true,
    "confirmed_at": "2025-01-15T10:30:00Z",
    "rejected": false,
    "rejected_at": null
  },
  "method.modalities": {
    "value": ["CBT", "IFS", "EMDR"],
    "source": "scraped",
    "source_url": "https://example.com/services",
    "confidence": 0.8,
    "confirmed": false,
    "confirmed_at": null,
    "rejected": false,
    "rejected_at": null
  }
}
```

---

## Brand DNA Structure

```typescript
interface BrandDNA {
  // Generated metadata
  generated_at: string;
  modules_used: string[];      // Which modules contributed
  confidence_score: number;    // Overall confidence in synthesis

  // Core outputs
  archetype: {
    primary: {
      id: string;
      name: string;
      description: string;
    };
    secondary: {
      id: string;
      name: string;
      description: string;
    } | null;
    blended_name: string;      // e.g., "The Grounded Challenger"
    blended_description: string;
  };

  brand_promise: {
    template: string;          // "I provide {method} for {audience} who {pain} so they can {outcome}"
    filled: string;            // Actual filled-in version
    editable_parts: {
      method: string;
      audience: string;
      pain_point: string;
      desired_outcome: string;
    };
  };

  content_pillars: Array<{
    id: string;
    name: string;              // e.g., "The Method"
    description: string;
    content_types: string[];   // What kind of content fits here
  }>;

  voice_characteristics: Array<{
    trait: string;
    description: string;
    example: string;
  }>;

  anti_patterns: Array<{
    pattern: string;
    why_avoid: string;
    instead: string;
  }>;

  // The actual AI integration
  ai_directives: {
    system_prompt_additions: string[];
    temperature_hint: number;  // 0-1
    content_preferences: {
      look_for: string[];      // What to emphasize in transcripts
      avoid: string[];         // What to skip or downplay
      framing: string;         // How to frame content
    };
    platform_adaptations: {
      [platform: string]: {
        tone_shift: string;
        length_preference: string;
        special_instructions: string;
      };
    };
  };
}
```

---

## Version History Structure

```typescript
interface HistoryEntry {
  timestamp: string;
  trigger: "module_completion" | "manual_regenerate" | "manual_edit" | "scheduled";
  modules_snapshot: {
    [moduleId: string]: {
      status: string;
      data_hash: string;       // Hash of data for change detection
    };
  };
  brand_dna_snapshot: BrandDNA | null;
  notes: string | null;        // Optional user note
}
```

---

## Completion Calculation

```typescript
function calculateOverallCompletion(modules: ModulesState): number {
  const weights = {
    sources: 15,    // Can be skipped, but valuable
    vibe: 25,       // Core identity, can't be inferred
    values: 25,     // Core identity, can't be inferred
    method: 15,     // Important but can be partially inferred
    audience: 10,   // Helpful but optional
    channels: 10    // Helpful but optional
  };

  let totalWeight = 0;
  let completedWeight = 0;

  for (const [moduleId, weight] of Object.entries(weights)) {
    totalWeight += weight;
    const status = modules[moduleId]?.status;
    if (status === "complete") {
      completedWeight += weight;
    } else if (status === "partial") {
      completedWeight += weight * 0.5;
    }
  }

  return Math.round((completedWeight / totalWeight) * 100);
}
```

---

## Integration with Existing Settings

Brand Discovery writes to the SAME underlying data as manual settings:

| Brand Discovery Module | Writes To |
|----------------------|-----------|
| Sources → extracted name, credentials, bio | `user_settings.therapist_profile` |
| Sources → extracted modalities | `user_settings.therapist_profile.modalities` (new field) |
| Vibe sliders | `brand_discovery.modules.vibe` (new) + influences `user_settings.voice_guidelines` |
| Values | `brand_discovery.modules.values` (new) |
| Method → modalities, specialties | `user_settings.therapist_profile` + `topics` table |
| Audience | `brand_discovery.modules.audience` (new) |
| Channels | `brand_discovery.modules.channels` (new) |

The Brand DNA synthesis reads from ALL sources (both brand_discovery and user_settings) to generate the final output.

---

## API Endpoints

### Brand Discovery Endpoints

```
GET    /api/brand-discovery
       Returns full brand_discovery record for current user

PATCH  /api/brand-discovery/modules/:moduleId
       Updates a specific module's data
       Body: { status, data }

POST   /api/brand-discovery/sources/scrape
       Initiates website scrape
       Body: { url }
       Returns: { scrape_id, status: "processing" }

GET    /api/brand-discovery/sources/scrape/:scrapeId
       Check scrape status
       Returns: { status, extracted_data? }

POST   /api/brand-discovery/inferences/confirm
       Confirm or reject inferences
       Body: { field_path, confirmed: boolean }

POST   /api/brand-discovery/brand-dna/regenerate
       Force regenerate Brand DNA
       Returns: { brand_dna }

GET    /api/brand-discovery/history
       Get version history
       Query: ?limit=10&offset=0

POST   /api/brand-discovery/values/generate-nuances
       Generate AI "Why" options for a value
       Body: { value }
       Returns: { options: [...] }
```

---

## Event Flow: Module Completion → Brand DNA Regeneration

```
1. User completes module (clicks Save)
         │
         ▼
2. Frontend calls PATCH /api/brand-discovery/modules/:id
         │
         ▼
3. Backend updates module status to "complete"
         │
         ▼
4. Backend checks: Are 2+ modules complete?
         │
         ├─ No → Return success, no DNA generation
         │
         └─ Yes → Continue
                   │
                   ▼
5. Backend triggers Brand DNA regeneration (async)
         │
         ▼
6. AI synthesizes Brand DNA from all module data
         │
         ▼
7. Backend saves new Brand DNA + creates history entry
         │
         ▼
8. Frontend receives update via polling or websocket
         │
         ▼
9. UI shows "Brand DNA updated" notification
```

---

## Scraping Flow

```
1. User enters website URL
         │
         ▼
2. Frontend calls POST /api/brand-discovery/sources/scrape
         │
         ▼
3. Backend creates scrape job, returns scrape_id
         │
         ▼
4. Backend (async): Simple scraper fetches homepage HTML
         │
         ▼
5. Backend (async): Discover and scrape /about, /services pages
         │
         ▼
6. Backend (async): Run AI analysis on scraped content
         │
         ├─ Extract: name, credentials, bio
         ├─ Extract: modalities, specialties
         ├─ Analyze: tone (formal/casual, clinical/relatable, etc.)
         └─ Extract: sample phrases, audience signals
         │
         ▼
7. Backend saves extracted_data to sources module
         │
         ▼
8. Backend creates inferences for each extracted field
         │
         ▼
9. Frontend polls for completion, receives extracted_data
         │
         ├─ Success → UI shows inferred fields with "confirm/reject" options
         │
         └─ Failed → UI shows manual text input fallback
```

---

## Simple Scraper Service Specification

We build our own lightweight scraper instead of using a paid service. This handles 90%+ of therapist/coach websites (WordPress, Squarespace, Wix, etc.).

### What It Does

```
URL → fetch HTML → parse with cheerio → extract main content → clean text
```

### Implementation Details

```javascript
// backend/services/scraper-service.js

const SCRAPER_CONFIG = {
  // Request settings
  timeout: 10000,              // 10 second timeout
  maxRedirects: 3,             // Follow up to 3 redirects
  userAgent: 'Mozilla/5.0 (compatible; BrandDiscoveryBot/1.0)',

  // Content extraction
  removeSelectors: [
    'script', 'style', 'noscript', 'iframe',
    'nav', 'header', 'footer',
    '.navigation', '.nav', '.menu', '.sidebar',
    '.cookie-banner', '.popup', '.modal',
    '[role="navigation"]', '[role="banner"]'
  ],

  // Main content selectors (tried in order)
  contentSelectors: [
    'main',
    'article',
    '[role="main"]',
    '.content', '.main-content', '.page-content',
    '.entry-content', '.post-content',
    '#content', '#main'
  ],

  // About page URL patterns to try
  aboutPagePatterns: [
    '/about',
    '/about-me',
    '/about-us',
    '/bio',
    '/meet-{name}',      // Common pattern
    '/our-story',
    '/who-we-are'
  ],

  // Services page URL patterns to try
  servicesPagePatterns: [
    '/services',
    '/work-with-me',
    '/offerings',
    '/what-i-do',
    '/how-i-help',
    '/therapy',
    '/coaching'
  ]
};
```

### Scraper Functions

```javascript
/**
 * Main scrape function
 * @param {string} url - Website URL to scrape
 * @returns {Promise<ScrapeResult>}
 */
async function scrapeWebsite(url) {
  const results = {
    homepage: null,
    about: null,
    services: null,
    error: null
  };

  try {
    // 1. Scrape homepage
    results.homepage = await scrapePage(url);

    // 2. Find and scrape about page
    const aboutUrl = await findPage(url, SCRAPER_CONFIG.aboutPagePatterns);
    if (aboutUrl) {
      results.about = await scrapePage(aboutUrl);
    }

    // 3. Find and scrape services page
    const servicesUrl = await findPage(url, SCRAPER_CONFIG.servicesPagePatterns);
    if (servicesUrl) {
      results.services = await scrapePage(servicesUrl);
    }

  } catch (error) {
    results.error = {
      type: categorizeError(error),
      message: error.message,
      recoverable: isRecoverable(error)
    };
  }

  return results;
}

/**
 * Scrape a single page
 * @param {string} url - Page URL
 * @returns {Promise<PageContent>}
 */
async function scrapePage(url) {
  // 1. Fetch HTML
  const response = await fetch(url, {
    headers: { 'User-Agent': SCRAPER_CONFIG.userAgent },
    timeout: SCRAPER_CONFIG.timeout,
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new ScraperError(`HTTP ${response.status}`, response.status);
  }

  const html = await response.text();

  // 2. Parse with cheerio
  const $ = cheerio.load(html);

  // 3. Remove unwanted elements
  SCRAPER_CONFIG.removeSelectors.forEach(selector => {
    $(selector).remove();
  });

  // 4. Find main content
  let content = '';
  for (const selector of SCRAPER_CONFIG.contentSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      content = element.text();
      break;
    }
  }

  // 5. Fallback to body if no main content found
  if (!content) {
    content = $('body').text();
  }

  // 6. Clean up text
  content = cleanText(content);

  return {
    url,
    title: $('title').text().trim(),
    content,
    wordCount: content.split(/\s+/).length
  };
}

/**
 * Clean extracted text
 */
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .replace(/\n{3,}/g, '\n\n')     // Max 2 newlines
    .trim()
    .slice(0, 50000);               // Max 50k chars per page
}

/**
 * Find a page by trying common URL patterns
 */
async function findPage(baseUrl, patterns) {
  const base = new URL(baseUrl);

  for (const pattern of patterns) {
    const testUrl = new URL(pattern, base).href;
    try {
      const response = await fetch(testUrl, {
        method: 'HEAD',
        timeout: 3000
      });
      if (response.ok) {
        return testUrl;
      }
    } catch {
      // Continue to next pattern
    }
  }

  return null;
}
```

### Error Handling

```javascript
const ERROR_TYPES = {
  TIMEOUT: 'timeout',           // Request took too long
  BLOCKED: 'blocked',           // 403, bot detection
  NOT_FOUND: 'not_found',       // 404
  SERVER_ERROR: 'server_error', // 5xx
  NETWORK: 'network',           // Connection failed
  INVALID_URL: 'invalid_url',   // Malformed URL
  NO_CONTENT: 'no_content'      // Page exists but no extractable content
};

function categorizeError(error) {
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
    return ERROR_TYPES.TIMEOUT;
  }
  if (error.status === 403) {
    return ERROR_TYPES.BLOCKED;
  }
  if (error.status === 404) {
    return ERROR_TYPES.NOT_FOUND;
  }
  if (error.status >= 500) {
    return ERROR_TYPES.SERVER_ERROR;
  }
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return ERROR_TYPES.NETWORK;
  }
  return 'unknown';
}

function isRecoverable(error) {
  // These errors might work with manual paste fallback
  return [
    ERROR_TYPES.BLOCKED,
    ERROR_TYPES.TIMEOUT,
    ERROR_TYPES.NO_CONTENT
  ].includes(categorizeError(error));
}
```

### What It Handles vs. Fallback

| Scenario | Handles? | Notes |
|----------|----------|-------|
| Static HTML sites | ✅ Yes | Most therapy/coach sites |
| WordPress | ✅ Yes | Server-rendered |
| Squarespace | ✅ Yes | Server-rendered |
| Wix | ⚠️ Partial | Some JS-heavy, may get limited content |
| React/Vue SPAs | ❌ No | Needs JS execution |
| Sites that block bots | ❌ No | Offer manual paste |
| Sites behind login | ❌ No | Offer manual paste |

### Fallback UX

When scraping fails, show manual input:

```
┌─────────────────────────────────────────────────────────────────────┐
│  We couldn't read your site automatically                           │
│                                                                      │
│  This sometimes happens with certain website platforms.             │
│  You can paste your About page text below instead.                  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  Paste your About page content here...                      │   │
│  │                                                              │   │
│  │                                                              │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [Analyze This Text]                                                │
│                                                                      │
│  Tip: Copy from your website's About, Bio, or Services page        │
└─────────────────────────────────────────────────────────────────────┘
```

### Dependencies

```json
{
  "cheerio": "^1.0.0"
}
```

No external API services required. Just `node-fetch` (or native fetch in Node 18+) and `cheerio` for HTML parsing.

---

## Files to Create/Modify

### New Files

```
backend/
├── api/routes/brand-discovery.js          # API endpoints
├── services/
│   ├── scraper-service.js                 # Website scraping logic
│   ├── brand-dna-synthesizer.js           # AI synthesis logic
│   └── inference-engine.js                # Inference tracking logic
├── prompts/
│   ├── scrape-analysis.md                 # Prompt for analyzing scraped content
│   ├── brand-dna-synthesis.md             # Prompt for generating Brand DNA
│   └── values-nuance-generation.md        # Prompt for AI "Why" options

frontend/
├── components/brand-discovery/
│   ├── BrandDiscoveryStudio.jsx           # Main container
│   ├── ModuleCard.jsx                     # Individual module card
│   ├── SourcesModule.jsx                  # URL input + scrape status
│   ├── VibeModule.jsx                     # Slider interface
│   ├── ValuesModule.jsx                   # Card swipe + ranking
│   ├── MethodModule.jsx                   # Modality/specialty selection
│   ├── AudienceModule.jsx                 # Archetype selection
│   ├── ChannelsModule.jsx                 # Platform ranking
│   ├── BrandDNAPreview.jsx                # Synthesis output display
│   ├── InferenceConfirmation.jsx          # Confirm/reject UI
│   └── CompletionProgress.jsx             # Progress bar + gamification
├── hooks/
│   └── useBrandDiscovery.js               # Data fetching + state
└── pages/
    └── Settings.jsx                        # Modified to include Brand Discovery tab
```

### Modified Files

```
backend/
├── api/routes/index.js                    # Add brand-discovery routes
├── lib/supabase-client.js                 # Add brand_discovery table helpers

frontend/
├── utils/api-client.js                    # Add brand-discovery API methods
└── pages/Settings.jsx                     # Add Brand Discovery Studio section
```

---

## Environment Variables

```
# No new environment variables required for scraping (self-built)

# AI for inference (uses existing keys)
# ANTHROPIC_API_KEY already exists
# OPENAI_API_KEY already exists
```

---

## Migration Notes

1. Create `brand_discovery` table
2. Add trigger to create brand_discovery for existing users
3. Run migration to create records for all existing user_profiles
4. No data migration needed - existing user_settings remain unchanged
5. Brand Discovery is purely additive

---

**This architecture document should be used alongside BRAND-DISCOVERY-IMPLEMENTATION.md for the full implementation guide.**
