# Podcast-to-Content Pipeline

## Project Overview

A single-user SaaS application for a therapist with a podcast to transform episode transcripts into polished blog posts, social media content, and email campaigns through a sophisticated 10-stage AI pipeline (Stage 0-9).

## Core Value Proposition

Transform raw podcast transcripts into publication-ready content across multiple channels while maintaining the therapist's authentic voice and professional standards.

## Target User

- **Who**: One therapist who hosts a podcast
- **Problem**: Manually creating blog posts, social content, and email campaigns from podcast episodes is time-consuming
- **Solution**: Automated multi-stage AI pipeline that analyzes, outlines, drafts, refines, and packages content
- **Outcome**: 750-word blog post + social content + email campaign from a single transcript in ~5 minutes

## Tech Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js (lightweight REST API)
- **Database**: Supabase (PostgreSQL + real-time subscriptions)
- **AI Providers**:
  - Anthropic Claude Haiku (Stage 0: preprocessing, Stage 2: quote extraction)
  - OpenAI GPT-5 mini (Stages 1, 3-6: analysis, outlining, drafting)
  - Anthropic Claude Sonnet (Stages 7-9: refinement, social, email)

### Frontend
- **Framework**: React 18+ with Vite
- **Styling**: CSS Modules or Tailwind with custom config
- **State Management**: React Context + Supabase real-time subscriptions
- **Routing**: React Router

### Infrastructure
- **Hosting**: Vercel (frontend + serverless functions) or Railway
- **Database**: Supabase (managed PostgreSQL)
- **Environment**: Environment variables for API keys and config

## Project Principles

### Design Philosophy
- **Soothing & Professional**: Warm beiges, soft taupes, elegant serif typography
- **Clarity Over Cleverness**: Clear states, obvious next actions, no mystery
- **Respectful of Time**: Show progress, never block, allow editing at any stage
- **Trust & Transparency**: Show costs, show timing, show what AI is doing

### Code Philosophy
- **Modularity First**: No file over 400 lines, single responsibility modules
- **Logging Everything**: Structured logs for debugging and cost tracking
- **Fail Gracefully**: Every API call can fail, every stage can retry
- **Comment Intentions**: Why code exists, not what it does

## Pipeline Overview

### Design Philosophy: Focused Analyzers

> **Analyzers work best when they don't have too many jobs.**

Each analyzer does ONE focused thing well. When a task can be split into independent work, split it and run in parallel. This is why Stage 8 is split into 4 platform-specific analyzers.

### The 4-Phase Pipeline (10 Stages)

**PRE-GATE: Preprocessing** (conditional)
- Stage 0: Transcript Preprocessing (Claude Haiku)
  - Compress long transcripts for downstream processing
  - *Automatically skipped for short transcripts (<8000 tokens)*

**PHASE 1: EXTRACT** (2 tasks in parallel)
- Stage 1: Transcript Analysis (GPT-5 mini)
  - Extract episode metadata, guest info, `episode_crux` (canonical summary)
- Stage 2: Quote Extraction (Claude Haiku)
  - Find 8-12 verbatim `quotes[]` (canonical quotes source)

**PHASE 2: PLAN** (3 tasks, grouped execution)
- Stage 3: Blog Outline (GPT-5 mini) - runs first
- Stage 4: Paragraph Details (GPT-5 mini) - then parallel with Stage 5
- Stage 5: Headlines & Copy (GPT-5 mini) - then parallel with Stage 4

**PHASE 3: WRITE** (2 tasks, sequential)
- Stage 6: Draft Generation (GPT-5 mini)
  - Write the complete 750-word blog post
- Stage 7: Refinement Pass (Claude Sonnet)
  - Polish prose, ensure voice consistency

**PHASE 4: DISTRIBUTE** (5 tasks in parallel)
- Stage 8a: Instagram (Claude Sonnet)
- Stage 8b: Twitter/X (Claude Sonnet)
- Stage 8c: LinkedIn (Claude Sonnet)
- Stage 8d: Facebook (Claude Sonnet)
- Stage 9: Email Campaign (Claude Sonnet)

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      4-PHASE PIPELINE                           │
│                                                                 │
│  PRE-GATE: [0] Preprocess (if needed)                          │
│                      │                                          │
│  PHASE 1:      [1] ──┴── [2]     (parallel)                    │
│                      │                                          │
│  PHASE 2:     [3] ─► [4] ─┬─ [5]  (grouped)                    │
│                      │                                          │
│  PHASE 3:     [6] ─────► [7]     (sequential)                  │
│                      │                                          │
│  PHASE 4:   [8a][8b][8c][8d][9]  (5 tasks parallel)            │
│                      │                                          │
│                [GENERATED CONTENT]                              │
└─────────────────────────────────────────────────────────────────┘
```

Each stage:
- Reads previous stage outputs from context
- Calls appropriate AI API with carefully crafted prompt
- Parses and validates response
- Saves structured output to database
- Updates real-time status for frontend
- Logs tokens, cost, duration

**Performance:** Parallel execution saves ~30% time compared to sequential processing.

## Success Metrics

### MVP Success Criteria
- ✅ User can upload transcript and process to completion
- ✅ All 10 stages (0-9) complete successfully with real API calls
- ✅ User can view, edit, and export final content
- ✅ Cost and timing tracking visible in admin dashboard
- ✅ Processing completes in <5 minutes for typical episode
- ✅ Total cost per episode <$2.00

### Quality Metrics
- Generated content passes "AI detector" checks (sounds human)
- Blog posts maintain therapist's voice and avoid clichés
- Zero clinical misinformation in outputs
- User satisfaction with first draft (minimal editing needed)

## Project Phases

### Phase 1: Foundation (Week 1)
- Database schema and migrations
- Backend project structure
- Utility modules (logging, API clients, cost tracking)
- Design system implementation

### Phase 2: AI Pipeline (Week 2)
- All 10 stage analyzers with prompts (Stage 8 has 4 platform-specific exports)
- Parser and validator modules
- API endpoint for episode processing
- Real-time status updates with parallel execution

### Phase 3: User Interface (Week 3)
- Dashboard and episode list
- Settings/evergreen content management
- Upload and processing screen
- Review & edit hub with all tabs

### Phase 4: Polish & Deploy (Week 4)
- Admin dashboard with cost/performance tracking
- Error handling and retry logic
- Responsive design refinements
- Deployment and monitoring setup

## Risk Mitigation

### Technical Risks
- **API Rate Limits**: Implement exponential backoff and retry logic
- **API Costs**: Set budget alerts, log every call, estimate costs before processing
- **Long Processing Times**: Real-time updates, allow pause/cancel
- **AI Output Quality**: Multiple review stages, allow regeneration per stage

### User Experience Risks
- **Unclear Progress**: Detailed stage-by-stage progress visualization
- **Lost Work**: Save every stage output, never overwrite without confirmation
- **Editing Frustration**: Allow inline editing at any stage
- **Cost Anxiety**: Show estimated and actual costs prominently

## Implemented Features (Post-MVP)

- **Audio Upload & Transcription**: Upload audio files for automatic transcription
  - Supports OpenAI Whisper and AssemblyAI (with speaker diarization)
  - See [AUDIO-TRANSCRIPTION-IMPLEMENTATION.md](./AUDIO-TRANSCRIPTION-IMPLEMENTATION.md)

- **RSS Podcast Integration**: Import episodes from podcast RSS feeds
  - Connect via podcast search, Apple Podcasts URL, or direct RSS URL
  - Transcribe episodes directly from feed audio URLs
  - Track which episodes have been processed
  - See [PODCAST-RSS-FEED-IMPLEMENTATION.md](./PODCAST-RSS-FEED-IMPLEMENTATION.md)

- **Content Reprocessing**: Regenerate content using existing transcripts
  - Skip re-transcription when regenerating content
  - Useful for updating with new settings or prompts
  - Available via "Regenerate Content" button in ReviewHub

- **Unified Task Progress**: ActiveTaskBanner component for all async operations
  - Shows progress for uploads, transcriptions, and content generation
  - Consistent UX across all async workflows

## Future Enhancements

- **Templates**: Different episode types (solo, interview, Q&A)
- **A/B Testing**: Generate multiple versions, track performance
- **Direct Publishing**: WordPress, Substack, social platform integrations
- **Multi-User**: Support multiple podcasts/therapists
- **Analytics**: Track which content performs best

## Non-Goals (Explicitly Out of Scope)

- ❌ Multi-user/multi-podcast support (single user only)
- ❌ Real-time collaboration (one editor at a time)
- ❌ Custom AI model training (use off-the-shelf APIs)
- ❌ Audio editing or production tools (transcript only)
- ❌ CMS features beyond content generation
- ❌ Payment processing (no subscription billing for MVP)

## Key Contacts & Resources

- **Target User**: Therapist podcaster (to be interviewed for voice/tone)
- **OpenAI Docs**: https://platform.openai.com/docs
- **Anthropic Docs**: https://docs.anthropic.com
- **Supabase Docs**: https://supabase.com/docs
- **Design Inspiration**: Notion (clarity), Linear (polish), Craft (elegance)

## Repository Structure

```
/
├── backend/
│   ├── analyzers/          # Each stage = separate module
│   ├── parsers/            # Response validators
│   ├── lib/                # Shared utilities
│   ├── prompts/            # AI prompt templates
│   ├── api/                # Express routes
│   └── types/              # TypeScript definitions
├── frontend/
│   ├── components/         # React components
│   ├── pages/              # Page-level components
│   ├── styles/             # Design system CSS
│   ├── hooks/              # Custom React hooks
│   └── utils/              # Frontend utilities
├── docs/                   # This documentation
└── supabase/
    └── migrations/         # Database migrations
```

## Development Workflow

1. **Local Development**: 
   - Supabase local instance
   - Mock API responses for testing
   - Hot reload for frontend

2. **Testing**:
   - Unit tests for each analyzer
   - Integration tests for pipeline
   - E2E tests for critical flows

3. **Deployment**:
   - Frontend: Vercel (git push to deploy)
   - Backend: Vercel serverless functions
   - Database: Supabase (managed)

4. **Monitoring**:
   - Supabase dashboard for database queries
   - Custom admin panel for costs and performance
   - Error logging to database table

---

**This document serves as the north star for the project. All other documentation supports these goals.**
