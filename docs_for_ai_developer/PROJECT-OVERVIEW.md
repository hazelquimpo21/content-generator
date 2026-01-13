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
  - Anthropic Claude 3.5 Haiku (Stage 0: preprocessing long transcripts)
  - OpenAI GPT-5 mini (Stages 1-6: analysis, outlining, drafting)
  - Anthropic Claude Sonnet 4 (Stages 7-9: refinement, social, email)

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

### The 10 Stages (0-9)

0. **Transcript Preprocessing** (Claude Haiku)
   - Compress long transcripts for downstream processing
   - Extract key quotes, themes, speaker info
   - *Automatically skipped for short transcripts (<8000 tokens)*

1. **Transcript Analysis** (GPT-5 mini)
   - Extract episode metadata, guest info, main topics

2. **Quote Extraction** (GPT-5 mini)
   - Find 5-8 key verbatim quotes with context

3. **Blog Outline - High Level** (GPT-5 mini)
   - Structure 750-word post with sections and hooks

4. **Paragraph-Level Outlines** (GPT-5 mini)
   - Detail each paragraph's content and flow

5. **Headlines & Copy Options** (GPT-5 mini)
   - Generate 10-15 headlines, subheads, taglines, hooks

6. **Draft Generation** (GPT-5 mini)
   - Write first half, then second half of blog post

7. **Refinement Pass** (Claude Sonnet)
   - Polish prose, ensure voice consistency, check clinical accuracy

8. **Social Content** (Claude Sonnet)
   - Create Instagram, Twitter, LinkedIn, Facebook posts

9. **Email Campaign** (Claude Sonnet)
   - Generate subject lines, email body, follow-up

### Data Flow

```
Transcript → Stage 0 → Stage 1 → Stage 2 → ... → Stage 8 → Stage 9
              ↓         ↓         ↓                ↓         ↓
            [Save]    [Save]    [Save]           [Save]    [Save]
                                                             ↓
                                                   [Complete Episode]

Note: Stage 0 (preprocessing) is skipped for short transcripts.
```

Each stage:
- Reads previous stage outputs from database
- Calls appropriate AI API with carefully crafted prompt
- Parses and validates response
- Saves structured output to database
- Updates real-time status for frontend
- Logs tokens, cost, duration

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
- All 9 analyzer modules with prompts
- Parser and validator modules
- API endpoint for episode processing
- Real-time status updates

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

## Future Enhancements (Post-MVP)

- **Audio Upload**: Integrate Whisper API for transcription
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
