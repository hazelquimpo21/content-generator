# Podcast-to-Content Pipeline - Documentation Index

## 🎯 Quick Start for Claude Code

You are about to build a sophisticated AI-powered application that transforms podcast transcripts into polished blog posts, social content, and email campaigns. This documentation suite contains everything you need.

**Start here:**
1. Read `PROJECT-OVERVIEW.md` for the big picture
2. Review `ARCHITECTURE.md` to understand the system design
3. Follow `IMPLEMENTATION-GUIDE.md` step-by-step to build

**Key Principles:**
- ✅ **Modularity First:** No file over 400 lines
- ✅ **Log Everything:** Structured logging for debugging and cost tracking
- ✅ **Comment Intentions:** Why code exists, not what it does
- ✅ **Test as You Build:** Unit tests for every module

---

## 📚 Documentation Suite

### Foundation Documents

#### 1. PROJECT-OVERVIEW.md
**Purpose:** High-level project description and goals  
**Read When:** Starting the project, onboarding  
**Key Content:**
- Project vision and value proposition
- Tech stack summary
- Success criteria
- Phases and timeline
- What's in scope and out of scope

**Read First:** ⭐⭐⭐⭐⭐

---

#### 2. ARCHITECTURE.md
**Purpose:** System design and technical architecture  
**Read When:** Before writing any code  
**Key Content:**
- Modularity requirements (400-line rule)
- Code organization and file structure
- Data flow through 9-stage pipeline
- Error handling patterns
- Logging architecture
- Database interaction patterns
- Real-time updates with Supabase

**Read First:** ⭐⭐⭐⭐⭐

---

#### 3. DATABASE-SCHEMA.md
**Purpose:** Complete Supabase schema and relationships  
**Read When:** Setting up database, querying data  
**Key Content:**
- All 4 table definitions
- Field descriptions and constraints
- Indexes for performance
- Real-time subscription setup
- Common query patterns
- Migration scripts

**Read First:** ⭐⭐⭐⭐

---

### Design & UX Documents

#### 4. DESIGN-SYSTEM.md
**Purpose:** Visual design language and component patterns  
**Read When:** Building any UI component  
**Key Content:**
- Color palette (warm beiges, serif elegance)
- Typography system (Lora + Inter)
- Spacing and layout patterns
- Component styles (buttons, inputs, cards)
- Animation principles
- Accessibility guidelines

**Use Throughout:** 🎨 Reference for every UI component

---

#### 5. PAGE-SPECIFICATIONS.md
**Purpose:** Detailed specs for all 6 pages  
**Read When:** Building frontend pages  
**Key Content:**
- Dashboard layout and states
- Settings form structure
- Upload and processing screens
- Review hub with tabs
- Admin dashboard
- All states (loading, error, success)

**Use During:** Frontend phase (Days 17-22)

---

### Development Guidelines

#### 6. CODE-STANDARDS.md
**Purpose:** Coding conventions and best practices  
**Read When:** Before writing any code  
**Key Content:**
- Modularity requirements (detailed)
- File size limits and when to split
- Naming conventions
- Logging strategy (what, when, how)
- Commenting guidelines
- Error handling patterns
- TypeScript usage
- Testing requirements

**Read First:** ⭐⭐⭐⭐⭐  
**Reference Daily:** Use as checklist

---

### AI & Prompts

#### 7. PROMPT-LIBRARY.md
**Purpose:** All AI prompts with quality frameworks  
**Read When:** Building analyzer modules  
**Key Content:**
- Universal "Never Use" list (therapy clichés, AI-speak)
- Quality frameworks for each content type
- All 9 stage prompts with:
  - Role & context
  - Task description
  - Quality criteria
  - Prohibited content
  - Function calling schemas
  - Self-verification checklists

**Use During:** AI pipeline phase (Days 6-10)  
**Critical:** These prompts define output quality

---

### API & Backend

#### 8. API-ENDPOINTS.md
**Purpose:** Complete REST API specification  
**Read When:** Building backend routes  
**Key Content:**
- All endpoints with request/response formats
- Episodes routes (CRUD + processing)
- Stages routes (view, edit, regenerate)
- Evergreen content routes
- Admin routes (costs, performance, errors)
- Error response formats
- Rate limiting

**Use During:** API phase (Days 11-13)

---

### Implementation

#### 9. IMPLEMENTATION-GUIDE.md
**Purpose:** Step-by-step build roadmap  
**Read When:** Starting each new phase  
**Key Content:**
- 9 phases with daily breakdowns
- Prerequisites and setup
- Phase 1: Database (Days 1-2)
- Phase 2: Backend Foundation (Days 3-5)
- Phase 3: AI Pipeline (Days 6-10)
- Phase 4: API Endpoints (Days 11-13)
- Phase 5: Frontend Foundation (Days 14-16)
- Phase 6: Pages (Days 17-21)
- Phase 7: Admin (Day 22)
- Phase 8: Testing (Days 23-24)
- Phase 9: Deploy (Days 25-28)

**Follow Sequentially:** ⭐⭐⭐⭐⭐  
**Master Roadmap**

---

## 🔍 How to Use This Documentation

### For Each Phase

**Before Starting:**
1. Read relevant sections in IMPLEMENTATION-GUIDE.md
2. Review ARCHITECTURE.md for patterns
3. Check CODE-STANDARDS.md for conventions

**While Building:**
1. Reference DESIGN-SYSTEM.md for UI
2. Reference PROMPT-LIBRARY.md for AI prompts
3. Reference API-ENDPOINTS.md for routes
4. Reference DATABASE-SCHEMA.md for queries

**Before Committing:**
1. Check CODE-STANDARDS.md checklist
2. Run tests
3. Verify logging works
4. Check file size limits

---

## 🚀 Quick Reference

### Critical Rules

**Modularity:**
```
❌ BAD: One file does everything (1000+ lines)
✅ GOOD: Each file has single purpose (<400 lines)

When to split:
- File approaches 400 lines
- Multiple distinct responsibilities
- Hard to understand at a glance
```

**Logging:**
```
ALWAYS LOG:
- Stage start/end with timing
- AI API calls with tokens/cost
- Errors with full context
- Retries with reason

NEVER LOG:
- Full transcripts (too large)
- API keys
- Unredacted PII
```

**Error Handling:**
```
✅ DO:
- Try-catch around ALL API calls
- Use specific error types
- Retry retryable errors
- Log with context

❌ DON'T:
- Swallow errors silently
- Use generic Error class
- Retry validation errors
- Log without context
```

---

## 📦 File Structure Reference

```
project/
├── backend/
│   ├── analyzers/          # 9 files, one per stage
│   │   ├── stage-01-analyze-transcript.js
│   │   ├── stage-02-extract-quotes.js
│   │   └── ... (stages 3-9)
│   │
│   ├── parsers/            # 9 files, validate stage outputs
│   │   ├── parse-episode-analysis.js
│   │   ├── parse-quotes.js
│   │   └── ... (stages 3-9)
│   │
│   ├── lib/                # Shared utilities
│   │   ├── api-client-openai.js
│   │   ├── api-client-anthropic.js
│   │   ├── cost-calculator.js
│   │   ├── logger.js
│   │   ├── prompt-loader.js
│   │   ├── supabase-client.js
│   │   └── retry-logic.js
│   │
│   ├── prompts/            # AI prompt templates (markdown)
│   │   ├── stage-01-transcript-analysis.md
│   │   ├── stage-02-quote-extraction.md
│   │   └── ... (all 9 stages)
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── episodes.js
│   │   │   ├── stages.js
│   │   │   ├── evergreen.js
│   │   │   └── admin.js
│   │   ├── middleware/
│   │   │   ├── error-handler.js
│   │   │   └── logger-middleware.js
│   │   └── server.js
│   │
│   ├── orchestrator/
│   │   ├── episode-processor.js
│   │   └── stage-runner.js
│   │
│   └── types/              # TypeScript definitions
│       ├── episode.ts
│       └── stage-outputs.ts
│
├── frontend/
│   ├── components/
│   │   ├── shared/         # Reusable UI components
│   │   │   ├── Button.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Card.jsx
│   │   │   └── ...
│   │   ├── episode/
│   │   │   └── EpisodeCard.jsx
│   │   └── review/         # Review hub tabs
│   │       ├── AnalysisTab.jsx
│   │       ├── BlogPostTab.jsx
│   │       └── ...
│   │
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Settings.jsx
│   │   ├── NewEpisode.jsx
│   │   ├── ProcessingScreen.jsx
│   │   ├── ReviewHub.jsx
│   │   └── AdminDashboard.jsx
│   │
│   ├── styles/
│   │   ├── variables.css
│   │   └── components.css
│   │
│   └── utils/
│       └── api-client.js
│
└── docs/                   # This documentation
    ├── PROJECT-OVERVIEW.md
    ├── ARCHITECTURE.md
    ├── DATABASE-SCHEMA.md
    ├── DESIGN-SYSTEM.md
    ├── PAGE-SPECIFICATIONS.md
    ├── CODE-STANDARDS.md
    ├── PROMPT-LIBRARY.md
    ├── API-ENDPOINTS.md
    └── IMPLEMENTATION-GUIDE.md
```

---

## 🎯 Daily Workflow

### Start of Day
1. Review today's phase in IMPLEMENTATION-GUIDE.md
2. Read relevant architecture sections
3. Check code standards for module type you're building

### During Development
1. Reference design system for UI
2. Use prompt library for AI prompts
3. Follow API spec for endpoints
4. Query database schema for DB operations

### End of Day
1. Run all tests
2. Check code against standards
3. Verify logging works
4. Commit with clear message

---

## ✅ Phase Completion Checklist

Use this for each phase:

**Code Quality:**
- [ ] No file exceeds 400 lines
- [ ] All functions have clear names
- [ ] Complex logic has comments
- [ ] No commented-out code

**Logging:**
- [ ] All stages log start/end
- [ ] All API calls logged
- [ ] All errors logged with context
- [ ] No secrets in logs

**Testing:**
- [ ] Unit tests written
- [ ] Unit tests pass
- [ ] Integration tests pass (where applicable)
- [ ] Manual testing completed

**Documentation:**
- [ ] Code comments added where needed
- [ ] JSDoc on public functions
- [ ] README updated if needed

---

## 🆘 Common Questions

**Q: Which document should I read first?**  
A: PROJECT-OVERVIEW.md → ARCHITECTURE.md → IMPLEMENTATION-GUIDE.md

**Q: Where do I find the prompt for Stage 3?**  
A: PROMPT-LIBRARY.md has all 9 stage prompts

**Q: How do I know if my file is too large?**  
A: If it's approaching 400 lines, split it. See CODE-STANDARDS.md for guidance.

**Q: What should I log?**  
A: Stage lifecycle, API calls, errors. See CODE-STANDARDS.md logging section.

**Q: Where are the API response formats?**  
A: API-ENDPOINTS.md has complete request/response examples

**Q: How do I implement a button?**  
A: DESIGN-SYSTEM.md has complete button styles

**Q: What colors should I use?**  
A: DESIGN-SYSTEM.md has full color palette (warm beiges, terracotta accent)

**Q: Which database table stores what?**  
A: DATABASE-SCHEMA.md has all 4 tables with field descriptions

---

## 🚀 Ready to Start?

1. **Set up environment** (see IMPLEMENTATION-GUIDE.md Prerequisites)
2. **Create Supabase project** and run schema (DATABASE-SCHEMA.md)
3. **Start Phase 1** (IMPLEMENTATION-GUIDE.md)
4. **Build with confidence** - all answers are in these docs

**Remember:**
- Modularity first (400-line rule)
- Log everything important
- Test as you build
- Follow the design system

---

## 📖 Document Versions

All documents in this suite are v1.0 and represent the complete specification for MVP.

**Last Updated:** January 13, 2025

---

**You have everything you need. Let's build something great! 🚀**
