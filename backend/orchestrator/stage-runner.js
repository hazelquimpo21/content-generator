/**
 * ============================================================================
 * STAGE RUNNER MODULE
 * ============================================================================
 * Executes individual stages of the 10-stage AI pipeline (stages 0-9).
 * Routes stage numbers to their corresponding analyzer functions.
 *
 * Stage Architecture:
 * -------------------
 * Each stage is implemented as a separate analyzer module that:
 * 1. Receives processing context (transcript, evergreen, previous outputs)
 * 2. Loads its specific prompt template
 * 3. Calls the appropriate AI API (OpenAI or Anthropic)
 * 4. Parses and validates the response
 * 5. Returns structured output with usage metrics
 *
 * Stage-to-Model Mapping:
 * -----------------------
 * Stage 0: Claude Haiku (preprocessing, 200K context)
 * Stage 1: GPT-5 mini (transcript analysis) - Creates episode_crux (CANONICAL SUMMARY)
 * Stage 2: Claude Haiku (quote extraction - accurate, verbatim)
 * Stages 3-6: GPT-5 mini (outlining and drafting)
 * Stages 7-9: Claude Sonnet (refinement and distribution)
 *
 * Key Design Principle - No Duplicate Summarization:
 * --------------------------------------------------
 * Stage 1's `episode_crux` is the SINGLE canonical summary of the episode.
 * Other stages (0, 3) intentionally DO NOT create their own summaries.
 * This prevents redundant AI calls and saves tokens/cost.
 *
 * Error Handling:
 * ---------------
 * All analyzer errors are wrapped in ProcessingError with:
 * - Stage number and name
 * - Episode ID for tracing
 * - Original error details
 *
 * Usage:
 *   import { runStage } from './orchestrator/stage-runner.js';
 *   const result = await runStage(1, context);
 * ============================================================================
 */

import logger from '../lib/logger.js';
import { ProcessingError } from '../lib/errors.js';

// Import all analyzers
import { preprocessTranscript } from '../analyzers/stage-00-preprocess-transcript.js';
import { analyzeTranscript } from '../analyzers/stage-01-analyze-transcript.js';
import { extractQuotes } from '../analyzers/stage-02-extract-quotes.js';
import { outlineHighLevel } from '../analyzers/stage-03-outline-high-level.js';
import { outlineParagraphs } from '../analyzers/stage-04-outline-paragraphs.js';
import { generateHeadlines } from '../analyzers/stage-05-generate-headlines.js';
import { draftBlogPost } from '../analyzers/stage-06-draft-blog-post.js';
import { refineWithClaude } from '../analyzers/stage-07-refine-with-claude.js';
import { generateSocial } from '../analyzers/stage-08-generate-social.js';
import { generateEmail } from '../analyzers/stage-09-generate-email.js';

// ============================================================================
// STAGE CONFIGURATION
// ============================================================================

/**
 * Maps stage numbers to their analyzer functions
 * Stage 0: Transcript preprocessing (for long transcripts)
 * Stages 1-9: Main content pipeline
 */
const STAGE_ANALYZERS = {
  0: preprocessTranscript,
  1: analyzeTranscript,
  2: extractQuotes,
  3: outlineHighLevel,
  4: outlineParagraphs,
  5: generateHeadlines,
  6: draftBlogPost,
  7: refineWithClaude,
  8: generateSocial,
  9: generateEmail,
};

/**
 * Human-readable names for each stage
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
 * AI provider for each stage
 */
export const STAGE_PROVIDERS = {
  0: 'anthropic',  // Claude Haiku for preprocessing (200K context)
  1: 'openai',
  2: 'anthropic',  // Claude Haiku for quote extraction (fast, accurate)
  3: 'openai',
  4: 'openai',
  5: 'openai',
  6: 'openai',
  7: 'anthropic',
  8: 'anthropic',
  9: 'anthropic',
};

/**
 * Model used for each stage
 *
 * Stage 2 uses Haiku because:
 * - Quote extraction is a precise extraction task (not creative)
 * - Haiku has 200K context (handles long transcripts)
 * - Much cheaper and faster than GPT-5 mini for this task
 */
export const STAGE_MODELS = {
  0: 'claude-3-5-haiku-20241022',  // Haiku for preprocessing (200K context, cheap)
  1: 'gpt-5-mini',
  2: 'claude-3-5-haiku-20241022',  // Haiku for quote extraction (fast, accurate)
  3: 'gpt-5-mini',
  4: 'gpt-5-mini',
  5: 'gpt-5-mini',
  6: 'gpt-5-mini',
  7: 'claude-sonnet-4-20250514',
  8: 'claude-sonnet-4-20250514',
  9: 'claude-sonnet-4-20250514',
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Runs a specific stage of the pipeline.
 *
 * This function is the bridge between the episode processor and individual
 * stage analyzers. It handles:
 * - Stage validation
 * - Analyzer lookup and execution
 * - Result normalization
 * - Error wrapping with context
 *
 * @param {number} stageNumber - Stage to run (0-9)
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript text
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.previousStages - Outputs from completed stages
 * @returns {Promise<Object>} Stage result object:
 *   - output_data: Structured JSON output (stages 0-5)
 *   - output_text: Text/markdown output (stages 6-9)
 *   - input_tokens: Number of tokens sent to AI
 *   - output_tokens: Number of tokens received
 *   - cost_usd: API cost in USD
 * @throws {ProcessingError} If stage validation or execution fails
 *
 * @example
 * const result = await runStage(1, {
 *   episodeId: 'uuid',
 *   transcript: '...',
 *   evergreen: {...},
 *   previousStages: { 0: {...} }
 * });
 * // result = {
 * //   output_data: { episode_basics: {...}, guest_info: {...} },
 * //   output_text: null,
 * //   input_tokens: 1500,
 * //   output_tokens: 800,
 * //   cost_usd: 0.0045
 * // }
 */
export async function runStage(stageNumber, context) {
  // Validate stage number is within allowed range (0-9)
  if (stageNumber < 0 || stageNumber > 9) {
    logger.error('Invalid stage number requested', {
      stageNumber,
      episodeId: context.episodeId,
      validRange: '0-9',
    });
    throw new ProcessingError(
      stageNumber,
      'Unknown',
      `Invalid stage number: ${stageNumber}. Must be 0-9.`
    );
  }

  // Get the analyzer function for this stage
  const analyzer = STAGE_ANALYZERS[stageNumber];
  const stageName = STAGE_NAMES[stageNumber];
  const provider = STAGE_PROVIDERS[stageNumber];
  const model = STAGE_MODELS[stageNumber];

  // Verify analyzer exists (should always exist for valid stage numbers)
  if (!analyzer) {
    logger.error('No analyzer found for stage', {
      stageNumber,
      stageName,
      episodeId: context.episodeId,
    });
    throw new ProcessingError(
      stageNumber,
      stageName,
      `No analyzer found for stage ${stageNumber}`
    );
  }

  // Log stage execution start with context info
  logger.debug('🔧 Running stage analyzer', {
    stage: stageNumber,
    name: stageName,
    provider,
    model,
    episodeId: context.episodeId,
    transcriptLength: context.transcript?.length,
    previousStagesCount: Object.keys(context.previousStages || {}).length,
  });

  const startTime = Date.now();

  try {
    // Execute the analyzer - this makes the AI API call
    const result = await analyzer(context);

    const durationMs = Date.now() - startTime;

    // Log successful completion with metrics
    logger.debug('✅ Stage analyzer completed', {
      stage: stageNumber,
      name: stageName,
      episodeId: context.episodeId,
      durationMs,
      inputTokens: result.input_tokens,
      outputTokens: result.output_tokens,
      costUsd: result.cost_usd,
      hasOutputData: !!result.output_data,
      hasOutputText: !!result.output_text,
    });

    // Normalize result to ensure all expected fields exist
    return {
      output_data: result.output_data || null,
      output_text: result.output_text || null,
      input_tokens: result.input_tokens || 0,
      output_tokens: result.output_tokens || 0,
      cost_usd: result.cost_usd || 0,
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Log the failure with as much context as possible
    logger.error('❌ Stage analyzer failed', {
      stage: stageNumber,
      name: stageName,
      provider,
      model,
      episodeId: context.episodeId,
      durationMs,
      errorType: error.name,
      errorMessage: error.message,
      isRetryable: error.retryable ?? false,
    });

    // Wrap in ProcessingError if not already (preserves original error)
    if (error.name === 'ProcessingError') {
      throw error;
    }

    throw new ProcessingError(
      stageNumber,
      stageName,
      error.message,
      context.episodeId,
      error
    );
  }
}

/**
 * Gets stage metadata
 * @param {number} stageNumber - Stage number (1-9)
 * @returns {Object} Stage metadata
 */
export function getStageInfo(stageNumber) {
  return {
    number: stageNumber,
    name: STAGE_NAMES[stageNumber] || 'Unknown',
    provider: STAGE_PROVIDERS[stageNumber] || 'unknown',
    model: STAGE_MODELS[stageNumber] || 'unknown',
  };
}

/**
 * Lists all stages with their metadata
 * @returns {Array<Object>} Array of stage info objects
 */
export function listStages() {
  return Object.keys(STAGE_NAMES).map(num => getStageInfo(parseInt(num)));
}

export default {
  runStage,
  getStageInfo,
  listStages,
  STAGE_NAMES,
  STAGE_PROVIDERS,
  STAGE_MODELS,
};
