# Brand Discovery System - Implementation Tracker

> **Created:** 2026-01-15
> **Status:** In Progress
> **Branch:** `claude/onboarding-planning-fEfWK`

---

## Design Decisions Made

### 1. Settings Page Layout
**Decision:** Brand Discovery Studio will be a **collapsible top section** in Settings.

**Rationale:**
- Keeps everything in one place
- Shows relationship between Brand Discovery (AI-assisted) and manual settings (fallback/override)
- Users see both options without navigating away
- Collapsed by default if complete, expanded if incomplete

### 2. Values Module UI
**Decision:** **Button-based selection** with subtle animations, not swipe gestures.

**Rationale:**
- Works equally well on desktop, tablet, and mobile
- More accessible (keyboard navigation, screen readers)
- Simpler to implement reliably
- Still feels engaging with good animations
- Reduces touch gesture complexity and edge cases

**UI Flow:**
1. Cards shown one at a time with "← Not Me" and "Me →" buttons
2. Progress indicator shows position in deck
3. After completing deck, transition to Power Five ranking (drag-and-drop list)
4. After ranking, AI generates "why" nuances for each value

### 3. Sources Module - Manual Paste First
**Decision:** Start with **manual text paste only**, design architecture for scraper to be added later.

**Rationale:**
- Gets us to working state faster
- Avoids scraper edge cases initially (blocked sites, JS rendering, etc.)
- Same AI analysis path regardless of input method
- Can add URL scraping as enhancement without changing architecture

**Architecture:**
```
User Input → (Manual Paste OR Future Scraper) → Raw Text → AI Analysis → Inferences
```

### 4. Brand DNA Pipeline Integration
**Decision:** Brand DNA **immediately affects** content pipeline prompts when synthesized.

**Rationale:**
- Users expect their brand settings to apply right away
- Avoids "did I turn it on?" confusion
- Brand DNA directives get injected into stage prompts automatically
- Users can see the effect on next episode processed

### 5. Database Approach
**Decision:** Keep the **monolithic JSONB modules column** as documented.

**Rationale:**
- Flexibility for adding/modifying module structure
- All module data loads in one query (common use case)
- Module completion tracking stays simple
- RLS at row level is sufficient (user can only access their own brand_discovery)

### 6. Module Completion UX
**Decision:** Modules can be completed in **any order** (except Brand DNA which requires ≥2 modules).

**Rationale:**
- Respects user autonomy
- Different users may want to start with different modules
- Some users may never complete all modules (and that's okay)
- Brand DNA synthesis triggers automatically when threshold met

---

## Implementation Order

### Phase 1: Foundation
1. ✅ Create implementation plan documentation (this file)
2. ✅ Database migration for `brand_discovery` table
3. ✅ Backend API routes (CRUD + module updates)
4. ✅ Frontend API client updates

### Phase 2: Core Components
5. ⬜ BrandDiscoveryStudio container component
6. ⬜ ModuleCard component (shared)
7. ⬜ CompletionProgress component

### Phase 3: Simple Modules First
8. ⬜ **Vibe Module** - 6 sliders (simplest)
9. ⬜ **Channels Module** - drag-drop ranking (straightforward)
10. ⬜ **Method Module** - multi-select lists (predefined options)

### Phase 4: Complex Modules
11. ⬜ **Sources Module** - manual paste + AI analysis
12. ⬜ **Audience Module** - archetype cards with nuances
13. ⬜ **Values Module** - card selection + ranking + AI why (most complex)

### Phase 5: Synthesis & Integration
14. ⬜ Brand DNA Synthesizer service
15. ⬜ BrandDNAPreview component
16. ⬜ Pipeline integration (inject into prompts)
17. ⬜ Settings page integration

---

## File Structure

### Backend Files to Create
```
backend/
├── api/routes/
│   └── brand-discovery.js              # API endpoints (~350 lines)
├── services/
│   ├── brand-discovery-service.js      # Business logic (~300 lines)
│   ├── inference-engine.js             # Inference tracking (~200 lines)
│   └── brand-dna-synthesizer.js        # AI synthesis (~300 lines)
├── prompts/
│   ├── brand-discovery/
│   │   ├── source-analysis.md          # Analyze pasted content
│   │   ├── values-nuance-generation.md # Generate value "why" options
│   │   └── brand-dna-synthesis.md      # Generate Brand DNA
│   └── shared/
│       └── brand-dna-injection.md      # How to inject into stage prompts
└── data/
    ├── values-deck.js                  # 30 values with descriptions
    ├── brand-archetypes.js             # 8 archetypes with correlations
    ├── audience-archetypes.js          # 12 audience personas
    ├── modalities.js                   # Therapy/coaching approaches
    ├── specialties.js                  # Issues/populations
    └── platforms.js                    # Social platforms
```

### Frontend Files to Create
```
frontend/src/
├── components/brand-discovery/
│   ├── BrandDiscoveryStudio.jsx        # Main container (~350 lines)
│   ├── BrandDiscoveryStudio.module.css # Styles
│   ├── ModuleCard.jsx                  # Individual module card (~180 lines)
│   ├── ModuleCard.module.css
│   ├── CompletionProgress.jsx          # Progress bar + stats (~100 lines)
│   │
│   ├── modules/
│   │   ├── SourcesModule.jsx           # Manual paste + analysis (~300 lines)
│   │   ├── VibeModule.jsx              # 6 sliders (~250 lines)
│   │   ├── ValuesModule.jsx            # Card selection + ranking (~400 lines)
│   │   ├── MethodModule.jsx            # Multi-select lists (~300 lines)
│   │   ├── AudienceModule.jsx          # Archetype cards (~300 lines)
│   │   └── ChannelsModule.jsx          # Drag-drop ranking (~250 lines)
│   │
│   ├── shared/
│   │   ├── VibeSlider.jsx              # Single slider component (~150 lines)
│   │   ├── ValueCard.jsx               # Single value card (~120 lines)
│   │   ├── ArchetypeCard.jsx           # Single archetype card (~130 lines)
│   │   ├── InferenceConfirmation.jsx   # Confirm/reject UI (~150 lines)
│   │   └── DraggableList.jsx           # Reusable drag-drop (~200 lines)
│   │
│   └── brand-dna/
│       ├── BrandDNAPreview.jsx         # Summary preview (~200 lines)
│       └── BrandDNAFullView.jsx        # Detailed modal view (~300 lines)
│
├── hooks/
│   └── useBrandDiscovery.js            # Data fetching + state (~200 lines)
│
└── utils/
    └── api-client.js                   # Add brandDiscovery namespace
```

### Database Migration
```
supabase/migrations/
└── 007_brand_discovery.sql             # brand_discovery table + RLS
```

---

## Module Specifications

### Vibe Module (6 Sliders)
Each slider: 0-100 scale, `null` = not set (distinct from 50)

| Slider | Left Label (0) | Right Label (100) |
|--------|---------------|-------------------|
| clinical_relatable | Clinical/Academic | Relatable/Lived Experience |
| quiet_energetic | Quiet/Soothing | High-Energy/Challenger |
| minimalist_eclectic | Minimalist | Eclectic/Rich |
| scientific_holistic | Scientific/Evidence-Based | Holistic/Intuitive |
| formal_playful | Formal/Professional | Playful/Casual |
| expert_guide | Expert/Authority | Guide/Fellow Traveler |

### Channels Module (Platform Ranking)
Drag-and-drop to order by priority:
- LinkedIn, Instagram, Twitter/X, Facebook, Email, TikTok, Threads, YouTube

User can also mark platforms as "Not Using" (excluded from ranking).

### Method Module (Multi-Select)
Categories:
- Cognitive & Behavioral (CBT, DBT, ACT, etc.)
- Trauma-Focused (EMDR, SE, IFS, etc.)
- Relational & Couples (EFT, Gottman, etc.)
- Humanistic & Existential
- Specialized Therapies
- Coaching Approaches
- Body-Based Approaches
- Mindfulness-Based

Users can add custom entries.

### Audience Module (12 Archetypes)
Pre-defined archetypes with optional nuance selection:
- The Cycle Breaker
- The Overwhelmed High-Achiever
- The Late-Diagnosed
- The People-Pleaser in Recovery
- The Burnt-Out Caregiver
- The Quarter-Life Questioner
- The Empty Nester Reinventing
- The Relationship Pattern Repeater
- The High-Functioning Anxious
- The Spiritual Seeker
- The Career Pivoter
- The Identity Excavator

### Values Module (3-Step Process)
1. **Card Selection**: 30 values, user picks "Me" or "Not Me"
2. **Power Five Ranking**: Top values ranked 1-5 by importance
3. **AI Why**: For each Power Five value, AI generates 3 nuance interpretations, user picks one

### Sources Module (Manual Paste → AI Analysis)
User pastes text from their website (about page, services page, bio).
AI extracts:
- Name, credentials, bio
- Modalities, specialties
- Tone analysis (scales matching Vibe sliders)
- Sample phrases capturing voice
- Audience signals

Extracted data becomes "inferences" that user can confirm/reject.

---

## API Endpoints

```
GET    /api/brand-discovery
       Returns full brand_discovery record for current user

PATCH  /api/brand-discovery/modules/:moduleId
       Updates a specific module's data
       Body: { status, data }

POST   /api/brand-discovery/sources/analyze
       Analyzes pasted text content
       Body: { content }
       Returns: { extracted_data, inferences }

POST   /api/brand-discovery/inferences/confirm
       Confirm or reject an inference
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

## Testing Checklist

### Backend
- [ ] brand_discovery table created with correct schema
- [ ] RLS policies enforce user-only access
- [ ] API routes return 401 for unauthenticated requests
- [ ] Module updates calculate completion percentage correctly
- [ ] Brand DNA synthesis triggers when ≥2 modules complete
- [ ] Source analysis handles empty/malformed input gracefully
- [ ] Values nuance generation returns valid options

### Frontend
- [ ] BrandDiscoveryStudio renders all 6 module cards
- [ ] Module cards show correct status (not_started/partial/complete)
- [ ] Vibe sliders save on change (debounced)
- [ ] Values card selection persists correctly
- [ ] Power Five ranking drag-and-drop works
- [ ] Channels ranking persists correctly
- [ ] Brand DNA preview shows when ≥2 modules complete
- [ ] Settings page integrates Brand Discovery section

### Integration
- [ ] Brand DNA directives appear in pipeline prompts
- [ ] Episode processing uses Brand DNA when available
- [ ] Generated content reflects brand voice

---

## What's Left vs Done

### Done
- [x] Read and analyze all documentation
- [x] Create implementation plan (this document)
- [x] Make design decisions
- [x] Database migration (`007_brand_discovery.sql`)
- [x] Backend data files (values, archetypes, modalities, specialties, platforms)
- [x] Backend services (`brand-discovery-service.js`, `brand-dna-synthesizer.js`)
- [x] Backend API routes (`brand-discovery.js`)
- [x] Frontend API client updates (`api-client.js`)

### In Progress
- [ ] Frontend components

### Not Started
- [ ] BrandDiscoveryStudio container
- [ ] Individual module components (Vibe, Sources, Values, Method, Audience, Channels)
- [ ] Brand DNA preview component
- [ ] Settings page integration
- [ ] Pipeline prompt injection

---

## Notes & Considerations

### Error Handling Strategy
All functions will:
1. Log entry with parameters (DEBUG level)
2. Validate inputs early, throw descriptive errors
3. Wrap external calls (AI, DB) in try/catch
4. Log errors with full context (ERROR level)
5. Return user-friendly error messages

### Commenting Strategy
- JSDoc for all exported functions
- Inline comments for non-obvious logic
- Section headers for long files
- README in each new directory

### Future Enhancements (Out of Scope for Now)
- URL scraping (designed for, not implemented)
- LinkedIn/Instagram profile import
- Podcast RSS feed analysis
- Brand DNA version comparison UI
- A/B testing brand voice variations
