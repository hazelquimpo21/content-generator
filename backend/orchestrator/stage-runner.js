/**
 * ============================================================================
 * STAGE RUNNER MODULE
 * ============================================================================
 * Executes individual stages (tasks) of the AI pipeline.
 *
 * This module is the bridge between the phase executor and the actual
 * analyzer functions. It handles:
 * - Stage number validation
 * - Analyzer function lookup and execution
 * - Result normalization
 * - Error wrapping with context
 *
 * Architecture Context:
 * ---------------------
 * The pipeline is organized into 4 phases, each containing multiple tasks:
 *
 *   PHASE 1 (Extract):    Stage 1 (analyze), Stage 2 (quotes)
 *   PHASE 2 (Plan):       Stage 3 (outline), Stage 4 (paragraphs), Stage 5 (headlines)
 *   PHASE 3 (Write):      Stage 6 (draft), Stage 7 (refine)
 *   PHASE 4 (Distribute): Stage 8 (social), Stage 9 (email)
 *   PRE-GATE:             Stage 0 (preprocess) - conditional
 *
 * Stage-to-Model Mapping:
 * -----------------------
 * Stage 0:   Claude Haiku 3.5     (preprocessing, 200K context)
 * Stage 1:   GPT-5 mini           (transcript analysis)
 * Stage 2:   Claude Haiku 3.5     (quote extraction)
 * Stage 3-6: GPT-5 mini           (outlining and drafting)
 * Stage 7-9: Claude Sonnet 4      (refinement and distribution)
 *
 * Design Principle - Focused Analyzers:
 * -------------------------------------
 * Each stage analyzer does ONE thing well:
 * - Stage 1: Extract metadata and episode_crux (CANONICAL SUMMARY)
 * - Stage 2: Extract verbatim quotes (CANONICAL QUOTES SOURCE)
 * - Stage 3: Create high-level blog outline
 * - Stage 4: Detail paragraph-level structure
 * - Stage 5: Generate headline options
 * - Stage 6: Write the complete draft
 * - Stage 7: Refine and polish prose
 * - Stage 8: Generate social content
 * - Stage 9: Generate email content
 *
 * Usage:
 *   import { runStage, STAGE_NAMES } from './stage-runner.js';
 *   const result = await runStage(1, context);
 *
 * ============================================================================
 */

import logger from '../lib/logger.js';
import { ProcessingError } from '../lib/errors.js';

// ============================================================================
// ANALYZER IMPORTS
// ============================================================================
// Each analyzer is a focused module that handles one specific task.
// ============================================================================

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
 * Maps stage numbers to their analyzer functions.
 *
 * Stage 0:  Transcript preprocessing (for long transcripts)
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
 * Human-readable names for each stage.
 * Used in logging and progress reporting.
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
 * AI provider for each stage.
 *
 * Stages using Anthropic (Claude):
 * - Stage 0: Haiku for preprocessing (200K context, cheap)
 * - Stage 2: Haiku for quote extraction (fast, accurate)
 * - Stage 7-9: Sonnet for refinement and creative content
 *
 * Stages using OpenAI (GPT-5 mini):
 * - Stage 1: Transcript analysis
 * - Stage 3-6: Outlining and drafting
 */
export const STAGE_PROVIDERS = {
  0: 'anthropic',  // Claude Haiku - 200K context for long transcripts
  1: 'openai',     // GPT-5 mini - structured extraction
  2: 'anthropic',  // Claude Haiku - fast, accurate quote extraction
  3: 'openai',     // GPT-5 mini - outline creation
  4: 'openai',     // GPT-5 mini - paragraph details
  5: 'openai',     // GPT-5 mini - headline generation
  6: 'openai',     // GPT-5 mini - draft writing
  7: 'anthropic',  // Claude Sonnet - prose refinement
  8: 'anthropic',  // Claude Sonnet - social content
  9: 'anthropic',  // Claude Sonnet - email content
};

/**
 * Model identifiers for each stage.
 *
 * Model selection rationale:
 * - Haiku: Fast, cheap, excellent for extraction tasks
 * - GPT-5 mini: Good balance of quality and cost for structured work
 * - Sonnet: High quality for refined, creative output
 */
export const STAGE_MODELS = {
  0: 'claude-3-5-haiku-20241022',   // Preprocessing (200K context, cheap)
  1: 'gpt-5-mini',                   // Analysis
  2: 'claude-3-5-haiku-20241022',   // Quote extraction (accurate)
  3: 'gpt-5-mini',                   // High-level outline
  4: 'gpt-5-mini',                   // Paragraph outlines
  5: 'gpt-5-mini',                   // Headlines
  6: 'gpt-5-mini',                   // Draft writing
  7: 'claude-sonnet-4-20250514',    // Refinement (quality matters)
  8: 'claude-sonnet-4-20250514',    // Social content (creative)
  9: 'claude-sonnet-4-20250514',    // Email content (creative)
};

/**
 * Phase mapping for each stage.
 * Used for progress tracking and resume capability.
 */
export const STAGE_PHASES = {
  0: 'pregate',
  1: 'extract',
  2: 'extract',
  3: 'plan',
  4: 'plan',
  5: 'plan',
  6: 'write',
  7: 'write',
  8: 'distribute',
  9: 'distribute',
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Runs a specific stage of the pipeline.
 *
 * This function is the bridge between the phase executor and individual
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
 *   - output_data: Structured JSON output (most stages)
 *   - output_text: Text/markdown output (stages 6-7)
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
  // -------------------------------------------------------------------------
  // Validate stage number
  // -------------------------------------------------------------------------
  if (stageNumber < 0 || stageNumber > 9) {
    logger.error('❌ Invalid stage number requested', {
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

  // -------------------------------------------------------------------------
  // Get analyzer and metadata
  // -------------------------------------------------------------------------
  const analyzer = STAGE_ANALYZERS[stageNumber];
  const stageName = STAGE_NAMES[stageNumber];
  const provider = STAGE_PROVIDERS[stageNumber];
  const model = STAGE_MODELS[stageNumber];
  const phase = STAGE_PHASES[stageNumber];

  // Verify analyzer exists
  if (!analyzer) {
    logger.error('❌ No analyzer found for stage', {
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

  // -------------------------------------------------------------------------
  // Log stage execution start
  // -------------------------------------------------------------------------
  logger.debug('🔧 Running stage analyzer', {
    stage: stageNumber,
    name: stageName,
    phase,
    provider,
    model,
    episodeId: context.episodeId,
    transcriptLength: context.transcript?.length,
    previousStagesCount: Object.keys(context.previousStages || {}).length,
  });

  const startTime = Date.now();

  try {
    // -----------------------------------------------------------------------
    // Execute the analyzer
    // -----------------------------------------------------------------------
    const result = await analyzer(context);

    const durationMs = Date.now() - startTime;

    // -----------------------------------------------------------------------
    // Log successful completion
    // -----------------------------------------------------------------------
    logger.debug('✅ Stage analyzer completed', {
      stage: stageNumber,
      name: stageName,
      phase,
      episodeId: context.episodeId,
      durationMs,
      inputTokens: result.input_tokens,
      outputTokens: result.output_tokens,
      costUsd: result.cost_usd,
      hasOutputData: !!result.output_data,
      hasOutputText: !!result.output_text,
    });

    // -----------------------------------------------------------------------
    // Normalize and return result
    // -----------------------------------------------------------------------
    return {
      output_data: result.output_data || null,
      output_text: result.output_text || null,
      input_tokens: result.input_tokens || 0,
      output_tokens: result.output_tokens || 0,
      cost_usd: result.cost_usd || 0,
      // Include skip flag if present (Stage 0 may be skipped)
      skipped: result.skipped || false,
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    // -----------------------------------------------------------------------
    // Log failure with context
    // -----------------------------------------------------------------------
    logger.error('❌ Stage analyzer failed', {
      stage: stageNumber,
      name: stageName,
      phase,
      provider,
      model,
      episodeId: context.episodeId,
      durationMs,
      errorType: error.name,
      errorMessage: error.message,
      isRetryable: error.retryable ?? false,
    });

    // -----------------------------------------------------------------------
    // Wrap in ProcessingError if not already
    // -----------------------------------------------------------------------
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets metadata about a specific stage.
 *
 * @param {number} stageNumber - Stage number (0-9)
 * @returns {Object} Stage metadata including name, provider, model, phase
 *
 * @example
 * const info = getStageInfo(1);
 * // info = {
 * //   number: 1,
 * //   name: 'Transcript Analysis',
 * //   provider: 'openai',
 * //   model: 'gpt-5-mini',
 * //   phase: 'extract'
 * // }
 */
export function getStageInfo(stageNumber) {
  return {
    number: stageNumber,
    name: STAGE_NAMES[stageNumber] || 'Unknown',
    provider: STAGE_PROVIDERS[stageNumber] || 'unknown',
    model: STAGE_MODELS[stageNumber] || 'unknown',
    phase: STAGE_PHASES[stageNumber] || 'unknown',
  };
}

/**
 * Lists all stages with their metadata.
 *
 * @returns {Array<Object>} Array of stage info objects
 *
 * @example
 * const stages = listStages();
 * // stages = [
 * //   { number: 0, name: 'Transcript Preprocessing', ... },
 * //   { number: 1, name: 'Transcript Analysis', ... },
 * //   ...
 * // ]
 */
export function listStages() {
  return Object.keys(STAGE_NAMES).map(num => getStageInfo(parseInt(num)));
}

/**
 * Gets all stages for a specific phase.
 *
 * @param {string} phaseId - Phase identifier (e.g., 'extract', 'plan')
 * @returns {Array<Object>} Array of stage info objects in that phase
 *
 * @example
 * const extractStages = getStagesForPhase('extract');
 * // extractStages = [
 * //   { number: 1, name: 'Transcript Analysis', ... },
 * //   { number: 2, name: 'Quote Extraction', ... }
 * // ]
 */
export function getStagesForPhase(phaseId) {
  return Object.entries(STAGE_PHASES)
    .filter(([_, phase]) => phase === phaseId)
    .map(([num, _]) => getStageInfo(parseInt(num)));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  runStage,
  getStageInfo,
  listStages,
  getStagesForPhase,
  STAGE_NAMES,
  STAGE_PROVIDERS,
  STAGE_MODELS,
  STAGE_PHASES,
};
