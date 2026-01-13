/**
 * ============================================================================
 * STAGE 1: TRANSCRIPT ANALYSIS
 * ============================================================================
 * Analyzes the podcast transcript to extract episode metadata, guest info,
 * and the core "crux" of the episode.
 *
 * Purpose:
 * --------
 * This is the first analysis stage that provides foundational information
 * used by all subsequent stages. It extracts:
 * - Episode basics (title, topics, duration estimate)
 * - Guest information (name, credentials, expertise)
 * - Episode crux (the core insight/takeaway)
 *
 * Input:
 * ------
 * - Raw transcript text (or preprocessed summary from Stage 0)
 * - Evergreen content (therapist profile, podcast info)
 *
 * Output:
 * -------
 * Structured JSON via OpenAI function calling (tool_use):
 * {
 *   episode_basics: { title, date, duration_estimate, main_topics[] },
 *   guest_info: { name, credentials, expertise, website } | null,
 *   episode_crux: "2-3 sentence core insight"
 * }
 *
 * Model: GPT-5 mini (OpenAI) with function calling (tool_use)
 * Temperature: 0.5 (balanced for consistent extraction)
 *
 * API Notes:
 * ----------
 * - Uses OpenAI's tool_use (function calling) for guaranteed structured output
 * - GPT-5 models require `max_completion_tokens` instead of `max_tokens`
 * - The function schema enforces the expected JSON structure
 *
 * Dependencies:
 * - Stage 0 output (if transcript was preprocessed)
 * - Evergreen content for context
 *
 * Error Handling:
 * ---------------
 * - Validates required fields (episode_basics, episode_crux)
 * - Checks array lengths (3-5 topics)
 * - Verifies crux substantiveness (>50 chars)
 * - Throws ValidationError with details on failure
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
 * Validates the episode analysis output from the AI.
 *
 * This ensures the AI returned properly structured data that downstream
 * stages can rely on. Validation checks:
 * - Required fields are present (episode_basics, episode_crux)
 * - main_topics array has 3-5 items
 * - episode_crux is substantive (>50 chars)
 * - guest_info has required fields if present
 *
 * @param {Object} data - Parsed output data from AI
 * @returns {boolean} True if validation passes
 * @throws {ValidationError} If any validation check fails
 *
 * @example
 * validateOutput({
 *   episode_basics: { main_topics: ['topic1', 'topic2', 'topic3'] },
 *   episode_crux: 'A substantive insight about the episode...',
 *   guest_info: null
 * }); // Returns true
 */
function validateOutput(data) {
  // Check required top-level fields
  if (!data.episode_basics) {
    logger.warn('Validation failed: missing episode_basics', { data: JSON.stringify(data).substring(0, 200) });
    throw new ValidationError('episode_basics', 'Missing required field');
  }

  if (!data.episode_crux) {
    logger.warn('Validation failed: missing episode_crux', { hasBasics: !!data.episode_basics });
    throw new ValidationError('episode_crux', 'Missing required field');
  }

  // Validate main_topics array - must have 3-5 specific topics
  const topics = data.episode_basics.main_topics;
  if (!Array.isArray(topics)) {
    logger.warn('Validation failed: main_topics is not an array', { topicsType: typeof topics });
    throw new ValidationError('main_topics', 'Must be an array');
  }

  if (topics.length < 3) {
    logger.warn('Validation failed: too few topics', { count: topics.length, topics });
    throw new ValidationError('main_topics', `Must have at least 3 topics (got ${topics.length})`);
  }

  if (topics.length > 5) {
    logger.warn('Validation failed: too many topics', { count: topics.length });
    throw new ValidationError('main_topics', `Must have at most 5 topics (got ${topics.length})`);
  }

  // Validate episode_crux is substantive (not just a title or fragment)
  if (data.episode_crux.length < 50) {
    logger.warn('Validation failed: episode_crux too short', {
      length: data.episode_crux.length,
      crux: data.episode_crux,
    });
    throw new ValidationError('episode_crux', `Crux is too short (${data.episode_crux.length} chars) - needs more substance`);
  }

  // Validate guest_info structure if guest is present
  if (data.guest_info !== null && data.guest_info !== undefined) {
    if (!data.guest_info.name) {
      logger.warn('Validation failed: guest missing name', { guest: data.guest_info });
      throw new ValidationError('guest_info.name', 'Guest name is required if guest exists');
    }
    if (!data.guest_info.expertise) {
      logger.warn('Validation failed: guest missing expertise', { guestName: data.guest_info.name });
      throw new ValidationError('guest_info.expertise', 'Guest expertise is required');
    }
  }

  logger.debug('Output validation passed', {
    topicsCount: topics.length,
    cruxLength: data.episode_crux.length,
    hasGuest: !!data.guest_info,
  });

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Analyzes a podcast transcript and extracts structured metadata.
 *
 * This analyzer uses OpenAI's function calling to ensure structured output.
 * It extracts episode basics, guest information, and the core insight.
 *
 * Processing Steps:
 * 1. Load the stage prompt template with context
 * 2. Call OpenAI GPT-5 mini with function calling
 * 3. Validate the structured response
 * 4. Return normalized output
 *
 * @param {Object} context - Processing context from episode processor
 * @param {string} context.episodeId - Episode UUID for logging/tracking
 * @param {string} context.transcript - Full transcript text (or preprocessed)
 * @param {Object} context.evergreen - Evergreen content (therapist, podcast, voice)
 * @param {Object} context.previousStages - Previous stage outputs (may include Stage 0)
 * @returns {Promise<Object>} Analysis result:
 *   - output_data: Structured analysis JSON
 *   - output_text: null (this stage produces JSON only)
 *   - input_tokens: Number of tokens sent
 *   - output_tokens: Number of tokens received
 *   - cost_usd: API cost in USD
 * @throws {ValidationError} If AI response is missing or invalid
 *
 * @example
 * const result = await analyzeTranscript({
 *   episodeId: 'uuid',
 *   transcript: 'Full transcript text...',
 *   evergreen: { therapist_profile: {...}, podcast_info: {...} },
 *   previousStages: {}
 * });
 * // result.output_data = {
 * //   episode_basics: { title: "...", main_topics: [...] },
 * //   guest_info: { name: "Dr. Smith", ... },
 * //   episode_crux: "The key insight is..."
 * // }
 */
export async function analyzeTranscript(context) {
  const { episodeId, transcript, evergreen, previousStages = {} } = context;

  // ============================================================================
  // STAGE INITIALIZATION
  // ============================================================================
  // Log detailed context for debugging and monitoring.
  // This information is critical for troubleshooting failed stages.

  logger.stageStart(1, 'Transcript Analysis', episodeId);

  // Calculate transcript metrics for logging and monitoring
  const transcriptLength = transcript?.length || 0;
  const transcriptWordCount = transcript?.split(/\s+/).length || 0;
  const hasStage0Output = !!previousStages[0];

  logger.debug('📋 Stage 1: Context summary', {
    episodeId,
    transcriptLength,
    transcriptWordCount,
    hasEvergreenProfile: !!evergreen?.therapist_profile,
    hasEvergreenPodcast: !!evergreen?.podcast_info,
    hasStage0Output,
    // If Stage 0 ran, we're using preprocessed content (shorter, with extracted quotes)
    usingPreprocessedContent: hasStage0Output,
  });

  // Validate we have a transcript to analyze
  if (!transcript || transcriptLength === 0) {
    logger.error('❌ Stage 1: No transcript provided', { episodeId });
    throw new ValidationError('transcript', 'Transcript is required but was empty or missing');
  }

  // Load the stage prompt template with transcript and evergreen context
  // The prompt includes instructions for extraction and voice guidelines
  logger.debug('Stage 1: Loading prompt template', { episodeId });
  const prompt = await loadStagePrompt('stage-01-transcript-analysis', {
    transcript,
    evergreen,
    previousStages,
  });

  logger.debug('Stage 1: Prompt loaded', {
    episodeId,
    promptLength: prompt?.length,
  });

  // ============================================================================
  // OPENAI API CALL WITH FUNCTION CALLING (TOOL_USE)
  // ============================================================================
  // We use function calling (tool_use) to ensure structured JSON output.
  // This is more reliable than asking for JSON in the prompt because:
  // - The schema is enforced at the API level
  // - No JSON parsing issues from free-form text
  // - Better type safety and validation

  logger.info('📤 Stage 1: Calling OpenAI API with function calling', {
    episodeId,
    functionName: 'episode_analysis',
    model: 'gpt-5-mini',
    temperature: 0.5,
  });

  let response;
  try {
    response = await callOpenAIWithFunctions(
      prompt,
      [EPISODE_ANALYSIS_SCHEMA],
      {
        episodeId,
        stageNumber: 1,
        functionCall: 'episode_analysis', // Force the model to use our function
        temperature: 0.5, // Lower temperature for consistent, reliable extraction
      }
    );

    logger.debug('📥 Stage 1: Received API response', {
      episodeId,
      hasResponse: !!response,
      hasFunctionCall: !!response?.functionCall,
      inputTokens: response?.inputTokens,
      outputTokens: response?.outputTokens,
      durationMs: response?.durationMs,
    });

  } catch (apiError) {
    // Log detailed error information for debugging API failures
    logger.error('❌ Stage 1: OpenAI API call failed', {
      episodeId,
      errorMessage: apiError.message,
      errorStatus: apiError.status || apiError.statusCode,
      errorCode: apiError.code,
      errorType: apiError.type,
      isRetryable: apiError.retryable,
    });

    // Re-throw to let the orchestrator handle the error
    throw apiError;
  }

  // Extract the function call output from the response
  const outputData = response.functionCall;

  // Validate we got a response
  if (!outputData) {
    logger.error('Stage 1: No function call output in response', {
      episodeId,
      hasResponse: !!response,
      responseKeys: Object.keys(response || {}),
    });
    throw new ValidationError('response', 'No function call output returned from OpenAI');
  }

  // Validate the output structure matches our expectations
  logger.debug('Stage 1: Validating output structure', {
    episodeId,
    hasEpisodeBasics: !!outputData.episode_basics,
    hasGuestInfo: outputData.guest_info !== undefined,
    hasEpisodeCrux: !!outputData.episode_crux,
    topicsCount: outputData.episode_basics?.main_topics?.length,
  });

  validateOutput(outputData);

  // Log successful completion with extracted data summary
  logger.stageComplete(1, 'Transcript Analysis', episodeId, response.durationMs, response.cost);
  logger.debug('Stage 1: Analysis complete', {
    episodeId,
    title: outputData.episode_basics?.title?.substring(0, 50),
    topicsCount: outputData.episode_basics?.main_topics?.length,
    hasGuest: !!outputData.guest_info,
    guestName: outputData.guest_info?.name,
    cruxLength: outputData.episode_crux?.length,
  });

  // Return normalized result object
  return {
    output_data: outputData,
    output_text: null,  // Stage 1 produces structured JSON only
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

export default analyzeTranscript;
