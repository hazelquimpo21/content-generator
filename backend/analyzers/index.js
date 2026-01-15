/**
 * ============================================================================
 * ANALYZERS INDEX
 * ============================================================================
 * Central export module for all stage analyzer functions.
 *
 * Architecture Overview:
 * ----------------------
 * The pipeline is organized into 4 phases with 10 focused analyzers:
 *
 *   PRE-GATE (conditional):
 *   └── Stage 0: preprocessTranscript - Compress long transcripts
 *
 *   PHASE 1: EXTRACT (parallel)
 *   ├── Stage 1: analyzeTranscript - Extract metadata, themes, episode_crux
 *   └── Stage 2: extractQuotes - Extract verbatim quotes
 *
 *   PHASE 2: PLAN (outline first, then parallel)
 *   ├── Stage 3: outlineHighLevel - Create blog structure
 *   ├── Stage 4: outlineParagraphs - Detail paragraph-level plans
 *   └── Stage 5: generateHeadlines - Generate title options
 *
 *   PHASE 3: WRITE (sequential)
 *   ├── Stage 6: draftBlogPost - Write complete draft
 *   └── Stage 7: refineWithClaude - Polish and improve prose
 *
 *   PHASE 4: DISTRIBUTE (parallel)
 *   ├── Stage 8: generateSocial - Create social media posts
 *   └── Stage 9: generateEmail - Create email newsletter
 *
 * Design Philosophy:
 * ------------------
 * Each analyzer is a FOCUSED module that does ONE thing well:
 * - Single responsibility: One analyzer, one task
 * - Clear inputs/outputs: Defined in JSDoc comments
 * - Standardized result format: { output_data, output_text, tokens, cost }
 *
 * Canonical Data Sources:
 * -----------------------
 * - CANONICAL SUMMARY: Stage 1's `episode_crux` field
 * - CANONICAL QUOTES: Stage 2's `quotes[]` array
 *
 * All downstream stages reference these - no duplicate summarization.
 *
 * Usage:
 *   // Named imports (recommended)
 *   import { analyzeTranscript, extractQuotes } from './analyzers/index.js';
 *
 *   // All analyzers
 *   import * as analyzers from './analyzers/index.js';
 *
 * ============================================================================
 */

// ============================================================================
// PRE-GATE: PREPROCESSING
// ============================================================================

/**
 * Stage 0: Transcript Preprocessing
 *
 * Model: Claude Haiku 3.5 (200K context, cheap)
 * Purpose: Compress long transcripts for downstream processing
 * Trigger: Only runs if transcript > 8000 tokens
 *
 * Output: { comprehensive_summary, key_topics, speakers, episode_metadata }
 */
export { preprocessTranscript } from './stage-00-preprocess-transcript.js';

// ============================================================================
// PHASE 1: EXTRACT
// ============================================================================

/**
 * Stage 1: Transcript Analysis ⭐ CANONICAL SUMMARY SOURCE
 *
 * Model: GPT-5 mini (OpenAI)
 * Purpose: Extract episode metadata, themes, and core insight
 *
 * Output:
 * - episode_basics: { title, date, duration_estimate, main_topics[] }
 * - guest_info: { name, credentials, expertise, website } | null
 * - episode_crux: "2-3 sentence core insight" ← CANONICAL SUMMARY
 *
 * This stage produces the SINGLE source of truth for the episode's
 * core message. All downstream stages reference episode_crux.
 */
export { analyzeTranscript } from './stage-01-analyze-transcript.js';

/**
 * Stage 2: Quote Extraction ⭐ CANONICAL QUOTES SOURCE
 *
 * Model: Claude Haiku 3.5 (fast, accurate)
 * Purpose: Extract 8-12 verbatim quotes from transcript
 *
 * Output:
 * - quotes[]: Array of { text, speaker, context, usage }
 * - extraction_notes: Brief notes about the extraction
 *
 * IMPORTANT: Always uses ORIGINAL transcript (not Stage 0 summary)
 * to ensure quotes are verbatim and accurate.
 *
 * This stage produces the CANONICAL quotes used by all downstream stages.
 */
export { extractQuotes } from './stage-02-extract-quotes.js';

// ============================================================================
// PHASE 2: PLAN
// ============================================================================

/**
 * Stage 3: Blog Outline - High Level
 *
 * Model: GPT-5 mini (OpenAI)
 * Purpose: Create high-level blog post structure
 * Dependencies: Stage 1 (episode_crux), Stage 2 (quotes)
 *
 * Output:
 * - post_structure: { hook, hook_type, sections[], context, cta }
 * - estimated_total_words: Target word count (~750)
 *
 * Note: Does NOT create its own summary - uses Stage 1's episode_crux.
 */
export { outlineHighLevel } from './stage-03-outline-high-level.js';

/**
 * Stage 4: Paragraph-Level Outlines
 *
 * Model: GPT-5 mini (OpenAI)
 * Purpose: Create detailed paragraph-level plans for each section
 * Dependencies: Stage 2 (quotes), Stage 3 (outline)
 *
 * Output:
 * - section_details[]: Array of { section_number, section_title, paragraphs[] }
 *   - Each paragraph: { main_point, supporting_elements[], transition_note }
 */
export { outlineParagraphs } from './stage-04-outline-paragraphs.js';

/**
 * Stage 5: Headlines & Copy Options
 *
 * Model: GPT-5 mini (OpenAI)
 * Purpose: Generate multiple title and copy variations
 * Dependencies: Stage 1 (episode_crux), Stage 3 (outline)
 *
 * Output:
 * - headlines[]: 10-15 title options
 * - subheadings[]: 8-10 section heading options
 * - taglines[]: 5-7 short punchy taglines
 * - social_hooks[]: 5-7 first-line hooks for social posts
 */
export { generateHeadlines } from './stage-05-generate-headlines.js';

// ============================================================================
// PHASE 3: WRITE
// ============================================================================

/**
 * Stage 6: Blog Post Draft Generation
 *
 * Model: GPT-5 mini (OpenAI)
 * Purpose: Write the complete ~750-word blog post
 * Dependencies: All Stages 1-5 (uses BlogContentCompiler)
 *
 * Output (BOTH types):
 * - output_data: { word_count, char_count, structure, ai_patterns_detected }
 * - output_text: "# Blog Title\n\n..." (the actual blog post markdown)
 *
 * This is the only stage that returns BOTH output_data AND output_text.
 */
export { draftBlogPost } from './stage-06-draft-blog-post.js';

/**
 * Stage 7: Refinement Pass
 *
 * Model: Claude Sonnet 4 (high quality prose)
 * Purpose: Polish the draft, remove AI patterns, improve flow
 * Dependencies: Stage 6 (output_text - the draft)
 *
 * Output:
 * - output_text: Refined blog post markdown
 *
 * Refinement tasks:
 * - Fix awkward phrasing and improve flow
 * - Remove AI patterns ("In today's world", "Let's explore", etc.)
 * - Vary sentence structure
 * - Ensure voice consistency
 */
export { refineWithClaude } from './stage-07-refine-with-claude.js';

// ============================================================================
// PHASE 4: DISTRIBUTE
// ============================================================================

/**
 * Stage 8: Social Content Generation
 *
 * Model: Claude Sonnet 4 (creative content)
 * Purpose: Create platform-specific social media posts
 * Dependencies: Stage 7 (refined blog), Stage 2 (quotes), Stage 5 (headlines)
 *
 * Output:
 * - instagram[]: { type, content, hashtags } - short/medium/long variants
 * - twitter[]: { content, type } - 5 tweet options
 * - linkedin[]: { content } - 2 professional posts
 * - facebook[]: { content } - 2 community posts
 */
export { generateSocial } from './stage-08-generate-social.js';

/**
 * Stage 9: Email Campaign Generation
 *
 * Model: Claude Sonnet 4 (creative content)
 * Purpose: Create email newsletter content
 * Dependencies: Stage 7 (refined blog), Stage 1 (metadata), Stage 5 (headlines)
 *
 * Output:
 * - subject_lines[]: 5 email subject options (<50 chars)
 * - preview_text[]: 3 preview text options (40-90 chars)
 * - email_body: 200-350 word email in markdown
 * - followup_email: Optional 100-150 word follow-up
 */
export { generateEmail } from './stage-09-generate-email.js';

// ============================================================================
// PHASE MAPPINGS
// ============================================================================

/**
 * Maps analyzer functions to their phase.
 * Used for parallel execution grouping.
 */
export const ANALYZER_PHASES = {
  preprocessTranscript: 'pregate',
  analyzeTranscript: 'extract',
  extractQuotes: 'extract',
  outlineHighLevel: 'plan',
  outlineParagraphs: 'plan',
  generateHeadlines: 'plan',
  draftBlogPost: 'write',
  refineWithClaude: 'write',
  generateSocial: 'distribute',
  generateEmail: 'distribute',
};

/**
 * Maps stage numbers to analyzer function names.
 * Used for backward compatibility with database.
 */
export const STAGE_ANALYZERS = {
  0: 'preprocessTranscript',
  1: 'analyzeTranscript',
  2: 'extractQuotes',
  3: 'outlineHighLevel',
  4: 'outlineParagraphs',
  5: 'generateHeadlines',
  6: 'draftBlogPost',
  7: 'refineWithClaude',
  8: 'generateSocial',
  9: 'generateEmail',
};

/**
 * Human-readable stage names.
 * Used in UI progress indicators.
 */
export const STAGE_NAMES = {
  0: 'Transcript Preprocessing',
  1: 'Transcript Analysis',
  2: 'Quote Extraction',
  3: 'Blog Outline - High Level',
  4: 'Paragraph-Level Outlines',
  5: 'Headlines & Copy Options',
  6: 'Draft Generation',
  7: 'Refinement Pass',
  8: 'Social Content',
  9: 'Email Campaign',
};

/**
 * Stage providers (which AI is used).
 * Used for cost estimation and debugging.
 */
export const STAGE_PROVIDERS = {
  0: 'anthropic',  // Haiku
  1: 'openai',     // GPT-5 mini
  2: 'anthropic',  // Haiku
  3: 'openai',     // GPT-5 mini
  4: 'openai',     // GPT-5 mini
  5: 'openai',     // GPT-5 mini
  6: 'openai',     // GPT-5 mini
  7: 'anthropic',  // Sonnet
  8: 'anthropic',  // Sonnet
  9: 'anthropic',  // Sonnet
};
