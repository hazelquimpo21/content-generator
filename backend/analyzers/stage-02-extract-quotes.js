/**
 * ============================================================================
 * STAGE 2: QUOTE EXTRACTION
 * ============================================================================
 * Extracts key verbatim quotes from the transcript that can be used
 * as pull quotes, headlines, and social media content.
 *
 * Input: Transcript + Stage 1 output (episode crux)
 * Output: 5-8 key quotes with metadata (JSON)
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

const QUOTE_EXTRACTION_SCHEMA = {
  name: 'quote_extraction',
  description: 'Key quotes extracted from podcast transcript',
  parameters: {
    type: 'object',
    properties: {
      key_quotes: {
        type: 'array',
        description: '5-8 key verbatim quotes from the transcript',
        items: {
          type: 'object',
          properties: {
            quote: {
              type: 'string',
              description: 'Exact verbatim quote (15-40 words ideal)',
            },
            speaker: {
              type: 'string',
              description: 'Name of who said it (host or guest)',
            },
            timestamp_estimate: {
              type: ['string', 'null'],
              description: 'Rough position in episode (early, middle, near end)',
            },
            significance: {
              type: 'string',
              description: 'Why this quote matters (1-2 sentences)',
            },
            usage_suggestion: {
              type: 'string',
              enum: ['headline', 'pullquote', 'social', 'key_point'],
              description: 'Suggested use for this quote',
            },
          },
          required: ['quote', 'speaker', 'significance', 'usage_suggestion'],
        },
        minItems: 5,
        maxItems: 8,
      },
    },
    required: ['key_quotes'],
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates the quote extraction output
 * @param {Object} data - Parsed output data
 * @throws {ValidationError} If validation fails
 */
function validateOutput(data) {
  if (!data.key_quotes || !Array.isArray(data.key_quotes)) {
    throw new ValidationError('key_quotes', 'Missing or invalid quotes array');
  }

  const quotes = data.key_quotes;

  if (quotes.length < 5) {
    throw new ValidationError('key_quotes', `Need at least 5 quotes, got ${quotes.length}`);
  }

  if (quotes.length > 8) {
    throw new ValidationError('key_quotes', `Maximum 8 quotes, got ${quotes.length}`);
  }

  // Validate each quote
  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i];

    if (!q.quote || q.quote.length < 20) {
      throw new ValidationError(`key_quotes[${i}].quote`, 'Quote too short or missing');
    }

    if (!q.speaker) {
      throw new ValidationError(`key_quotes[${i}].speaker`, 'Speaker is required');
    }

    if (!q.significance) {
      throw new ValidationError(`key_quotes[${i}].significance`, 'Significance is required');
    }

    const validUsages = ['headline', 'pullquote', 'social', 'key_point'];
    if (!validUsages.includes(q.usage_suggestion)) {
      throw new ValidationError(
        `key_quotes[${i}].usage_suggestion`,
        `Invalid usage. Must be one of: ${validUsages.join(', ')}`
      );
    }
  }

  // Check variety in usage suggestions
  const usageCounts = quotes.reduce((acc, q) => {
    acc[q.usage_suggestion] = (acc[q.usage_suggestion] || 0) + 1;
    return acc;
  }, {});

  if (Object.keys(usageCounts).length < 2) {
    logger.warn('Low variety in quote usage suggestions', { usageCounts });
  }

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Extracts key quotes from a podcast transcript
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript text
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.previousStages - Previous stage outputs
 * @returns {Promise<Object>} Extraction result with output_data, tokens, cost
 */
export async function extractQuotes(context) {
  const { episodeId, transcript, evergreen, previousStages } = context;

  logger.stageStart(2, 'Quote Extraction', episodeId);

  // Load prompt with context (includes stage 1 output)
  const prompt = await loadStagePrompt('stage-02-quote-extraction', {
    transcript,
    evergreen,
    previousStages,
  });

  // Call OpenAI with function calling
  const response = await callOpenAIWithFunctions(
    prompt,
    [QUOTE_EXTRACTION_SCHEMA],
    {
      episodeId,
      stageNumber: 2,
      functionCall: 'quote_extraction',
      temperature: 0.6,
    }
  );

  // Validate output
  const outputData = response.functionCall;

  if (!outputData) {
    throw new ValidationError('response', 'No function call output returned');
  }

  validateOutput(outputData);

  logger.stageComplete(2, 'Quote Extraction', episodeId, response.durationMs, response.cost);

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

export default extractQuotes;
