/**
 * ============================================================================
 * TRANSCRIPT HANDLER MODULE
 * ============================================================================
 * Handles long podcast transcripts by estimating tokens and truncating
 * to fit within model context limits.
 *
 * Features:
 * - Token estimation for transcripts
 * - Smart truncation with context preservation
 * - Chunking support for very long transcripts
 * - Logging for visibility into transcript handling
 *
 * Usage:
 *   import { prepareTranscript, estimateTranscriptTokens } from './lib/transcript-handler.js';
 *   const prepared = prepareTranscript(transcript, { maxTokens: 60000 });
 * ============================================================================
 */

import logger from './logger.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Model context limits (tokens)
 * Leave headroom for prompt templates, system messages, and output
 */
const MODEL_LIMITS = {
  'gpt-5-mini': 128000,      // GPT-5-mini has 128K context
  'gpt-4o-mini': 128000,     // GPT-4o-mini has 128K context
  'gpt-4o': 128000,          // GPT-4o has 128K context
  'claude-sonnet-4': 200000, // Claude Sonnet 4 has 200K context
  'claude-3-5-sonnet': 200000,
};

/**
 * Default maximum tokens to allocate for transcript
 * Leaves room for:
 * - Prompt template: ~2,000 tokens
 * - Previous stage outputs: ~5,000 tokens
 * - System message: ~500 tokens
 * - Output buffer: ~4,000 tokens
 * - Safety margin: ~8,500 tokens
 * Total reserved: ~20,000 tokens
 */
const DEFAULT_MAX_TRANSCRIPT_TOKENS = 100000; // 100K for transcript in 128K context

/**
 * Minimum tokens needed for a useful transcript analysis
 */
const MIN_TRANSCRIPT_TOKENS = 500;

/**
 * Tokens per character ratio (approximate for English)
 * More accurate: 1 token ≈ 4 characters for GPT models
 */
const TOKENS_PER_CHAR = 0.25;

/**
 * Tokens per word ratio (approximate for English)
 * More accurate: 1 token ≈ 0.75 words (or ~1.3 tokens per word)
 */
const TOKENS_PER_WORD = 1.3;

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Estimates token count for a transcript
 * Uses word count as it's more accurate than character count
 *
 * @param {string} text - Transcript text
 * @returns {number} Estimated token count
 */
export function estimateTranscriptTokens(text) {
  if (!text) return 0;

  // Count words (split on whitespace)
  const words = text.split(/\s+/).filter(w => w.length > 0).length;

  // Estimate tokens (~1.3 tokens per word for English)
  return Math.ceil(words * TOKENS_PER_WORD);
}

/**
 * Estimates character count that would fit within token limit
 *
 * @param {number} maxTokens - Maximum tokens allowed
 * @returns {number} Approximate character count
 */
export function tokensToChars(maxTokens) {
  return Math.floor(maxTokens / TOKENS_PER_CHAR);
}

/**
 * Estimates word count that would fit within token limit
 *
 * @param {number} maxTokens - Maximum tokens allowed
 * @returns {number} Approximate word count
 */
export function tokensToWords(maxTokens) {
  return Math.floor(maxTokens / TOKENS_PER_WORD);
}

// ============================================================================
// TRANSCRIPT TRUNCATION
// ============================================================================

/**
 * Truncates transcript to fit within token limit while preserving context
 *
 * Strategy:
 * 1. If transcript fits, return as-is
 * 2. If too long, take beginning + end portions (preserves intro/conclusion)
 * 3. Add truncation marker to indicate content was removed
 *
 * @param {string} transcript - Full transcript text
 * @param {Object} options - Truncation options
 * @param {number} [options.maxTokens] - Maximum tokens for transcript
 * @param {string} [options.model='gpt-5-mini'] - Model to use for limit calculation
 * @param {number} [options.beginningRatio=0.6] - Ratio of beginning to keep (0-1)
 * @returns {Object} Result with truncated text and metadata
 */
export function truncateTranscript(transcript, options = {}) {
  const {
    maxTokens = DEFAULT_MAX_TRANSCRIPT_TOKENS,
    model = 'gpt-5-mini',
    beginningRatio = 0.6, // Keep 60% from beginning, 40% from end
  } = options;

  if (!transcript) {
    return {
      text: '',
      originalTokens: 0,
      truncatedTokens: 0,
      wasTruncated: false,
      truncationDetails: null,
    };
  }

  const originalTokens = estimateTranscriptTokens(transcript);

  // If fits, return as-is
  if (originalTokens <= maxTokens) {
    logger.debug('Transcript fits within token limit', {
      originalTokens,
      maxTokens,
      model,
    });

    return {
      text: transcript,
      originalTokens,
      truncatedTokens: originalTokens,
      wasTruncated: false,
      truncationDetails: null,
    };
  }

  // Need to truncate
  logger.warn('Transcript exceeds token limit, truncating', {
    originalTokens,
    maxTokens,
    excessTokens: originalTokens - maxTokens,
    model,
  });

  // Calculate how many tokens we can keep from beginning and end
  const reserveForMarker = 50; // Reserve tokens for truncation marker
  const usableTokens = maxTokens - reserveForMarker;
  const beginningTokens = Math.floor(usableTokens * beginningRatio);
  const endingTokens = usableTokens - beginningTokens;

  // Convert to approximate word counts
  const beginningWords = tokensToWords(beginningTokens);
  const endingWords = tokensToWords(endingTokens);

  // Split transcript into words
  const words = transcript.split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;

  // Extract beginning and ending portions
  const beginningPortion = words.slice(0, beginningWords).join(' ');
  const endingPortion = words.slice(-endingWords).join(' ');

  // Create truncation marker with context
  const removedWords = totalWords - beginningWords - endingWords;
  const removedPercent = Math.round((removedWords / totalWords) * 100);
  const truncationMarker = `\n\n[... TRANSCRIPT TRUNCATED: ~${removedWords.toLocaleString()} words (${removedPercent}% of transcript) removed to fit context limit. The middle portion of the conversation has been omitted. ...]\n\n`;

  // Combine portions
  const truncatedText = beginningPortion + truncationMarker + endingPortion;
  const truncatedTokens = estimateTranscriptTokens(truncatedText);

  logger.info('Transcript truncated successfully', {
    originalTokens,
    truncatedTokens,
    removedWords,
    removedPercent,
    beginningWords,
    endingWords,
  });

  return {
    text: truncatedText,
    originalTokens,
    truncatedTokens,
    wasTruncated: true,
    truncationDetails: {
      removedWords,
      removedPercent,
      beginningWords,
      endingWords,
      strategy: 'beginning-end-preserve',
    },
  };
}

// ============================================================================
// TRANSCRIPT PREPARATION (MAIN ENTRY POINT)
// ============================================================================

/**
 * Prepares a transcript for AI analysis
 * Handles token estimation, truncation, and logging
 *
 * @param {string} transcript - Full transcript text
 * @param {Object} options - Preparation options
 * @param {number} [options.maxTokens] - Maximum tokens for transcript
 * @param {string} [options.model='gpt-5-mini'] - Target model
 * @param {string} [options.stageNumber] - Stage number for logging
 * @param {string} [options.episodeId] - Episode ID for logging
 * @returns {Object} Prepared transcript with metadata
 *
 * @example
 * const prepared = prepareTranscript(longTranscript, {
 *   maxTokens: 60000,
 *   stageNumber: 1,
 *   episodeId: 'uuid'
 * });
 * console.log(prepared.text); // Possibly truncated transcript
 * console.log(prepared.wasTruncated); // true if truncation occurred
 */
export function prepareTranscript(transcript, options = {}) {
  const {
    maxTokens = DEFAULT_MAX_TRANSCRIPT_TOKENS,
    model = 'gpt-5-mini',
    stageNumber = null,
    episodeId = null,
  } = options;

  // Validate input
  if (!transcript || typeof transcript !== 'string') {
    logger.warn('Invalid transcript provided', {
      type: typeof transcript,
      stageNumber,
      episodeId,
    });
    return {
      text: '',
      originalTokens: 0,
      truncatedTokens: 0,
      wasTruncated: false,
      truncationDetails: null,
      isValid: false,
      validationError: 'Transcript is empty or invalid',
    };
  }

  // Check minimum length
  const originalTokens = estimateTranscriptTokens(transcript);
  if (originalTokens < MIN_TRANSCRIPT_TOKENS) {
    logger.warn('Transcript may be too short for meaningful analysis', {
      originalTokens,
      minRequired: MIN_TRANSCRIPT_TOKENS,
      stageNumber,
      episodeId,
    });
  }

  // Truncate if needed
  const result = truncateTranscript(transcript, {
    maxTokens,
    model,
  });

  // Log preparation summary
  logger.debug('Transcript prepared for analysis', {
    originalTokens: result.originalTokens,
    truncatedTokens: result.truncatedTokens,
    wasTruncated: result.wasTruncated,
    originalChars: transcript.length,
    truncatedChars: result.text.length,
    stageNumber,
    episodeId,
  });

  return {
    ...result,
    isValid: true,
    validationError: null,
  };
}

// ============================================================================
// CONTEXT-AWARE TOKEN BUDGET
// ============================================================================

/**
 * Calculates available tokens for transcript based on stage context
 * Different stages have different token budgets based on what else is in the prompt
 *
 * @param {number} stageNumber - Stage number (1-9)
 * @param {string} model - Model being used
 * @param {Object} previousStages - Previous stage outputs (to estimate their token usage)
 * @returns {number} Available tokens for transcript
 */
export function calculateTranscriptBudget(stageNumber, model = 'gpt-5-mini', previousStages = {}) {
  // Get model limit
  const modelLimit = MODEL_LIMITS[model] || 128000;

  // Reserve tokens for different parts of the prompt
  const reserves = {
    promptTemplate: 2000,      // Stage prompt template
    systemMessage: 500,        // System message
    outputBuffer: 4096,        // Max output tokens
    safetyMargin: 5000,        // Safety margin for token estimation errors
  };

  // Calculate previous stage output tokens
  let previousStageTokens = 0;
  for (const [stage, output] of Object.entries(previousStages)) {
    if (output) {
      const outputText = typeof output === 'string' ? output : JSON.stringify(output);
      previousStageTokens += estimateTranscriptTokens(outputText);
    }
  }

  // Later stages have more previous stage context
  const stageContextMultiplier = Math.min(stageNumber * 0.1, 0.5); // Up to 50% more context

  const totalReserved =
    reserves.promptTemplate +
    reserves.systemMessage +
    reserves.outputBuffer +
    reserves.safetyMargin +
    previousStageTokens +
    Math.floor(previousStageTokens * stageContextMultiplier);

  const availableForTranscript = modelLimit - totalReserved;

  logger.debug('Calculated transcript token budget', {
    stageNumber,
    model,
    modelLimit,
    totalReserved,
    previousStageTokens,
    availableForTranscript,
  });

  // Ensure we have at least some minimum budget
  return Math.max(availableForTranscript, MIN_TRANSCRIPT_TOKENS);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  estimateTranscriptTokens,
  tokensToChars,
  tokensToWords,
  truncateTranscript,
  prepareTranscript,
  calculateTranscriptBudget,
  DEFAULT_MAX_TRANSCRIPT_TOKENS,
  MIN_TRANSCRIPT_TOKENS,
  MODEL_LIMITS,
};
