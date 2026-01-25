# Pipeline Reference

## Design Philosophy: Focused Analyzers

### Core Principle

> **Analyzers work best when they don't have too many jobs.**

Each analyzer does ONE focused thing well. When a task can be split into independent work, split it and run in parallel. This is the foundational principle behind the pipeline architecture.

### Why This Matters

AI analyzers produce better results when they have a clear, focused task. A single prompt asking an AI to "generate Instagram, Twitter, LinkedIn, AND Facebook content" produces worse results than four specialized prompts, each optimized for a specific platform.

**The tradeoff is worth it:**
- Slightly more code organization
- Significantly better output quality
- Faster execution through parallelization
- Easier testing and debugging

### Stage 6 & Stage 8: Case Studies

**Stage 6 (Blog Drafts)** and **Stage 8 (Social Content)** both demonstrate this philosophy.

**Stage 6 - The wrong approach (avoided):**
```javascript
// BAD: One API call tries to write TWO different articles
// - Model's attention is split between two tasks
// - Requires complex parsing to separate the articles
// - If one article fails validation, must regenerate both
generateBothBlogPosts() {
  const response = await callAI("Write BOTH articles...");
  const { article1, article2 } = parseArticles(response); // Fragile parsing
}
```

**Stage 6 - The right approach (implemented):**
```javascript
// GOOD: Two focused API calls, one article each
const episodeRecap = await generateSingleArticle('episode_recap');  // Full attention
const topicArticle = await generateSingleArticle('topic_article');  // Full attention
// No parsing needed - each call returns one clean article
```

**Stage 8 - The wrong approach (avoided):**
```javascript
// BAD: 400+ lines, unfocused, hard to test, sequential
generateSocial() {
  // Generate Instagram posts (100 lines)
  // Generate Twitter posts (100 lines)
  // Generate LinkedIn posts (100 lines)
  // Generate Facebook posts (100 lines)
  // Complex merging logic (50 lines)
}
```

**Stage 8 - The right approach (implemented):**
```javascript
// GOOD: Focused, parallel, specialized
generateInstagram()  // ~250 lines, Instagram-specific prompts & validation
generateTwitter()    // ~250 lines, Twitter-specific prompts & validation
generateLinkedIn()   // ~250 lines, LinkedIn-specific prompts & validation
generateFacebook()   // ~250 lines, Facebook-specific prompts & validation
```

Each focused analyzer:
- Has its own prompt file (`stage-08-instagram.md`, etc.)
- Has platform-specific validation rules
- Runs in parallel with the others
- Can be tested independently

### Benefits of Focused Analyzers

| Benefit | Description |
|---------|-------------|
| **Better Quality** | Each AI call has a focused task with specialized prompts |
| **Parallel Execution** | Independent tasks run simultaneously (~30% faster) |
| **Easier Testing** | Each analyzer tested in isolation |
| **Clearer Code** | No 600+ line monolithic modules |
| **Platform-Specific Logic** | Different validation, different requirements |
| **Maintainability** | Change one platform without affecting others |

### Canonical Data Sources

Another aspect of the focused analyzer philosophy: **no duplicate work**.

| Data | Canonical Source | Rule |
|------|-----------------|------|
| Episode Summary | Stage 1 `episode_crux` | Only Stage 1 creates the summary |
| Verbatim Quotes | Stage 2 `quotes[]` | Only Stage 2 extracts quotes |

**Why this matters:**
- Stage 0 does NOT create a summary (Stage 1 handles it)
- Stage 3 does NOT create its own summary (uses Stage 1's `episode_crux`)
- All downstream stages reference Stage 2 quotes (no re-extraction)

This prevents redundant AI calls doing the same summarization work, saving tokens and money.

---

## The 4-Phase Pipeline

The pipeline processes podcast transcripts through **4 phases** containing **10 stages (0-9)**.

### Visual Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              TRANSCRIPT INPUT                                 │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🚪 PRE-GATE: Preprocessing (Conditional)                                      │
│ ════════════════════════════════════════════════════════════════════════════ │
│ Only runs if transcript > 8000 tokens                                         │
│                                                                               │
│   Stage 0: preprocessTranscript (Claude Haiku)                                │
│   Output: { comprehensive_summary, key_topics, speakers }                     │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📤 PHASE 1: EXTRACT (2 tasks in PARALLEL)                                     │
│ ════════════════════════════════════════════════════════════════════════════ │
│ Both tasks only need the transcript, so they run simultaneously.              │
│                                                                               │
│   ┌────────────────────────────┐    ┌────────────────────────────┐           │
│   │ Stage 1: analyzeTranscript │    │ Stage 2: extractQuotes     │           │
│   │ (GPT-5 mini)               │    │ (Claude Haiku)             │           │
│   │                            │    │                            │           │
│   │ Output:                    │    │ Output:                    │           │
│   │ • episode_basics           │    │ • quotes[] (8-12 quotes)   │           │
│   │ • guest_info               │    │ • extraction_notes         │           │
│   │ • episode_crux ⭐          │    │                            │           │
│   │   (CANONICAL SUMMARY)      │    │ ⭐ CANONICAL QUOTES SOURCE │           │
│   └────────────────────────────┘    └────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📋 PHASE 2: PLAN (3 tasks, grouped execution)                                 │
│ ════════════════════════════════════════════════════════════════════════════ │
│ First: outline runs alone (needed by the next two)                            │
│ Then: paragraphs + headlines run in PARALLEL                                  │
│                                                                               │
│   Step 1 (Sequential):                                                        │
│   ┌────────────────────────────┐                                              │
│   │ Stage 3: outlineHighLevel  │                                              │
│   │ (GPT-5 mini)               │                                              │
│   │ Output: post_structure     │                                              │
│   └─────────────┬──────────────┘                                              │
│                 │                                                             │
│                 ▼                                                             │
│   Step 2 (Parallel):                                                          │
│   ┌────────────────────────────┐    ┌────────────────────────────┐           │
│   │ Stage 4: outlineParagraphs │    │ Stage 5: generateHeadlines │           │
│   │ (GPT-5 mini)               │    │ (GPT-5 mini)               │           │
│   │ Output: section_details[]  │    │ Output: headlines[],       │           │
│   │                            │    │         subheadings[]      │           │
│   └────────────────────────────┘    └────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ ✍️ PHASE 3: WRITE (3 tasks, SEQUENTIAL)                                       │
│ ════════════════════════════════════════════════════════════════════════════ │
│ Sequential execution - each step needs the previous output.                   │
│ Stage 6 is split into focused analyzers (6a, 6b) following the core          │
│ philosophy: AI works best with one clear task per API call.                  │
│                                                                               │
│   ┌────────────────────────────┐                                              │
│   │ Stage 6a: Episode Recap    │                                              │
│   │ (GPT-5 mini)               │                                              │
│   │ One focused API call       │                                              │
│   │ Output: episode_recap text │                                              │
│   └─────────────┬──────────────┘                                              │
│                 │                                                             │
│                 ▼                                                             │
│   ┌────────────────────────────┐                                              │
│   │ Stage 6b: Topic Article    │                                              │
│   │ (GPT-5 mini)               │                                              │
│   │ One focused API call       │                                              │
│   │ Output: topic_article text │                                              │
│   └─────────────┬──────────────┘                                              │
│                 │                                                             │
│                 ▼                                                             │
│   ┌────────────────────────────┐                                              │
│   │ Stage 7: refineWithClaude  │                                              │
│   │ (Claude Sonnet)            │                                              │
│   │                            │                                              │
│   │ Input: Stage 6 output_text │                                              │
│   │ Output: Refined markdown   │                                              │
│   └────────────────────────────┘                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📣 PHASE 4: DISTRIBUTE (5 tasks in PARALLEL)                                  │
│ ════════════════════════════════════════════════════════════════════════════ │
│ All 5 tasks run simultaneously - they only need the refined post.             │
│ Stage 8 is split into 4 platform-specific analyzers (focused analyzer         │
│ philosophy in action).                                                        │
│                                                                               │
│   ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐    │
│   │ Stage 8a:     │ │ Stage 8b:     │ │ Stage 8c:     │ │ Stage 8d:     │    │
│   │ Instagram     │ │ Twitter/X     │ │ LinkedIn      │ │ Facebook      │    │
│   │ (Claude       │ │ (Claude       │ │ (Claude       │ │ (Claude       │    │
│   │  Sonnet)      │ │  Sonnet)      │ │  Sonnet)      │ │  Sonnet)      │    │
│   └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘    │
│                                                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐    │
│   │ Stage 9: generateEmail (Claude Sonnet)                              │    │
│   │ Output: subject_lines[], preview_text[], email_body                 │    │
│   └─────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Performance Benefits

| Phase | Tasks | Execution | Time Saved |
|-------|-------|-----------|------------|
| Phase 1 | 2 | Parallel | ~7 sec |
| Phase 2 | 3 | 1 sequential + 2 parallel | ~5 sec |
| Phase 3 | 3 | Sequential (6a → 6b → 7) | 0 sec |
| Phase 4 | 5 | Parallel | ~6 sec |
| **Total** | **13** | | **~18 sec (~30%)** |

**Note:** Phase 3 runs sequentially by design. While 6a and 6b could theoretically run in parallel (they're independent), we run them sequentially to:
- Ensure consistent quality (full model attention per article)
- Simplify debugging (clear execution order)
- Keep API rate limits comfortable

---

## Stage Reference Table

| Stage | Name | Model | Provider | Phase | Output |
|-------|------|-------|----------|-------|--------|
| 0 | Preprocessing | Claude Haiku | Anthropic | pregate | `comprehensive_summary`, `key_topics`, `speakers` |
| 1 | Transcript Analysis | GPT-5 mini | OpenAI | extract | `episode_basics`, `guest_info`, `episode_crux` ⭐ |
| 2 | Quote Extraction | Claude Haiku | Anthropic | extract | `quotes[]` ⭐ |
| 3 | Blog Outline | GPT-5 mini | OpenAI | plan | `post_structure` |
| 4 | Paragraph Details | GPT-5 mini | OpenAI | plan | `section_details[]` |
| 5 | Headlines & Copy | GPT-5 mini | OpenAI | plan | `headlines[]`, `subheadings[]`, `taglines[]` |
| 6a | Episode Recap Draft | GPT-5 mini | OpenAI | write | `episode_recap` (blog post) |
| 6b | Topic Article Draft | GPT-5 mini | OpenAI | write | `topic_article` (blog post) |
| 7 | Refinement | Claude Sonnet | Anthropic | write | `output_text` (refined blog) |
| 8a | Instagram | Claude Sonnet | Anthropic | distribute | `instagram[]` |
| 8b | Twitter/X | Claude Sonnet | Anthropic | distribute | `twitter[]` |
| 8c | LinkedIn | Claude Sonnet | Anthropic | distribute | `linkedin[]` |
| 8d | Facebook | Claude Sonnet | Anthropic | distribute | `facebook[]` |
| 9 | Email Campaign | Claude Sonnet | Anthropic | distribute | `subject_lines[]`, `email_body` |

**Notes:**
- ⭐ = Canonical data source (all downstream stages use this)
- Stage 0 only runs if transcript > 8000 tokens
- Stage 2 ALWAYS uses original transcript (not Stage 0 summary) to preserve quote accuracy

---

## Task Dependencies

### What Each Stage Needs

```
Stage 0 (preprocess):  transcript only
Stage 1 (analyze):     transcript only
Stage 2 (quotes):      transcript only (ALWAYS original)

Stage 3 (outline):     Stage 1 + Stage 2
Stage 4 (paragraphs):  Stage 2 + Stage 3
Stage 5 (headlines):   Stage 1 + Stage 3

Stage 6 (draft):       Stages 1-5 (all previous)
Stage 7 (refine):      Stage 6 output_text

Stage 8a-d (social):   Stage 7 output_text + Stage 2 quotes
Stage 9 (email):       Stage 7 output_text + Stage 1 metadata
```

### The `previousStages` Object

Each stage receives context including outputs from all previous stages:

```javascript
{
  episodeId: 'uuid',
  transcript: '...',           // Original transcript (always available)
  episodeContext: {...},       // User-provided context
  evergreen: {...},            // Therapist profile, podcast info
  previousStages: {
    0: { /* preprocessing output */ } | null,
    1: { episode_basics, guest_info, episode_crux },
    2: { quotes: [...] },
    3: { post_structure },
    4: { section_details },
    5: { headlines, subheadings, taglines },
    6: { output_text: "...", word_count: 750 },
    7: { output_text: "..." },
    // Stage 8 outputs merged after all 4 complete
    8: { instagram: [...], twitter: [...], linkedin: [...], facebook: [...] },
    9: { subject_lines: [...], email_body: "..." }
  }
}
```

---

## Error Handling

### Atomic Phases

A phase either fully succeeds or fully fails:
- If any task in a parallel phase fails, the entire phase fails
- Partial results are NOT saved to the database
- Safe to retry the entire phase without side effects

### Phase-Level Retry

```javascript
// If Phase 4 fails, retry the entire phase (all 5 tasks)
// This is simpler than task-level retry and avoids partial state
await executePhase('distribute', context);
```

### Fail Fast

When a task fails during parallel execution:
1. Error is captured immediately
2. Phase execution stops
3. Clear error message is returned
4. No cost wasted on remaining tasks in that phase

---

## Resume Capability

### Resume from Phase

```javascript
await processEpisode('uuid', { resumeFromPhase: 'plan' });
```

This will:
1. Load all completed stages from phases before 'plan'
2. Start execution from the 'plan' phase
3. Continue through remaining phases

### Resume from Stage (Legacy)

```javascript
await processEpisode('uuid', { startFromStage: 3 });
```

This will:
1. Determine which phase contains stage 3 (plan)
2. Load stages 0-2 from database
3. Start from the 'plan' phase

---

## Key Files

| File | Purpose |
|------|---------|
| `/backend/orchestrator/phase-config.js` | Phase/task definitions, dependencies |
| `/backend/orchestrator/phase-executor.js` | Parallel execution, timeout handling |
| `/backend/orchestrator/episode-processor.js` | Main orchestrator |
| `/backend/orchestrator/stage-runner.js` | Individual stage execution |
| `/backend/analyzers/stage-08-social-platform.js` | Platform-specific social generators |
| `/backend/analyzers/index.js` | Analyzer exports with documentation |

---

## Cost Estimates

Typical cost per episode (~10,000 word transcript):

| Phase | Model(s) | Est. Cost |
|-------|----------|-----------|
| Pre-gate | Claude Haiku | ~$0.02-0.05 (only for long transcripts) |
| Phase 1-2 | GPT-5 mini + Claude Haiku | ~$0.02-0.04 |
| Phase 3 | GPT-5 mini + Claude Sonnet | ~$0.03-0.06 |
| Phase 4 | Claude Sonnet (5 tasks) | ~$0.03-0.08 |
| **Total** | | **~$0.05-0.18** |

---

*Last updated: 2026-01-25*
*Related: ARCHITECTURE.md, CODE-STANDARDS.md, STAGE-DATA-FLOW.md*
