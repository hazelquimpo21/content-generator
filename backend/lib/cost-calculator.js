/**
 * ============================================================================
 * COST CALCULATOR MODULE
 * ============================================================================
 * Calculates API costs based on token usage for OpenAI and Anthropic models.
 * Pricing is per 1 million tokens and is updated as of January 2025.
 *
 * IMPORTANT: Update pricing tables when providers change their rates!
 *
 * Usage:
 *   import { calculateCost, estimateEpisodeCost } from './lib/cost-calculator.js';
 *   const cost = calculateCost('gpt-4o-mini', 1000, 500);
 * ============================================================================
 */

// ============================================================================
// PRICING TABLES (per 1M tokens)
// Last updated: January 2025
// ============================================================================

/**
 * OpenAI pricing per 1 million tokens
 * Source: https://openai.com/pricing
 */
const OPENAI_PRICING = {
  // GPT-4o-mini - main model for stages 1-6
  'gpt-4o-mini': {
    input: 0.15,    // $0.15 per 1M input tokens
    output: 0.60,   // $0.60 per 1M output tokens
    cached_input: 0.075, // Cached prompts are 50% off
  },
  // GPT-4o - backup/premium option
  'gpt-4o': {
    input: 2.50,
    output: 10.00,
    cached_input: 1.25,
  },
  // GPT-4-turbo - legacy, kept for reference
  'gpt-4-turbo': {
    input: 10.00,
    output: 30.00,
  },
  // GPT-3.5-turbo - cheapest option
  'gpt-3.5-turbo': {
    input: 0.50,
    output: 1.50,
  },
};

/**
 * Anthropic Claude pricing per 1 million tokens
 * Source: https://www.anthropic.com/pricing
 */
const ANTHROPIC_PRICING = {
  // Claude Sonnet 4 - main model for stages 7-9
  'claude-sonnet-4-20250514': {
    input: 3.00,    // $3.00 per 1M input tokens
    output: 15.00,  // $15.00 per 1M output tokens
    cached_input: 0.30, // Cache reads are 90% off
  },
  // Claude 3.5 Sonnet - fallback
  'claude-3-5-sonnet-20241022': {
    input: 3.00,
    output: 15.00,
    cached_input: 0.30,
  },
  // Claude Opus 4 - premium option
  'claude-opus-4-20250514': {
    input: 15.00,
    output: 75.00,
    cached_input: 1.50,
  },
  // Claude Haiku - fast and cheap
  'claude-3-5-haiku-20241022': {
    input: 0.80,
    output: 4.00,
    cached_input: 0.08,
  },
};

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Rough estimate of tokens from text
 * Rule of thumb: ~4 characters per token for English
 * More accurate: ~1.3 tokens per word
 *
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text) return 0;

  // Count words (more accurate than characters)
  const words = text.split(/\s+/).filter(w => w.length > 0).length;

  // ~1.3 tokens per word on average for English
  return Math.ceil(words * 1.3);
}

// ============================================================================
// COST CALCULATION
// ============================================================================

/**
 * Gets pricing info for a model
 * @param {string} model - Model identifier
 * @returns {Object|null} Pricing object or null if unknown
 */
function getPricing(model) {
  // Check OpenAI models
  for (const [key, pricing] of Object.entries(OPENAI_PRICING)) {
    if (model.includes(key)) {
      return { provider: 'openai', ...pricing };
    }
  }

  // Check Anthropic models
  for (const [key, pricing] of Object.entries(ANTHROPIC_PRICING)) {
    if (model.includes(key)) {
      return { provider: 'anthropic', ...pricing };
    }
  }

  return null;
}

/**
 * Calculates the cost of an API call based on token usage
 *
 * @param {string} model - Model identifier (e.g., 'gpt-4o-mini', 'claude-sonnet-4-20250514')
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {Object} [options] - Additional options
 * @param {number} [options.cachedInputTokens=0] - Tokens served from cache
 * @returns {number} Cost in USD
 *
 * @example
 * const cost = calculateCost('gpt-4o-mini', 1500, 800);
 * console.log(`Cost: $${cost.toFixed(4)}`); // Cost: $0.0007
 */
export function calculateCost(model, inputTokens, outputTokens, options = {}) {
  const { cachedInputTokens = 0 } = options;

  const pricing = getPricing(model);

  if (!pricing) {
    // Unknown model - return 0 but log warning
    console.warn(`Unknown model for cost calculation: ${model}`);
    return 0;
  }

  // Calculate cost per million tokens
  const nonCachedInputTokens = inputTokens - cachedInputTokens;

  // Input cost (split between cached and non-cached)
  const inputCost = (nonCachedInputTokens / 1_000_000) * pricing.input;
  const cachedInputCost = pricing.cached_input
    ? (cachedInputTokens / 1_000_000) * pricing.cached_input
    : 0;

  // Output cost
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  // Total cost
  const totalCost = inputCost + cachedInputCost + outputCost;

  return totalCost;
}

/**
 * Calculates cost and returns detailed breakdown
 *
 * @param {string} model - Model identifier
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {Object} Cost breakdown
 */
export function calculateCostDetailed(model, inputTokens, outputTokens) {
  const pricing = getPricing(model);

  if (!pricing) {
    return {
      model,
      provider: 'unknown',
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
    };
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;

  return {
    model,
    provider: pricing.provider,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost,
    outputCost,
    totalCost,
    pricing: {
      inputPer1M: pricing.input,
      outputPer1M: pricing.output,
    },
  };
}

// ============================================================================
// EPISODE COST ESTIMATION
// ============================================================================

/**
 * Average token usage per stage (based on testing)
 * These are estimates - actual usage varies by transcript length
 */
const STAGE_TOKEN_ESTIMATES = {
  1: { input: 3000, output: 500 },   // Transcript Analysis
  2: { input: 3500, output: 600 },   // Quote Extraction
  3: { input: 2000, output: 400 },   // Blog Outline High Level
  4: { input: 2500, output: 800 },   // Paragraph Outlines
  5: { input: 2000, output: 1200 },  // Headlines
  6: { input: 4000, output: 1500 },  // Draft Generation
  7: { input: 3000, output: 1200 },  // Refinement (Claude)
  8: { input: 2500, output: 2000 },  // Social Content (Claude)
  9: { input: 2000, output: 1500 },  // Email Campaign (Claude)
};

const STAGE_MODELS = {
  1: 'gpt-4o-mini',
  2: 'gpt-4o-mini',
  3: 'gpt-4o-mini',
  4: 'gpt-4o-mini',
  5: 'gpt-4o-mini',
  6: 'gpt-4o-mini',
  7: 'claude-sonnet-4-20250514',
  8: 'claude-sonnet-4-20250514',
  9: 'claude-sonnet-4-20250514',
};

/**
 * Estimates total cost for processing an episode
 *
 * @param {string} transcript - Episode transcript
 * @returns {Object} Cost estimate with breakdown
 *
 * @example
 * const estimate = estimateEpisodeCost(transcriptText);
 * console.log(`Estimated cost: $${estimate.totalCost.toFixed(2)}`);
 */
export function estimateEpisodeCost(transcript) {
  const transcriptTokens = estimateTokens(transcript);

  let totalCost = 0;
  const stageBreakdown = [];

  for (let stage = 1; stage <= 9; stage++) {
    const { input, output } = STAGE_TOKEN_ESTIMATES[stage];
    const model = STAGE_MODELS[stage];

    // Adjust input tokens based on transcript length (transcript is passed to each stage)
    const adjustedInput = stage <= 6
      ? input + transcriptTokens
      : input + Math.min(transcriptTokens, 1000); // Claude stages get summarized context

    const stageCost = calculateCost(model, adjustedInput, output);
    totalCost += stageCost;

    stageBreakdown.push({
      stage,
      model,
      inputTokens: adjustedInput,
      outputTokens: output,
      cost: stageCost,
    });
  }

  return {
    transcriptTokens,
    transcriptCharacters: transcript?.length || 0,
    totalCost,
    formattedCost: `$${totalCost.toFixed(2)}`,
    stageBreakdown,
    estimatedTimeSeconds: 9 * 30, // ~30 seconds per stage
    formattedTime: '~4-5 minutes',
  };
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Formats a cost value as currency string
 * @param {number} cost - Cost in USD
 * @param {number} [decimals=4] - Decimal places
 * @returns {string} Formatted cost string
 */
export function formatCost(cost, decimals = 4) {
  return `$${cost.toFixed(decimals)}`;
}

/**
 * Formats token count with thousand separators
 * @param {number} tokens - Token count
 * @returns {string} Formatted token string
 */
export function formatTokens(tokens) {
  return tokens.toLocaleString();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateCost,
  calculateCostDetailed,
  estimateTokens,
  estimateEpisodeCost,
  formatCost,
  formatTokens,
  OPENAI_PRICING,
  ANTHROPIC_PRICING,
  STAGE_MODELS,
};
