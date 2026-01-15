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
 *   const cost = calculateCost('gpt-5-mini', 1000, 500);
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
  // GPT-5 mini - main model for stages 1-6
  'gpt-5-mini': {
    input: 0.30,    // $0.30 per 1M input tokens
    output: 1.25,   // $1.25 per 1M output tokens
    cached_input: 0.15, // Cached prompts are 50% off
  },
  // GPT-4o-mini - legacy, kept for backwards compatibility
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
 * @param {string} model - Model identifier (e.g., 'gpt-5-mini', 'claude-sonnet-4-20250514')
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {Object} [options] - Additional options
 * @param {number} [options.cachedInputTokens=0] - Tokens served from cache
 * @returns {number} Cost in USD
 *
 * @example
 * const cost = calculateCost('gpt-5-mini', 1500, 800);
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
 *
 * Stage 0: Preprocessing (only runs for long transcripts > 8000 tokens)
 * - Uses full transcript input, outputs ~2000 token summary + quotes
 * - Uses Claude Haiku (200K context window, cheap)
 *
 * Stages 1-2: Use preprocessed summary if Stage 0 ran, otherwise raw transcript
 * Stages 3-7: Use outputs from previous stages (smaller context)
 * Stage 8: Now runs 4 parallel platform-specific analyzers (Instagram, Twitter, LinkedIn, Facebook)
 * Stage 9: Email campaign
 */
const STAGE_TOKEN_ESTIMATES = {
  0: { input: 0, output: 2500 },     // Preprocessing (input varies by transcript size)
  1: { input: 3000, output: 500 },   // Transcript Analysis (uses preprocessed if available)
  2: { input: 3500, output: 600 },   // Quote Extraction (uses preprocessed if available)
  3: { input: 2000, output: 400 },   // Blog Outline High Level
  4: { input: 2500, output: 800 },   // Paragraph Outlines
  5: { input: 2000, output: 1200 },  // Headlines
  6: { input: 4000, output: 1500 },  // Draft Generation
  7: { input: 3000, output: 1200 },  // Refinement (Claude)
  9: { input: 2000, output: 1500 },  // Email Campaign (Claude)
};

/**
 * Stage 8 is now 4 parallel platform-specific analyzers
 * Each generates 5 posts with platform-specific formatting
 */
const STAGE_8_PLATFORM_ESTIMATES = {
  instagram: { input: 2500, output: 600 },  // 5 posts with captions + hashtags
  twitter: { input: 2500, output: 400 },    // 5 short posts (<280 chars each)
  linkedin: { input: 2500, output: 700 },   // 5 professional posts (longer form)
  facebook: { input: 2500, output: 600 },   // 5 community posts
};

const STAGE_MODELS = {
  0: 'claude-3-5-haiku-20241022',  // Haiku for preprocessing (200K context, cheap)
  1: 'gpt-5-mini',
  2: 'gpt-5-mini',
  3: 'gpt-5-mini',
  4: 'gpt-5-mini',
  5: 'gpt-5-mini',
  6: 'gpt-5-mini',
  7: 'claude-sonnet-4-20250514',
  9: 'claude-sonnet-4-20250514',
};

// Stage 8 models (all use Sonnet for quality social content)
const STAGE_8_PLATFORM_MODELS = {
  instagram: 'claude-sonnet-4-20250514',
  twitter: 'claude-sonnet-4-20250514',
  linkedin: 'claude-sonnet-4-20250514',
  facebook: 'claude-sonnet-4-20250514',
};

// Threshold for when preprocessing is needed (in estimated tokens)
const PREPROCESSING_THRESHOLD = 8000;

/**
 * Estimates total cost for processing an episode
 * Includes Stage 0 preprocessing for long transcripts
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
  const needsPreprocessing = transcriptTokens > PREPROCESSING_THRESHOLD;

  let totalCost = 0;
  const stageBreakdown = [];

  // Stage 0: Preprocessing (only for long transcripts)
  if (needsPreprocessing) {
    const stage0Model = STAGE_MODELS[0];
    const stage0Input = transcriptTokens + 500; // transcript + prompt overhead
    const stage0Output = STAGE_TOKEN_ESTIMATES[0].output;
    const stage0Cost = calculateCost(stage0Model, stage0Input, stage0Output);
    totalCost += stage0Cost;

    stageBreakdown.push({
      stage: 0,
      name: 'Transcript Preprocessing',
      model: stage0Model,
      inputTokens: stage0Input,
      outputTokens: stage0Output,
      cost: stage0Cost,
      note: 'Uses Claude Haiku (200K context) to compress long transcript',
    });
  } else {
    stageBreakdown.push({
      stage: 0,
      name: 'Transcript Preprocessing',
      model: STAGE_MODELS[0],
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      note: 'Skipped - transcript small enough for direct processing',
    });
  }

  // Stages 1-7 (non-social stages)
  for (let stage = 1; stage <= 7; stage++) {
    const { input, output } = STAGE_TOKEN_ESTIMATES[stage];
    const model = STAGE_MODELS[stage];

    let adjustedInput;
    if (stage <= 2) {
      // Stages 1-2: Use preprocessed summary (~3000 tokens) or full transcript
      adjustedInput = needsPreprocessing
        ? input + 3000  // preprocessed summary size
        : input + transcriptTokens;
    } else if (stage <= 6) {
      // Stages 3-6: Use outputs from previous stages (not full transcript)
      adjustedInput = input + 2000; // approximate context from previous stages
    } else {
      // Stage 7 (Claude): Smaller context from previous stages
      adjustedInput = input + Math.min(transcriptTokens, 1000);
    }

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

  // Stage 8: 4 parallel platform-specific social content generators
  const platforms = ['instagram', 'twitter', 'linkedin', 'facebook'];
  let stage8TotalCost = 0;
  const stage8Platforms = [];

  for (const platform of platforms) {
    const { input, output } = STAGE_8_PLATFORM_ESTIMATES[platform];
    const model = STAGE_8_PLATFORM_MODELS[platform];

    // Each platform gets same context (blog post, summary, quotes, etc.)
    const adjustedInput = input + Math.min(transcriptTokens, 1000);

    const platformCost = calculateCost(model, adjustedInput, output);
    stage8TotalCost += platformCost;

    stage8Platforms.push({
      platform,
      model,
      inputTokens: adjustedInput,
      outputTokens: output,
      cost: platformCost,
    });
  }

  totalCost += stage8TotalCost;
  stageBreakdown.push({
    stage: 8,
    name: 'Social Content',
    model: 'claude-sonnet-4-20250514 (x4)',
    inputTokens: stage8Platforms.reduce((sum, p) => sum + p.inputTokens, 0),
    outputTokens: stage8Platforms.reduce((sum, p) => sum + p.outputTokens, 0),
    cost: stage8TotalCost,
    note: '4 parallel platform analyzers (Instagram, Twitter, LinkedIn, Facebook)',
    platforms: stage8Platforms,
  });

  // Stage 9: Email Campaign
  {
    const { input, output } = STAGE_TOKEN_ESTIMATES[9];
    const model = STAGE_MODELS[9];
    const adjustedInput = input + Math.min(transcriptTokens, 1000);

    const stageCost = calculateCost(model, adjustedInput, output);
    totalCost += stageCost;

    stageBreakdown.push({
      stage: 9,
      model,
      inputTokens: adjustedInput,
      outputTokens: output,
      cost: stageCost,
    });
  }

  // Calculate estimated time
  // Stages 1-7 + stage 8 (parallel, counts as 1 time slot) + stage 9 = 9 stages
  // Add 1 for preprocessing if needed
  const baseStages = 9; // stages 1-7 + 1 for parallel stage 8 + stage 9
  const totalStages = needsPreprocessing ? baseStages + 1 : baseStages;
  const estimatedTimeSeconds = totalStages * 30;
  const minutes = Math.ceil(estimatedTimeSeconds / 60);

  return {
    transcriptTokens,
    transcriptCharacters: transcript?.length || 0,
    needsPreprocessing,
    preprocessingThreshold: PREPROCESSING_THRESHOLD,
    totalCost,
    formattedCost: `$${totalCost.toFixed(2)}`,
    stageBreakdown,
    estimatedTimeSeconds,
    formattedTime: `~${minutes} minutes`,
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
  STAGE_8_PLATFORM_MODELS,
  STAGE_8_PLATFORM_ESTIMATES,
};
