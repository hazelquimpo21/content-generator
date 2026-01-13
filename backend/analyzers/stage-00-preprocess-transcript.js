/**
 * ============================================================================
 * STAGE 0: TRANSCRIPT PREPROCESSING
 * ============================================================================
 * Preprocesses long podcast transcripts using Claude Haiku (200K context window)
 * to create a condensed but comprehensive representation that preserves ALL
 * key information.
 *
 * This stage solves the problem of transcripts exceeding context limits for
 * downstream models (GPT-5 mini) by:
 * 1. Reading the ENTIRE transcript (no truncation)
 * 2. Creating a comprehensive summary
 * 3. Extracting verbatim quotes with context
 * 4. Identifying speakers and key themes
 *
 * Input: Raw transcript + evergreen content
 * Output: Preprocessed transcript data (summary, quotes, themes)
 * Model: Claude 3.5 Haiku (200K context, cheap, fast)
 * ============================================================================
 */

import { callClaude } from '../lib/api-client-anthropic.js';
import { loadStagePrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';
import { estimateTokens } from '../lib/cost-calculator.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Use Claude 3.5 Haiku for preprocessing - 200K context, cheap, fast
const PREPROCESSING_MODEL = 'claude-3-5-haiku-20241022';

// Threshold for when preprocessing is needed (in estimated tokens)
// If transcript + prompt is below this, skip preprocessing
const PREPROCESSING_THRESHOLD_TOKENS = 8000;

// ============================================================================
// JSON SCHEMA FOR STRUCTURED OUTPUT
// ============================================================================

const PREPROCESSING_SCHEMA = {
  comprehensive_summary: {
    type: 'string',
    description: 'Detailed 800-1500 word summary preserving all key information',
  },
  verbatim_quotes: {
    type: 'array',
    description: '10-15 exact verbatim quotes from the transcript',
    items: {
      quote: 'string - exact verbatim text',
      speaker: 'string - who said it',
      position: 'string - early/middle/late in episode',
      potential_use: 'string - headline/pullquote/social/key_point',
    },
  },
  key_topics: {
    type: 'array',
    description: '5-8 specific topics discussed',
  },
  speakers: {
    host: { name: 'string', role: 'string' },
    guest: { name: 'string|null', credentials: 'string|null', expertise: 'string|null' },
  },
  episode_metadata: {
    inferred_title: 'string',
    core_message: 'string',
    estimated_duration: 'string',
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates the preprocessing output
 * @param {Object} data - Parsed output data
 * @throws {ValidationError} If validation fails
 */
function validateOutput(data) {
  // Check comprehensive_summary
  if (!data.comprehensive_summary || typeof data.comprehensive_summary !== 'string') {
    throw new ValidationError('comprehensive_summary', 'Missing or invalid summary');
  }

  if (data.comprehensive_summary.length < 500) {
    throw new ValidationError('comprehensive_summary', 'Summary too short - needs more detail');
  }

  // Check verbatim_quotes
  if (!data.verbatim_quotes || !Array.isArray(data.verbatim_quotes)) {
    throw new ValidationError('verbatim_quotes', 'Missing or invalid quotes array');
  }

  if (data.verbatim_quotes.length < 5) {
    throw new ValidationError('verbatim_quotes', `Need at least 5 quotes, got ${data.verbatim_quotes.length}`);
  }

  // Validate each quote
  for (let i = 0; i < data.verbatim_quotes.length; i++) {
    const q = data.verbatim_quotes[i];
    if (!q.quote || q.quote.length < 20) {
      throw new ValidationError(`verbatim_quotes[${i}].quote`, 'Quote too short or missing');
    }
    if (!q.speaker) {
      throw new ValidationError(`verbatim_quotes[${i}].speaker`, 'Speaker is required');
    }
  }

  // Check key_topics
  if (!data.key_topics || !Array.isArray(data.key_topics)) {
    throw new ValidationError('key_topics', 'Missing or invalid topics array');
  }

  if (data.key_topics.length < 3) {
    throw new ValidationError('key_topics', `Need at least 3 topics, got ${data.key_topics.length}`);
  }

  // Check speakers
  if (!data.speakers || !data.speakers.host) {
    throw new ValidationError('speakers', 'Missing host information');
  }

  // Check episode_metadata
  if (!data.episode_metadata) {
    throw new ValidationError('episode_metadata', 'Missing episode metadata');
  }

  return true;
}

/**
 * Extracts JSON from Claude's response (handles markdown code blocks)
 * @param {string} content - Raw response content
 * @returns {Object} Parsed JSON object
 */
function extractJSON(content) {
  // Try to parse directly first
  try {
    return JSON.parse(content);
  } catch {
    // Not direct JSON, try to extract from markdown code block
  }

  // Try to extract from ```json ... ``` block
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch (e) {
      logger.warn('Failed to parse JSON from code block', { error: e.message });
    }
  }

  // Try to find JSON object pattern
  const objectMatch = content.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (e) {
      logger.warn('Failed to parse JSON from object match', { error: e.message });
    }
  }

  throw new ValidationError('response', 'Could not extract valid JSON from response');
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Preprocesses a podcast transcript to create a condensed representation
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript text
 * @param {Object} context.evergreen - Evergreen content settings
 * @returns {Promise<Object>} Preprocessing result with output_data, tokens, cost
 *
 * @example
 * const result = await preprocessTranscript({
 *   episodeId: 'uuid',
 *   transcript: '...',
 *   evergreen: { therapist_profile: {...} }
 * });
 */
export async function preprocessTranscript(context) {
  const { episodeId, transcript, evergreen } = context;

  logger.stageStart(0, 'Transcript Preprocessing', episodeId);

  // Estimate transcript size
  const transcriptTokens = estimateTokens(transcript);
  const transcriptWords = transcript.split(/\s+/).length;

  logger.info('📊 Transcript size analysis', {
    episodeId,
    transcriptWords,
    transcriptTokens,
    transcriptChars: transcript.length,
    preprocessingThreshold: PREPROCESSING_THRESHOLD_TOKENS,
    needsPreprocessing: transcriptTokens > PREPROCESSING_THRESHOLD_TOKENS,
  });

  // Check if preprocessing is needed
  if (transcriptTokens <= PREPROCESSING_THRESHOLD_TOKENS) {
    logger.info('⏭️ Transcript small enough, skipping preprocessing', {
      episodeId,
      transcriptTokens,
      threshold: PREPROCESSING_THRESHOLD_TOKENS,
    });

    // Return a pass-through result that signals no preprocessing was done
    return {
      output_data: {
        preprocessed: false,
        original_transcript: transcript,
        comprehensive_summary: null,
        verbatim_quotes: [],
        key_topics: [],
        speakers: null,
        episode_metadata: null,
      },
      output_text: null,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      skipped: true,
    };
  }

  logger.info('🔄 Preprocessing required - using Claude Haiku (200K context)', {
    episodeId,
    transcriptTokens,
    model: PREPROCESSING_MODEL,
  });

  // Load prompt with context
  const prompt = await loadStagePrompt('stage-00-transcript-preprocessing', {
    transcript,
    evergreen,
    previousStages: {},
  });

  // Build the system prompt for structured output
  const systemPrompt = `You are an expert content analyst. Your task is to process a podcast transcript and return a structured JSON response.

IMPORTANT: Return ONLY valid JSON matching this schema:
{
  "comprehensive_summary": "800-1500 word detailed summary preserving all key information",
  "verbatim_quotes": [
    {
      "quote": "exact verbatim text from transcript",
      "speaker": "speaker name",
      "position": "early|middle|late",
      "potential_use": "headline|pullquote|social|key_point"
    }
  ],
  "key_topics": ["specific topic 1", "specific topic 2", ...],
  "speakers": {
    "host": {"name": "host name", "role": "host role"},
    "guest": {"name": "guest name or null", "credentials": "credentials or null", "expertise": "expertise or null"}
  },
  "episode_metadata": {
    "inferred_title": "compelling episode title",
    "core_message": "1-2 sentence core takeaway",
    "estimated_duration": "estimated duration"
  }
}

Return ONLY the JSON object. No additional text, explanations, or markdown formatting.`;

  // Call Claude Haiku with the full transcript
  const response = await callClaude(prompt, {
    model: PREPROCESSING_MODEL,
    system: systemPrompt,
    episodeId,
    stageNumber: 0,
    temperature: 0.3, // Low temperature for consistent extraction
    maxTokens: 8192, // Allow generous output for comprehensive summary
  });

  logger.debug('📥 Received preprocessing response', {
    episodeId,
    responseLength: response.content.length,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
  });

  // Parse and validate the output
  let outputData;
  try {
    outputData = extractJSON(response.content);
  } catch (parseError) {
    logger.error('Failed to parse preprocessing response', {
      episodeId,
      error: parseError.message,
      responsePreview: response.content.substring(0, 500),
    });
    throw parseError;
  }

  // Mark as preprocessed
  outputData.preprocessed = true;

  // Validate the output
  validateOutput(outputData);

  // Log success metrics
  const summaryWords = outputData.comprehensive_summary.split(/\s+/).length;
  const compressionRatio = (transcriptWords / summaryWords).toFixed(1);

  logger.info('✅ Preprocessing complete', {
    episodeId,
    originalWords: transcriptWords,
    summaryWords,
    compressionRatio: `${compressionRatio}:1`,
    quotesExtracted: outputData.verbatim_quotes.length,
    topicsIdentified: outputData.key_topics.length,
    cost: response.cost,
  });

  logger.stageComplete(0, 'Transcript Preprocessing', episodeId, response.durationMs, response.cost);

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
    skipped: false,
  };
}

/**
 * Checks if a transcript needs preprocessing based on size
 * @param {string} transcript - The transcript text
 * @returns {boolean} True if preprocessing is needed
 */
export function needsPreprocessing(transcript) {
  const tokens = estimateTokens(transcript);
  return tokens > PREPROCESSING_THRESHOLD_TOKENS;
}

/**
 * Gets the preprocessing model info
 * @returns {Object} Model information
 */
export function getPreprocessingModelInfo() {
  return {
    model: PREPROCESSING_MODEL,
    contextWindow: 200000,
    threshold: PREPROCESSING_THRESHOLD_TOKENS,
    provider: 'anthropic',
  };
}

export default preprocessTranscript;
