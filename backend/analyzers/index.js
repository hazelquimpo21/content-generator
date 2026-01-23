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
 *   PRE-GATE (always runs):
 *   └── Stage 0: createContentBrief - Create content brief with themes, metadata
 *
 *   PHASE 1: EXTRACT (parallel)
 *   ├── Stage 1: createEpisodeSummary - Create in-depth summary and episode_crux
 *   └── Stage 2: extractQuotesAndTips - Extract verbatim quotes and actionable tips
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
 *   ├── Stage 8: generateInstagram/Twitter/LinkedIn/Facebook - Social posts
 *   └── Stage 9: generateEmail - Email newsletter
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
 * - CANONICAL CONTENT BRIEF: Stage 0's themes, metadata, SEO overview
 * - CANONICAL SUMMARY: Stage 1's `summary` and `episode_crux` fields
 * - CANONICAL QUOTES/TIPS: Stage 2's `quotes[]` and `tips[]` arrays
 *
 * Usage:
 *   // Named imports (recommended)
 *   import { createContentBrief, createEpisodeSummary } from './analyzers/index.js';
 *
 *   // All analyzers
 *   import * as analyzers from './analyzers/index.js';
 *
 * ============================================================================
 */

// ============================================================================
// PRE-GATE: CONTENT BRIEF
// ============================================================================

/**
 * Stage 0: Content Brief ⭐ CANONICAL CONTENT BRIEF SOURCE
 *
 * Model: Claude Sonnet 4 (quality analysis)
 * Purpose: Create comprehensive content brief with themes, metadata, SEO overview
 * Trigger: ALWAYS runs (no longer conditional)
 *
 * Output:
 * - episode_name, episode_subtitle
 * - host_name, guest_name, guest_bio
 * - seo_overview: SEO paragraph overview
 * - themes[]: 4 themes with what_was_discussed and practical_value
 * - tags[]: 4 topic tags
 * - has_promotion, promotion_details
 * - date_released
 *
 * Also outputs human-readable content brief as output_text.
 */
export { createContentBrief, preprocessTranscript } from './stage-00-content-brief.js';

// ============================================================================
// PHASE 1: EXTRACT
// ============================================================================

/**
 * Stage 1: Episode Summary ⭐ CANONICAL SUMMARY SOURCE
 *
 * Model: GPT-5 mini (OpenAI)
 * Purpose: Create in-depth summary and distill core insight
 * Dependencies: Stage 0 (themes)
 *
 * Output:
 * - summary: In-depth narrative summary (400-600 words)
 * - episode_crux: Core insight in 2-3 sentences ← CANONICAL
 *
 * This stage produces the CANONICAL summary for the episode.
 * All downstream stages reference summary and episode_crux.
 */
export { createEpisodeSummary, analyzeTranscript } from './stage-01-episode-summary.js';

/**
 * Stage 2: Quotes & Tips Extraction ⭐ CANONICAL QUOTES/TIPS SOURCE
 *
 * Model: Claude Haiku 3.5 (fast, accurate)
 * Purpose: Extract 8-12 verbatim quotes and 3-5 actionable tips
 *
 * Output:
 * - quotes[]: Array of { text, speaker, context, usage }
 * - tips[]: Array of { tip, context, category }
 * - extraction_notes: Brief notes about the extraction
 *
 * IMPORTANT: Always uses ORIGINAL transcript (not Stage 0 output)
 * to ensure quotes are verbatim and accurate.
 */
export { extractQuotesAndTips, extractQuotes } from './stage-02-extract-quotes.js';

// ============================================================================
// PHASE 2: PLAN
// ============================================================================

/**
 * Stage 3: Blog Outline - High Level
 *
 * Model: GPT-5 mini (OpenAI)
 * Purpose: Create high-level blog post structure
 * Dependencies: Stage 0 (content brief), Stage 1 (summary, episode_crux), Stage 2 (quotes, tips)
 *
 * Output:
 * - post_structure: { hook, hook_type, sections[], context, cta }
 * - estimated_total_words: Target word count (~750)
 *
 * Note: Does NOT create its own summary - uses Stage 1's content.
 */
export { outlineHighLevel } from './stage-03-outline-high-level.js';

/**
 * Stage 4: Paragraph-Level Outlines
 *
 * Model: GPT-5 mini (OpenAI)
 * Purpose: Create detailed paragraph-level plans for each section
 * Dependencies: Stage 2 (quotes, tips), Stage 3 (outline)
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
 * Dependencies: Stage 1 (summary, episode_crux), Stage 3 (outline)
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
 * Dependencies: All Stages 0-5 (uses BlogContentCompiler)
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
 * Stage 8: Social Content Generation (Platform-Specific)
 *
 * Model: Claude Sonnet 4 (creative content)
 * Purpose: Create platform-specific social media posts
 * Dependencies: Stage 7 (refined blog), Stage 2 (quotes, tips), Stage 5 (headlines)
 *
 * Platform-specific exports:
 * - generateInstagram: Instagram posts with hashtags
 * - generateTwitter: Twitter/X thread options
 * - generateLinkedIn: Professional LinkedIn posts
 * - generateFacebook: Community-focused Facebook posts
 *
 * Each runs in parallel as a focused analyzer.
 */
export {
  generateInstagram,
  generateTwitter,
  generateLinkedIn,
  generateFacebook,
  generateSocialContent,
} from './stage-08-social-platform.js';

// Also export the combined social generator for backward compatibility
export { generateSocial } from './stage-08-generate-social.js';

/**
 * Stage 9: Email Campaign Generation
 *
 * Model: Claude Sonnet 4 (creative content)
 * Purpose: Create email newsletter content
 * Dependencies: Stage 7 (refined blog), Stage 0 (content brief), Stage 5 (headlines)
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
  createContentBrief: 'pregate',
  createEpisodeSummary: 'extract',
  extractQuotesAndTips: 'extract',
  outlineHighLevel: 'plan',
  outlineParagraphs: 'plan',
  generateHeadlines: 'plan',
  draftBlogPost: 'write',
  refineWithClaude: 'write',
  generateInstagram: 'distribute',
  generateTwitter: 'distribute',
  generateLinkedIn: 'distribute',
  generateFacebook: 'distribute',
  generateEmail: 'distribute',
  // Backward compatibility aliases
  preprocessTranscript: 'pregate',
  analyzeTranscript: 'extract',
  extractQuotes: 'extract',
  generateSocial: 'distribute',
};

/**
 * Maps stage numbers to analyzer function names.
 * Used for backward compatibility with database.
 */
export const STAGE_ANALYZERS = {
  0: 'createContentBrief',
  1: 'createEpisodeSummary',
  2: 'extractQuotesAndTips',
  3: 'outlineHighLevel',
  4: 'outlineParagraphs',
  5: 'generateHeadlines',
  6: 'draftBlogPost',
  7: 'refineWithClaude',
  8: 'generateInstagram',  // Primary platform for stage 8
  9: 'generateEmail',
};

/**
 * Human-readable stage names.
 * Used in UI progress indicators.
 */
export const STAGE_NAMES = {
  0: 'Content Brief',
  1: 'Episode Summary',
  2: 'Quotes & Tips',
  3: 'Blog Outline',
  4: 'Paragraph Outlines',
  5: 'Headlines & Copy',
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
  0: 'anthropic',  // Sonnet (content brief)
  1: 'openai',     // GPT-5 mini
  2: 'anthropic',  // Haiku (quotes/tips)
  3: 'openai',     // GPT-5 mini
  4: 'openai',     // GPT-5 mini
  5: 'openai',     // GPT-5 mini
  6: 'openai',     // GPT-5 mini
  7: 'anthropic',  // Sonnet
  8: 'anthropic',  // Sonnet
  9: 'anthropic',  // Sonnet
};
