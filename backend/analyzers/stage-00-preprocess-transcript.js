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
 * Validates the preprocessing output to ensure all required fields
 * are present and properly formatted.
 *
 * Validation is strict to ensure downstream stages receive quality data:
 * - comprehensive_summary: Must be at least 500 characters
 * - verbatim_quotes: Need at least 5 quotes with proper structure
 * - key_topics: Need at least 3 topics
 * - speakers: Must have host information
 * - episode_metadata: Required for downstream processing
 *
 * @param {Object} data - Parsed output data from Claude
 * @throws {ValidationError} If validation fails with detailed reason
 * @returns {boolean} True if validation passes
 */
function validateOutput(data) {
  logger.debug('🔍 Starting validation of preprocessing output', {
    hasComprehensiveSummary: !!data.comprehensive_summary,
    hasVerbatimQuotes: !!data.verbatim_quotes,
    hasKeyTopics: !!data.key_topics,
    hasSpeakers: !!data.speakers,
    hasEpisodeMetadata: !!data.episode_metadata,
  });

  // -------------------------------------------------------------------------
  // Validate comprehensive_summary
  // -------------------------------------------------------------------------
  if (!data.comprehensive_summary || typeof data.comprehensive_summary !== 'string') {
    logger.error('❌ Validation failed: comprehensive_summary missing or invalid', {
      exists: !!data.comprehensive_summary,
      type: typeof data.comprehensive_summary,
    });
    throw new ValidationError('comprehensive_summary', 'Missing or invalid summary');
  }

  if (data.comprehensive_summary.length < 500) {
    logger.error('❌ Validation failed: comprehensive_summary too short', {
      length: data.comprehensive_summary.length,
      minimum: 500,
      preview: data.comprehensive_summary.substring(0, 100),
    });
    throw new ValidationError(
      'comprehensive_summary',
      `Summary too short - needs more detail (got ${data.comprehensive_summary.length} chars, need at least 500)`
    );
  }

  logger.debug('✓ comprehensive_summary validated', {
    length: data.comprehensive_summary.length,
    wordCount: data.comprehensive_summary.split(/\s+/).length,
  });

  // -------------------------------------------------------------------------
  // Validate verbatim_quotes
  // -------------------------------------------------------------------------
  if (!data.verbatim_quotes || !Array.isArray(data.verbatim_quotes)) {
    logger.error('❌ Validation failed: verbatim_quotes missing or not an array', {
      exists: !!data.verbatim_quotes,
      isArray: Array.isArray(data.verbatim_quotes),
    });
    throw new ValidationError('verbatim_quotes', 'Missing or invalid quotes array');
  }

  if (data.verbatim_quotes.length < 5) {
    logger.error('❌ Validation failed: not enough verbatim_quotes', {
      count: data.verbatim_quotes.length,
      minimum: 5,
    });
    throw new ValidationError('verbatim_quotes', `Need at least 5 quotes, got ${data.verbatim_quotes.length}`);
  }

  // Validate each quote's structure
  for (let i = 0; i < data.verbatim_quotes.length; i++) {
    const q = data.verbatim_quotes[i];
    if (!q.quote || q.quote.length < 20) {
      logger.error('❌ Validation failed: quote too short or missing', {
        quoteIndex: i,
        quoteLength: q.quote?.length || 0,
        minimum: 20,
        quote: q.quote?.substring(0, 50),
      });
      throw new ValidationError(
        `verbatim_quotes[${i}].quote`,
        `Quote too short or missing (got ${q.quote?.length || 0} chars, need at least 20)`
      );
    }
    if (!q.speaker) {
      logger.error('❌ Validation failed: quote missing speaker', {
        quoteIndex: i,
        quote: q.quote?.substring(0, 50),
      });
      throw new ValidationError(`verbatim_quotes[${i}].speaker`, 'Speaker is required for all quotes');
    }
  }

  logger.debug('✓ verbatim_quotes validated', {
    count: data.verbatim_quotes.length,
    speakers: [...new Set(data.verbatim_quotes.map((q) => q.speaker))],
  });

  // -------------------------------------------------------------------------
  // Validate key_topics
  // -------------------------------------------------------------------------
  if (!data.key_topics || !Array.isArray(data.key_topics)) {
    logger.error('❌ Validation failed: key_topics missing or not an array', {
      exists: !!data.key_topics,
      isArray: Array.isArray(data.key_topics),
    });
    throw new ValidationError('key_topics', 'Missing or invalid topics array');
  }

  if (data.key_topics.length < 3) {
    logger.error('❌ Validation failed: not enough key_topics', {
      count: data.key_topics.length,
      minimum: 3,
      topics: data.key_topics,
    });
    throw new ValidationError('key_topics', `Need at least 3 topics, got ${data.key_topics.length}`);
  }

  logger.debug('✓ key_topics validated', {
    count: data.key_topics.length,
    topics: data.key_topics,
  });

  // -------------------------------------------------------------------------
  // Validate speakers
  // -------------------------------------------------------------------------
  if (!data.speakers || !data.speakers.host) {
    logger.error('❌ Validation failed: speakers.host missing', {
      hasSpeakers: !!data.speakers,
      hasHost: !!data.speakers?.host,
    });
    throw new ValidationError('speakers', 'Missing host information in speakers object');
  }

  logger.debug('✓ speakers validated', {
    hostName: data.speakers.host?.name,
    hasGuest: !!data.speakers.guest?.name,
    guestName: data.speakers.guest?.name,
  });

  // -------------------------------------------------------------------------
  // Validate episode_metadata
  // -------------------------------------------------------------------------
  if (!data.episode_metadata) {
    logger.error('❌ Validation failed: episode_metadata missing', {
      hasEpisodeMetadata: !!data.episode_metadata,
    });
    throw new ValidationError('episode_metadata', 'Missing episode metadata object');
  }

  logger.debug('✓ episode_metadata validated', {
    hasInferredTitle: !!data.episode_metadata.inferred_title,
    hasCoreMessage: !!data.episode_metadata.core_message,
  });

  // All validations passed
  logger.info('✅ All preprocessing output validations passed', {
    summaryLength: data.comprehensive_summary.length,
    quotesCount: data.verbatim_quotes.length,
    topicsCount: data.key_topics.length,
    hostName: data.speakers.host?.name,
  });

  return true;
}

/**
 * Sanitizes a JSON string by properly escaping control characters
 * that may appear within string values from AI responses.
 *
 * Common issues:
 * - Unescaped newlines (\n) within string values
 * - Unescaped tabs (\t) within string values
 * - Unescaped carriage returns (\r) within string values
 * - Other control characters (0x00-0x1F)
 * - Backslash followed by actual control character (not escape sequence)
 *
 * Edge cases handled:
 * - `\"` -> keeps as valid escaped quote
 * - `\\` -> keeps as valid escaped backslash
 * - `\` + actual newline char -> converts to proper `\n` escape sequence
 * - Raw control characters in strings -> escapes them properly
 *
 * @param {string} jsonStr - Raw JSON string potentially containing control characters
 * @returns {string} Sanitized JSON string with properly escaped control characters
 */
function sanitizeJSONString(jsonStr) {
  logger.debug('🧹 Sanitizing JSON string', {
    originalLength: jsonStr.length,
  });

  // State machine approach: track whether we're inside a string value
  let result = '';
  let inString = false;
  let escapeNext = false;
  let controlCharsEscaped = 0;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    const charCode = char.charCodeAt(0);

    // -------------------------------------------------------------------------
    // HANDLE ESCAPED CHARACTERS
    // When escapeNext is true, the previous character was a backslash.
    // We need to check if this character is:
    // 1. A valid escape char (", \, /, b, f, n, r, t, u) -> keep as-is
    // 2. A control character -> convert to proper escape sequence
    // 3. Something else -> keep as-is (might be invalid but let JSON.parse handle it)
    // -------------------------------------------------------------------------
    if (escapeNext) {
      // Check if this is a control character that needs special handling
      // This handles the edge case where AI outputs backslash + actual newline
      // instead of backslash + letter 'n'
      if (charCode >= 0 && charCode <= 31) {
        // Control character after backslash - the AI likely meant to escape it
        // but used an actual control char instead of the escape letter
        // Convert to proper JSON escape sequence (we already have the backslash)
        logger.debug('🔧 Found control char after backslash, converting to escape', {
          charCode,
          position: i,
        });
        switch (charCode) {
          case 9: // Tab -> \t
            result += 't';
            break;
          case 10: // Newline (LF) -> \n
            result += 'n';
            break;
          case 13: // Carriage return (CR) -> \r
            result += 'r';
            break;
          case 8: // Backspace -> \b
            result += 'b';
            break;
          case 12: // Form feed -> \f
            result += 'f';
            break;
          default:
            // For other control chars, use unicode escape
            // Need to remove the backslash we added and use full \uXXXX
            result = result.slice(0, -1); // Remove the backslash
            result += '\\u' + charCode.toString(16).padStart(4, '0');
        }
        controlCharsEscaped++;
      } else {
        // Normal escaped character (valid escape sequence) - keep as is
        result += char;
      }
      escapeNext = false;
      continue;
    }

    // -------------------------------------------------------------------------
    // HANDLE BACKSLASH IN STRING
    // Mark the next character as escaped
    // -------------------------------------------------------------------------
    if (char === '\\' && inString) {
      result += char;
      escapeNext = true;
      continue;
    }

    // -------------------------------------------------------------------------
    // HANDLE QUOTES
    // Toggle string state on unescaped quotes
    // -------------------------------------------------------------------------
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    // -------------------------------------------------------------------------
    // HANDLE CONTROL CHARACTERS IN STRINGS
    // Any control character (0x00-0x1F) inside a string must be escaped
    // -------------------------------------------------------------------------
    if (inString && charCode >= 0 && charCode <= 31) {
      // Control character inside string - must be escaped
      // Map common control characters to their escape sequences
      switch (charCode) {
        case 9: // Tab
          result += '\\t';
          break;
        case 10: // Newline (LF)
          result += '\\n';
          break;
        case 13: // Carriage return (CR)
          result += '\\r';
          break;
        case 8: // Backspace
          result += '\\b';
          break;
        case 12: // Form feed
          result += '\\f';
          break;
        default:
          // Other control chars - use unicode escape
          result += '\\u' + charCode.toString(16).padStart(4, '0');
      }
      controlCharsEscaped++;
      logger.debug('🔧 Escaped control character in JSON string', {
        charCode,
        position: i,
        escaped: result.slice(-2),
      });
    } else {
      result += char;
    }
  }

  // Log sanitization summary if changes were made
  if (controlCharsEscaped > 0 || result !== jsonStr) {
    logger.info('✅ JSON string sanitized', {
      originalLength: jsonStr.length,
      sanitizedLength: result.length,
      controlCharsEscaped,
      lengthDifference: result.length - jsonStr.length,
    });
  }

  return result;
}

/**
 * Finds the position and context of a JSON parse error
 * Helps identify exactly where and what control character caused the issue
 *
 * @param {string} content - The JSON string that failed to parse
 * @param {Error} error - The JSON parse error
 * @returns {Object} Details about the error location and context
 */
function analyzeJsonParseError(content, error) {
  const result = {
    errorMessage: error.message,
    position: null,
    context: null,
    problematicChar: null,
    controlCharsFound: [],
  };

  // Try to extract position from error message (e.g., "at position 1234")
  const positionMatch = error.message.match(/position\s+(\d+)/i);
  if (positionMatch) {
    result.position = parseInt(positionMatch[1], 10);
    // Get context around the error position
    const start = Math.max(0, result.position - 30);
    const end = Math.min(content.length, result.position + 30);
    result.context = content.substring(start, end);

    // Identify the problematic character at that position
    if (result.position < content.length) {
      const char = content[result.position];
      result.problematicChar = {
        char: char,
        charCode: char.charCodeAt(0),
        isControlChar: char.charCodeAt(0) >= 0 && char.charCodeAt(0) <= 31,
        displayCode: `0x${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
      };
    }
  }

  // Scan for all control characters in the content
  for (let i = 0; i < Math.min(content.length, 5000); i++) {
    const charCode = content.charCodeAt(i);
    if (charCode >= 0 && charCode <= 31 && charCode !== 10 && charCode !== 13 && charCode !== 9) {
      result.controlCharsFound.push({
        position: i,
        charCode,
        displayCode: `0x${charCode.toString(16).padStart(2, '0')}`,
      });
    }
  }

  return result;
}

/**
 * Extracts JSON from Claude's response (handles markdown code blocks)
 * Includes robust error handling and sanitization for AI-generated JSON
 * that may contain unescaped control characters.
 *
 * Parsing strategy (in order):
 * 1. Direct JSON.parse on raw content
 * 2. JSON.parse on sanitized content (escapes control chars)
 * 3. Extract from ```json code block and parse
 * 4. Extract from ```json code block, sanitize, and parse
 * 5. Extract object pattern ({...}) and parse
 * 6. Extract object pattern, sanitize, and parse
 *
 * @param {string} content - Raw response content from AI
 * @returns {Object} Parsed JSON object
 * @throws {ValidationError} If no valid JSON can be extracted after all attempts
 */
function extractJSON(content) {
  logger.debug('🔍 Attempting to extract JSON from response', {
    contentLength: content.length,
    contentPreview: content.substring(0, 100) + '...',
  });

  // -------------------------------------------------------------------------
  // STRATEGY 1: Direct parse on raw content
  // -------------------------------------------------------------------------
  try {
    logger.debug('📋 Strategy 1: Direct JSON.parse on raw content');
    return JSON.parse(content);
  } catch (directError) {
    const errorAnalysis = analyzeJsonParseError(content, directError);
    logger.debug('⚠️ Strategy 1 failed: Direct parse', {
      error: directError.message,
      position: errorAnalysis.position,
      problematicChar: errorAnalysis.problematicChar,
      controlCharsInFirst5k: errorAnalysis.controlCharsFound.length,
    });
  }

  // -------------------------------------------------------------------------
  // STRATEGY 2: Parse sanitized content
  // -------------------------------------------------------------------------
  try {
    logger.debug('📋 Strategy 2: JSON.parse on sanitized content');
    const sanitized = sanitizeJSONString(content);
    return JSON.parse(sanitized);
  } catch (sanitizedError) {
    logger.debug('⚠️ Strategy 2 failed: Sanitized parse', {
      error: sanitizedError.message,
    });
  }

  // -------------------------------------------------------------------------
  // STRATEGY 3 & 4: Extract from code block
  // -------------------------------------------------------------------------
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    const codeBlockContent = jsonMatch[1].trim();
    logger.debug('📋 Strategy 3: Found code block, attempting direct parse', {
      codeBlockLength: codeBlockContent.length,
    });

    // Strategy 3: Direct parse of code block
    try {
      return JSON.parse(codeBlockContent);
    } catch (codeBlockError) {
      logger.debug('⚠️ Strategy 3 failed: Code block direct parse', {
        error: codeBlockError.message,
      });

      // Strategy 4: Sanitized code block
      try {
        logger.debug('📋 Strategy 4: Sanitized code block parse');
        const sanitizedCodeBlock = sanitizeJSONString(codeBlockContent);
        return JSON.parse(sanitizedCodeBlock);
      } catch (sanitizedCodeBlockError) {
        const errorAnalysis = analyzeJsonParseError(codeBlockContent, sanitizedCodeBlockError);
        logger.warn('⚠️ Strategy 4 failed: Sanitized code block parse', {
          error: sanitizedCodeBlockError.message,
          position: errorAnalysis.position,
          context: errorAnalysis.context,
          problematicChar: errorAnalysis.problematicChar,
          codeBlockPreview: codeBlockContent.substring(0, 200),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // STRATEGY 5 & 6: Extract JSON object pattern
  // -------------------------------------------------------------------------
  const objectMatch = content.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const objectContent = objectMatch[0];
    logger.debug('📋 Strategy 5: Found object pattern, attempting direct parse', {
      objectLength: objectContent.length,
    });

    // Strategy 5: Direct parse of object pattern
    try {
      return JSON.parse(objectContent);
    } catch (objectError) {
      logger.debug('⚠️ Strategy 5 failed: Object pattern direct parse', {
        error: objectError.message,
      });

      // Strategy 6: Sanitized object pattern
      try {
        logger.debug('📋 Strategy 6: Sanitized object pattern parse');
        const sanitizedObject = sanitizeJSONString(objectContent);
        return JSON.parse(sanitizedObject);
      } catch (sanitizedObjectError) {
        const errorAnalysis = analyzeJsonParseError(objectContent, sanitizedObjectError);
        logger.error('❌ Strategy 6 failed: All parsing strategies exhausted', {
          error: sanitizedObjectError.message,
          position: errorAnalysis.position,
          context: errorAnalysis.context,
          problematicChar: errorAnalysis.problematicChar,
          controlCharsFound: errorAnalysis.controlCharsFound.slice(0, 5), // First 5 control chars
          objectPreview: objectContent.substring(0, 300),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // ALL STRATEGIES FAILED
  // Log comprehensive diagnostic information
  // -------------------------------------------------------------------------
  logger.error('❌ All JSON extraction strategies failed', {
    contentLength: content.length,
    contentPreview: content.substring(0, 500),
    contentEnd: content.substring(Math.max(0, content.length - 200)),
    hasCodeBlock: !!jsonMatch,
    hasObjectPattern: !!objectMatch,
    startsWithBrace: content.trim().startsWith('{'),
    endsWithBrace: content.trim().endsWith('}'),
  });

  throw new ValidationError('response', 'Could not extract valid JSON from response - all 6 parsing strategies failed');
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

  // -------------------------------------------------------------------------
  // Call Claude Haiku API
  // Using low temperature (0.3) for consistent, factual extraction
  // Max tokens set to 8192 to allow for comprehensive summaries
  // -------------------------------------------------------------------------
  logger.info('📤 Sending request to Claude Haiku API', {
    episodeId,
    model: PREPROCESSING_MODEL,
    promptLength: prompt.length,
    systemPromptLength: systemPrompt.length,
    temperature: 0.3,
    maxTokens: 8192,
  });

  let response;
  try {
    response = await callClaude(prompt, {
      model: PREPROCESSING_MODEL,
      system: systemPrompt,
      episodeId,
      stageNumber: 0,
      temperature: 0.3, // Low temperature for consistent extraction
      maxTokens: 8192, // Allow generous output for comprehensive summary
    });
  } catch (apiError) {
    logger.error('❌ Claude API call failed during preprocessing', {
      episodeId,
      errorName: apiError.name,
      errorMessage: apiError.message,
      errorCode: apiError.code,
      model: PREPROCESSING_MODEL,
    });
    throw apiError;
  }

  logger.info('📥 Received preprocessing response from Claude', {
    episodeId,
    responseLength: response.content.length,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    durationMs: response.durationMs,
    cost: response.cost,
  });

  // Log first 100 chars of response for debugging (truncated to avoid PII)
  logger.debug('📄 Response content preview', {
    episodeId,
    preview: response.content.substring(0, 100) + '...',
    endsWithBrace: response.content.trim().endsWith('}'),
    startsWithBrace: response.content.trim().startsWith('{'),
  });

  // -------------------------------------------------------------------------
  // Parse JSON from response
  // Claude may return JSON with control characters that need sanitization
  // -------------------------------------------------------------------------
  let outputData;
  try {
    logger.info('🔄 Parsing JSON from Claude response', { episodeId });
    outputData = extractJSON(response.content);
    logger.info('✅ Successfully parsed JSON from response', {
      episodeId,
      parsedKeys: Object.keys(outputData),
    });
  } catch (parseError) {
    // Log detailed error info to help debug JSON parsing issues
    logger.error('❌ Failed to parse preprocessing response as JSON', {
      episodeId,
      errorName: parseError.name,
      errorMessage: parseError.message,
      responseLength: response.content.length,
      responsePreview: response.content.substring(0, 500),
      responseEnd: response.content.substring(response.content.length - 200),
      containsCodeBlock: response.content.includes('```'),
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
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
