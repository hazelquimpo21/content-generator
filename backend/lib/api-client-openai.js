/**
 * ============================================================================
 * OPENAI API CLIENT
 * ============================================================================
 * Provides a robust wrapper around OpenAI's API for the content pipeline.
 * Used for stages 1-6 which use GPT-5 mini.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Token counting and cost calculation
 * - Structured function calling (tool_use) support
 * - Comprehensive error handling and logging
 * - Usage logging to database for cost tracking
 *
 * IMPORTANT API NOTES:
 * - GPT-5 and newer models use `max_completion_tokens` instead of `max_tokens`
 * - The legacy `max_tokens` parameter is unsupported and will cause 400 errors
 * - Function calling uses the `tools` API (not deprecated `functions`)
 *
 * Usage:
 *   import { callOpenAI, callOpenAIWithFunctions } from './lib/api-client-openai.js';
 *   const response = await callOpenAI('Your prompt here', { model: 'gpt-5-mini' });
 * ============================================================================
 */

import OpenAI from 'openai';
import logger from './logger.js';
import { APIError } from './errors.js';
import { retryWithBackoff, createAPIRetryConfig } from './retry-logic.js';
import { calculateCost } from './cost-calculator.js';
import { apiLogRepo } from './supabase-client.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  logger.warn('OPENAI_API_KEY not set - OpenAI calls will fail');
}

// Default model for the pipeline (stages 1-6)
const DEFAULT_MODEL = 'gpt-5-mini';

// Default temperature for consistent outputs
const DEFAULT_TEMPERATURE = 0.7;

// Maximum tokens for output
const DEFAULT_MAX_TOKENS = 4096;

// ============================================================================
// OPENAI CLIENT (SINGLETON)
// ============================================================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ============================================================================
// MAIN API FUNCTIONS
// ============================================================================

/**
 * Makes a basic chat completion call to OpenAI
 *
 * @param {string|Array} messages - Prompt string or array of message objects
 * @param {Object} [options] - API options
 * @param {string} [options.model='gpt-5-mini'] - Model to use
 * @param {number} [options.temperature=0.7] - Sampling temperature
 * @param {number} [options.maxTokens=4096] - Max output tokens
 * @param {string} [options.episodeId] - Episode ID for logging
 * @param {number} [options.stageNumber] - Stage number for logging
 * @returns {Promise<Object>} Response with content and usage stats
 *
 * @example
 * const result = await callOpenAI('Summarize this text: ...');
 * console.log(result.content);
 * console.log(`Cost: $${result.cost}`);
 */
export async function callOpenAI(messages, options = {}) {
  const {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    episodeId = null,
    stageNumber = null,
  } = options;

  // Convert string to messages array if needed
  const messagesArray = typeof messages === 'string'
    ? [{ role: 'user', content: messages }]
    : messages;

  const startTime = Date.now();

  // Use retry logic for resilience against transient API errors (429, 500, 502, 503)
  const retryConfig = createAPIRetryConfig('OpenAI');

  // Log the API call attempt for debugging and monitoring
  logger.debug('📤 Preparing OpenAI API call', {
    episodeId,
    stageNumber,
    model,
    messageCount: messagesArray.length,
    temperature,
    maxTokens,
  });

  const response = await retryWithBackoff(async () => {
    try {
      // IMPORTANT: GPT-5 and newer models require `max_completion_tokens` instead of `max_tokens`
      // Using the legacy `max_tokens` parameter will result in a 400 "Unsupported parameter" error
      const completion = await openai.chat.completions.create({
        model,
        messages: messagesArray,
        temperature,
        max_completion_tokens: maxTokens, // Note: GPT-5+ uses max_completion_tokens, not max_tokens
      });

      return completion;
    } catch (error) {
      // Log detailed error information for debugging
      logger.error('❌ OpenAI API call failed', {
        episodeId,
        stageNumber,
        model,
        errorMessage: error.message,
        errorStatus: error.status,
        errorCode: error.code,
        errorType: error.type,
      });

      // Convert OpenAI errors to our APIError type for consistent error handling
      throw new APIError(
        'openai',
        error.status || 500,
        error.message,
        { code: error.code, type: error.type }
      );
    }
  }, retryConfig);

  const durationMs = Date.now() - startTime;

  // Extract usage stats
  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;
  const cost = calculateCost(model, inputTokens, outputTokens);

  // Log API call
  logger.apiCall('openai', model, inputTokens, outputTokens, durationMs, cost);

  // Log to database (non-blocking)
  apiLogRepo.create({
    provider: 'openai',
    model,
    endpoint: '/v1/chat/completions',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
    episode_id: episodeId,
    stage_number: stageNumber,
    response_time_ms: durationMs,
    success: true,
  }).catch(() => {}); // Ignore logging errors

  // Return structured result
  return {
    content: response.choices[0]?.message?.content || '',
    model: response.model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost,
    durationMs,
    finishReason: response.choices[0]?.finish_reason,
  };
}

/**
 * Makes a chat completion call with function calling (structured output)
 * This is used for stages 1-5 which return structured JSON data
 *
 * @param {string|Array} messages - Prompt or message array
 * @param {Array} functions - Function definitions for structured output
 * @param {Object} [options] - API options (same as callOpenAI)
 * @returns {Promise<Object>} Response with parsed function arguments
 *
 * @example
 * const functions = [{
 *   name: 'extract_quotes',
 *   parameters: { type: 'object', properties: { quotes: { type: 'array' } } }
 * }];
 * const result = await callOpenAIWithFunctions('Extract quotes...', functions);
 * console.log(result.functionCall.quotes);
 */
export async function callOpenAIWithFunctions(messages, functions, options = {}) {
  const {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    episodeId = null,
    stageNumber = null,
    functionCall = 'auto', // or specific function name
  } = options;

  // Convert string to messages array if needed
  const messagesArray = typeof messages === 'string'
    ? [{ role: 'user', content: messages }]
    : messages;

  const startTime = Date.now();

  // Use retry logic for resilience against transient API errors
  const retryConfig = createAPIRetryConfig('OpenAI');

  // Log the function calling request for debugging
  logger.debug('📤 Preparing OpenAI function call (tool_use)', {
    episodeId,
    stageNumber,
    model,
    messageCount: messagesArray.length,
    functionNames: functions.map(fn => fn.name),
    temperature,
    maxTokens,
    toolChoice: functionCall,
  });

  const response = await retryWithBackoff(async () => {
    try {
      // IMPORTANT: GPT-5 and newer models require `max_completion_tokens` instead of `max_tokens`
      // Using the legacy `max_tokens` parameter will result in a 400 "Unsupported parameter" error
      // Function calling uses the modern `tools` API format (not the deprecated `functions` parameter)
      const completion = await openai.chat.completions.create({
        model,
        messages: messagesArray,
        temperature,
        max_completion_tokens: maxTokens, // Note: GPT-5+ uses max_completion_tokens, not max_tokens
        // Convert our function definitions to OpenAI's tool format
        tools: functions.map(fn => ({
          type: 'function',
          function: fn,
        })),
        // Force specific function or allow model to choose
        tool_choice: functionCall === 'auto'
          ? 'auto'
          : { type: 'function', function: { name: functionCall } },
      });

      return completion;
    } catch (error) {
      // Log detailed error information for debugging function call failures
      logger.error('❌ OpenAI function call (tool_use) failed', {
        episodeId,
        stageNumber,
        model,
        functionNames: functions.map(fn => fn.name),
        errorMessage: error.message,
        errorStatus: error.status,
        errorCode: error.code,
        errorType: error.type,
      });

      // Convert OpenAI errors to our APIError type for consistent error handling
      throw new APIError(
        'openai',
        error.status || 500,
        error.message,
        { code: error.code, type: error.type }
      );
    }
  }, retryConfig);

  const durationMs = Date.now() - startTime;

  // Extract usage stats
  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;
  const cost = calculateCost(model, inputTokens, outputTokens);

  // Log API call
  logger.apiCall('openai', model, inputTokens, outputTokens, durationMs, cost);

  // Log to database
  apiLogRepo.create({
    provider: 'openai',
    model,
    endpoint: '/v1/chat/completions',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
    episode_id: episodeId,
    stage_number: stageNumber,
    response_time_ms: durationMs,
    success: true,
  }).catch(() => {});

  // ============================================================================
  // PARSE FUNCTION CALL RESPONSE
  // ============================================================================
  // OpenAI returns function call results in the `tool_calls` array.
  // We need to extract and parse the JSON arguments from the first tool call.
  // Common issues: malformed JSON with trailing commas, control characters

  const message = response.choices[0]?.message;
  let functionCallResult = null;

  // Check if the model returned a function/tool call
  if (message?.tool_calls && message.tool_calls.length > 0) {
    const toolCall = message.tool_calls[0];

    if (toolCall.type === 'function') {
      logger.debug('📥 Received function call response', {
        episodeId,
        stageNumber,
        functionName: toolCall.function.name,
        argumentsLength: toolCall.function.arguments?.length,
      });

      try {
        // First attempt: parse JSON directly
        functionCallResult = {
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
        };

        logger.debug('✅ Successfully parsed function call arguments', {
          episodeId,
          stageNumber,
          functionName: toolCall.function.name,
          argumentKeys: Object.keys(functionCallResult.arguments),
        });

      } catch (parseError) {
        // JSON parsing failed - log the error and attempt recovery
        logger.warn('⚠️ Failed to parse function call arguments, attempting recovery', {
          episodeId,
          stageNumber,
          functionName: toolCall.function.name,
          parseError: parseError.message,
          // Log first 200 chars to help debug without exposing full content
          argumentsPreview: toolCall.function.arguments?.substring(0, 200),
        });

        // Try to fix common JSON issues from OpenAI responses:
        // - Trailing commas before closing braces/brackets
        // - Sometimes there are newlines or special characters
        const fixedJson = toolCall.function.arguments
          .replace(/,\s*}/g, '}')  // Remove trailing commas before }
          .replace(/,\s*]/g, ']'); // Remove trailing commas before ]

        try {
          functionCallResult = {
            name: toolCall.function.name,
            arguments: JSON.parse(fixedJson),
          };

          logger.info('✅ Successfully parsed function call after JSON fix', {
            episodeId,
            stageNumber,
            functionName: toolCall.function.name,
          });

        } catch (secondParseError) {
          // Both parsing attempts failed - this is a critical error
          logger.error('❌ Failed to parse function call response after recovery attempt', {
            episodeId,
            stageNumber,
            functionName: toolCall.function.name,
            originalError: parseError.message,
            secondError: secondParseError.message,
            argumentsPreview: toolCall.function.arguments?.substring(0, 500),
          });

          throw new APIError(
            'openai',
            500,
            `Failed to parse function call response: ${secondParseError.message}`,
            { functionName: toolCall.function.name }
          );
        }
      }
    }
  } else {
    // Model didn't return a function call - this might be expected or an error
    // depending on the tool_choice setting
    logger.debug('ℹ️ No function call in response', {
      episodeId,
      stageNumber,
      hasContent: !!message?.content,
      finishReason: response.choices[0]?.finish_reason,
    });
  }

  return {
    content: message?.content || '',
    functionCall: functionCallResult?.arguments || null,
    functionName: functionCallResult?.name || null,
    model: response.model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost,
    durationMs,
    finishReason: response.choices[0]?.finish_reason,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Builds a system message with instructions
 * @param {string} content - System instructions
 * @returns {Object} Message object
 */
export function systemMessage(content) {
  return { role: 'system', content };
}

/**
 * Builds a user message
 * @param {string} content - User content
 * @returns {Object} Message object
 */
export function userMessage(content) {
  return { role: 'user', content };
}

/**
 * Builds an assistant message
 * @param {string} content - Assistant content
 * @returns {Object} Message object
 */
export function assistantMessage(content) {
  return { role: 'assistant', content };
}

/**
 * Tests the OpenAI connection with a simple API call.
 *
 * This function is useful for:
 * - Verifying API key validity
 * - Checking network connectivity to OpenAI
 * - Health checks and monitoring
 *
 * @returns {Promise<boolean>} True if connection works, false otherwise
 *
 * @example
 * const isConnected = await testConnection();
 * if (!isConnected) {
 *   console.error('OpenAI API is not accessible');
 * }
 */
export async function testConnection() {
  logger.debug('🔌 Testing OpenAI connection...');

  try {
    const result = await callOpenAI('Reply with exactly the word "ok"', {
      maxTokens: 10,
      temperature: 0, // Deterministic response for testing
    });

    const isOk = result.content.toLowerCase().includes('ok');

    if (isOk) {
      logger.info('✅ OpenAI connection test passed', {
        model: result.model,
        responseTime: result.durationMs,
      });
    } else {
      logger.warn('⚠️ OpenAI connection test: unexpected response', {
        response: result.content,
      });
    }

    return isOk;
  } catch (error) {
    logger.error('❌ OpenAI connection test failed', {
      errorMessage: error.message,
      errorStatus: error.status,
      errorCode: error.code,
    });
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  callOpenAI,
  callOpenAIWithFunctions,
  systemMessage,
  userMessage,
  assistantMessage,
  testConnection,
  DEFAULT_MODEL,
};
