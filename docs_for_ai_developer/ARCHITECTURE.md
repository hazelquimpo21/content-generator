# System Architecture

## Architectural Principles

### Modularity Requirements

**CRITICAL: Every file must have a single, clear responsibility and should not exceed 400 lines of code.**

When a file approaches 400 lines:
1. Identify distinct responsibilities
2. Extract into separate modules
3. Use clear interfaces between modules
4. Document why the split was made

### Code Organization

```
backend/
├── analyzers/                    # AI analysis modules (one per stage, 0-9)
│   ├── stage-00-preprocess-transcript.js    (~300 lines - Claude Haiku)
│   ├── stage-01-analyze-transcript.js       (~300 lines)
│   ├── stage-02-extract-quotes.js           (~300 lines)
│   ├── stage-03-outline-high-level.js       (~300 lines)
│   ├── stage-04-outline-paragraphs.js       (~300 lines)
│   ├── stage-05-generate-headlines.js       (~300 lines)
│   ├── stage-06-draft-blog-post.js          (~350 lines - two API calls)
│   ├── stage-07-refine-with-claude.js       (~300 lines)
│   ├── stage-08-generate-social.js          (~300 lines)
│   └── stage-09-generate-email.js           (~300 lines)
│
├── parsers/                      # Response validators (one per stage)
│   ├── parse-episode-analysis.js            (~200 lines)
│   ├── parse-quotes.js                      (~200 lines)
│   ├── parse-blog-outline.js                (~200 lines)
│   ├── parse-paragraph-outlines.js          (~200 lines)
│   ├── parse-headlines.js                   (~150 lines)
│   ├── parse-blog-draft.js                  (~150 lines)
│   ├── parse-refined-post.js                (~150 lines)
│   ├── parse-social-content.js              (~250 lines)
│   └── parse-email-campaign.js              (~200 lines)
│
├── lib/                          # Shared utilities
│   ├── api-client-openai.js                 (~300 lines)
│   ├── api-client-anthropic.js              (~300 lines)
│   ├── cost-calculator.js                   (~250 lines)
│   ├── logger.js                            (~200 lines)
│   ├── prompt-loader.js                     (~200 lines)
│   ├── supabase-client.js                   (~300 lines)
│   ├── retry-logic.js                       (~200 lines)
│   └── validators.js                        (~200 lines)
│
├── api/                          # Express routes
│   ├── routes/
│   │   ├── episodes.js                      (~350 lines)
│   │   ├── stages.js                        (~250 lines)
│   │   ├── evergreen.js                     (~200 lines)
│   │   └── admin.js                         (~300 lines)
│   ├── middleware/
│   │   ├── error-handler.js                 (~150 lines)
│   │   ├── logger-middleware.js             (~100 lines)
│   │   └── validation.js                    (~200 lines)
│   └── server.js                            (~200 lines)
│
├── prompts/                      # AI prompt templates (markdown)
│   ├── stage-01-transcript-analysis.md
│   ├── stage-02-quote-extraction.md
│   ├── stage-03-blog-outline.md
│   ├── stage-04-paragraph-outlines.md
│   ├── stage-05-headlines.md
│   ├── stage-06-draft-generation.md
│   ├── stage-07-refinement.md
│   ├── stage-08-social-content.md
│   ├── stage-09-email-campaign.md
│   └── shared/
│       ├── never-use-list.md
│       └── quality-frameworks.md
│
├── types/                        # TypeScript definitions
│   ├── episode.ts                           (~200 lines)
│   ├── stage-outputs.ts                     (~300 lines)
│   ├── api-responses.ts                     (~200 lines)
│   └── database.ts                          (~300 lines)
│
└── orchestrator/                 # Pipeline coordination
    ├── episode-processor.js                 (~400 lines)
    └── stage-runner.js                      (~300 lines)

frontend/
├── components/
│   ├── shared/                   # Reusable UI components
│   │   ├── Button.jsx                       (~150 lines)
│   │   ├── Input.jsx                        (~150 lines)
│   │   ├── Card.jsx                         (~100 lines)
│   │   ├── Modal.jsx                        (~200 lines)
│   │   ├── Toast.jsx                        (~150 lines)
│   │   ├── LoadingSpinner.jsx               (~80 lines)
│   │   ├── ProgressBar.jsx                  (~100 lines)
│   │   └── Badge.jsx                        (~80 lines)
│   │
│   ├── episode/                  # Episode-specific components
│   │   ├── EpisodeCard.jsx                  (~200 lines)
│   │   ├── EpisodeList.jsx                  (~250 lines)
│   │   └── StageIndicator.jsx               (~150 lines)
│   │
│   └── review/                   # Review hub components
│       ├── AnalysisTab.jsx                  (~300 lines)
│       ├── OutlineTab.jsx                   (~300 lines)
│       ├── BlogPostTab.jsx                  (~400 lines)
│       ├── HeadlinesTab.jsx                 (~300 lines)
│       ├── SocialTab.jsx                    (~400 lines)
│       └── EmailTab.jsx                     (~350 lines)
│
├── pages/                        # Page-level components
│   ├── Dashboard.jsx                        (~400 lines)
│   ├── Settings.jsx                         (~400 lines)
│   ├── NewEpisode.jsx                       (~350 lines)
│   ├── ProcessingScreen.jsx                 (~400 lines)
│   ├── ReviewHub.jsx                        (~400 lines - tab orchestration)
│   └── AdminDashboard.jsx                   (~400 lines)
│
├── hooks/                        # Custom React hooks
│   ├── useEpisode.js                        (~150 lines)
│   ├── useStageUpdates.js                   (~200 lines - real-time)
│   ├── useEvergreenContent.js               (~150 lines)
│   └── useAdminData.js                      (~200 lines)
│
├── styles/                       # Design system
│   ├── variables.css                        (~100 lines)
│   ├── typography.css                       (~80 lines)
│   ├── components.css                       (~200 lines)
│   └── utilities.css                        (~150 lines)
│
└── utils/                        # Frontend utilities
    ├── api-client.js                        (~200 lines)
    ├── formatting.js                        (~150 lines)
    └── validation.js                        (~150 lines)
```

## Stage-to-Model Mapping

Each stage uses the most appropriate AI model for its task:

| Stage | Name | Model | Provider | Purpose |
|-------|------|-------|----------|---------|
| 0 | Preprocessing | Claude Haiku | Anthropic | Compress long transcripts (200K context) |
| 1 | Analysis | GPT-5 mini | OpenAI | Extract metadata, themes, audience |
| 2 | **Quote Extraction** | **Claude Haiku** | Anthropic | Extract verbatim quotes (fast, accurate) |
| 3 | Blog Outline | GPT-5 mini | OpenAI | High-level post structure |
| 4 | Paragraph Outlines | GPT-5 mini | OpenAI | Detailed section plans |
| 5 | Headlines | GPT-5 mini | OpenAI | Title and copy options |
| 6 | Draft Generation | GPT-5 mini | OpenAI | Write the blog post |
| 7 | Refinement | Claude Sonnet | Anthropic | Polish and improve |
| 8 | Social Content | Claude Sonnet | Anthropic | Platform-specific posts |
| 9 | Email Campaign | Claude Sonnet | Anthropic | Newsletter content |

## Quote Architecture

**IMPORTANT:** Stage 2 is the SOLE source of quotes for the entire pipeline.

### Quote Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ ORIGINAL TRANSCRIPT (always used for Stage 2, never the summary)   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 2: Quote Extraction (Claude Haiku)                            │
│ ────────────────────────────────────────────────────────────────────│
│ Extracts 8-12 verbatim quotes with standardized structure:          │
│                                                                     │
│ {                                                                   │
│   quotes: [                                                         │
│     {                                                               │
│       text: "Exact verbatim quote...",  // Required                │
│       speaker: "Dr. Jane Smith",         // Required                │
│       context: "Why significant...",     // Optional                │
│       usage: "headline|pullquote|social|key_point" // Optional     │
│     }                                                               │
│   ]                                                                 │
│ }                                                                   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ Stage 6: Blog     │ │ Stage 8: Social   │ │ Frontend UI       │
│ Draft Generation  │ │ Content           │ │ (ReviewHub)       │
│ ─────────────────│ │ ─────────────────│ │ ─────────────────│
│ Integrates quotes │ │ Uses quotes for   │ │ Displays quotes   │
│ into blog post    │ │ social media      │ │ with copy button  │
└───────────────────┘ └───────────────────┘ └───────────────────┘
```

### Accessing Quotes in Code

**In Analyzers:**
```javascript
const quotes = previousStages[2]?.quotes;
```

**In Prompt Templates:**
```
{{STAGE_2_QUOTES}}
```

### Why Stage 2 Uses Haiku

1. **Extraction Task** - Not creative generation, just finding verbatim text
2. **200K Context** - Handles very long transcripts without truncation
3. **Cost Effective** - Much cheaper than GPT-5 mini for this task
4. **Fast** - Quicker response times for the extraction task
5. **Accuracy** - Excellent at precise, verbatim extraction

### Stage 0 Does NOT Extract Quotes

Stage 0 (preprocessing) focuses ONLY on:
- Compressing long transcripts into summaries
- Identifying speakers and topics
- Extracting episode metadata

**Stage 0 does not extract quotes** to maintain single responsibility and avoid diluted output quality.

## Data Flow Architecture

### Episode Processing Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  [Upload] → [Start Processing] → [Subscribe to Updates]     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
│  POST /api/episodes/:id/process                             │
│  → Validates input                                           │
│  → Creates stage records                                     │
│  → Triggers orchestrator                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator                              │
│  episode-processor.js                                        │
│  → Loads context (transcript + evergreen)                    │
│  → For stage 0-9:                                            │
│    ├─ Stage 0: Preprocess (Claude Haiku, skipped for short)  │
│    ├─ Update status to "processing"                          │
│    ├─ Call stage analyzer                                    │
│    ├─ Parse & validate response                              │
│    ├─ Save output to database                                │
│    ├─ Log tokens/cost/duration                               │
│    └─ Update status to "completed"                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                 ┌───────┴───────┐
                 │               │
                 ▼               ▼
     ┌───────────────────┐   ┌───────────────────┐
     │    Analyzers      │   │    Parsers        │
     │  (call AI APIs)   │   │  (validate data)  │
     └─────────┬─────────┘   └─────────┬─────────┘
               │                       │
               ▼                       ▼
     ┌───────────────────┐   ┌───────────────────┐
     │   OpenAI API      │   │  Validation       │
     │   Anthropic API   │   │  Type Checking    │
     └─────────┬─────────┘   └─────────┬─────────┘
               │                       │
               └───────────┬───────────┘
                           ▼
               ┌───────────────────────┐
               │   Supabase Database   │
               │   - episodes          │
               │   - stage_outputs     │
               │   - api_usage_log     │
               └───────────┬───────────┘
                           │
                           ▼ (Real-time subscription)
               ┌───────────────────────┐
               │   Frontend Update     │
               │   (Stage progress)    │
               └───────────────────────┘
```

### Real-Time Updates Flow

```
1. Backend updates stage_outputs table
   └─> Supabase triggers PostgreSQL NOTIFY

2. Supabase broadcasts change via WebSocket
   └─> Realtime channel: "episode-updates"

3. Frontend receives update
   └─> useStageUpdates hook processes change
   └─> Component state updates
   └─> UI reflects new status
```

## Module Communication Patterns

### Analyzer Module Pattern

Every analyzer module follows this interface:

```javascript
/**
 * Analyzer for Stage X: [Purpose]
 * @param {Object} context - Execution context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript
 * @param {Object} context.evergreen - Evergreen settings
 * @param {Object} context.previousStages - Outputs from stages 1 to X-1
 * @returns {Promise<Object>} Structured stage output
 * @throws {APIError} If AI API call fails
 * @throws {ValidationError} If response is invalid
 */
async function analyzeStage(context) {
  // 1. Load prompt template
  const prompt = await loadPrompt('stage-X', context);
  
  // 2. Call AI API
  const response = await callAI(prompt, options);
  
  // 3. Parse response
  const parsed = parseResponse(response);
  
  // 4. Validate structure
  validateStageOutput(parsed);
  
  // 5. Log usage
  logAPIUsage(response.usage, context.episodeId);
  
  // 6. Return structured data
  return parsed;
}
```

**Key Requirements:**
- Each analyzer is 250-350 lines max
- Single responsibility: call AI, parse, validate, return
- No database access (handled by orchestrator)
- No side effects beyond logging
- Comprehensive error handling

### Parser Module Pattern

Every parser module follows this interface:

```javascript
/**
 * Parser for Stage X output
 * @param {Object} rawResponse - Raw AI API response
 * @returns {Object} Validated structured data
 * @throws {ValidationError} If structure is invalid
 */
function parseStageOutput(rawResponse) {
  // 1. Extract relevant data
  const data = extractData(rawResponse);
  
  // 2. Type checking
  validateTypes(data);
  
  // 3. Business logic validation
  validateBusinessRules(data);
  
  // 4. Return cleaned data
  return data;
}
```

**Key Requirements:**
- Each parser is 150-250 lines max
- No API calls (pure function)
- Throws descriptive errors
- Returns consistent structure

### Utility Module Pattern

Shared utilities provide common functionality:

```javascript
// api-client-openai.js
export async function callOpenAI(prompt, options) {
  // Handles: auth, rate limiting, retries, token counting
}

// cost-calculator.js
export function calculateCost(usage, model) {
  // Returns cost in USD based on token usage
}

// logger.js
export function log(level, message, metadata) {
  // Structured logging to console + database
}

// prompt-loader.js
export async function loadPrompt(stageName, variables) {
  // Loads template, substitutes variables, returns string
}
```

## Error Handling Architecture

### Error Types

```javascript
// lib/errors.js

class APIError extends Error {
  constructor(provider, statusCode, message) {
    super(message);
    this.name = 'APIError';
    this.provider = provider; // 'openai' | 'anthropic'
    this.statusCode = statusCode;
    this.retryable = [429, 500, 502, 503].includes(statusCode);
  }
}

class ValidationError extends Error {
  constructor(field, reason) {
    super(`Validation failed for ${field}: ${reason}`);
    this.name = 'ValidationError';
    this.field = field;
    this.retryable = false;
  }
}

class DatabaseError extends Error {
  constructor(operation, message) {
    super(message);
    this.name = 'DatabaseError';
    this.operation = operation;
    this.retryable = true;
  }
}
```

### Retry Strategy

```javascript
// lib/retry-logic.js

async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2
  } = options;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!error.retryable || attempt === maxRetries) {
        throw error;
      }
      
      const delay = Math.min(
        initialDelay * Math.pow(backoffFactor, attempt),
        maxDelay
      );
      
      logger.warn('Retrying after error', {
        attempt: attempt + 1,
        delay,
        error: error.message
      });
      
      await sleep(delay);
    }
  }
}
```

## Logging Architecture

### Structured Logging Format

```javascript
{
  "timestamp": "2025-01-13T20:45:32.123Z",
  "level": "INFO",
  "service": "backend",
  "episode_id": "uuid",
  "stage": 3,
  "message": "Stage completed successfully",
  "metadata": {
    "duration_ms": 1234,
    "tokens_input": 1500,
    "tokens_output": 800,
    "cost_usd": 0.0045,
    "model": "gpt-5-mini"
  }
}
```

### Log Levels Usage

- **DEBUG**: Detailed flow (function entry/exit, variable values)
- **INFO**: Key milestones (stage start/complete, API calls)
- **WARN**: Recoverable issues (retries, missing optional data)
- **ERROR**: Failures (API errors, validation failures)

### What to Log

**ALWAYS LOG:**
- Stage start/end with episode_id and stage number
- AI API calls with model, tokens, cost, duration
- Errors with full stack trace and context
- Retry attempts with reason

**NEVER LOG:**
- Full transcripts (too large, PII)
- API keys or secrets
- Unredacted PII

## Database Interaction Patterns

### Repository Pattern

```javascript
// lib/repositories/episode-repository.js

class EpisodeRepository {
  constructor(supabaseClient) {
    this.db = supabaseClient;
  }
  
  async create(data) {
    // CREATE operations
  }
  
  async findById(id) {
    // READ operations
  }
  
  async update(id, data) {
    // UPDATE operations
  }
  
  async delete(id) {
    // DELETE operations
  }
}
```

**Benefits:**
- Centralized database logic
- Easy to mock for testing
- Consistent error handling
- Query optimization in one place

## Frontend State Management

### Context + Hooks Pattern

```javascript
// contexts/EpisodeContext.jsx
const EpisodeContext = createContext();

export function EpisodeProvider({ children }) {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Subscribe to real-time updates
  useEffect(() => {
    const subscription = supabase
      .channel('episodes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'episodes'
      }, handleChange)
      .subscribe();
      
    return () => subscription.unsubscribe();
  }, []);
  
  return (
    <EpisodeContext.Provider value={{ episodes, loading }}>
      {children}
    </EpisodeContext.Provider>
  );
}

// Custom hook for consuming context
export function useEpisodes() {
  return useContext(EpisodeContext);
}
```

## Performance Considerations

### Database Indexes

```sql
-- Critical for queries
CREATE INDEX idx_episodes_status ON episodes(status);
CREATE INDEX idx_episodes_created_at ON episodes(created_at DESC);
CREATE INDEX idx_stage_outputs_episode ON stage_outputs(episode_id);
CREATE INDEX idx_stage_outputs_stage ON stage_outputs(stage_number);
CREATE INDEX idx_api_usage_timestamp ON api_usage_log(timestamp DESC);
```

### API Response Optimization

- Use `select` to limit returned fields
- Paginate large lists (episodes, logs)
- Cache evergreen content in memory
- Stream long responses where possible

### Frontend Optimization

- Lazy load tabs in Review Hub
- Virtualize long lists (admin logs)
- Debounce search inputs
- Memoize expensive computations

## Security Considerations

### API Keys

- Store in environment variables, never in code
- Use separate keys for dev/production
- Rotate keys periodically
- Rate limit API endpoints

### Database Security

- Row-level security policies
- Prepared statements (prevent SQL injection)
- Input validation on all endpoints
- Sanitize user input before storing

### Content Security

- No PII in logs
- Secure transcript storage
- User owns all generated content
- Clear data retention policy

---

**This architecture prioritizes modularity, maintainability, and clear separation of concerns. Every module should be independently testable and replaceable.**
