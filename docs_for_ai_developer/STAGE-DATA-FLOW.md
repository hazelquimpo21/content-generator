# Stage Data Flow Documentation

## Overview

This document explains how data flows between the 4 phases (containing 10 stages) of the AI pipeline. Understanding this flow is critical for debugging issues and understanding parallelization.

---

## Phase-Based Architecture

The pipeline is organized into 4 phases with parallel execution where possible:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TRANSCRIPT INPUT                                    │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🚪 PRE-GATE: Preprocessing (Conditional)                                     │
│ ═══════════════════════════════════════════════════════════════════════════ │
│ Only runs if transcript > 8000 tokens                                        │
│                                                                              │
│   Stage 0: preprocessTranscript (Claude Haiku)                               │
│   Output: { comprehensive_summary, key_topics, speakers }                    │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📤 PHASE 1: EXTRACT (Parallel) ⚡                                            │
│ ═══════════════════════════════════════════════════════════════════════════ │
│ Both tasks run in PARALLEL - they only need the transcript                   │
│                                                                              │
│   ┌─────────────────────────────┐  ┌─────────────────────────────┐          │
│   │ Stage 1: analyzeTranscript  │  │ Stage 2: extractQuotes      │          │
│   │ (GPT-5 mini)                │  │ (Claude Haiku)              │          │
│   │                             │  │                             │          │
│   │ Output:                     │  │ Output:                     │          │
│   │ • episode_basics            │  │ • quotes[] (8-12 quotes)    │          │
│   │ • guest_info                │  │ • extraction_notes          │          │
│   │ • episode_crux ⭐           │  │                             │          │
│   │   (CANONICAL SUMMARY)       │  │ ⭐ CANONICAL QUOTES SOURCE  │          │
│   └─────────────────────────────┘  └─────────────────────────────┘          │
│                                                                              │
│ Checkpoint: { episode_crux, metadata, quotes[] }                             │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📋 PHASE 2: PLAN (Grouped Execution)                                         │
│ ═══════════════════════════════════════════════════════════════════════════ │
│ First: outline runs alone (needed by others)                                 │
│ Then: paragraphs + headlines run in PARALLEL ⚡                              │
│                                                                              │
│   Step 1 (Sequential):                                                       │
│   ┌─────────────────────────────┐                                           │
│   │ Stage 3: outlineHighLevel   │                                           │
│   │ (GPT-5 mini)                │                                           │
│   │ Output: post_structure      │                                           │
│   └──────────────┬──────────────┘                                           │
│                  │                                                           │
│                  ▼                                                           │
│   Step 2 (Parallel):                                                         │
│   ┌─────────────────────────────┐  ┌─────────────────────────────┐          │
│   │ Stage 4: outlineParagraphs  │  │ Stage 5: generateHeadlines  │          │
│   │ (GPT-5 mini)                │  │ (GPT-5 mini)                │          │
│   │ Output: section_details[]   │  │ Output: headlines[],        │          │
│   │                             │  │         subheadings[]       │          │
│   └─────────────────────────────┘  └─────────────────────────────┘          │
│                                                                              │
│ Checkpoint: { outline, paragraphs, headlines }                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ✍️ PHASE 3: WRITE (Sequential - Focused Analyzers)                           │
│ ═══════════════════════════════════════════════════════════════════════════ │
│ Sequential execution. Stage 6 uses the focused analyzer philosophy:         │
│ two separate API calls, one per article type.                               │
│                                                                              │
│   ┌─────────────────────────────┐                                           │
│   │ Stage 6a: Episode Recap     │                                           │
│   │ (GPT-5 mini)                │                                           │
│   │ One focused API call        │                                           │
│   │ Output: episode_recap text  │                                           │
│   └──────────────┬──────────────┘                                           │
│                  │                                                           │
│                  ▼                                                           │
│   ┌─────────────────────────────┐                                           │
│   │ Stage 6b: Topic Article     │                                           │
│   │ (GPT-5 mini)                │                                           │
│   │ One focused API call        │                                           │
│   │ Output: topic_article text  │                                           │
│   └──────────────┬──────────────┘                                           │
│                  │                                                           │
│                  ▼                                                           │
│   ┌─────────────────────────────┐                                           │
│   │ Stage 7: refineWithClaude   │                                           │
│   │ (Claude Sonnet 4)           │                                           │
│   │                             │                                           │
│   │ Input: Stage 6 output_text  │                                           │
│   │ Output: Refined markdown    │                                           │
│   └─────────────────────────────┘                                           │
│                                                                              │
│ Checkpoint: { blog_markdown }                                                │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📣 PHASE 4: DISTRIBUTE (5 tasks in PARALLEL) ⚡                              │
│ ═══════════════════════════════════════════════════════════════════════════ │
│ All 5 tasks run simultaneously - they only need the refined post.            │
│ Stage 8 is split into 4 platform-specific analyzers (focused analyzer        │
│ philosophy: each analyzer does ONE thing well).                              │
│                                                                              │
│   ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌───────────────┐│
│   │ Stage 8a:      │ │ Stage 8b:      │ │ Stage 8c:      │ │ Stage 8d:     ││
│   │ Instagram      │ │ Twitter/X      │ │ LinkedIn       │ │ Facebook      ││
│   │ (Sonnet)       │ │ (Sonnet)       │ │ (Sonnet)       │ │ (Sonnet)      ││
│   │                │ │                │ │                │ │               ││
│   │ Output:        │ │ Output:        │ │ Output:        │ │ Output:       ││
│   │ instagram[]    │ │ twitter[]      │ │ linkedin[]     │ │ facebook[]    ││
│   └────────────────┘ └────────────────┘ └────────────────┘ └───────────────┘│
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ Stage 9: generateEmail (Claude Sonnet)                              │   │
│   │ Input: Stage 7 output_text + Stage 1 metadata                       │   │
│   │ Output: subject_lines[], preview_text[], email_body                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│ Checkpoint: { instagram, twitter, linkedin, facebook, email }                │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Performance Benefits

The parallel execution architecture provides significant speed improvements:

| Phase | Tasks | Execution | Sequential Time | Parallel Time | Savings |
|-------|-------|-----------|-----------------|---------------|---------|
| Phase 1 | 2 | Parallel | ~15 sec | ~8 sec | ~7 sec |
| Phase 2 | 3 | 1 + 2 parallel | ~18 sec | ~13 sec | ~5 sec |
| Phase 3 | 3 | Sequential (6a → 6b → 7) | ~18 sec | ~18 sec | 0 sec |
| Phase 4 | 5 | Parallel (focused analyzers) | ~15 sec | ~6 sec | ~9 sec |
| **Total** | **13** | | **~66 sec** | **~45 sec** | **~21 sec (~32%)** |

**Why Stage 6 is split into 2 tasks (6a, 6b):** Each article type gets the model's full attention, producing better quality output. No complex parsing is needed—each API call returns one clean article. If one article fails validation, only that article is retried.

**Why Stage 8 is split into 4 tasks:** Each platform analyzer is focused on a single platform, producing better quality output. This also enables parallel execution - all 5 distribution tasks run simultaneously.

---

## The `previousStages` Object

Each stage receives a `context` object containing:

```javascript
{
  episodeId: 'uuid',           // Episode identifier
  transcript: '...',           // Original transcript text
  episodeContext: {...},       // User-provided context
  evergreen: {...},            // Therapist profile, podcast info
  previousStages: {...}        // Outputs from ALL completed stages
}
```

### How `previousStages` Is Populated

**During parallel execution:**
- Each parallel task returns its own isolated result
- Results are merged into `previousStages` AFTER all tasks complete
- This prevents race conditions

**During sequential execution:**
- Results are merged immediately after each task
- Next task can access previous task's output

```javascript
// After parallel Phase 1 completes:
context.previousStages = {
  0: { /* preprocessing output or null */ },
  1: { episode_basics, guest_info, episode_crux },
  2: { quotes: [...] }
};
```

---

## Stage Dependencies

### Phase 1: EXTRACT (No Dependencies)

| Stage | Depends On | Uses From |
|-------|------------|-----------|
| 1 (analyze) | transcript only | `context.transcript` |
| 2 (quotes) | transcript only | `context.transcript` (ALWAYS original) |

### Phase 2: PLAN (Depends on Phase 1)

| Stage | Depends On | Uses From |
|-------|------------|-----------|
| 3 (outline) | 1, 2 | `previousStages[1].episode_crux`, `previousStages[2].quotes` |
| 4 (paragraphs) | 2, 3 | `previousStages[2].quotes`, `previousStages[3].post_structure` |
| 5 (headlines) | 1, 3 | `previousStages[1].episode_crux`, `previousStages[3].post_structure` |

### Phase 3: WRITE (Depends on Phases 1-2)

| Stage | Depends On | Uses From |
|-------|------------|-----------|
| 6 (draft) | 1-5 | All via `BlogContentCompiler` |
| 7 (refine) | 6 | `previousStages[6].output_text` ← CRITICAL |

### Phase 4: DISTRIBUTE (Depends on Phase 3)

| Stage | Depends On | Uses From |
|-------|------------|-----------|
| 8 (social) | 7, 2, 5 | `previousStages[7].output_text`, quotes, headlines |
| 9 (email) | 7, 1, 5 | `previousStages[7].output_text`, metadata, headlines |

---

## Output Types

### JSON Output Only (Stages 0-5)

```javascript
return {
  output_data: { /* structured JSON */ },
  output_text: null,
  input_tokens: ...,
  output_tokens: ...,
  cost_usd: ...,
};
```

### Both Output Types (Stage 6)

```javascript
return {
  output_data: { word_count: 750, structure: {...} },
  output_text: "# Blog Post Title\n\n...",  // THE ACTUAL BLOG
  input_tokens: ...,
  output_tokens: ...,
  cost_usd: ...,
};
```

### Text Output Only (Stage 7)

```javascript
return {
  output_data: null,
  output_text: "# Refined Blog Post\n\n...",
  input_tokens: ...,
  output_tokens: ...,
  cost_usd: ...,
};
```

### JSON Output Only (Stages 8-9)

```javascript
return {
  output_data: { instagram: [...], twitter: [...] },
  output_text: null,
  input_tokens: ...,
  output_tokens: ...,
  cost_usd: ...,
};
```

---

## Critical Failure Points

### 1. Stage 6 → Stage 7: Missing Draft

**Symptom:** "Missing Stage 6 draft for refinement"

**Cause:** `previousStages[6].output_text` is undefined

**Solution:** The processor merges BOTH output types:
```javascript
context.previousStages[stageNum] = {
  ...(result.output_data || {}),
  output_text: result.output_text || null,
};
```

### 2. Stage 7 → Stages 8, 9: Missing Refined Post

**Symptom:** Social/Email generation fails

**Cause:** `previousStages[7].output_text` is undefined

**Solution:** Same as above - ensure both types are merged

### 3. Parallel Race Conditions

**Symptom:** Inconsistent data, random failures

**Cause:** Parallel tasks writing to shared state

**Solution:** Tasks return isolated results, merged AFTER completion

---

## Resume Capability

### Phase-Based Resume

```javascript
// Resume from a specific phase
await processEpisode('uuid', { resumeFromPhase: 'plan' });
```

This will:
1. Load all completed stages from phases before 'plan'
2. Start execution from the 'plan' phase
3. Continue through remaining phases

### Legacy Stage-Based Resume

```javascript
// Resume from a specific stage number (backward compatible)
await processEpisode('uuid', { startFromStage: 3 });
```

This will:
1. Determine which phase contains stage 3 (plan)
2. Load stages 0-2 from database
3. Start from the 'plan' phase

---

## Error Handling

### Atomic Phases

A phase either fully succeeds or fully fails:
- If any task in a parallel phase fails, the entire phase fails
- Partial results are NOT saved
- Safe to retry the entire phase

### Phase-Level Retry

```javascript
// If Phase 2 fails, retry the entire phase (not individual tasks)
// This is simpler and avoids partial state issues
await executePhase('plan', context);  // Retries all 3 tasks
```

### Fail Fast

When a task fails in parallel execution:
1. Error is captured immediately
2. Phase execution stops
3. Clear error message is returned
4. No cost wasted on remaining tasks

---

## Design Principles

### 1. Focused Analyzers (Core Philosophy)

> **Analyzers work best when they don't have too many jobs.**

Each analyzer does ONE focused thing well. When a task can be split into independent work, split it.

**Stage 6 demonstrates this:** Instead of one API call writing TWO blog articles (which splits attention and requires complex parsing), we have 2 focused calls:
- `stage-06a-episode-recap.md` - Focused on the episode recap article
- `stage-06b-topic-article.md` - Focused on the standalone topic article
- Each call gets the model's full attention
- No parsing needed—each returns one clean article
- Can retry individual articles if validation fails

**Stage 8 also demonstrates this:** Instead of one "social content" analyzer handling all platforms, we have 4 platform-specific analyzers (Instagram, Twitter, LinkedIn, Facebook) that:
- Have specialized prompts per platform
- Run in parallel for faster execution
- Can be tested independently
- Produce better quality through focus

### 2. Single Canonical Summary

**Stage 1's `episode_crux`** is the ONLY summary in the pipeline.

| Stage | Summary Field | Status |
|-------|--------------|--------|
| Stage 0 | `core_message` | **REMOVED** (redundant) |
| Stage 1 | `episode_crux` | **CANONICAL** ✓ |
| Stage 3 | `narrative_summary` | **REMOVED** (redundant) |

### 3. Single Canonical Quotes Source

**Stage 2's `quotes[]`** is the ONLY quotes source.

All downstream stages reference `previousStages[2].quotes`.

---

## Key Files

| File | Purpose |
|------|---------|
| `/backend/orchestrator/phase-config.js` | Phase definitions, dependencies |
| `/backend/orchestrator/phase-executor.js` | Parallel execution logic |
| `/backend/orchestrator/episode-processor.js` | Main orchestrator |
| `/backend/orchestrator/stage-runner.js` | Stage execution bridge |
| `/backend/analyzers/*.js` | Individual stage analyzers |
| `/backend/analyzers/stage-06-draft-blog-post.js` | Blog draft generator (sequential 6a/6b calls) |
| `/backend/prompts/stage-06a-episode-recap.md` | Focused prompt for episode recap |
| `/backend/prompts/stage-06b-topic-article.md` | Focused prompt for topic article |
| `/backend/lib/blog-content-compiler.js` | Context assembly for Stage 6 |

---

## Summary

1. **4 phases** with clear boundaries and checkpoints
2. **Parallel execution** in Phases 1, 2 (partial), and 4
3. **Focused analyzers** - Stage 6 (blog drafts) and Stage 8 (social) demonstrate the core philosophy
4. **~32% faster** than fully sequential execution
5. **Atomic phases** for simpler error handling
6. **Single canonical sources** for summary and quotes
7. **Backward compatible** with existing database schema

---

*Last updated: 2026-01-25*
*Related: ARCHITECTURE.md, IMPLEMENTATION-GUIDE.md, PIPELINE-REFERENCE.md*
