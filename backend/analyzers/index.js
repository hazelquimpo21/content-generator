/**
 * ============================================================================
 * ANALYZERS INDEX
 * ============================================================================
 * Exports all stage analyzer functions for the 9-stage pipeline.
 *
 * Stages 1-6: Use GPT-5 mini (OpenAI)
 * Stages 7-9: Use Claude Sonnet 4 (Anthropic)
 * ============================================================================
 */

export { analyzeTranscript } from './stage-01-analyze-transcript.js';
export { extractQuotes } from './stage-02-extract-quotes.js';
export { outlineHighLevel } from './stage-03-outline-high-level.js';
export { outlineParagraphs } from './stage-04-outline-paragraphs.js';
export { generateHeadlines } from './stage-05-generate-headlines.js';
export { draftBlogPost } from './stage-06-draft-blog-post.js';
export { refineWithClaude } from './stage-07-refine-with-claude.js';
export { generateSocial } from './stage-08-generate-social.js';
export { generateEmail } from './stage-09-generate-email.js';

/**
 * Maps stage numbers to their analyzer functions
 */
export const STAGE_ANALYZERS = {
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
 * Human-readable stage names
 */
export const STAGE_NAMES = {
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
 * Stage providers (which AI is used)
 */
export const STAGE_PROVIDERS = {
  1: 'openai',
  2: 'openai',
  3: 'openai',
  4: 'openai',
  5: 'openai',
  6: 'openai',
  7: 'anthropic',
  8: 'anthropic',
  9: 'anthropic',
};
