/**
 * ============================================================================
 * STAGE 3: BLOG OUTLINE - HIGH LEVEL
 * ============================================================================
 * Creates a high-level structure for a 750-word blog post based on
 * the episode analysis and extracted quotes.
 *
 * Input: Stage 1-2 outputs + evergreen content
 * Output: Blog structure with sections (JSON)
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

const BLOG_OUTLINE_SCHEMA = {
  name: 'blog_outline_high_level',
  description: 'High-level structure for a 750-word blog post',
  parameters: {
    type: 'object',
    properties: {
      // NOTE: We intentionally do NOT include a narrative_summary here.
      // Stage 1's episode_crux already captures the "big picture" message.
      // Duplicating it here would be redundant and waste tokens.
      // The blog-content-compiler uses episode_crux from Stage 1 directly.
      post_structure: {
        type: 'object',
        properties: {
          hook: {
            type: 'string',
            description: 'Opening approach/strategy (not the full text)',
          },
          hook_type: {
            type: 'string',
            enum: ['anecdote', 'bold_statement', 'named_problem', 'scenario', 'statistic'],
            description: 'Type of hook being used',
          },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                section_title: {
                  type: 'string',
                  description: 'Section heading',
                },
                purpose: {
                  type: 'string',
                  description: 'What this section accomplishes',
                },
                key_points: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '2-3 key points this section should cover',
                },
                word_count_target: {
                  type: 'number',
                  description: 'Target word count for this section',
                },
              },
              required: ['section_title', 'purpose', 'word_count_target'],
            },
            minItems: 3,
            maxItems: 4,
          },
          cta: {
            type: 'string',
            description: 'Closing/takeaway approach',
          },
        },
        required: ['hook', 'hook_type', 'sections', 'cta'],
      },
      estimated_total_words: {
        type: 'number',
        description: 'Sum of word count targets (should be ~750)',
      },
    },
    required: ['post_structure', 'estimated_total_words'],
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

function validateOutput(data, episodeId) {
  logger.debug('🔍 Validating Stage 3 outline output', { episodeId });

  // NOTE: We no longer require narrative_summary here.
  // Stage 1's episode_crux serves as the canonical "big picture" summary.
  // This avoids duplicate summarization across stages.

  if (!data.post_structure) {
    logger.error('❌ Missing post_structure', { episodeId });
    throw new ValidationError('post_structure', 'Missing post structure');
  }

  const { post_structure, estimated_total_words } = data;

  // Check hook
  if (!post_structure.hook || post_structure.hook.length < 20) {
    throw new ValidationError('hook', 'Hook description is too short');
  }

  // Check sections
  const sections = post_structure.sections;
  if (!sections || sections.length < 3 || sections.length > 4) {
    throw new ValidationError('sections', 'Must have 3-4 sections');
  }

  // Validate each section
  let totalWords = 0;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!s.section_title) {
      throw new ValidationError(`sections[${i}].section_title`, 'Title is required');
    }
    if (!s.purpose) {
      throw new ValidationError(`sections[${i}].purpose`, 'Purpose is required');
    }
    if (!s.word_count_target || s.word_count_target < 50) {
      throw new ValidationError(`sections[${i}].word_count_target`, 'Invalid word count');
    }
    totalWords += s.word_count_target;
  }

  // Check total word count is reasonable
  if (estimated_total_words < 600 || estimated_total_words > 900) {
    logger.warn('⚠️ Word count estimate outside expected range', {
      episodeId,
      estimated: estimated_total_words,
      calculated: totalWords,
    });
  }

  // Check CTA
  if (!post_structure.cta || post_structure.cta.length < 10) {
    throw new ValidationError('cta', 'CTA description is too short');
  }

  logger.info('✅ Stage 3 outline validation passed', {
    episodeId,
    sectionCount: sections.length,
    estimatedWords: estimated_total_words,
  });

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

export async function outlineHighLevel(context) {
  const { episodeId, transcript, evergreen, previousStages } = context;

  logger.stageStart(3, 'Blog Outline - High Level', episodeId);

  const prompt = await loadStagePrompt('stage-03-blog-outline', {
    transcript,
    evergreen,
    previousStages,
  });

  const response = await callOpenAIWithFunctions(
    prompt,
    [BLOG_OUTLINE_SCHEMA],
    {
      episodeId,
      stageNumber: 3,
      functionCall: 'blog_outline_high_level',
      temperature: 0.7,
    }
  );

  const outputData = response.functionCall;

  if (!outputData) {
    throw new ValidationError('response', 'No function call output returned');
  }

  validateOutput(outputData, episodeId);

  logger.stageComplete(3, 'Blog Outline - High Level', episodeId, response.durationMs, response.cost);

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

export default outlineHighLevel;
