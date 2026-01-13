# Implementation Guide

## Overview

This guide provides a step-by-step roadmap for building the Podcast-to-Content Pipeline application. Follow these phases in order, completing and testing each phase before moving to the next.

**Estimated Timeline:** 3-4 weeks for full MVP

---

## Prerequisites

### Required Tools

- Node.js 18+
- npm or yarn
- Supabase account
- OpenAI API key
- Anthropic API key
- Git
- Code editor (VS Code recommended)

### Environment Setup

Create `.env` file:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# AI APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# App Config
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000
```

---

## Phase 1: Database Foundation (Days 1-2)

### Step 1.1: Set Up Supabase Project

1. Create new Supabase project
2. Note down URL and keys
3. Enable Real-time for all tables

### Step 1.2: Create Database Schema

Execute SQL from `DATABASE-SCHEMA.md`:

```sql
-- Create tables in order
1. episodes
2. stage_outputs
3. evergreen_content
4. api_usage_log

-- Create indexes
-- Create triggers
-- Enable RLS policies
-- Insert default evergreen row
```

### Step 1.3: Verify Database

```bash
# Test connection
psql -h db.your-project.supabase.co -U postgres

# Verify tables exist
\dt

# Verify RLS enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public';
```

### Deliverables
- ✅ All 4 tables created
- ✅ Indexes added
- ✅ RLS policies enabled
- ✅ One row in evergreen_content
- ✅ Database connection tested

---

## Phase 2: Backend Foundation (Days 3-5)

### Step 2.1: Initialize Backend Project

```bash
mkdir backend
cd backend
npm init -y

# Install dependencies
npm install express cors dotenv
npm install @supabase/supabase-js
npm install openai @anthropic-ai/sdk
npm install winston

# Dev dependencies
npm install -D nodemon jest @types/node
```

### Step 2.2: Create Project Structure

```bash
mkdir -p {lib,analyzers,parsers,prompts,api,types,orchestrator}
mkdir -p api/{routes,middleware}
mkdir -p prompts/shared
```

### Step 2.3: Build Core Utilities

**Priority order:**

1. **lib/logger.js** (~200 lines)
   - Winston setup
   - Structured logging
   - Database logging for errors
   - Test: Log at all levels

2. **lib/supabase-client.js** (~300 lines)
   - Client initialization
   - Helper methods for common queries
   - Real-time channel setup
   - Test: Query episodes table

3. **lib/api-client-openai.js** (~300 lines)
   - OpenAI API wrapper
   - Auth, rate limiting, retries
   - Token counting
   - Test: Make sample completion call

4. **lib/api-client-anthropic.js** (~300 lines)
   - Anthropic API wrapper
   - Auth, rate limiting, retries
   - Test: Make sample Claude call

5. **lib/cost-calculator.js** (~250 lines)
   - Pricing tables for models
   - Calculate cost from usage
   - Test: Calculate for sample usage

6. **lib/prompt-loader.js** (~200 lines)
   - Load markdown files
   - Variable substitution
   - Caching
   - Test: Load and substitute variables

7. **lib/retry-logic.js** (~200 lines)
   - Exponential backoff
   - Retry strategy
   - Test: Simulate retries

### Step 2.4: Create Error Classes

**lib/errors.js** (~150 lines)
- APIError
- ValidationError
- DatabaseError
- TimeoutError

### Step 2.5: Set Up Express Server

**api/server.js** (~200 lines)

```javascript
const express = require('express');
const cors = require('cors');
const logger = require('../lib/logger');

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(loggerMiddleware);

// Routes (add as implemented)
app.use('/api/episodes', episodesRouter);
app.use('/api/stages', stagesRouter);
app.use('/api/evergreen', evergreenRouter);
app.use('/api/admin', adminRouter);

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
});
```

### Deliverables
- ✅ All utility modules created and tested
- ✅ Error classes defined
- ✅ Express server running
- ✅ Can make API calls to OpenAI and Anthropic
- ✅ Can query/write to Supabase

---

## Phase 3: AI Pipeline (Days 6-10)

### Step 3.1: Create Prompt Templates

Create markdown files in `prompts/`:

1. **prompts/shared/never-use-list.md**
   - Copy from PROMPT-LIBRARY.md

2. **prompts/shared/quality-frameworks.md**
   - Copy frameworks from PROMPT-LIBRARY.md

3. **prompts/stage-01-transcript-analysis.md**
   - Full prompt for Stage 1
   - Include role, task, schema, checklist

4. **prompts/stage-02-quote-extraction.md**
   - Full prompt for Stage 2

... (Continue for all 9 stages)

### Step 3.2: Build Analyzers (One per day)

**Day 6: Stages 1-2**

1. **analyzers/stage-01-analyze-transcript.js** (~300 lines)
   ```javascript
   async function analyzeTranscript(context) {
     // 1. Load prompt
     const prompt = await loadPrompt('stage-01', context);
     
     // 2. Call OpenAI
     const response = await callOpenAI(prompt, {
       model: 'gpt-4o-mini',
       functions: [episodeAnalysisSchema]
     });
     
     // 3. Parse response
     const parsed = extractFunctionCall(response);
     
     // 4. Validate
     validateEpisodeAnalysis(parsed);
     
     // 5. Return
     return parsed;
   }
   ```

2. **parsers/parse-episode-analysis.js** (~200 lines)
   - Validate episode_basics
   - Validate guest_info (nullable)
   - Validate episode_crux
   - Throw ValidationError if invalid

**Day 7: Stages 3-4**
- Build Stage 3 analyzer and parser
- Build Stage 4 analyzer and parser

**Day 8: Stages 5-6**
- Build Stage 5 analyzer and parser
- Build Stage 6 analyzer and parser (two-part)

**Day 9: Stages 7-9 (Claude)**
- Build Stage 7 analyzer and parser (refinement)
- Build Stage 8 analyzer and parser (social)
- Build Stage 9 analyzer and parser (email)

### Step 3.3: Build Orchestrator

**orchestrator/episode-processor.js** (~400 lines)

```javascript
async function processEpisode(episodeId) {
  logger.info('Starting episode processing', { episodeId });
  
  // Load context
  const episode = await getEpisode(episodeId);
  const evergreen = await getEvergreenContent();
  
  const context = {
    episodeId,
    transcript: episode.transcript,
    evergreen,
    previousStages: {}
  };
  
  // Process stages 1-9
  for (let stageNum = 1; stageNum <= 9; stageNum++) {
    try {
      // Update status
      await updateStageStatus(episodeId, stageNum, 'processing');
      
      const startTime = Date.now();
      
      // Run analyzer
      const result = await runStage(stageNum, context);
      
      const duration = Date.now() - startTime;
      
      // Save result
      await saveStageOutput(episodeId, stageNum, {
        status: 'completed',
        output: result,
        duration_seconds: Math.floor(duration / 1000),
        cost_usd: result.cost
      });
      
      // Add to context for next stage
      context.previousStages[stageNum] = result;
      
      logger.info('Stage completed', {
        episodeId,
        stage: stageNum,
        duration_ms: duration,
        cost: result.cost
      });
      
    } catch (error) {
      logger.error('Stage failed', {
        episodeId,
        stage: stageNum,
        error: error.message
      });
      
      await updateStageStatus(episodeId, stageNum, 'failed', {
        error_message: error.message
      });
      
      throw error;
    }
  }
  
  // Mark episode complete
  await updateEpisodeStatus(episodeId, 'completed');
  
  logger.info('Episode processing complete', { episodeId });
}
```

**orchestrator/stage-runner.js** (~300 lines)

```javascript
async function runStage(stageNum, context) {
  const analyzers = {
    1: analyzeTranscript,
    2: extractQuotes,
    3: outlineHighLevel,
    4: outlineParagraphs,
    5: generateHeadlines,
    6: draftBlogPost,
    7: refineWithClaude,
    8: generateSocial,
    9: generateEmail
  };
  
  const analyzer = analyzers[stageNum];
  if (!analyzer) {
    throw new Error(`No analyzer for stage ${stageNum}`);
  }
  
  return await analyzer(context);
}
```

### Step 3.4: Test Full Pipeline

Create test episode and run through all 9 stages:

```javascript
// test/pipeline.test.js
describe('Full Pipeline', () => {
  test('processes episode end-to-end', async () => {
    const episode = await createEpisode({
      transcript: sampleTranscript
    });
    
    await processEpisode(episode.id);
    
    const result = await getEpisode(episode.id);
    expect(result.status).toBe('completed');
    expect(result.stages).toHaveLength(9);
  }, 300000); // 5 min timeout
});
```

### Deliverables
- ✅ All 9 prompt templates created
- ✅ All 9 analyzer modules implemented
- ✅ All 9 parser modules implemented
- ✅ Orchestrator working
- ✅ Full pipeline tested end-to-end
- ✅ Cost tracking working
- ✅ Error handling tested

---

## Phase 4: API Endpoints (Days 11-13)

### Step 4.1: Episodes Routes

**api/routes/episodes.js** (~350 lines)

Implement in order:
1. `GET /api/episodes` - List episodes
2. `POST /api/episodes` - Create episode
3. `GET /api/episodes/:id` - Get single episode
4. `PUT /api/episodes/:id` - Update episode
5. `DELETE /api/episodes/:id` - Delete episode
6. `POST /api/episodes/:id/process` - Start processing
7. `POST /api/episodes/:id/pause` - Pause processing
8. `POST /api/episodes/:id/cancel` - Cancel processing

Test each endpoint with curl/Postman.

### Step 4.2: Stages Routes

**api/routes/stages.js** (~250 lines)

1. `GET /api/stages/:id` - Get stage
2. `PUT /api/stages/:id` - Update stage (editing)
3. `POST /api/stages/:id/regenerate` - Regenerate stage

### Step 4.3: Evergreen Routes

**api/routes/evergreen.js** (~200 lines)

1. `GET /api/evergreen` - Get settings
2. `PUT /api/evergreen` - Update settings

### Step 4.4: Admin Routes

**api/routes/admin.js** (~300 lines)

1. `GET /api/admin/costs` - Cost analytics
2. `GET /api/admin/performance` - Performance metrics
3. `GET /api/admin/errors` - Error log
4. `POST /api/admin/errors/:id/retry` - Retry failed stage

### Step 4.5: Middleware

**api/middleware/error-handler.js** (~150 lines)
**api/middleware/logger-middleware.js** (~100 lines)
**api/middleware/validation.js** (~200 lines)

### Deliverables
- ✅ All API endpoints implemented
- ✅ Request/response validation
- ✅ Error handling working
- ✅ All endpoints tested
- ✅ API documentation up to date

---

## Phase 5: Frontend Foundation (Days 14-16)

### Step 5.1: Initialize Frontend Project

```bash
npm create vite@latest frontend -- --template react
cd frontend
npm install

# Dependencies
npm install react-router-dom
npm install @supabase/supabase-js
npm install react-markdown
npm install date-fns

# Dev dependencies
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Step 5.2: Design System Setup

1. **styles/variables.css**
   - Copy colors, typography from DESIGN-SYSTEM.md

2. **styles/components.css**
   - Button styles
   - Input styles
   - Card styles

3. **tailwind.config.js**
   - Configure custom colors
   - Configure fonts

### Step 5.3: Shared Components

Build in priority order:

1. **components/shared/Button.jsx** (~150 lines)
   - Primary, secondary, ghost, danger variants
   - Loading state
   - Disabled state

2. **components/shared/Input.jsx** (~150 lines)
   - Text, textarea, file variants
   - Validation states
   - Error messages

3. **components/shared/Card.jsx** (~100 lines)
   - Basic card layout
   - Hover effects

4. **components/shared/Modal.jsx** (~200 lines)
   - Overlay
   - Close button
   - Animation

5. **components/shared/Toast.jsx** (~150 lines)
   - Success, error, warning variants
   - Auto-dismiss
   - Toast queue

6. **components/shared/LoadingSpinner.jsx** (~80 lines)
7. **components/shared/ProgressBar.jsx** (~100 lines)
8. **components/shared/Badge.jsx** (~80 lines)

### Step 5.4: Routing Setup

**src/App.jsx**

```javascript
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/new" element={<NewEpisode />} />
        <Route path="/episode/:id/processing" element={<ProcessingScreen />} />
        <Route path="/episode/:id" element={<ReviewHub />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Step 5.5: API Client

**utils/api-client.js** (~200 lines)

```javascript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export async function getEpisodes() {
  const res = await fetch(`${API_BASE}/episodes`);
  if (!res.ok) throw new Error('Failed to fetch episodes');
  return res.json();
}

// ... all other API methods
```

### Deliverables
- ✅ Frontend project initialized
- ✅ Design system implemented
- ✅ Shared components built and tested
- ✅ Routing configured
- ✅ API client working

---

## Phase 6: Page Implementations (Days 17-21)

### Day 17: Dashboard

**pages/Dashboard.jsx** (~400 lines)

1. Quick stats component
2. Episode list
3. Empty state
4. Loading state
5. Real-time updates

Test:
- Empty state shows correctly
- Episodes load and display
- Real-time updates work
- Navigation works

### Day 18: Settings

**pages/Settings.jsx** (~400 lines)

1. Form with all evergreen fields
2. Validation
3. Save/cancel
4. Unsaved changes warning

Test:
- Form loads current data
- Validation works
- Save updates database
- Toast notifications show

### Day 19: Upload & Processing

**pages/NewEpisode.jsx** (~350 lines)
1. Transcript input
2. File upload
3. Context form
4. Validation
5. Cost/time estimates

**pages/ProcessingScreen.jsx** (~400 lines)
1. Stage progress indicators
2. Real-time updates
3. Pause/cancel buttons
4. Auto-navigate on complete

Test:
- Upload works
- Estimates calculate correctly
- Processing starts
- Real-time updates show
- Auto-navigation works

### Day 20: Review Hub (Part 1)

**pages/ReviewHub.jsx** (~400 lines)
- Tab navigation orchestration

**components/review/AnalysisTab.jsx** (~300 lines)
**components/review/OutlineTab.jsx** (~300 lines)

### Day 21: Review Hub (Part 2)

**components/review/BlogPostTab.jsx** (~400 lines)
- Markdown editor
- Word count
- Export options

**components/review/HeadlinesTab.jsx** (~300 lines)
**components/review/SocialTab.jsx** (~400 lines)
**components/review/EmailTab.jsx** (~350 lines)

### Deliverables
- ✅ All 6 pages implemented
- ✅ All page states handled
- ✅ Navigation works
- ✅ Real-time updates work
- ✅ Forms validate
- ✅ Exports work

---

## Phase 7: Admin Dashboard (Day 22)

**pages/AdminDashboard.jsx** (~400 lines)

1. Cost stats
2. Performance metrics
3. Error log
4. Charts/visualizations

Test:
- Stats load correctly
- Charts render
- Error log shows recent errors
- Retry button works

### Deliverables
- ✅ Admin dashboard complete
- ✅ All metrics displaying
- ✅ Charts working
- ✅ Error handling working

---

## Phase 8: Integration Testing (Days 23-24)

### Test Scenarios

**Scenario 1: Happy Path**
1. Upload transcript
2. Start processing
3. Watch progress
4. Review all outputs
5. Edit blog post
6. Export content

**Scenario 2: Error Recovery**
1. Start processing
2. Simulate API error
3. Verify retry works
4. Complete processing

**Scenario 3: Editing**
1. Complete processing
2. Edit stage outputs
3. Regenerate individual stage
4. Verify updates

**Scenario 4: Multiple Episodes**
1. Create 3 episodes
2. Process simultaneously
3. Verify no conflicts
4. Check cost tracking

### Deliverables
- ✅ All scenarios pass
- ✅ No critical bugs
- ✅ Performance acceptable

---

## Phase 9: Polish & Deploy (Days 25-28)

### Day 25: Polish

1. Loading states everywhere
2. Error messages clear
3. Empty states helpful
4. Animations smooth
5. Mobile responsive

### Day 26: Documentation

1. README.md with setup instructions
2. API documentation
3. Deployment guide
4. User guide

### Day 27: Deployment

**Backend:**
```bash
# Deploy to Vercel or Railway
vercel deploy

# Set environment variables
# Connect to Supabase
```

**Frontend:**
```bash
# Build
npm run build

# Deploy to Vercel
vercel deploy

# Configure API URL
```

### Day 28: Monitoring

1. Set up error tracking
2. Configure Supabase alerts
3. Set cost budget alerts
4. Create monitoring dashboard

### Deliverables
- ✅ Application deployed
- ✅ Documentation complete
- ✅ Monitoring configured
- ✅ MVP complete!

---

## Testing Checklist

### Unit Tests
- [ ] All analyzer modules
- [ ] All parser modules
- [ ] All utility functions
- [ ] Cost calculator
- [ ] Retry logic

### Integration Tests
- [ ] Full pipeline (9 stages)
- [ ] API endpoints
- [ ] Database operations
- [ ] Real-time subscriptions

### E2E Tests
- [ ] Create episode → Process → Review
- [ ] Edit settings → Create episode
- [ ] Error → Retry → Success
- [ ] Multiple concurrent episodes

### Performance Tests
- [ ] Pipeline completes <5 min
- [ ] Cost per episode <$2
- [ ] UI responsive <100ms
- [ ] Real-time updates <1s latency

---

## Code Review Checklist

Before considering phase complete:

**Modularity:**
- [ ] No file >400 lines
- [ ] Single responsibility per file
- [ ] Clear interfaces

**Logging:**
- [ ] All stages log start/end
- [ ] All API calls logged
- [ ] All errors logged
- [ ] No PII in logs

**Error Handling:**
- [ ] Try-catch around API calls
- [ ] Retry for retryable errors
- [ ] User-friendly error messages

**Comments:**
- [ ] JSDoc on public functions
- [ ] Complex logic explained
- [ ] No commented-out code

**Tests:**
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] 80%+ coverage

---

## Common Issues & Solutions

### Issue: API Rate Limits

**Solution:** Implement exponential backoff in retry-logic.js

### Issue: Long Processing Times

**Solution:** 
- Optimize prompt sizes
- Use streaming where possible
- Consider parallel processing for independent stages

### Issue: High Costs

**Solution:**
- Use GPT-4o-mini (not GPT-4)
- Optimize prompt templates
- Cache evergreen content

### Issue: Real-time Updates Not Working

**Solution:**
- Verify Supabase real-time enabled
- Check RLS policies
- Verify subscription code

---

**Follow this guide methodically. Complete and test each phase before moving to the next. The modular architecture ensures that work can be parallelized when needed.**
