/**
 * ============================================================================
 * STAGE RUNNER MODULE
 * ============================================================================
 * Executes individual stages of the 9-stage AI pipeline.
 * Routes stage numbers to their corresponding analyzer functions.
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
  2: 'openai',
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
 */
export const STAGE_MODELS = {
  0: 'claude-3-5-haiku-20241022',  // Haiku for preprocessing (200K context, cheap)
  1: 'gpt-5-mini',
  2: 'gpt-5-mini',
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
 * Runs a specific stage of the pipeline
 *
 * @param {number} stageNumber - Stage to run (1-9)
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.previousStages - Outputs from previous stages
 * @returns {Promise<Object>} Stage result with output_data/output_text and usage stats
 * @throws {ProcessingError} If stage execution fails
 *
 * @example
 * const result = await runStage(1, {
 *   episodeId: 'uuid',
 *   transcript: '...',
 *   evergreen: {...},
 *   previousStages: {}
 * });
 */
export async function runStage(stageNumber, context) {
  // Validate stage number
  if (stageNumber < 1 || stageNumber > 9) {
    throw new ProcessingError(
      stageNumber,
      'Unknown',
      `Invalid stage number: ${stageNumber}. Must be 1-9.`
    );
  }

  // Get the analyzer function
  const analyzer = STAGE_ANALYZERS[stageNumber];
  const stageName = STAGE_NAMES[stageNumber];

  if (!analyzer) {
    throw new ProcessingError(
      stageNumber,
      stageName,
      `No analyzer found for stage ${stageNumber}`
    );
  }

  logger.debug('Running stage analyzer', {
    stage: stageNumber,
    name: stageName,
    provider: STAGE_PROVIDERS[stageNumber],
    model: STAGE_MODELS[stageNumber],
  });

  try {
    // Execute the analyzer
    const result = await analyzer(context);

    // Ensure result has required fields
    return {
      output_data: result.output_data || null,
      output_text: result.output_text || null,
      input_tokens: result.input_tokens || 0,
      output_tokens: result.output_tokens || 0,
      cost_usd: result.cost_usd || 0,
    };

  } catch (error) {
    // Wrap in ProcessingError if not already
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
