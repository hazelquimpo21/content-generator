/**
 * ============================================================================
 * STAGE 1: TRANSCRIPT ANALYSIS
 * ============================================================================
 * Analyzes the podcast transcript to extract episode metadata, guest info,
 * and the core "crux" of the episode.
 *
 * Input: Raw transcript + evergreen content
 * Output: Structured episode analysis (JSON)
 * Model: GPT-5 mini (OpenAI)
 * ============================================================================
 */

import { callOpenAIWithFunctions } from '../lib/api-client-openai.js';
import { loadStagePrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// FUNCTION SCHEMA FOR STRUCTURED OUTPUT
// ============================================================================

const EPISODE_ANALYSIS_SCHEMA = {
  name: 'episode_analysis',
  description: 'Structured analysis of podcast episode metadata and content',
  parameters: {
    type: 'object',
    properties: {
      episode_basics: {
        type: 'object',
        description: 'Core episode information',
        properties: {
          title: {
            type: ['string', 'null'],
            description: 'Episode title (stated or inferred), 40-60 characters',
          },
          date: {
            type: ['string', 'null'],
            description: 'Recording or release date in YYYY-MM-DD format',
          },
          duration_estimate: {
            type: ['string', 'null'],
            description: 'Estimated duration (e.g., "45 minutes")',
          },
          main_topics: {
            type: 'array',
            items: { type: 'string' },
            minItems: 3,
            maxItems: 5,
            description: 'Main topics discussed (specific, not generic)',
          },
        },
        required: ['main_topics'],
      },
      guest_info: {
        type: ['object', 'null'],
        description: 'Guest information (null if no guest)',
        properties: {
          name: {
            type: 'string',
            description: 'Guest full name',
          },
          credentials: {
            type: ['string', 'null'],
            description: 'Professional credentials (PhD, LMFT, etc.)',
          },
          expertise: {
            type: 'string',
            description: 'Area of professional expertise',
          },
          website: {
            type: ['string', 'null'],
            description: 'Website URL if mentioned',
          },
        },
        required: ['name', 'expertise'],
      },
      episode_crux: {
        type: 'string',
        description: 'Core insight/takeaway in 2-3 sentences (not just description)',
      },
    },
    required: ['episode_basics', 'episode_crux'],
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates the episode analysis output
 * @param {Object} data - Parsed output data
 * @throws {ValidationError} If validation fails
 */
function validateOutput(data) {
  // Check required fields
  if (!data.episode_basics) {
    throw new ValidationError('episode_basics', 'Missing required field');
  }

  if (!data.episode_crux) {
    throw new ValidationError('episode_crux', 'Missing required field');
  }

  // Check main_topics
  const topics = data.episode_basics.main_topics;
  if (!Array.isArray(topics) || topics.length < 3) {
    throw new ValidationError('main_topics', 'Must have at least 3 topics');
  }

  if (topics.length > 5) {
    throw new ValidationError('main_topics', 'Must have at most 5 topics');
  }

  // Check episode_crux is substantive
  if (data.episode_crux.length < 50) {
    throw new ValidationError('episode_crux', 'Crux is too short - needs more substance');
  }

  // Check guest_info structure if present
  if (data.guest_info !== null) {
    if (!data.guest_info.name) {
      throw new ValidationError('guest_info.name', 'Guest name is required if guest exists');
    }
    if (!data.guest_info.expertise) {
      throw new ValidationError('guest_info.expertise', 'Guest expertise is required');
    }
  }

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Analyzes a podcast transcript and extracts structured metadata
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript text
 * @param {Object} context.evergreen - Evergreen content settings
 * @returns {Promise<Object>} Analysis result with output_data, tokens, cost
 *
 * @example
 * const result = await analyzeTranscript({
 *   episodeId: 'uuid',
 *   transcript: '...',
 *   evergreen: { therapist_profile: {...} }
 * });
 */
export async function analyzeTranscript(context) {
  const { episodeId, transcript, evergreen } = context;

  logger.stageStart(1, 'Transcript Analysis', episodeId);

  // Load prompt with context
  const prompt = await loadStagePrompt('stage-01-transcript-analysis', {
    transcript,
    evergreen,
    previousStages: {},
  });

  // Call OpenAI with function calling for structured output
  const response = await callOpenAIWithFunctions(
    prompt,
    [EPISODE_ANALYSIS_SCHEMA],
    {
      episodeId,
      stageNumber: 1,
      functionCall: 'episode_analysis',
      temperature: 0.5, // Lower temperature for consistent extraction
    }
  );

  // Validate the output
  const outputData = response.functionCall;

  if (!outputData) {
    throw new ValidationError('response', 'No function call output returned');
  }

  validateOutput(outputData);

  logger.stageComplete(1, 'Transcript Analysis', episodeId, response.durationMs, response.cost);

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

export default analyzeTranscript;
