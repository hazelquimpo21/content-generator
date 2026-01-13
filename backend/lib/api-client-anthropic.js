/**
 * ============================================================================
 * ANTHROPIC CLAUDE API CLIENT
 * ============================================================================
 * Provides a robust wrapper around Anthropic's API for the content pipeline.
 * Used for stages 7-9 which use Claude Sonnet 4 for refinement and generation.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Token counting and cost calculation
 * - Comprehensive error handling
 * - Usage logging to database
 *
 * Usage:
 *   import { callClaude } from './lib/api-client-anthropic.js';
 *   const response = await callClaude('Your prompt here');
 * ============================================================================
 */

import Anthropic from '@anthropic-ai/sdk';
import logger from './logger.js';
import { APIError } from './errors.js';
import { retryWithBackoff, createAPIRetryConfig } from './retry-logic.js';
import { calculateCost, estimateTokens } from './cost-calculator.js';
import { apiLogRepo } from './supabase-client.js';

// ============================================================================
// ERROR DETECTION HELPERS
// ============================================================================

/**
 * Checks if an error is a token limit / context length error
 * @param {Error} error - Error to check
 * @returns {boolean} True if this is a token limit error
 */
function isTokenLimitError(error) {
  const message = error.message?.toLowerCase() || '';
  const type = error.type?.toLowerCase() || '';
  const code = error.error?.type?.toLowerCase() || '';

  return (
    message.includes('context_length') ||
    message.includes('too long') ||
    message.includes('too many tokens') ||
    message.includes('maximum') && message.includes('token') ||
    type === 'invalid_request_error' && message.includes('token') ||
    code === 'context_length_exceeded'
  );
}

/**
 * Extracts token limit details from error message
 * @param {string} message - Error message
 * @returns {Object|null} Token limit details if found
 */
function extractTokenLimitDetails(message) {
  // Anthropic error messages patterns
  const maxMatch = message.match(/maximum.*?(\d+)\s*tokens/i);
  const usedMatch = message.match(/(\d+)\s*tokens/i);

  if (maxMatch || usedMatch) {
    return {
      maxTokens: maxMatch ? parseInt(maxMatch[1], 10) : null,
      usedTokens: usedMatch ? parseInt(usedMatch[1], 10) : null,
    };
  }

  return null;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  logger.warn('ANTHROPIC_API_KEY not set - Claude calls will fail');
}

// Default model for stages 7-9
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

// Default temperature (Claude uses 0-1 range)
const DEFAULT_TEMPERATURE = 0.7;

// Maximum output tokens
const DEFAULT_MAX_TOKENS = 4096;

// ============================================================================
// ANTHROPIC CLIENT (SINGLETON)
// ============================================================================

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

// ============================================================================
// MAIN API FUNCTIONS
// ============================================================================

/**
 * Makes a message API call to Claude
 *
 * @param {string|Array} messages - Prompt string or array of message objects
 * @param {Object} [options] - API options
 * @param {string} [options.model='claude-sonnet-4-20250514'] - Model to use
 * @param {string} [options.system] - System prompt
 * @param {number} [options.temperature=0.7] - Sampling temperature
 * @param {number} [options.maxTokens=4096] - Max output tokens
 * @param {string} [options.episodeId] - Episode ID for logging
 * @param {number} [options.stageNumber] - Stage number for logging
 * @returns {Promise<Object>} Response with content and usage stats
 *
 * @example
 * const result = await callClaude('Refine this blog post: ...', {
 *   system: 'You are an expert editor specializing in therapy content.'
 * });
 * console.log(result.content);
 */
export async function callClaude(messages, options = {}) {
  const {
    model = DEFAULT_MODEL,
    system = '',
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
  const retryConfig = createAPIRetryConfig('Anthropic');

  const response = await retryWithBackoff(async () => {
    try {
      const message = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: system || undefined,
        messages: messagesArray,
      });

      return message;
    } catch (error) {
      // Extract status code from Anthropic error
      const status = error.status || error.statusCode || 500;

      // Check for token limit errors and log detailed info
      if (isTokenLimitError(error)) {
        const tokenDetails = extractTokenLimitDetails(error.message);
        const promptLength = messagesArray.reduce((acc, m) => acc + (m.content?.length || 0), 0);
        const systemLength = system?.length || 0;
        const estimatedPromptTokens = estimateTokens(
          messagesArray.map(m => m.content).join(' ') + (system || '')
        );

        logger.error('Token limit exceeded in Claude call - content may be too long', {
          model,
          episodeId,
          stageNumber,
          promptCharacters: promptLength,
          systemCharacters: systemLength,
          estimatedPromptTokens,
          maxTokens: tokenDetails?.maxTokens,
          usedTokens: tokenDetails?.usedTokens,
          suggestion: 'Consider using a shorter transcript or enabling transcript truncation',
          errorMessage: error.message,
        });

        // Create a more descriptive error for token limits
        throw new APIError(
          'anthropic',
          400,
          `Content too long for Claude: input exceeds model context limit. The content needs to be shortened.`,
          {
            code: 'context_length_exceeded',
            type: error.type,
            tokenDetails,
            isTokenLimit: true,
          }
        );
      }

      throw new APIError(
        'anthropic',
        status,
        error.message,
        { type: error.type, code: error.error?.type }
      );
    }
  }, retryConfig);

  const durationMs = Date.now() - startTime;

  // Extract usage stats
  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const cost = calculateCost(model, inputTokens, outputTokens);

  // Log API call
  logger.apiCall('anthropic', model, inputTokens, outputTokens, durationMs, cost);

  // Log to database (non-blocking)
  apiLogRepo.create({
    provider: 'anthropic',
    model,
    endpoint: '/v1/messages',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
    episode_id: episodeId,
    stage_number: stageNumber,
    response_time_ms: durationMs,
    success: true,
  }).catch(() => {}); // Ignore logging errors

  // Extract text content from response
  const content = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');

  return {
    content,
    model: response.model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost,
    durationMs,
    stopReason: response.stop_reason,
  };
}

/**
 * Calls Claude with a specific role/persona system prompt
 * Convenience method for common pipeline patterns
 *
 * @param {string} role - Role description for system prompt
 * @param {string} task - The task/prompt to complete
 * @param {Object} [options] - Additional options
 * @returns {Promise<Object>} Response
 */
export async function callClaudeWithRole(role, task, options = {}) {
  return callClaude(task, {
    ...options,
    system: role,
  });
}

/**
 * Calls Claude for editing/refinement tasks
 * Uses a lower temperature for more consistent editing
 *
 * @param {string} content - Content to edit
 * @param {string} instructions - Editing instructions
 * @param {Object} [options] - Additional options
 * @returns {Promise<Object>} Response
 */
export async function callClaudeEditor(content, instructions, options = {}) {
  const systemPrompt = `You are an expert editor specializing in therapy and mental health content.
Your task is to refine and polish content while maintaining the author's voice.

Editing Guidelines:
- Fix grammar and punctuation without changing tone
- Improve flow and transitions
- Remove AI-sounding phrases
- Ensure clinical accuracy
- Keep the warm, professional voice
- Do not add content that wasn't there
- Do not remove key information`;

  const userPrompt = `${instructions}

CONTENT TO EDIT:
${content}`;

  return callClaude(userPrompt, {
    ...options,
    system: systemPrompt,
    temperature: 0.5, // Lower temperature for editing consistency
  });
}

/**
 * Calls Claude for creative content generation
 * Uses slightly higher temperature for variety
 *
 * @param {string} prompt - Generation prompt
 * @param {string} context - Context/background information
 * @param {Object} [options] - Additional options
 * @returns {Promise<Object>} Response
 */
export async function callClaudeCreative(prompt, context, options = {}) {
  const systemPrompt = `You are an expert content creator specializing in therapy and mental health content.
Create engaging, authentic content that resonates with audiences seeking mental health insights.

Style Guidelines:
- Write in a warm, accessible tone
- Avoid therapy clichés and AI-sounding phrases
- Be specific and practical
- Use conversational language
- Create content that sounds human, not AI-generated`;

  const userPrompt = context
    ? `CONTEXT:\n${context}\n\nTASK:\n${prompt}`
    : prompt;

  return callClaude(userPrompt, {
    ...options,
    system: systemPrompt,
    temperature: 0.8, // Higher temperature for creativity
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Builds a user message object
 * @param {string} content - Message content
 * @returns {Object} Message object
 */
export function userMessage(content) {
  return { role: 'user', content };
}

/**
 * Builds an assistant message object
 * @param {string} content - Message content
 * @returns {Object} Message object
 */
export function assistantMessage(content) {
  return { role: 'assistant', content };
}

/**
 * Creates a multi-turn conversation
 * @param {...Object} messages - Alternating user/assistant messages
 * @returns {Array} Message array
 */
export function conversation(...messages) {
  return messages;
}

/**
 * Tests the Anthropic connection with a simple call
 * @returns {Promise<boolean>} True if connection works
 */
export async function testConnection() {
  try {
    const result = await callClaude('Reply with exactly "ok"', {
      maxTokens: 10,
    });
    return result.content.toLowerCase().includes('ok');
  } catch (error) {
    logger.error('Anthropic connection test failed', { error: error.message });
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  callClaude,
  callClaudeWithRole,
  callClaudeEditor,
  callClaudeCreative,
  userMessage,
  assistantMessage,
  conversation,
  testConnection,
  DEFAULT_MODEL,
};
