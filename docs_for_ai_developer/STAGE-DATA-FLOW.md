# Stage Data Flow Documentation

## Overview

This document explains how data flows between the 10 stages (0-9) of the AI pipeline. Understanding this flow is critical for debugging issues like "Missing Stage X output" errors.

---

## The `previousStages` Object

Each stage receives a `context` object containing:

```javascript
{
  episodeId: 'uuid',           // Episode identifier
  transcript: '...',           // Original transcript text
  episodeContext: {...},       // User-provided context (guest name, keywords)
  evergreen: {...},            // Therapist profile, podcast info, voice guidelines
  previousStages: {...}        // Outputs from ALL completed stages (the focus of this doc)
}
```

### How `previousStages` Is Populated

**During processing** (in `episode-processor.js`):

```javascript
// After each stage completes, its output is stored:
context.previousStages[stageNum] = {
  ...result.output_data,       // Structured JSON data (quotes, outlines, metadata)
  output_text: result.output_text  // Text content (blog posts, refined content)
};
```

**Key insight:** Both `output_data` properties AND `output_text` are merged together into a single object per stage. This ensures downstream stages can access either type of output.

---

## Stage Output Types

### Stages 0-5: Structured Data (`output_data`)

These stages return JSON objects with structured analysis:

| Stage | Key Fields in `output_data` |
|-------|----------------------------|
| 0 | `comprehensive_summary`, `key_topics`, `speakers`, `episode_metadata` (preprocessing) |
| 1 | `episode_basics`, `guest_info`, `episode_crux` ← **CANONICAL SUMMARY** |
| 2 | `quotes[]` with `text`, `speaker`, `context`, `usage` |
| 3 | `post_structure`, `estimated_total_words` |
| 4 | `section_details[]` with `paragraphs[]` |
| 5 | `headlines[]`, `subheadings[]`, `taglines[]`, `social_hooks[]` |

> **Note:** Stage 1's `episode_crux` is the **single source of truth** for the episode's
> core insight/message. We intentionally avoid duplicate summarization in other stages.

### Stage 6: Both Types

Stage 6 returns BOTH:
- `output_data`: `{ word_count, char_count, structure, ai_patterns_detected }`
- `output_text`: The actual blog post markdown

### Stages 7-9: Text Content (`output_text`)

| Stage | Returns |
|-------|---------|
| 7 | Refined blog post markdown (via `output_text`) |
| 8 | JSON social content (via `output_data`) |
| 9 | JSON email content (via `output_data`) |

---

## Accessing Previous Stage Data

### Accessing Structured Data

```javascript
// Stage 3 needs quotes from Stage 2
const quotes = previousStages[2]?.quotes;

// Stage 4 needs outline from Stage 3
const postStructure = previousStages[3]?.post_structure;

// Stage 6 needs everything from Stages 1-5
const stage1 = previousStages[1];  // { episode_basics, guest_info, episode_crux }
const stage2 = previousStages[2];  // { quotes: [...] }
// etc.
```

### Accessing Text Content

```javascript
// Stage 7 needs the blog draft from Stage 6
const draft = previousStages[6]?.output_text;

// Stage 8 needs the refined post from Stage 7
const refinedPost = previousStages[7]?.output_text;

// Stage 9 also needs the refined post
const refinedPost = previousStages[7]?.output_text;
```

---

## Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRANSCRIPT INPUT                                   │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 0: Transcript Preprocessing (Claude Haiku)                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│ SKIPPED if transcript < 8000 tokens                                          │
│                                                                              │
│ OUTPUT: { comprehensive_summary, key_topics, speakers, episode_metadata }    │
│ STORED: previousStages[0] = { comprehensive_summary, key_topics, ..., output_text: null } │
│                                                                              │
│ NOTE: Stage 0 focuses on COMPRESSION only. It does NOT create a core_message │
│       summary - that's Stage 1's job (episode_crux).                         │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: Transcript Analysis (GPT-5 mini)                                    │
│ ─────────────────────────────────────────────────────────────────────────── │
│ READS: transcript, evergreen                                                 │
│                                                                              │
│ OUTPUT: { episode_basics, guest_info, episode_crux }                         │
│ STORED: previousStages[1] = { episode_basics, guest_info, episode_crux, output_text: null } │
│                                                                              │
│ ⭐ episode_crux is the CANONICAL SUMMARY for the entire pipeline.            │
│    All downstream stages reference this - no duplicate summarization.       │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: Quote Extraction (Claude Haiku)                                     │
│ ─────────────────────────────────────────────────────────────────────────── │
│ READS: transcript (ALWAYS original, never Stage 0 summary)                   │
│                                                                              │
│ OUTPUT: { quotes: [{ text, speaker, context, usage }, ...] }                 │
│ STORED: previousStages[2] = { quotes: [...], output_text: null }             │
│                                                                              │
│ NOTE: Stage 2 is the SOLE source of quotes for the entire pipeline           │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: Blog Outline - High Level (GPT-5 mini)                              │
│ ─────────────────────────────────────────────────────────────────────────── │
│ READS: previousStages[1], previousStages[2], evergreen                       │
│                                                                              │
│ OUTPUT: { post_structure, estimated_total_words }                            │
│ STORED: previousStages[3] = { post_structure, estimated_total_words, output_text: null } │
│                                                                              │
│ NOTE: Stage 3 does NOT create its own narrative_summary. It uses the         │
│       episode_crux from Stage 1 as the "big picture" for the blog post.     │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: Paragraph-Level Outlines (GPT-5 mini)                               │
│ ─────────────────────────────────────────────────────────────────────────── │
│ READS: previousStages[2], previousStages[3], evergreen                       │
│                                                                              │
│ OUTPUT: { section_details: [...] }                                           │
│ STORED: previousStages[4] = { section_details, output_text: null }           │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 5: Headlines & Copy Options (GPT-5 mini)                               │
│ ─────────────────────────────────────────────────────────────────────────── │
│ READS: previousStages[1], previousStages[2], previousStages[3]               │
│                                                                              │
│ OUTPUT: { headlines, subheadings, taglines, social_hooks }                   │
│ STORED: previousStages[5] = { headlines, subheadings, ..., output_text: null } │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 6: Blog Post Draft Generation (GPT-5 mini)                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│ READS: ALL previous stages (1-5 via blog-content-compiler), evergreen        │
│                                                                              │
│ OUTPUT (BOTH types):                                                         │
│   output_data: { word_count, char_count, structure, ai_patterns_detected }   │
│   output_text: "# Blog Post Title\n\n..."  (THE ACTUAL BLOG POST)            │
│                                                                              │
│ STORED: previousStages[6] = {                                                │
│   word_count, char_count, structure, ai_patterns_detected,                   │
│   output_text: "# Blog Post Title\n\n..."  ← CRITICAL FOR STAGE 7            │
│ }                                                                            │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 7: Refinement Pass (Claude Sonnet 4)                                   │
│ ─────────────────────────────────────────────────────────────────────────── │
│ READS: previousStages[6].output_text  ← THE BLOG DRAFT                       │
│        evergreen.voice_guidelines                                            │
│                                                                              │
│ OUTPUT: Refined blog post markdown                                           │
│ STORED: previousStages[7] = { output_text: "# Refined Blog Post\n\n..." }    │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 8: Social Content (Claude Sonnet 4)                                    │
│ ─────────────────────────────────────────────────────────────────────────── │
│ READS: previousStages[7].output_text  ← THE REFINED POST                     │
│        previousStages[2].quotes                                              │
│        previousStages[5] (headlines)                                         │
│        evergreen                                                             │
│                                                                              │
│ OUTPUT: { instagram, twitter, linkedin, facebook }                           │
│ STORED: previousStages[8] = { instagram, twitter, ..., output_text: null }   │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 9: Email Campaign (Claude Sonnet 4)                                    │
│ ─────────────────────────────────────────────────────────────────────────── │
│ READS: previousStages[7].output_text  ← THE REFINED POST                     │
│        previousStages[5] (headlines)                                         │
│        previousStages[1].episode_basics.title                                │
│        evergreen                                                             │
│                                                                              │
│ OUTPUT: { subject_lines, preview_text, email_body, followup_email }          │
│ STORED: previousStages[9] = { subject_lines, ..., output_text: null }        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Common Issues and Solutions

### Issue: "Missing Stage X output" Errors

**Symptom:** Stage Y fails with "Missing Stage X draft for refinement"

**Cause:** The `previousStages` object didn't properly preserve both `output_data` and `output_text` fields.

**Solution:** The `episode-processor.js` now merges both:

```javascript
// CORRECT: Merge both output types
context.previousStages[stageNum] = {
  ...(result.output_data || {}),
  output_text: result.output_text || null,
};
```

### Issue: "Missing Stage 6 draft for refinement"

**Root cause:** Stage 6 returns both `output_data` (metadata) AND `output_text` (the blog post). The old code used `||` which chose only ONE:

```javascript
// BUGGY: output_text is lost when output_data exists
context.previousStages[stageNum] = result.output_data || {
  output_text: result.output_text,
};
```

Stage 7 then tried to access `previousStages[6].output_text` but it didn't exist because only `output_data` was stored.

---

## Resume Processing

When resuming from a specific stage, the same data flow must be preserved.

**`loadPreviousStages(context, upToStage)`:**
- Fetches all completed stages from the database
- Reconstructs `previousStages` with both `output_data` AND `output_text`

```javascript
// From episode-processor.js
context.previousStages[stage.stage_number] = {
  ...(stage.output_data || {}),
  output_text: stage.output_text || null,
};
```

---

## Best Practices for Stage Analyzers

### 1. Always Return Both Output Types Appropriately

```javascript
// Stage returns structured data only
return {
  output_data: { quotes: [...] },
  output_text: null,  // Explicitly null
  input_tokens: ...,
  output_tokens: ...,
  cost_usd: ...,
};

// Stage returns text content only
return {
  output_data: null,  // Explicitly null
  output_text: "# Blog Post\n\n...",
  ...
};

// Stage returns BOTH (like Stage 6)
return {
  output_data: { word_count: 750, structure: {...} },
  output_text: "# Blog Post\n\n...",
  ...
};
```

### 2. Access Previous Stages Safely

```javascript
// Always use optional chaining
const draft = previousStages[6]?.output_text;

// Validate before using
if (!draft) {
  throw new ValidationError('previousStages.6', 'Missing Stage 6 draft');
}
```

### 3. Document Stage Dependencies

Every analyzer should clearly document what it reads:

```javascript
/**
 * STAGE 7: Refinement Pass
 *
 * READS:
 * - previousStages[6].output_text (REQUIRED) - The blog draft to refine
 * - evergreen.voice_guidelines (optional) - Voice/tone guidelines
 *
 * OUTPUTS:
 * - output_text: Refined blog post markdown
 */
```

---

## Database Storage

Stage outputs are stored in the `stage_outputs` table:

| Column | Type | Description |
|--------|------|-------------|
| `output_data` | JSONB | Structured JSON (stages 0-5, 8-9) |
| `output_text` | TEXT | Text/markdown content (stages 6-7) |

Both columns can be populated for the same stage. The orchestrator reads both when loading for resume.

---

## Summary

1. **`previousStages` contains BOTH `output_data` fields AND `output_text`** merged into one object per stage
2. **Stage 6 is special** - it returns both structured metadata AND the actual blog post text
3. **Stages 7-9 depend on `output_text`** from previous stages for their input
4. **Always use optional chaining** when accessing `previousStages` to handle missing data gracefully
5. **The orchestrator merges both output types** when populating `previousStages`

---

## Design Principle: No Duplicate Summarization

The pipeline is designed to avoid redundant summarization. There is **one canonical summary**:

| Concept | Location | Purpose |
|---------|----------|---------|
| **episode_crux** | Stage 1 | The single source of truth for the episode's core insight/message |

Previously, the pipeline had three separate summaries:
- Stage 0: `core_message` (1-2 sentences) - **REMOVED** (redundant)
- Stage 1: `episode_crux` (2-3 sentences) - **KEPT** (canonical)
- Stage 3: `narrative_summary` (3-4 sentences) - **REMOVED** (redundant)

This design follows the **single responsibility principle**: each stage has one job, and
summary generation happens in exactly one place (Stage 1).

---

*Last updated: 2026-01-15*
*Related: ARCHITECTURE.md, IMPLEMENTATION-GUIDE.md*
