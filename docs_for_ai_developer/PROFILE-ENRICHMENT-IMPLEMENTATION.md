# Profile Enrichment & Madlibs Onboarding - Implementation Plan

> **Created:** 2026-01-23
> **Status:** In Progress
> **Branch:** `claude/profile-enrichment-scraping-XyQbM`

---

## Overview

This implementation adds a **structured profile builder** ("Madlibs") and **profile enrichment via scraping** to the onboarding flow. The goal is to capture concrete business facts before the more abstract brand personality work (Vibe/Values).

### Core Features

1. **Properties Checklist** - User indicates what they have (website, podcast, newsletter, bio)
2. **Import/Enrichment** - Scrape and analyze existing content to pre-populate profile
3. **Madlibs Profile Builder** - Interactive fill-in-the-blanks with word banks
4. **Integration** - Profile data feeds into existing Brand Discovery and content pipeline

---

## User Flow

```
1. WELCOME
   "Let's set up your profile so we can create content that sounds like you"
   ↓
2. PROPERTIES CHECKLIST (NEW)
   "What do you have? Check all that apply"
   □ Practice/Business Website
   □ Podcast
   □ Newsletter/Substack
   □ Existing bio or about page text
   ↓
3. IMPORT CONTENT (NEW - conditional, if any properties checked)
   "We can analyze your existing content to jumpstart your profile"
   - Website URL input → scrape
   - Podcast name/RSS → lookup/analyze
   - Bio text → paste box
   → AI analyzes → draft profile
   ↓
4. MADLIBS PROFILE (NEW)
   Interactive sections with fill-in-the-blanks
   Pre-populated from scrape if available
   Word banks + custom input
   ↓
5. VIBE MODULE (existing)
   ↓
6. VALUES MODULE (existing)
   ↓
7. COMPLETION
   (with option to do Method, Audience, Channels in Settings)
```

---

## Madlibs Profile Structure

### Section 1: Who You Are
```
I'm [NAME] and my credentials are [CREDENTIALS].
My business name is [BUSINESS NAME].
```

### Section 2: Where You Work
```
I'm based in [LOCATION].
My clients are typically located in [LOCATION], [LOCATION], and [LOCATION].
```
Options: □ Serve clients by state □ Nationwide □ Internationally

### Section 3: Your Properties (conditional based on checklist)
```
My podcast is called [PODCAST NAME].
My newsletter is called [NEWSLETTER NAME].
```

### Section 4: Your Business Model
```
My main revenue stream is [REVENUE TYPE].
I also make money from [REVENUE TYPE] and [REVENUE TYPE].
```

### Section 5: Your Clients
```
My clients are typically [CLIENT TYPE], [CLIENT TYPE], and [CLIENT TYPE].
They're sometimes part of these communities: [SUBCULTURE], [SUBCULTURE].
They come to me because they're trying to [PROBLEM TO SOLVE].
They choose me over others because [DIFFERENTIATOR].
```

---

## Word Banks

### Revenue Types
- 1:1 therapy sessions
- 1:1 coaching sessions
- Group therapy/programs
- Online courses
- Workshops/retreats
- Speaking engagements
- Supervision/consultation
- Book sales
- Affiliate partnerships
- Sponsorships
- Membership/community

### Client Types
- High-achievers
- Entrepreneurs
- Executives/leaders
- Healthcare workers
- Creatives/artists
- Parents
- Couples
- New moms
- Students/young adults
- Professionals in transition
- People in recovery

### Subcultures
- LGBTQ+ community
- Neurodivergent individuals
- Faith-based communities
- Recovery/sobriety community
- Chronic illness warriors
- Immigrant families
- Military/veterans
- Tech industry
- Startup culture
- Academic/research
- Wellness/holistic

### Problems (aligned with Audience archetypes)
- Breaking generational patterns
- Managing burnout and exhaustion
- Navigating relationship dynamics
- Finding authentic purpose
- Processing trauma
- Setting healthy boundaries
- Overcoming perfectionism
- Managing anxiety
- Building self-worth
- Navigating life transitions
- Healing from loss/grief

---

## Database Schema

### Option A: Extend `user_settings.therapist_profile` JSONB

Add new fields to existing structure:

```javascript
// user_settings.therapist_profile (extended)
{
  // Existing fields
  name: "Dr. Jane Smith",
  credentials: "PhD, LMFT",
  bio: "Licensed therapist...",
  website: "https://drjanesmith.com",

  // NEW: Business details
  business_name: "Clarity Counseling",
  location: "Austin, TX",
  client_locations: ["Texas", "California", "Nationwide"],
  serves_internationally: false,

  // NEW: Properties
  has_podcast: true,
  podcast_name: "The Clarity Sessions",
  has_newsletter: true,
  newsletter_name: "Clarity Notes",

  // NEW: Business model
  primary_revenue: "1:1 therapy sessions",
  secondary_revenue: ["Group programs", "Online courses"],

  // NEW: Client profile
  client_types: ["High-achievers", "Entrepreneurs", "Healthcare workers"],
  client_subcultures: ["Neurodivergent individuals", "Tech industry"],
  client_problems: ["Managing burnout", "Setting healthy boundaries"],
  differentiator: "I combine evidence-based approaches with real-world practicality"
}
```

### Option B: New `business_profile` module in `brand_discovery.modules`

Add a 7th module to brand_discovery:

```javascript
// brand_discovery.modules.profile (NEW)
{
  status: "complete",
  completed_at: "2026-01-23T10:30:00Z",
  data: {
    // Properties checklist
    properties: {
      has_website: true,
      has_podcast: true,
      has_newsletter: false,
      has_bio: true
    },

    // Identity
    name: "Dr. Jane Smith",
    credentials: "PhD, LMFT",
    business_name: "Clarity Counseling",

    // Location
    location: "Austin, TX",
    client_locations: ["Texas", "California"],
    service_scope: "nationwide", // "local" | "state" | "nationwide" | "international"

    // Properties details
    podcast_name: "The Clarity Sessions",
    newsletter_name: null,

    // Business model
    primary_revenue: "1:1 therapy sessions",
    secondary_revenue: ["Group programs"],

    // Client profile
    client_types: ["High-achievers", "Entrepreneurs"],
    client_subcultures: ["Tech industry"],
    client_problems: ["Managing burnout"],
    differentiator: "Evidence-based + practical"
  }
}
```

**Recommendation:** Option B - keeps profile data with Brand Discovery where it conceptually belongs, and allows the same completion tracking/weighting system.

---

## Migration Plan

### New Migration: `011_profile_enrichment.sql`

```sql
-- ============================================================================
-- Migration 011: Profile Enrichment (Madlibs Profile Module)
-- ============================================================================
-- Extends brand_discovery modules to include a "profile" module for
-- structured business profile data captured through the Madlibs flow.
-- ============================================================================

-- Update the default modules JSONB to include 'profile' module
-- Note: Existing records need backfill, new records get it automatically

-- Add profile module to existing brand_discovery records
UPDATE brand_discovery
SET modules = modules || '{"profile": {"status": "not_started", "completed_at": null, "data": null}}'::jsonb
WHERE NOT (modules ? 'profile');

-- Update the completion calculation function to include profile module
CREATE OR REPLACE FUNCTION calculate_brand_discovery_completion(modules_data JSONB)
RETURNS INTEGER AS $$
DECLARE
  weights JSONB := '{
    "profile": 20,
    "sources": 10,
    "vibe": 20,
    "values": 20,
    "method": 15,
    "audience": 10,
    "channels": 5
  }'::jsonb;
  -- ... rest of function unchanged
$$

-- Create scrape_jobs table for tracking website analysis
CREATE TABLE scrape_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Job type and target
  job_type TEXT NOT NULL CHECK (job_type IN ('website', 'podcast_rss', 'bio_text')),
  target_url TEXT,
  input_text TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Results
  raw_content JSONB,        -- Scraped/fetched content
  extracted_data JSONB,     -- AI analysis results
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_scrape_jobs_user ON scrape_jobs(user_id);
CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status);

-- RLS
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scrape jobs" ON scrape_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scrape jobs" ON scrape_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access" ON scrape_jobs
  FOR ALL USING (auth.role() = 'service_role');
```

---

## Backend Implementation

### New Files

```
backend/
├── api/routes/
│   └── profile-enrichment.js     # API endpoints for scraping/analysis
├── services/
│   ├── scraper-service.js        # Website scraping (already spec'd)
│   ├── podcast-lookup-service.js # Podcast search by name
│   └── profile-analyzer.js       # AI analysis of scraped content
├── data/
│   └── word-banks.js             # Revenue types, client types, etc.
└── prompts/
    └── profile-analysis.md       # Prompt for analyzing scraped content
```

### API Endpoints

```
POST   /api/profile-enrichment/scrape
       Start a scrape job
       Body: { type: "website" | "podcast" | "bio", url?: string, text?: string }
       Returns: { jobId, status: "processing" }

GET    /api/profile-enrichment/scrape/:jobId
       Check scrape job status
       Returns: { status, extractedData?, error? }

GET    /api/profile-enrichment/word-banks
       Get all word bank data for UI
       Returns: { revenueTypes, clientTypes, subcultures, problems }

POST   /api/profile-enrichment/podcast-lookup
       Search for podcast by name
       Body: { query: string }
       Returns: { results: [{ name, rssUrl, description }] }
```

### Profile Analysis Prompt

```markdown
# Profile Analysis for Therapist/Coach

Analyze the following content and extract profile information.

## Content
{{CONTENT}}

## Extract

Return JSON with confidence scores (0-1):

{
  "identity": {
    "name": { "value": "...", "confidence": 0.9 },
    "credentials": { "value": "...", "confidence": 0.8 },
    "business_name": { "value": "...", "confidence": 0.7 }
  },
  "location": {
    "location": { "value": "...", "confidence": 0.6 },
    "service_scope": { "value": "...", "confidence": 0.5 }
  },
  "business_model": {
    "primary_revenue": { "value": "...", "confidence": 0.7 },
    "secondary_revenue": { "value": [...], "confidence": 0.5 }
  },
  "clients": {
    "client_types": { "value": [...], "confidence": 0.8 },
    "client_problems": { "value": [...], "confidence": 0.7 },
    "differentiator": { "value": "...", "confidence": 0.6 }
  },
  "tone_signals": {
    "clinical_relatable": { "value": 65, "confidence": 0.7 },
    "formal_casual": { "value": 40, "confidence": 0.6 }
  }
}
```

---

## Frontend Implementation

### New Components

```
frontend/src/components/
├── profile-enrichment/
│   ├── PropertiesChecklist.jsx      # Step 2: What do you have?
│   ├── PropertiesChecklist.module.css
│   ├── ImportContent.jsx            # Step 3: Scrape/analyze
│   ├── ImportContent.module.css
│   ├── MadlibsProfile.jsx           # Step 4: Fill-in-the-blanks
│   ├── MadlibsProfile.module.css
│   ├── MadlibsSection.jsx           # Reusable section component
│   ├── MadlibsBlank.jsx             # Individual blank with word bank
│   └── WordBankPopover.jsx          # Dropdown for word suggestions
```

### Onboarding Flow Update

Modify `frontend/src/pages/Onboarding.jsx`:

```javascript
const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Content Pipeline',
    // ...
  },
  {
    id: 'properties',           // NEW
    title: 'What Do You Have?',
    description: 'Check all that apply - this helps us personalize your experience.',
    icon: CheckSquare,
  },
  {
    id: 'import',               // NEW (conditional)
    title: 'Import Your Content',
    description: "We'll analyze your existing content to jumpstart your profile.",
    icon: Download,
    conditional: (data) => hasAnyProperties(data),
  },
  {
    id: 'profile',              // NEW
    title: 'Build Your Profile',
    description: 'Fill in the blanks to describe your practice.',
    icon: User,
    module: 'profile',
    weight: 20,
  },
  {
    id: 'vibe',
    title: 'Set Your Vibe',
    // ... existing
  },
  {
    id: 'values',
    title: 'Discover Your Values',
    // ... existing
  },
  {
    id: 'complete',
    title: "You're All Set!",
    // ... existing
  },
];
```

### Settings Page Integration

Modify `frontend/src/pages/Settings.jsx` to:

1. Add "Profile" section to Brand Identity tab (or create new "Profile" tab)
2. Show MadlibsProfile component for editing after onboarding
3. Allow re-running import/enrichment from Settings

```javascript
// In Settings.jsx - add ProfileEditor to Brand tab
{activeTab === 'brand' && (
  <div className={styles.tabPanel}>
    {/* Profile section - always visible */}
    <Card title="Your Profile" subtitle="Business details for content personalization">
      <ProfileEditor
        data={brandDiscovery?.modules?.profile?.data}
        onSave={handleProfileSave}
      />
    </Card>

    {/* Existing Brand Discovery Studio */}
    <BrandDiscoveryStudio ... />
  </div>
)}
```

---

## Implementation Phases

### Phase 1: Database & Data
- [ ] Create migration `011_profile_enrichment.sql`
- [ ] Add word-banks.js reference data
- [ ] Update brand-discovery-service.js for profile module

### Phase 2: Backend APIs
- [ ] Create profile-enrichment.js routes
- [ ] Implement scraper-service.js (simple fetch + cheerio)
- [ ] Create profile-analyzer.js with AI prompt
- [ ] Add podcast-lookup-service.js (optional, can be manual for MVP)

### Phase 3: Frontend - Properties & Import
- [ ] Create PropertiesChecklist component
- [ ] Create ImportContent component
- [ ] Wire up to API for scraping/analysis

### Phase 4: Frontend - Madlibs Profile
- [ ] Create MadlibsProfile component
- [ ] Create MadlibsSection, MadlibsBlank, WordBankPopover
- [ ] Style with engaging animations

### Phase 5: Integration
- [ ] Update Onboarding.jsx with new flow
- [ ] Update Settings.jsx with ProfileEditor
- [ ] Update completion percentage weights
- [ ] Test end-to-end flow

### Phase 6: Polish
- [ ] Add loading states and animations
- [ ] Error handling and fallbacks
- [ ] Mobile responsiveness
- [ ] Accessibility (keyboard nav, screen readers)

---

## Access After Skipping Onboarding

Users who skip onboarding should still be able to complete their profile:

1. **Banner in Dashboard**: "Complete your profile to improve content quality" → links to Settings
2. **Settings Page**: Profile section is always editable, not just during onboarding
3. **Re-import Option**: Settings allows re-running the import/enrichment flow

```javascript
// In Dashboard.jsx - show banner if profile incomplete
{!profileComplete && (
  <Banner
    message="Complete your profile to get better content recommendations"
    action={{ label: "Complete Profile", href: "/settings?tab=brand" }}
  />
)}
```

---

## Testing Checklist

### Properties Checklist
- [ ] All checkboxes work correctly
- [ ] State persists when navigating back
- [ ] "None of these" option works (skips import step)

### Import Content
- [ ] Website URL validation
- [ ] Scraping starts and shows loading state
- [ ] Scrape results display correctly
- [ ] Error handling for blocked/failed scrapes
- [ ] Manual paste fallback works
- [ ] Extracted data pre-fills Madlibs

### Madlibs Profile
- [ ] All sections render correctly
- [ ] Word bank popovers work (click to open, select to fill)
- [ ] Custom text input works
- [ ] Multiple selections work (client types, etc.)
- [ ] Pre-populated fields show correctly
- [ ] Can clear/change pre-populated values
- [ ] Save triggers module completion

### Settings Integration
- [ ] Profile section visible in Settings
- [ ] Can edit profile after onboarding
- [ ] Changes save correctly
- [ ] Re-import option available

### Flow
- [ ] Full onboarding flow works end-to-end
- [ ] Skip onboarding allows access to Dashboard
- [ ] Can return to complete profile from Settings
- [ ] Completion percentage updates correctly

---

## Future Enhancements

- [ ] Podcast lookup API (search by name, auto-fill RSS)
- [ ] LinkedIn profile import
- [ ] Social media handle verification
- [ ] AI suggestions for differentiator based on other inputs
- [ ] Compare profile with successful practitioners (benchmarking)
