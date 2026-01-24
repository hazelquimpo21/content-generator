/**
 * ============================================================================
 * STAGE 3: BLOG SELECTION & DUAL ARTICLE PLANNING (PARALLEL)
 * ============================================================================
 * Selects the best blog idea from Stage 2 and creates outlines for
 * TWO articles IN PARALLEL:
 *   1. Episode Recap (promotes the podcast episode)
 *   2. Topic Article (standalone piece based on selected blog idea)
 *
 * Architecture:
 * - Step 1: Select best blog idea from Stage 2's 6 ideas
 * - Step 2: Generate BOTH outlines in parallel:
 *   - Episode Recap outline (doesn't depend on selected idea)
 *   - Topic Article outline (uses selected idea as its foundation)
 *
 * Input: Stage 0-2 outputs + evergreen content
 * Output: Selected blog idea + outlines for both articles
 * Model: GPT-5 mini (OpenAI)
 * ============================================================================
 */

import { callOpenAIWithFunctions } from '../lib/api-client-openai.js';
import { loadStagePrompt, loadPrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// FUNCTION SCHEMAS (Separate for parallel execution)
// ============================================================================

/**
 * Schema for Step 1: Blog idea selection
 */
const BLOG_SELECTION_SCHEMA = {
  name: 'select_blog_idea',
  description: 'Select the best blog idea from the 6 options for the Topic Article',
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
            description: 'Why this idea was selected over the others (2-3 sentences)',
          },
          original_index: {
            type: 'number',
            description: 'Index of the idea in the Stage 2 blog_ideas array (0-5)',
          },
          angle: {
            type: 'string',
            description: 'The angle/hook from the original idea',
          },
        },
        required: ['title', 'reasoning', 'original_index'],
      },
    },
    required: ['selected_blog_idea'],
  },
};

/**
 * Schema for Episode Recap outline
 */
const EPISODE_RECAP_OUTLINE_SCHEMA = {
  name: 'create_episode_recap_outline',
  description: 'Create outline for Episode Recap article that promotes the podcast',
  parameters: {
    type: 'object',
    properties: {
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
    },
    required: ['episode_recap_outline'],
  },
};

/**
 * Schema for Topic Article outline
 */
const TOPIC_ARTICLE_OUTLINE_SCHEMA = {
  name: 'create_topic_article_outline',
  description: 'Create outline for standalone Topic Article based on selected blog idea',
  parameters: {
    type: 'object',
    properties: {
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
    required: ['topic_article_outline'],
  },
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateSelectedIdea(data, episodeId) {
  if (!data?.selected_blog_idea) {
    throw new ValidationError('selected_blog_idea', 'Missing selected blog idea');
  }
  if (!data.selected_blog_idea.title) {
    throw new ValidationError('selected_blog_idea.title', 'Selected idea must have a title');
  }
  if (!data.selected_blog_idea.reasoning) {
    throw new ValidationError('selected_blog_idea.reasoning', 'Must explain why this idea was chosen');
  }
  logger.debug('Blog idea selection validated', { episodeId, title: data.selected_blog_idea.title });
  return true;
}

function validateEpisodeRecapOutline(data, episodeId) {
  const outline = data?.episode_recap_outline;
  if (!outline) {
    throw new ValidationError('episode_recap_outline', 'Missing episode recap outline');
  }
  if (!outline.working_title) {
    throw new ValidationError('episode_recap_outline.working_title', 'Episode recap needs a title');
  }
  if (!outline.hook?.approach) {
    throw new ValidationError('episode_recap_outline.hook', 'Episode recap needs a hook');
  }
  if (!outline.key_insights || outline.key_insights.length < 2) {
    throw new ValidationError('episode_recap_outline.key_insights', 'Need at least 2 key insights');
  }
  logger.debug('Episode recap outline validated', { episodeId, title: outline.working_title });
  return true;
}

function validateTopicArticleOutline(data, episodeId) {
  const outline = data?.topic_article_outline;
  if (!outline) {
    throw new ValidationError('topic_article_outline', 'Missing topic article outline');
  }
  if (!outline.working_title) {
    throw new ValidationError('topic_article_outline.working_title', 'Topic article needs a title');
  }
  if (!outline.hook?.approach) {
    throw new ValidationError('topic_article_outline.hook', 'Topic article needs a hook');
  }
  if (!outline.sections || outline.sections.length < 3) {
    throw new ValidationError('topic_article_outline.sections', 'Need at least 3 sections');
  }

  // Validate sections
  for (let i = 0; i < outline.sections.length; i++) {
    const s = outline.sections[i];
    if (!s.section_title) {
      throw new ValidationError(`topic_article_outline.sections[${i}].section_title`, 'Section title required');
    }
    if (!s.purpose) {
      throw new ValidationError(`topic_article_outline.sections[${i}].purpose`, 'Section purpose required');
    }
    if (!s.word_count_target || s.word_count_target < 50) {
      throw new ValidationError(`topic_article_outline.sections[${i}].word_count_target`, 'Invalid word count');
    }
  }

  if (!outline.takeaway) {
    throw new ValidationError('topic_article_outline.takeaway', 'Topic article needs a takeaway');
  }

  logger.debug('Topic article outline validated', {
    episodeId,
    title: outline.working_title,
    sectionCount: outline.sections.length,
  });
  return true;
}

// ============================================================================
// STEP 1: BLOG IDEA SELECTION
// ============================================================================

async function selectBlogIdea(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.info('  → Step 1: Selecting best blog idea...', { episodeId });

  const stage2Output = previousStages[2];
  const blogIdeas = stage2Output?.blog_ideas || [];

  // Build a focused prompt for blog idea selection
  const selectionPrompt = `
You are selecting the BEST blog idea from 6 options to turn into a standalone Topic Article.

## The 6 Blog Ideas from Stage 2:
${blogIdeas.map((idea, i) => `
${i + 1}. **${idea.title}**
   - Angle: ${idea.angle}
   - Why it resonates: ${idea.why_it_resonates}
   - Searchability: ${idea.searchability || 'medium'}
`).join('\n')}

## Selection Criteria:
- Which idea has the strongest standalone potential?
- Which would resonate most with ${evergreen?.podcast_info?.target_audience || 'the target audience'}?
- Which has the best searchability/SEO potential?
- Which offers the clearest value to readers who've never heard the podcast?

Select ONE idea and explain your reasoning.
`;

  const response = await callOpenAIWithFunctions(
    selectionPrompt,
    [BLOG_SELECTION_SCHEMA],
    {
      episodeId,
      stageNumber: 3,
      subStage: 'blog_selection',
      functionCall: 'select_blog_idea',
      temperature: 0.5, // Lower temp for more focused selection
    }
  );

  const result = response.functionCall;
  validateSelectedIdea(result, episodeId);

  // Enrich with original idea data
  const originalIndex = result.selected_blog_idea.original_index;
  if (originalIndex >= 0 && originalIndex < blogIdeas.length) {
    result.selected_blog_idea.angle = blogIdeas[originalIndex].angle;
    result.selected_blog_idea.why_it_resonates = blogIdeas[originalIndex].why_it_resonates;
    result.selected_blog_idea.searchability = blogIdeas[originalIndex].searchability;
  }

  logger.info('  ✓ Blog idea selected', {
    episodeId,
    title: result.selected_blog_idea.title,
    index: originalIndex,
  });

  return {
    data: result,
    inputTokens: response.inputTokens || 0,
    outputTokens: response.outputTokens || 0,
    cost: response.cost || 0,
    durationMs: response.durationMs || 0,
  };
}

// ============================================================================
// STEP 2A: EPISODE RECAP OUTLINE (runs in parallel)
// ============================================================================

async function createEpisodeRecapOutline(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.info('  → Creating Episode Recap outline...', { episodeId });

  const stage1Output = previousStages[1] || {};
  const stage2Output = previousStages[2] || {};

  // Build focused prompt for Episode Recap outline
  const recapPrompt = `
You are creating an outline for an EPISODE RECAP blog post.

This article PROMOTES the podcast episode. Readers should:
- Understand what the episode covers
- Get genuine value from the summary itself
- Want to listen to the full episode

## Episode Context:
**Podcast:** ${evergreen?.podcast_info?.name || 'The Podcast'}
**Host:** ${evergreen?.therapist_profile?.name || 'The Host'}
**Episode Summary:** ${stage1Output.summary || 'No summary available'}
**Episode Crux:** ${stage1Output.episode_crux || 'No crux available'}

## Available Quotes (pick 2-3 for key insights):
${(stage2Output.quotes || []).slice(0, 6).map((q, i) => `${i + 1}. "${q.text}" — ${q.speaker}`).join('\n')}

## Target Audience:
${evergreen?.podcast_info?.target_audience || 'General audience interested in mental health'}

Create an outline that:
1. Opens with a compelling hook (not a question)
2. Highlights 2-3 key insights with supporting quotes
3. Explains why this episode is worth listening to
4. Ends with a natural CTA to listen

Target word count: ~750 words
`;

  const response = await callOpenAIWithFunctions(
    recapPrompt,
    [EPISODE_RECAP_OUTLINE_SCHEMA],
    {
      episodeId,
      stageNumber: 3,
      subStage: 'episode_recap_outline',
      functionCall: 'create_episode_recap_outline',
      temperature: 0.7,
    }
  );

  const result = response.functionCall;
  validateEpisodeRecapOutline(result, episodeId);

  logger.info('  ✓ Episode Recap outline created', {
    episodeId,
    title: result.episode_recap_outline.working_title,
    insightCount: result.episode_recap_outline.key_insights?.length,
  });

  return {
    data: result,
    inputTokens: response.inputTokens || 0,
    outputTokens: response.outputTokens || 0,
    cost: response.cost || 0,
    durationMs: response.durationMs || 0,
  };
}

// ============================================================================
// STEP 2B: TOPIC ARTICLE OUTLINE (runs in parallel, uses selected idea)
// ============================================================================

async function createTopicArticleOutline(context, selectedIdea) {
  const { episodeId, evergreen, previousStages } = context;

  logger.info('  → Creating Topic Article outline...', { episodeId });

  const stage2Output = previousStages[2] || {};

  // Build focused prompt for Topic Article outline
  const topicPrompt = `
You are creating an outline for a STANDALONE Topic Article.

This article does NOT mention the podcast. It stands completely on its own.

## Selected Blog Idea:
**Title:** ${selectedIdea.title}
**Angle:** ${selectedIdea.angle || 'Not specified'}
**Why it resonates:** ${selectedIdea.why_it_resonates || 'Not specified'}
**Selection reasoning:** ${selectedIdea.reasoning}

## Available Content to Draw From:

### Quotes:
${(stage2Output.quotes || []).slice(0, 6).map((q, i) => `${i + 1}. "${q.text}" — ${q.speaker}`).join('\n')}

### Tips:
${(stage2Output.tips || []).slice(0, 5).map((t, i) => `${i + 1}. ${t.tip} (${t.category})`).join('\n')}

## Target Audience:
${evergreen?.podcast_info?.target_audience || 'General audience interested in mental health'}

Create an outline that:
1. Opens with a compelling hook (problem, counterintuitive insight, or relatable moment)
2. Establishes context and stakes
3. Has 3-4 substantive sections that deliver real value
4. Ends with an actionable takeaway

Target word count: ~750 words

IMPORTANT: This article should NOT mention the podcast or episode.
`;

  const response = await callOpenAIWithFunctions(
    topicPrompt,
    [TOPIC_ARTICLE_OUTLINE_SCHEMA],
    {
      episodeId,
      stageNumber: 3,
      subStage: 'topic_article_outline',
      functionCall: 'create_topic_article_outline',
      temperature: 0.7,
    }
  );

  const result = response.functionCall;
  validateTopicArticleOutline(result, episodeId);

  logger.info('  ✓ Topic Article outline created', {
    episodeId,
    title: result.topic_article_outline.working_title,
    sectionCount: result.topic_article_outline.sections?.length,
  });

  return {
    data: result,
    inputTokens: response.inputTokens || 0,
    outputTokens: response.outputTokens || 0,
    cost: response.cost || 0,
    durationMs: response.durationMs || 0,
  };
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Selects the best blog idea from Stage 2 and creates outlines for two articles
 * in parallel:
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
  const { episodeId, previousStages } = context;

  logger.stageStart(3, 'Blog Selection & Dual Article Planning (Parallel)', episodeId);

  // Validate we have Stage 2 output with blog ideas
  const stage2Output = previousStages[2];
  if (!stage2Output?.blog_ideas || stage2Output.blog_ideas.length < 6) {
    throw new ValidationError('previousStages[2]', 'Stage 2 must provide 6 blog ideas');
  }

  logger.info('Planning dual articles with parallel outline generation', {
    episodeId,
    blogIdeasCount: stage2Output.blog_ideas.length,
    quotesCount: stage2Output.quotes?.length || 0,
    tipsCount: stage2Output.tips?.length || 0,
  });

  // ============================================================================
  // STEP 1: Select blog idea (must complete first - topic outline depends on it)
  // ============================================================================
  const selectionResult = await selectBlogIdea(context);
  const selectedIdea = selectionResult.data.selected_blog_idea;

  // ============================================================================
  // STEP 2: Generate BOTH outlines in PARALLEL
  // ============================================================================
  logger.info('Stage 3: Generating both outlines in parallel...', { episodeId });

  const [recapResult, topicResult] = await Promise.all([
    createEpisodeRecapOutline(context),
    createTopicArticleOutline(context, selectedIdea),
  ]);

  // ============================================================================
  // AGGREGATE RESULTS
  // ============================================================================
  const outputData = {
    selected_blog_idea: selectedIdea,
    episode_recap_outline: recapResult.data.episode_recap_outline,
    topic_article_outline: topicResult.data.topic_article_outline,
  };

  // Calculate totals (selection is sequential, outlines are parallel)
  const totalInputTokens = selectionResult.inputTokens + recapResult.inputTokens + topicResult.inputTokens;
  const totalOutputTokens = selectionResult.outputTokens + recapResult.outputTokens + topicResult.outputTokens;
  const totalCost = selectionResult.cost + recapResult.cost + topicResult.cost;

  // Duration: selection time + max of parallel outline times
  const parallelDuration = Math.max(recapResult.durationMs, topicResult.durationMs);
  const totalDurationMs = selectionResult.durationMs + parallelDuration;

  logger.stageComplete(3, 'Blog Selection & Dual Article Planning (Parallel)', episodeId, totalDurationMs, totalCost);

  logger.info('Dual article planning complete', {
    episodeId,
    selectedIdea: selectedIdea.title,
    recapTitle: outputData.episode_recap_outline.working_title,
    topicTitle: outputData.topic_article_outline.working_title,
    parallelExecution: true,
  });

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cost_usd: totalCost,
  };
}

// Export aliases for compatibility
export { planDualArticles as outlineHighLevel };
export default planDualArticles;
