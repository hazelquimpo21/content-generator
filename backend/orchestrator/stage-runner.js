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
// Stage 8 is split into 4 platform-specific analyzers
import {
  generateInstagram,
  generateTwitter,
  generateLinkedIn,
  generateFacebook,
} from '../analyzers/stage-08-social-platform.js';
import { generateEmail } from '../analyzers/stage-09-generate-email.js';

// ============================================================================
// STAGE CONFIGURATION
// ============================================================================

/**
 * Maps stage numbers to their analyzer functions.
 *
 * Stage 0:  Transcript preprocessing (for long transcripts)
 * Stages 1-9: Main content pipeline
 *
 * Stage 8 is special - it has sub-stages for each social platform.
 * Use STAGE_8_SUBSTAGE_ANALYZERS for platform-specific analyzers.
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
  // Stage 8 requires subStage - use STAGE_8_SUBSTAGE_ANALYZERS
  8: null,  // Requires subStage parameter
  9: generateEmail,
};

/**
 * Maps Stage 8 sub-stage identifiers to their platform-specific analyzers.
 */
const STAGE_8_SUBSTAGE_ANALYZERS = {
  instagram: generateInstagram,
  twitter: generateTwitter,
  linkedin: generateLinkedIn,
  facebook: generateFacebook,
};

/**
 * Valid sub-stages for Stage 8
 */
export const STAGE_8_SUBSTAGES = Object.keys(STAGE_8_SUBSTAGE_ANALYZERS);

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
 * Human-readable names for Stage 8 sub-stages.
 */
export const STAGE_8_SUBSTAGE_NAMES = {
  instagram: 'Social Content (Instagram)',
  twitter: 'Social Content (Twitter/X)',
  linkedin: 'Social Content (LinkedIn)',
  facebook: 'Social Content (Facebook)',
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
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.subStage] - Sub-stage for Stage 8 (instagram, twitter, linkedin, facebook)
 * @returns {Promise<Object>} Stage result object:
 *   - output_data: Structured JSON output (most stages)
 *   - output_text: Text/markdown output (stages 6-7)
 *   - input_tokens: Number of tokens sent to AI
 *   - output_tokens: Number of tokens received
 *   - cost_usd: API cost in USD
 *   - subStage: Sub-stage identifier (for Stage 8 only)
 * @throws {ProcessingError} If stage validation or execution fails
 *
 * @example
 * // Regular stage
 * const result = await runStage(1, context);
 *
 * // Stage 8 with sub-stage
 * const result = await runStage(8, context, { subStage: 'instagram' });
 */
export async function runStage(stageNumber, context, options = {}) {
  const { subStage } = options;

  // -------------------------------------------------------------------------
  // Validate stage number
  // -------------------------------------------------------------------------
  if (stageNumber < 0 || stageNumber > 9) {
    logger.error('❌ Invalid stage number requested', {
      stageNumber,
      subStage,
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
  let analyzer;
  let stageName;

  // Stage 8 requires a subStage parameter
  if (stageNumber === 8) {
    if (!subStage) {
      logger.error('❌ Stage 8 requires subStage parameter', {
        stageNumber,
        episodeId: context.episodeId,
        validSubStages: STAGE_8_SUBSTAGES,
      });
      throw new ProcessingError(
        stageNumber,
        'Social Content',
        `Stage 8 requires subStage parameter. Valid values: ${STAGE_8_SUBSTAGES.join(', ')}`
      );
    }

    analyzer = STAGE_8_SUBSTAGE_ANALYZERS[subStage];
    stageName = STAGE_8_SUBSTAGE_NAMES[subStage] || `Social Content (${subStage})`;

    if (!analyzer) {
      logger.error('❌ Invalid subStage for Stage 8', {
        stageNumber,
        subStage,
        episodeId: context.episodeId,
        validSubStages: STAGE_8_SUBSTAGES,
      });
      throw new ProcessingError(
        stageNumber,
        stageName,
        `Invalid subStage: ${subStage}. Valid values: ${STAGE_8_SUBSTAGES.join(', ')}`
      );
    }
  } else {
    analyzer = STAGE_ANALYZERS[stageNumber];
    stageName = STAGE_NAMES[stageNumber];
  }

  const provider = STAGE_PROVIDERS[stageNumber];
  const model = STAGE_MODELS[stageNumber];
  const phase = STAGE_PHASES[stageNumber];

  // Verify analyzer exists
  if (!analyzer) {
    logger.error('❌ No analyzer found for stage', {
      stageNumber,
      subStage,
      stageName,
      episodeId: context.episodeId,
    });
    throw new ProcessingError(
      stageNumber,
      stageName,
      `No analyzer found for stage ${stageNumber}${subStage ? ` (${subStage})` : ''}`
    );
  }

  // -------------------------------------------------------------------------
  // Log stage execution start
  // -------------------------------------------------------------------------
  logger.debug('🔧 Running stage analyzer', {
    stage: stageNumber,
    subStage: subStage || null,
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
      subStage: subStage || null,
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
      // Include subStage for Stage 8
      subStage: subStage || null,
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    // -----------------------------------------------------------------------
    // Log failure with context
    // -----------------------------------------------------------------------
    logger.error('❌ Stage analyzer failed', {
      stage: stageNumber,
      subStage: subStage || null,
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
  STAGE_8_SUBSTAGES,
  STAGE_8_SUBSTAGE_NAMES,
};
