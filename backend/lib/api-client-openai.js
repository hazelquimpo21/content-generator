/**
 * ============================================================================
 * OPENAI API CLIENT
 * ============================================================================
 * Provides a robust wrapper around OpenAI's API for the content pipeline.
 * Used for stages 1-6 which use GPT-4o-mini.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Token counting and cost calculation
 * - Structured function calling support
 * - Comprehensive error handling
 * - Usage logging to database
 *
 * Usage:
 *   import { callOpenAI, callOpenAIWithFunctions } from './lib/api-client-openai.js';
 *   const response = await callOpenAI('Your prompt here', { model: 'gpt-4o-mini' });
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
const DEFAULT_MODEL = 'gpt-4o-mini';

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
 * @param {string} [options.model='gpt-4o-mini'] - Model to use
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

  // Use retry logic for resilience
  const retryConfig = createAPIRetryConfig('OpenAI');

  const response = await retryWithBackoff(async () => {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: messagesArray,
        temperature,
        max_tokens: maxTokens,
      });

      return completion;
    } catch (error) {
      // Convert OpenAI errors to our APIError type
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
  const retryConfig = createAPIRetryConfig('OpenAI');

  const response = await retryWithBackoff(async () => {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: messagesArray,
        temperature,
        max_tokens: maxTokens,
        tools: functions.map(fn => ({
          type: 'function',
          function: fn,
        })),
        tool_choice: functionCall === 'auto'
          ? 'auto'
          : { type: 'function', function: { name: functionCall } },
      });

      return completion;
    } catch (error) {
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

  // Parse function call response
  const message = response.choices[0]?.message;
  let functionCallResult = null;

  if (message?.tool_calls && message.tool_calls.length > 0) {
    const toolCall = message.tool_calls[0];
    if (toolCall.type === 'function') {
      try {
        functionCallResult = {
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
        };
      } catch (parseError) {
        logger.warn('Failed to parse function call arguments', {
          error: parseError.message,
          raw: toolCall.function.arguments,
        });
        // Try to fix common JSON issues
        const fixedJson = toolCall.function.arguments
          .replace(/,\s*}/g, '}')  // Remove trailing commas
          .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
        try {
          functionCallResult = {
            name: toolCall.function.name,
            arguments: JSON.parse(fixedJson),
          };
        } catch {
          throw new APIError('openai', 500, 'Failed to parse function call response');
        }
      }
    }
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
 * Tests the OpenAI connection with a simple call
 * @returns {Promise<boolean>} True if connection works
 */
export async function testConnection() {
  try {
    const result = await callOpenAI('Reply with "ok"', {
      maxTokens: 10,
    });
    return result.content.toLowerCase().includes('ok');
  } catch (error) {
    logger.error('OpenAI connection test failed', { error: error.message });
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
