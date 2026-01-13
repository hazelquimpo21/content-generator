/**
 * ============================================================================
 * STAGE 5: HEADLINES & COPY OPTIONS
 * ============================================================================
 * Generates multiple headline and copy variations for the blog post.
 *
 * Input: Stage 1-3 outputs
 * Output: Headlines, subheadings, taglines, social hooks (JSON)
 * Model: GPT-5 mini (OpenAI)
 * ============================================================================
 */

import { callOpenAIWithFunctions } from '../lib/api-client-openai.js';
import { loadStagePrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// FUNCTION SCHEMA
// ============================================================================

const HEADLINES_SCHEMA = {
  name: 'headline_options',
  description: 'Multiple headline and copy variations',
  parameters: {
    type: 'object',
    properties: {
      headlines: {
        type: 'array',
        items: { type: 'string' },
        minItems: 10,
        maxItems: 15,
        description: 'Main headlines for blog post (40-80 chars)',
      },
      subheadings: {
        type: 'array',
        items: { type: 'string' },
        minItems: 8,
        maxItems: 10,
        description: 'Section subheadings (20-50 chars)',
      },
      taglines: {
        type: 'array',
        items: { type: 'string' },
        minItems: 5,
        maxItems: 7,
        description: 'Short punchy summaries (50-100 chars)',
      },
      social_hooks: {
        type: 'array',
        items: { type: 'string' },
        minItems: 5,
        maxItems: 7,
        description: 'Social media opening lines (60-100 chars)',
      },
    },
    required: ['headlines', 'subheadings', 'taglines', 'social_hooks'],
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

function validateOutput(data) {
  // Check headlines
  if (!data.headlines || data.headlines.length < 10) {
    throw new ValidationError('headlines', 'Need at least 10 headline options');
  }

  // Check subheadings
  if (!data.subheadings || data.subheadings.length < 8) {
    throw new ValidationError('subheadings', 'Need at least 8 subheading options');
  }

  // Check taglines
  if (!data.taglines || data.taglines.length < 5) {
    throw new ValidationError('taglines', 'Need at least 5 tagline options');
  }

  // Check social hooks
  if (!data.social_hooks || data.social_hooks.length < 5) {
    throw new ValidationError('social_hooks', 'Need at least 5 social hook options');
  }

  // Validate headline lengths
  for (let i = 0; i < data.headlines.length; i++) {
    const h = data.headlines[i];
    if (h.length < 20 || h.length > 100) {
      logger.warn('Headline outside recommended length', {
        headline: h,
        length: h.length,
      });
    }
  }

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

export async function generateHeadlines(context) {
  const { episodeId, transcript, evergreen, previousStages } = context;

  logger.stageStart(5, 'Headlines & Copy Options', episodeId);

  const prompt = await loadStagePrompt('stage-05-headlines', {
    transcript,
    evergreen,
    previousStages,
  });

  const response = await callOpenAIWithFunctions(
    prompt,
    [HEADLINES_SCHEMA],
    {
      episodeId,
      stageNumber: 5,
      functionCall: 'headline_options',
      temperature: 0.8, // Higher temp for creative variation
    }
  );

  const outputData = response.functionCall;

  if (!outputData) {
    throw new ValidationError('response', 'No function call output returned');
  }

  validateOutput(outputData);

  logger.stageComplete(5, 'Headlines & Copy Options', episodeId, response.durationMs, response.cost);

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

export default generateHeadlines;
