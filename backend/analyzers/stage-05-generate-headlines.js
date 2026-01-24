/**
 * ============================================================================
 * STAGE 5: DUAL ARTICLE HEADLINES & COPY OPTIONS (PARALLEL)
 * ============================================================================
 * Generates headline and copy variations for BOTH articles:
 *   1. Episode Recap - headlines that promote the episode
 *   2. Topic Article - SEO-focused headlines for standalone content
 *
 * Architecture:
 * - Generates headlines for both articles in PARALLEL
 * - Uses Promise.all for concurrent execution
 *
 * Input: Stage 1-3 outputs
 * Output: Dual headline sets (JSON)
 * Model: GPT-5 mini (OpenAI)
 * ============================================================================
 */

import { callOpenAIWithFunctions } from '../lib/api-client-openai.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// FUNCTION SCHEMAS (Separate for each article type)
// ============================================================================

/**
 * Schema for Episode Recap headlines
 */
const EPISODE_RECAP_HEADLINES_SCHEMA = {
  name: 'episode_recap_headlines',
  description: 'Headlines and copy for Episode Recap article',
  parameters: {
    type: 'object',
    properties: {
      headlines: {
        type: 'array',
        items: { type: 'string' },
        minItems: 5,
        maxItems: 8,
        description: 'Main headlines that promote the episode (40-80 chars)',
      },
      subheadings: {
        type: 'array',
        items: { type: 'string' },
        minItems: 4,
        maxItems: 6,
        description: 'Section subheadings (20-50 chars)',
      },
      taglines: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 5,
        description: 'Short punchy summaries (50-100 chars)',
      },
      social_hooks: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 5,
        description: 'Social media opening lines (60-100 chars)',
      },
    },
    required: ['headlines', 'subheadings', 'taglines', 'social_hooks'],
  },
};

/**
 * Schema for Topic Article headlines
 */
const TOPIC_ARTICLE_HEADLINES_SCHEMA = {
  name: 'topic_article_headlines',
  description: 'Headlines and copy for standalone Topic Article',
  parameters: {
    type: 'object',
    properties: {
      headlines: {
        type: 'array',
        items: { type: 'string' },
        minItems: 5,
        maxItems: 8,
        description: 'SEO-focused main headlines (40-80 chars)',
      },
      subheadings: {
        type: 'array',
        items: { type: 'string' },
        minItems: 4,
        maxItems: 6,
        description: 'Section subheadings (20-50 chars)',
      },
      taglines: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 5,
        description: 'Short punchy summaries (50-100 chars)',
      },
      social_hooks: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 5,
        description: 'Social media opening lines (60-100 chars)',
      },
    },
    required: ['headlines', 'subheadings', 'taglines', 'social_hooks'],
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

function validateHeadlines(data, articleType, episodeId) {
  // Check headlines
  if (!data.headlines || data.headlines.length < 5) {
    throw new ValidationError('headlines', `Need at least 5 headline options for ${articleType}`);
  }

  // Check subheadings
  if (!data.subheadings || data.subheadings.length < 4) {
    throw new ValidationError('subheadings', `Need at least 4 subheading options for ${articleType}`);
  }

  // Check taglines
  if (!data.taglines || data.taglines.length < 3) {
    throw new ValidationError('taglines', `Need at least 3 tagline options for ${articleType}`);
  }

  // Check social hooks
  if (!data.social_hooks || data.social_hooks.length < 3) {
    throw new ValidationError('social_hooks', `Need at least 3 social hook options for ${articleType}`);
  }

  // Validate headline lengths
  for (let i = 0; i < data.headlines.length; i++) {
    const h = data.headlines[i];
    if (h.length < 20 || h.length > 100) {
      logger.warn(`${articleType} headline outside recommended length`, {
        headline: h,
        length: h.length,
      });
    }
  }

  logger.debug(`Headlines validation passed for ${articleType}`, {
    episodeId,
    headlineCount: data.headlines.length,
    subheadingCount: data.subheadings.length,
  });

  return true;
}

// ============================================================================
// EPISODE RECAP HEADLINES (runs in parallel)
// ============================================================================

async function createEpisodeRecapHeadlines(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.info('  → Creating Episode Recap headlines...', { episodeId });

  const stage1Output = previousStages[1] || {};
  const stage3Output = previousStages[3] || {};
  const recapOutline = stage3Output.episode_recap_outline || {};

  const prompt = `
You are creating headlines and copy for an EPISODE RECAP blog post.

## Episode Context
**Podcast:** ${evergreen?.podcast_info?.name || 'The Podcast'}
**Host:** ${evergreen?.therapist_profile?.name || 'The Host'}
**Episode Crux:** ${stage1Output.episode_crux || 'No crux available'}

## Article Outline
**Working Title:** ${recapOutline.working_title || 'Episode Recap'}
**Hook:** ${recapOutline.hook?.approach || 'No hook defined'}
**Key Insights:** ${(recapOutline.key_insights || []).map(i => i.insight_title).join(', ')}

## Goal
Create headlines that:
1. Entice readers to read the recap
2. Tease what's in the episode without spoiling everything
3. Use intrigue, curiosity, or emotional hooks
4. Naturally lead to CTA to listen

## Generate
- 5-8 main headlines (40-80 chars each)
- 4-6 subheadings for article sections
- 3-5 taglines (short punchy summaries)
- 3-5 social media hooks
`;

  const response = await callOpenAIWithFunctions(
    prompt,
    [EPISODE_RECAP_HEADLINES_SCHEMA],
    {
      episodeId,
      stageNumber: 5,
      subStage: 'episode_recap_headlines',
      functionCall: 'episode_recap_headlines',
      temperature: 0.8,
    }
  );

  const result = response.functionCall;
  validateHeadlines(result, 'Episode Recap', episodeId);

  logger.info('  ✓ Episode Recap headlines created', {
    episodeId,
    headlineCount: result.headlines.length,
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
// TOPIC ARTICLE HEADLINES (runs in parallel)
// ============================================================================

async function createTopicArticleHeadlines(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.info('  → Creating Topic Article headlines...', { episodeId });

  const stage1Output = previousStages[1] || {};
  const stage3Output = previousStages[3] || {};
  const topicOutline = stage3Output.topic_article_outline || {};
  const selectedIdea = stage3Output.selected_blog_idea || {};

  const prompt = `
You are creating headlines and copy for a STANDALONE Topic Article.

## Article Context
**Title:** ${topicOutline.working_title || selectedIdea.title || 'Topic Article'}
**Angle:** ${selectedIdea.angle || 'No angle specified'}
**Target Audience:** ${evergreen?.podcast_info?.target_audience || 'General audience'}

## Article Outline
**Hook:** ${topicOutline.hook?.approach || 'No hook defined'}
**Problem Addressed:** ${topicOutline.problem_addressed || 'No problem specified'}
**Sections:** ${(topicOutline.sections || []).map(s => s.section_title).join(', ')}

## SEO Focus
${topicOutline.seo_approach?.target_query || selectedIdea.title || 'No SEO query defined'}

## Goal
Create headlines that:
1. Are SEO-optimized for search discovery
2. Work as standalone content (no episode reference needed)
3. Promise clear value to readers
4. Appeal to the target audience's needs

## Generate
- 5-8 main headlines (40-80 chars each, SEO-focused)
- 4-6 subheadings for article sections
- 3-5 taglines (short punchy summaries)
- 3-5 social media hooks
`;

  const response = await callOpenAIWithFunctions(
    prompt,
    [TOPIC_ARTICLE_HEADLINES_SCHEMA],
    {
      episodeId,
      stageNumber: 5,
      subStage: 'topic_article_headlines',
      functionCall: 'topic_article_headlines',
      temperature: 0.8,
    }
  );

  const result = response.functionCall;
  validateHeadlines(result, 'Topic Article', episodeId);

  logger.info('  ✓ Topic Article headlines created', {
    episodeId,
    headlineCount: result.headlines.length,
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
 * Generates headlines for BOTH articles in PARALLEL.
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.previousStages - Previous stage outputs (0-3)
 * @returns {Promise<Object>} Result with dual headline sets
 */
export async function generateHeadlines(context) {
  const { episodeId, previousStages } = context;

  logger.stageStart(5, 'Dual Article Headlines (Parallel)', episodeId);

  // Validate we have Stage 3 dual outlines
  const stage3Output = previousStages[3];
  if (!stage3Output?.episode_recap_outline || !stage3Output?.topic_article_outline) {
    throw new ValidationError('previousStages[3]', 'Stage 3 must provide dual article outlines');
  }

  logger.info('Creating headlines for both articles in parallel', {
    episodeId,
    hasRecapOutline: !!stage3Output.episode_recap_outline,
    hasTopicOutline: !!stage3Output.topic_article_outline,
  });

  // Generate BOTH headline sets in PARALLEL
  const [recapResult, topicResult] = await Promise.all([
    createEpisodeRecapHeadlines(context),
    createTopicArticleHeadlines(context),
  ]);

  // Aggregate results - dual article format
  const outputData = {
    episode_recap: recapResult.data,
    topic_article: topicResult.data,
    // Also include flat headlines for backward compatibility
    headlines: [
      ...recapResult.data.headlines,
      ...topicResult.data.headlines,
    ],
    subheadings: [
      ...recapResult.data.subheadings,
      ...topicResult.data.subheadings,
    ],
    taglines: [
      ...recapResult.data.taglines,
      ...topicResult.data.taglines,
    ],
    social_hooks: [
      ...recapResult.data.social_hooks,
      ...topicResult.data.social_hooks,
    ],
  };

  // Calculate totals (both run in parallel)
  const totalInputTokens = recapResult.inputTokens + topicResult.inputTokens;
  const totalOutputTokens = recapResult.outputTokens + topicResult.outputTokens;
  const totalCost = recapResult.cost + topicResult.cost;
  const totalDurationMs = Math.max(recapResult.durationMs, topicResult.durationMs);

  logger.stageComplete(5, 'Dual Article Headlines (Parallel)', episodeId, totalDurationMs, totalCost);

  logger.info('Dual headline generation complete', {
    episodeId,
    recapHeadlines: recapResult.data.headlines.length,
    topicHeadlines: topicResult.data.headlines.length,
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

export default generateHeadlines;
