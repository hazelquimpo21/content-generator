# Code Standards & Best Practices

## Critical Modularity Requirements

### File Size Limits

**ABSOLUTE RULE: No file should exceed 400 lines of code.**

When a file approaches 400 lines:
1. Stop and refactor immediately
2. Identify distinct responsibilities within the file
3. Extract into separate, focused modules
4. Use clear interfaces between modules
5. Document why the split was made

**Target file sizes:**
- Utility modules: 150-250 lines
- Analyzers: 250-350 lines
- API routes: 250-350 lines
- React components: 200-350 lines
- Pages: 300-400 lines (orchestration only)

### Single Responsibility Principle

Every file must have ONE clear purpose:

**Good:**
```
✓ stage-01-analyze-transcript.js - Only handles Stage 1 AI analysis
✓ parse-episode-analysis.js - Only parses/validates Stage 1 output
✓ cost-calculator.js - Only calculates API costs
```

**Bad:**
```
✗ stage-handler.js - Handles all 9 stages (too broad)
✗ utils.js - Random collection of functions (no focus)
✗ api.js - All endpoints in one file (too large)
```

### Module Organization

```
backend/
├── analyzers/           # Each stage = ONE file
│   ├── stage-01-analyze-transcript.js       ← 300 lines
│   ├── stage-02-extract-quotes.js           ← 300 lines
│   └── ...
│
├── parsers/             # Each stage validation = ONE file
│   ├── parse-episode-analysis.js            ← 200 lines
│   ├── parse-quotes.js                      ← 200 lines
│   └── ...
│
├── lib/                 # Shared utilities, focused purpose
│   ├── api-client-openai.js                 ← 300 lines
│   ├── api-client-anthropic.js              ← 300 lines
│   ├── cost-calculator.js                   ← 200 lines
│   ├── logger.js                            ← 200 lines
│   └── ...
```

**If an analyzer exceeds 350 lines:**
- Extract prompt building into separate function
- Extract response parsing into parser module
- Extract validation into validator module
- Keep only: load context → call AI → return result

---

## Naming Conventions

### Files

```javascript
// Use kebab-case for all files
stage-01-analyze-transcript.js  ✓
stageOneAnalyzeTranscript.js   ✗

parse-episode-analysis.js      ✓
parseEpisodeAnalysis.js        ✗

api-client-openai.js           ✓
openaiClient.js                ✗
```

### Functions

```javascript
// Use camelCase for functions
async function analyzeTranscript() { }     ✓
async function AnalyzeTranscript() { }    ✗
async function analyze_transcript() { }   ✗

function calculateCost() { }              ✓
function CalculateCost() { }              ✗
```

### Classes

```javascript
// Use PascalCase for classes
class EpisodeProcessor { }                ✓
class episodeProcessor { }                ✗
class episode_processor { }               ✗
```

### Constants

```javascript
// Use UPPER_SNAKE_CASE for constants
const MAX_RETRIES = 3;                    ✓
const maxRetries = 3;                     ✗

const API_TIMEOUT_MS = 30000;             ✓
const apiTimeoutMs = 30000;               ✗
```

### Variables

```javascript
// Use camelCase, descriptive names
const episodeId = '123';                  ✓
const id = '123';                         ✗
const episode_id = '123';                 ✗

let currentStage = 1;                     ✓
let stage = 1;                            ✗ (too vague)
let current_stage = 1;                    ✗
```

---

## Logging Strategy

### Log Levels

```javascript
// ERROR - Something failed that should not have
logger.error('Stage processing failed', {
  episodeId,
  stage: 3,
  error: error.message,
  stack: error.stack
});

// WARN - Something unexpected but recoverable
logger.warn('Retrying after rate limit', {
  episodeId,
  stage: 2,
  attempt: 2,
  retryAfter: 5000
});

// INFO - Important milestones
logger.info('Stage completed', {
  episodeId,
  stage: 1,
  duration_ms: 1234,
  cost_usd: 0.0045
});

// DEBUG - Detailed flow for debugging
logger.debug('Loading prompt template', {
  stage: 1,
  templatePath: '/prompts/stage-01.md'
});
```

### What to Log

**ALWAYS LOG:**

```javascript
// Stage lifecycle
logger.info('Stage started', { episodeId, stage });
logger.info('Stage completed', { episodeId, stage, duration_ms, cost_usd });

// AI API calls
logger.info('Calling OpenAI', {
  model: 'gpt-5-mini',
  input_tokens: 1500,
  episodeId,
  stage
});

logger.info('OpenAI response received', {
  output_tokens: 800,
  cost_usd: 0.0045,
  duration_ms: 2340
});

// Errors
logger.error('API call failed', {
  provider: 'openai',
  statusCode: 429,
  error: error.message,
  episodeId,
  stage
});

// Retries
logger.warn('Retrying stage', {
  episodeId,
  stage,
  attempt: 2,
  reason: 'Rate limit exceeded'
});
```

**NEVER LOG:**

```javascript
// Full transcripts (too large, PII concerns)
logger.debug('Processing transcript', {
  transcript: fullTranscript  // ✗ DON'T DO THIS
});

// API keys or secrets
logger.debug('Making API call', {
  apiKey: process.env.OPENAI_API_KEY  // ✗ NEVER
});

// Unredacted PII
logger.info('Processing episode', {
  userEmail: 'therapist@example.com'  // ✗ Unless necessary
});
```

### Structured Logging Format

```javascript
// Every log entry should be structured JSON
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

### Logger Implementation

```javascript
// lib/logger.js

const winston = require('winston');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

class Logger {
  constructor() {
    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console()
      ]
    });
  }
  
  async log(level, message, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      service: 'backend',
      message,
      ...metadata
    };
    
    // Console log
    this.winston.log(level, message, metadata);
    
    // Persist ERROR and WARN to database
    if (level === 'error' || level === 'warn') {
      await this.persistLog(logEntry);
    }
  }
  
  async persistLog(entry) {
    try {
      await supabase
        .from('system_logs')
        .insert(entry);
    } catch (error) {
      // If DB logging fails, don't crash the app
      console.error('Failed to persist log:', error);
    }
  }
  
  info(message, metadata) {
    return this.log('info', message, metadata);
  }
  
  warn(message, metadata) {
    return this.log('warn', message, metadata);
  }
  
  error(message, metadata) {
    return this.log('error', message, metadata);
  }
  
  debug(message, metadata) {
    return this.log('debug', message, metadata);
  }
}

module.exports = new Logger();
```

---

## Commenting Guidelines

### When to Comment

**DO comment:**

```javascript
// Complex business logic
/**
 * Calculate cost based on token usage and model pricing.
 * OpenAI charges per 1M tokens; Anthropic charges per 1M tokens.
 * Pricing as of Jan 2025 (update if changed).
 */
function calculateCost(usage, model) {
  // Implementation
}

// Non-obvious algorithms
// Use exponential backoff: delay = initial * (factor ^ attempt)
// Cap at maxDelay to prevent infinite waits
const delay = Math.min(
  initialDelay * Math.pow(backoffFactor, attempt),
  maxDelay
);

// Workarounds
// WORKAROUND: OpenAI function calling sometimes returns invalid JSON
// We wrap parsing in try-catch and manually fix common issues
try {
  return JSON.parse(response);
} catch {
  return JSON.parse(response.replace(/,\s*}/g, '}'));
}

// Public API functions (JSDoc)
/**
 * Analyze podcast transcript and extract episode metadata
 * 
 * @param {Object} context - Execution context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript text
 * @param {Object} context.evergreen - Evergreen settings
 * @returns {Promise<EpisodeAnalysis>} Structured analysis
 * @throws {APIError} If OpenAI call fails
 * @throws {ValidationError} If response is invalid
 */
async function analyzeTranscript(context) {
  // Implementation
}

// Regex patterns
// Match ISO 8601 datetime: YYYY-MM-DDTHH:mm:ss.sssZ
const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// TODO items
// TODO(hazel): Add support for multiple guests in Stage 1
// TODO: Implement caching for evergreen content (2025-01-20)
```

**DON'T comment:**

```javascript
// Self-explanatory code
// Set episode status to processing  ✗ (code shows this)
episode.status = 'processing';

// What code does (code shows this)
// Loop through stages  ✗
for (let stage = 1; stage <= 9; stage++) {
  // Process stage
}

// Commented-out code (delete it)
// const oldFunction = () => {  ✗
//   // old implementation
// };

// Obvious variable names
// Episode ID  ✗
const episodeId = '123';
```

### JSDoc for Functions

**Format:**

```javascript
/**
 * Brief description of function purpose
 * 
 * Longer explanation if needed, including:
 * - Important constraints
 * - Side effects
 * - Performance considerations
 * 
 * @param {Type} paramName - Description
 * @param {Type} [optionalParam] - Optional parameter
 * @returns {Type} Description of return value
 * @throws {ErrorType} When and why this error is thrown
 * 
 * @example
 * const result = await functionName({ param: 'value' });
 */
```

**Example:**

```javascript
/**
 * Parse and validate Stage 1 output from OpenAI
 * 
 * Ensures all required fields are present and correctly typed.
 * Returns null for guest_info if no guest was present.
 * 
 * @param {Object} rawResponse - Raw OpenAI API response
 * @returns {EpisodeAnalysis} Validated episode analysis
 * @throws {ValidationError} If required fields missing or invalid types
 * 
 * @example
 * const analysis = parseEpisodeAnalysis(apiResponse);
 * console.log(analysis.episode_crux);
 */
function parseEpisodeAnalysis(rawResponse) {
  // Implementation
}
```

---

## Error Handling

### Error Types

```javascript
// lib/errors.js

class APIError extends Error {
  constructor(provider, statusCode, message) {
    super(message);
    this.name = 'APIError';
    this.provider = provider;  // 'openai' | 'anthropic'
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

class TimeoutError extends Error {
  constructor(operation, timeout) {
    super(`${operation} timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
    this.retryable = true;
  }
}

module.exports = {
  APIError,
  ValidationError,
  DatabaseError,
  TimeoutError
};
```

### Error Handling Patterns

```javascript
// Try-catch with specific error handling
try {
  const result = await callOpenAI(prompt);
  return result;
} catch (error) {
  if (error instanceof APIError && error.retryable) {
    logger.warn('Retrying after API error', {
      provider: error.provider,
      statusCode: error.statusCode
    });
    // Retry logic
  } else if (error instanceof ValidationError) {
    logger.error('Validation failed', {
      field: error.field,
      reason: error.message
    });
    throw error;  // Don't retry validation errors
  } else {
    logger.error('Unexpected error', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Graceful degradation
async function getEvergreenContent() {
  try {
    const content = await supabase
      .from('evergreen_content')
      .select('*')
      .single();
    return content.data;
  } catch (error) {
    logger.warn('Failed to load evergreen content, using defaults', {
      error: error.message
    });
    return getDefaultEvergreenContent();
  }
}
```

---

## Import/Export Patterns

### Prefer Named Exports

```javascript
// Good - clear what's being exported
export async function analyzeTranscript(context) { }
export async function validateAnalysis(data) { }

// Avoid default exports (harder to refactor)
export default function() { }  ✗
```

### Barrel Exports

```javascript
// analyzers/index.js
export { analyzeTranscript } from './stage-01-analyze-transcript.js';
export { extractQuotes } from './stage-02-extract-quotes.js';
// ...

// Usage
import { analyzeTranscript, extractQuotes } from './analyzers';
```

### Import Order

```javascript
// 1. Node built-ins
import fs from 'fs';
import path from 'path';

// 2. External dependencies
import express from 'express';
import { createClient } from '@supabase/supabase-js';

// 3. Internal modules (grouped by type)
import { analyzeTranscript } from './analyzers/stage-01-analyze-transcript.js';
import { parseEpisodeAnalysis } from './parsers/parse-episode-analysis.js';
import logger from './lib/logger.js';
import { calculateCost } from './lib/cost-calculator.js';

// 4. Types
import type { EpisodeAnalysis } from './types/episode.js';
```

---

## TypeScript Usage

### Strict Mode

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Type Definitions

```typescript
// Use interfaces for public APIs
interface EpisodeAnalysis {
  episode_basics: {
    title: string | null;
    date: string | null;
    duration_estimate: string | null;
    main_topics: string[];
  };
  guest_info: GuestInfo | null;
  episode_crux: string;
}

// Use types for internal shapes
type StageStatus = 'pending' | 'processing' | 'completed' | 'failed';

type APIProvider = 'openai' | 'anthropic';
```

### Avoid `any`

```typescript
// Bad
function processData(data: any) { }  ✗

// Good - use unknown if truly unknown
function processData(data: unknown) {
  if (typeof data === 'object' && data !== null) {
    // Type narrowing
  }
}

// Good - use specific types
function processData(data: EpisodeAnalysis) { }  ✓
```

---

## Testing Requirements

### Unit Tests

Every module should have corresponding tests:

```
backend/
├── analyzers/
│   ├── stage-01-analyze-transcript.js
│   └── stage-01-analyze-transcript.test.js  ← Test file
```

### Test Structure

```javascript
// stage-01-analyze-transcript.test.js

describe('analyzeTranscript', () => {
  // Mock dependencies
  beforeEach(() => {
    jest.mock('./lib/api-client-openai');
  });
  
  test('should extract episode basics', async () => {
    // Arrange
    const context = {
      transcript: 'sample transcript...',
      evergreen: { /* ... */ }
    };
    
    // Act
    const result = await analyzeTranscript(context);
    
    // Assert
    expect(result.episode_basics.main_topics).toHaveLength(5);
  });
  
  test('should handle missing guest gracefully', async () => {
    const context = {
      transcript: 'solo episode...',
      evergreen: { /* ... */ }
    };
    
    const result = await analyzeTranscript(context);
    
    expect(result.guest_info).toBeNull();
  });
  
  test('should throw ValidationError for invalid response', async () => {
    // Mock invalid API response
    mockOpenAI.mockReturnValue({ invalid: 'response' });
    
    await expect(analyzeTranscript(context)).rejects.toThrow(ValidationError);
  });
});
```

### Coverage Goals

- Unit tests: 80% minimum
- Integration tests: All critical paths
- E2E tests: Happy path + top 3 error scenarios

---

## Code Review Checklist

Before submitting code, verify:

**Modularity:**
- [ ] No file exceeds 400 lines
- [ ] Each file has single, clear responsibility
- [ ] Functions are focused and named descriptively

**Logging:**
- [ ] Stage start/end logged with timing
- [ ] API calls logged with tokens/cost
- [ ] Errors logged with full context
- [ ] No PII or secrets in logs

**Comments:**
- [ ] Public functions have JSDoc
- [ ] Complex logic explained
- [ ] No commented-out code
- [ ] TODOs have owner and date

**Error Handling:**
- [ ] Try-catch around API calls
- [ ] Specific error types used
- [ ] Retries for retryable errors
- [ ] Graceful degradation where possible

**Types:**
- [ ] No `any` types
- [ ] Interfaces for public APIs
- [ ] Proper null checking

**Tests:**
- [ ] Unit tests written
- [ ] Edge cases covered
- [ ] Mocks for external dependencies

---

**These standards ensure code is maintainable, debuggable, and scalable. Every line of code should be written with the next developer in mind.**
