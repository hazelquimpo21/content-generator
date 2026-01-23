/**
 * ============================================================================
 * STAGE 1: EPISODE SUMMARY
 * ============================================================================
 * Creates an in-depth summary and episode crux using the themes from Stage 0.
 *
 * Purpose:
 * --------
 * Transform the transcript and Stage 0 themes into:
 * - An in-depth narrative summary (400-600 words)
 * - A distilled episode crux (2-3 sentences) - CANONICAL SUMMARY for downstream
 *
 * Input:
 * ------
 * - Transcript text
 * - Stage 0 content brief (themes, metadata)
 * - Evergreen content (therapist profile, podcast info)
 *
 * Output:
 * -------
 * - output_data: { summary, episode_crux }
 * - output_text: Human-readable summary document
 *
 * Model: GPT-5 mini (OpenAI) with function calling
 *
 * ⭐ CANONICAL SUMMARY SOURCE ⭐
 * The episode_crux from this stage is used by all downstream stages.
 * ============================================================================
 */

import { callOpenAIWithFunctions } from '../lib/api-client-openai.js';
import { loadStagePrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// FUNCTION SCHEMA FOR STRUCTURED OUTPUT
// ============================================================================

const EPISODE_SUMMARY_SCHEMA = {
  name: 'episode_summary',
  description: 'In-depth episode summary and core insight',
  parameters: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'In-depth narrative summary (400-600 words) weaving together the episode themes',
      },
      episode_crux: {
        type: 'string',
        description: 'The single most important insight in 2-3 sentences - specific, challenging, memorable',
      },
    },
    required: ['summary', 'episode_crux'],
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates the episode summary output
 * @param {Object} data - Structured output from AI
 * @throws {ValidationError} If validation fails
 * @returns {boolean} True if validation passes
 */
function validateOutput(data) {
  logger.debug('Validating episode summary output', {
    hasSummary: !!data.summary,
    hasEpisodeCrux: !!data.episode_crux,
    summaryLength: data.summary?.length,
    cruxLength: data.episode_crux?.length,
  });

  // Validate summary
  if (!data.summary) {
    throw new ValidationError('summary', 'Summary is required');
  }

  const summaryWords = data.summary.split(/\s+/).length;
  if (summaryWords < 300) {
    throw new ValidationError('summary', `Summary too short (${summaryWords} words, need at least 300)`);
  }

  if (summaryWords > 800) {
    logger.warn('Summary longer than expected', { summaryWords });
    // Don't throw - just warn
  }

  // Validate episode_crux
  if (!data.episode_crux) {
    throw new ValidationError('episode_crux', 'Episode crux is required');
  }

  if (data.episode_crux.length < 50) {
    throw new ValidationError('episode_crux', `Episode crux too short (${data.episode_crux.length} chars, need at least 50)`);
  }

  if (data.episode_crux.length > 500) {
    logger.warn('Episode crux longer than expected', { cruxLength: data.episode_crux.length });
    // Don't throw - just warn
  }

  logger.info('Episode summary validation passed', {
    summaryWords,
    cruxLength: data.episode_crux.length,
  });

  return true;
}

/**
 * Formats the output into human-readable text
 * @param {Object} data - Structured summary data
 * @returns {string} Human-readable markdown
 */
function formatHumanReadableOutput(data) {
  return [
    '## Episode Summary',
    '',
    data.summary,
    '',
    '## Episode Crux',
    '',
    data.episode_crux,
  ].join('\n');
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Creates an in-depth episode summary using themes from Stage 0
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript text
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.previousStages - Previous stage outputs (must include Stage 0)
 * @returns {Promise<Object>} Summary result with output_data and output_text
 */
export async function createEpisodeSummary(context) {
  const { episodeId, transcript, evergreen, previousStages = {} } = context;

  logger.stageStart(1, 'Episode Summary', episodeId);

  // Validate we have Stage 0 output
  const stage0Output = previousStages[0];
  if (!stage0Output) {
    logger.warn('Stage 1: No Stage 0 output found, proceeding without themes', { episodeId });
  }

  // Calculate transcript metrics
  const transcriptWords = transcript?.split(/\s+/).length || 0;

  logger.info('Stage 1: Creating episode summary', {
    episodeId,
    transcriptWords,
    hasStage0Output: !!stage0Output,
    stage0Themes: stage0Output?.themes?.length || 0,
  });

  // Validate transcript
  if (!transcript || transcriptWords < 100) {
    throw new ValidationError('transcript', 'Transcript is required');
  }

  // Load prompt with context
  const prompt = await loadStagePrompt('stage-01-episode-summary', {
    transcript,
    evergreen,
    previousStages,
  });

  logger.debug('Stage 1: Prompt loaded', {
    episodeId,
    promptLength: prompt.length,
  });

  // Call OpenAI with function calling
  logger.info('Stage 1: Calling OpenAI API', {
    episodeId,
    functionName: 'episode_summary',
    model: 'gpt-5-mini',
  });

  let response;
  try {
    response = await callOpenAIWithFunctions(
      prompt,
      [EPISODE_SUMMARY_SCHEMA],
      {
        episodeId,
        stageNumber: 1,
        functionCall: 'episode_summary',
        temperature: 0.6, // Balance creativity and consistency
      }
    );
  } catch (apiError) {
    logger.error('Stage 1: OpenAI API call failed', {
      episodeId,
      errorMessage: apiError.message,
      errorStatus: apiError.status,
    });
    throw apiError;
  }

  logger.info('Stage 1: Received response', {
    episodeId,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    durationMs: response.durationMs,
    cost: response.cost,
  });

  // Extract structured output
  const outputData = response.functionCall;

  if (!outputData) {
    throw new ValidationError('response', 'No function call output returned');
  }

  // Validate output
  validateOutput(outputData);

  // Generate human-readable output
  const outputText = formatHumanReadableOutput(outputData);

  logger.stageComplete(1, 'Episode Summary', episodeId, response.durationMs, response.cost);
  logger.info('Stage 1: Summary created', {
    episodeId,
    summaryWords: outputData.summary.split(/\s+/).length,
    cruxLength: outputData.episode_crux.length,
  });

  return {
    output_data: outputData,
    output_text: outputText,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

// Export alias for backward compatibility
export { createEpisodeSummary as analyzeTranscript };
export default createEpisodeSummary;
