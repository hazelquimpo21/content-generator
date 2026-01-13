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
import { calculateCost } from './cost-calculator.js';
import { apiLogRepo } from './supabase-client.js';

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

/**
 * Calls Claude with tool_use (function calling) for structured JSON output.
 * This is the preferred method for extracting structured data as it:
 * - Enforces the schema at the model level
 * - Eliminates JSON parsing issues
 * - Provides better type safety
 *
 * @param {string} prompt - The prompt/task for Claude
 * @param {Object} options - Configuration options
 * @param {string} options.toolName - Name of the tool (used in tool_choice)
 * @param {string} options.toolDescription - Description of what the tool does
 * @param {Object} options.inputSchema - JSON Schema for the tool's input parameters
 * @param {string} [options.model] - Model to use (defaults to claude-3-5-haiku for preprocessing)
 * @param {string} [options.system] - System prompt
 * @param {number} [options.temperature=0.3] - Temperature (lower for structured output)
 * @param {number} [options.maxTokens=8192] - Max output tokens
 * @param {string} [options.episodeId] - Episode ID for logging
 * @param {number} [options.stageNumber] - Stage number for logging
 * @returns {Promise<Object>} Response with toolInput (parsed JSON) and usage stats
 *
 * @example
 * const result = await callClaudeStructured('Extract quotes from this text...', {
 *   toolName: 'extract_quotes',
 *   toolDescription: 'Extract verbatim quotes from the transcript',
 *   inputSchema: {
 *     type: 'object',
 *     properties: {
 *       quotes: {
 *         type: 'array',
 *         items: { type: 'object', properties: { quote: { type: 'string' } } }
 *       }
 *     },
 *     required: ['quotes']
 *   }
 * });
 * console.log(result.toolInput.quotes);
 */
export async function callClaudeStructured(prompt, options = {}) {
  const {
    toolName,
    toolDescription,
    inputSchema,
    model = DEFAULT_MODEL,
    system = '',
    temperature = 0.3, // Lower temperature for structured output consistency
    maxTokens = DEFAULT_MAX_TOKENS,
    episodeId = null,
    stageNumber = null,
  } = options;

  // Validate required options
  if (!toolName || !toolDescription || !inputSchema) {
    throw new Error('callClaudeStructured requires toolName, toolDescription, and inputSchema');
  }

  // Define the tool for structured output
  const tool = {
    name: toolName,
    description: toolDescription,
    input_schema: inputSchema,
  };

  const startTime = Date.now();
  const retryConfig = createAPIRetryConfig('Anthropic');

  logger.debug('📤 Calling Claude with tool_use for structured output', {
    episodeId,
    model,
    toolName,
    schemaProperties: Object.keys(inputSchema.properties || {}),
  });

  const response = await retryWithBackoff(async () => {
    try {
      const message = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: system || undefined,
        messages: [{ role: 'user', content: prompt }],
        tools: [tool],
        // Force the model to use our tool (ensures structured output)
        tool_choice: { type: 'tool', name: toolName },
      });

      return message;
    } catch (error) {
      const status = error.status || error.statusCode || 500;
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

  // Extract the tool use result from the response
  // The response.content will contain a tool_use block with the structured input
  const toolUseBlock = response.content.find(block => block.type === 'tool_use');

  if (!toolUseBlock) {
    logger.error('❌ Claude did not return tool_use block', {
      episodeId,
      contentTypes: response.content.map(b => b.type),
      stopReason: response.stop_reason,
    });
    throw new APIError(
      'anthropic',
      500,
      'Expected tool_use response but got none',
      { contentTypes: response.content.map(b => b.type) }
    );
  }

  logger.debug('✅ Claude returned structured output via tool_use', {
    episodeId,
    toolName: toolUseBlock.name,
    inputKeys: Object.keys(toolUseBlock.input || {}),
  });

  return {
    toolInput: toolUseBlock.input, // The structured JSON data
    toolName: toolUseBlock.name,
    toolId: toolUseBlock.id,
    model: response.model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost,
    durationMs,
    stopReason: response.stop_reason,
  };
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
  callClaudeStructured,
  callClaudeWithRole,
  callClaudeEditor,
  callClaudeCreative,
  userMessage,
  assistantMessage,
  conversation,
  testConnection,
  DEFAULT_MODEL,
};
