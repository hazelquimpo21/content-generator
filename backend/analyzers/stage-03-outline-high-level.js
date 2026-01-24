/**
 * ============================================================================
 * STAGE 3: BLOG SELECTION & DUAL ARTICLE PLANNING
 * ============================================================================
 * Selects the best blog idea from Stage 2 and creates outlines for
 * TWO articles:
 *   1. Episode Recap (promotes the podcast episode)
 *   2. Topic Article (standalone piece based on selected blog idea)
 *
 * Input: Stage 0-2 outputs + evergreen content
 * Output: Selected blog idea + outlines for both articles
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

const DUAL_ARTICLE_PLANNING_SCHEMA = {
  name: 'dual_article_planning',
  description: 'Select best blog idea and create outlines for two articles',
  parameters: {
    type: 'object',
    properties: {
      selected_blog_idea: {
        type: 'object',
        description: 'The blog idea chosen from Stage 2',
        properties: {
          title: {
            type: 'string',
            description: 'The title of the chosen blog idea',
          },
          reasoning: {
            type: 'string',
            description: 'Why this idea was selected over the others',
          },
          original_index: {
            type: 'number',
            description: 'Index of the idea in the Stage 2 blog_ideas array (0-5)',
          },
        },
        required: ['title', 'reasoning'],
      },
      episode_recap_outline: {
        type: 'object',
        description: 'Outline for Article 1: Episode Recap (promotes the episode)',
        properties: {
          working_title: {
            type: 'string',
            description: 'Compelling title that promotes the episode',
          },
          hook: {
            type: 'object',
            properties: {
              approach: {
                type: 'string',
                description: 'What tension, insight, or moment to lead with',
              },
              hook_type: {
                type: 'string',
                enum: ['tension', 'insight', 'story', 'question_answered', 'bold_claim'],
              },
            },
            required: ['approach', 'hook_type'],
          },
          what_episode_covers: {
            type: 'string',
            description: 'Narrative overview of key themes to highlight',
          },
          key_insights: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                insight: { type: 'string' },
                quote_to_use: { type: 'string', description: 'Quote from Stage 2 to integrate' },
              },
              required: ['insight'],
            },
            minItems: 2,
            maxItems: 3,
          },
          why_listen: {
            type: 'string',
            description: 'What makes this episode worth the time',
          },
          cta_approach: {
            type: 'string',
            description: 'How to direct them to the episode',
          },
          estimated_word_count: {
            type: 'number',
            description: 'Target word count (aim for 750)',
          },
        },
        required: ['working_title', 'hook', 'what_episode_covers', 'key_insights', 'why_listen', 'cta_approach'],
      },
      topic_article_outline: {
        type: 'object',
        description: 'Outline for Article 2: Topic Article (standalone piece)',
        properties: {
          working_title: {
            type: 'string',
            description: 'Compelling standalone title',
          },
          hook: {
            type: 'object',
            properties: {
              approach: {
                type: 'string',
                description: 'Specific moment, problem, or insight to lead with',
              },
              hook_type: {
                type: 'string',
                enum: ['problem', 'counterintuitive', 'moment', 'statistic', 'bold_statement'],
              },
            },
            required: ['approach', 'hook_type'],
          },
          context: {
            type: 'string',
            description: 'What to establish - stakes, misconceptions',
          },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                section_title: {
                  type: 'string',
                  description: 'Specific, descriptive section heading',
                },
                purpose: {
                  type: 'string',
                  description: 'What this section accomplishes',
                },
                word_count_target: {
                  type: 'number',
                  description: 'Target words for this section',
                },
                quotes_or_tips_to_use: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'References to Stage 2 quotes/tips to integrate',
                },
              },
              required: ['section_title', 'purpose', 'word_count_target'],
            },
            minItems: 3,
            maxItems: 4,
          },
          takeaway: {
            type: 'string',
            description: 'What to leave them with - specific action or thought',
          },
          estimated_word_count: {
            type: 'number',
            description: 'Target word count (aim for 750)',
          },
        },
        required: ['working_title', 'hook', 'context', 'sections', 'takeaway'],
      },
    },
    required: ['selected_blog_idea', 'episode_recap_outline', 'topic_article_outline'],
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

function validateOutput(data, episodeId) {
  logger.debug('Validating Stage 3 dual article planning output', { episodeId });

  // Validate selected blog idea
  if (!data.selected_blog_idea) {
    throw new ValidationError('selected_blog_idea', 'Missing selected blog idea');
  }

  if (!data.selected_blog_idea.title) {
    throw new ValidationError('selected_blog_idea.title', 'Selected idea must have a title');
  }

  if (!data.selected_blog_idea.reasoning) {
    throw new ValidationError('selected_blog_idea.reasoning', 'Must explain why this idea was chosen');
  }

  // Validate episode recap outline
  if (!data.episode_recap_outline) {
    throw new ValidationError('episode_recap_outline', 'Missing episode recap outline');
  }

  const recapOutline = data.episode_recap_outline;
  if (!recapOutline.working_title) {
    throw new ValidationError('episode_recap_outline.working_title', 'Episode recap needs a title');
  }

  if (!recapOutline.hook?.approach) {
    throw new ValidationError('episode_recap_outline.hook', 'Episode recap needs a hook');
  }

  if (!recapOutline.key_insights || recapOutline.key_insights.length < 2) {
    throw new ValidationError('episode_recap_outline.key_insights', 'Need at least 2 key insights');
  }

  // Validate topic article outline
  if (!data.topic_article_outline) {
    throw new ValidationError('topic_article_outline', 'Missing topic article outline');
  }

  const topicOutline = data.topic_article_outline;
  if (!topicOutline.working_title) {
    throw new ValidationError('topic_article_outline.working_title', 'Topic article needs a title');
  }

  if (!topicOutline.hook?.approach) {
    throw new ValidationError('topic_article_outline.hook', 'Topic article needs a hook');
  }

  if (!topicOutline.sections || topicOutline.sections.length < 3) {
    throw new ValidationError('topic_article_outline.sections', 'Need at least 3 sections');
  }

  // Validate each section in topic article
  let totalWords = 0;
  for (let i = 0; i < topicOutline.sections.length; i++) {
    const s = topicOutline.sections[i];
    if (!s.section_title) {
      throw new ValidationError(`topic_article_outline.sections[${i}].section_title`, 'Section title required');
    }
    if (!s.purpose) {
      throw new ValidationError(`topic_article_outline.sections[${i}].purpose`, 'Section purpose required');
    }
    if (!s.word_count_target || s.word_count_target < 50) {
      throw new ValidationError(`topic_article_outline.sections[${i}].word_count_target`, 'Invalid word count');
    }
    totalWords += s.word_count_target;
  }

  if (!topicOutline.takeaway) {
    throw new ValidationError('topic_article_outline.takeaway', 'Topic article needs a takeaway');
  }

  logger.info('Stage 3 dual article planning validation passed', {
    episodeId,
    selectedIdeaTitle: data.selected_blog_idea.title,
    recapTitle: recapOutline.working_title,
    topicTitle: topicOutline.working_title,
    topicSectionCount: topicOutline.sections.length,
  });

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Selects the best blog idea from Stage 2 and creates outlines for two articles:
 *   1. Episode Recap - promotes the podcast episode
 *   2. Topic Article - standalone piece based on selected idea
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Transcript text
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.previousStages - Previous stage outputs (0-2)
 * @returns {Promise<Object>} Result with dual article outlines
 */
export async function planDualArticles(context) {
  const { episodeId, transcript, evergreen, previousStages } = context;

  logger.stageStart(3, 'Blog Selection & Dual Article Planning', episodeId);

  // Validate we have Stage 2 output with blog ideas
  const stage2Output = previousStages[2];
  if (!stage2Output?.blog_ideas || stage2Output.blog_ideas.length < 6) {
    throw new ValidationError('previousStages[2]', 'Stage 2 must provide 6 blog ideas');
  }

  logger.info('Planning dual articles', {
    episodeId,
    blogIdeasCount: stage2Output.blog_ideas.length,
    quotesCount: stage2Output.quotes?.length || 0,
    tipsCount: stage2Output.tips?.length || 0,
  });

  const prompt = await loadStagePrompt('stage-03-blog-outline', {
    transcript,
    evergreen,
    previousStages,
  });

  const response = await callOpenAIWithFunctions(
    prompt,
    [DUAL_ARTICLE_PLANNING_SCHEMA],
    {
      episodeId,
      stageNumber: 3,
      functionCall: 'dual_article_planning',
      temperature: 0.7,
    }
  );

  const outputData = response.functionCall;

  if (!outputData) {
    throw new ValidationError('response', 'No function call output returned');
  }

  validateOutput(outputData, episodeId);

  logger.stageComplete(3, 'Blog Selection & Dual Article Planning', episodeId, response.durationMs, response.cost);

  logger.info('Dual article planning complete', {
    episodeId,
    selectedIdea: outputData.selected_blog_idea.title,
    recapTitle: outputData.episode_recap_outline.working_title,
    topicTitle: outputData.topic_article_outline.working_title,
  });

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

// Export aliases for compatibility
export { planDualArticles as outlineHighLevel };
export default planDualArticles;
