/**
 * ============================================================================
 * STAGE 4: DUAL ARTICLE PARAGRAPH-LEVEL OUTLINES (PARALLEL)
 * ============================================================================
 * Creates detailed paragraph-level breakdowns for BOTH articles:
 *   1. Episode Recap - paragraph details
 *   2. Topic Article - paragraph details
 *
 * Architecture:
 * - Generates paragraph outlines for both articles in PARALLEL
 * - Uses Promise.all for concurrent execution
 *
 * Input: Stage 3 dual outlines + Stage 2 quotes
 * Output: Dual paragraph roadmaps (JSON)
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
 * Schema for Episode Recap paragraph outlines
 */
const EPISODE_RECAP_PARAGRAPHS_SCHEMA = {
  name: 'episode_recap_paragraphs',
  description: 'Paragraph-level breakdown for Episode Recap article',
  parameters: {
    type: 'object',
    properties: {
      section_details: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            section_number: { type: 'number' },
            section_title: { type: 'string' },
            paragraphs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  para_number: { type: 'number' },
                  main_point: {
                    type: 'string',
                    description: 'Key message of this paragraph',
                  },
                  supporting_elements: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Quotes, examples, or concepts to include',
                  },
                  transition_note: {
                    type: ['string', 'null'],
                    description: 'How this connects to the next paragraph',
                  },
                },
                required: ['para_number', 'main_point', 'supporting_elements'],
              },
            },
          },
          required: ['section_number', 'section_title', 'paragraphs'],
        },
      },
    },
    required: ['section_details'],
  },
};

/**
 * Schema for Topic Article paragraph outlines
 */
const TOPIC_ARTICLE_PARAGRAPHS_SCHEMA = {
  name: 'topic_article_paragraphs',
  description: 'Paragraph-level breakdown for Topic Article',
  parameters: {
    type: 'object',
    properties: {
      section_details: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            section_number: { type: 'number' },
            section_title: { type: 'string' },
            paragraphs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  para_number: { type: 'number' },
                  main_point: {
                    type: 'string',
                    description: 'Key message of this paragraph',
                  },
                  supporting_elements: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Quotes, examples, or concepts to include',
                  },
                  transition_note: {
                    type: ['string', 'null'],
                    description: 'How this connects to the next paragraph',
                  },
                },
                required: ['para_number', 'main_point', 'supporting_elements'],
              },
            },
          },
          required: ['section_number', 'section_title', 'paragraphs'],
        },
      },
    },
    required: ['section_details'],
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

function validateSectionDetails(data, articleType, episodeId) {
  if (!data.section_details || !Array.isArray(data.section_details)) {
    throw new ValidationError('section_details', `Missing section details array for ${articleType}`);
  }

  const sections = data.section_details;

  if (sections.length < 2) {
    throw new ValidationError('section_details', `Need at least 2 sections for ${articleType}`);
  }

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];

    if (!s.section_title) {
      throw new ValidationError(`section_details[${i}].section_title`, `Missing title in ${articleType}`);
    }

    if (!s.paragraphs || s.paragraphs.length < 1) {
      throw new ValidationError(`section_details[${i}].paragraphs`, `Need at least 1 paragraph in ${articleType}`);
    }

    for (let j = 0; j < s.paragraphs.length; j++) {
      const p = s.paragraphs[j];

      if (!p.main_point || p.main_point.length < 10) {
        throw new ValidationError(
          `section_details[${i}].paragraphs[${j}].main_point`,
          `Main point is too short in ${articleType}`
        );
      }
    }
  }

  logger.debug(`Paragraph outline validation passed for ${articleType}`, {
    episodeId,
    sectionCount: sections.length,
    totalParagraphs: sections.reduce((sum, s) => sum + s.paragraphs.length, 0),
  });

  return true;
}

// ============================================================================
// EPISODE RECAP PARAGRAPHS (runs in parallel)
// ============================================================================

async function createEpisodeRecapParagraphs(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.info('  → Creating Episode Recap paragraph outlines...', { episodeId });

  const stage1Output = previousStages[1] || {};
  const stage2Output = previousStages[2] || {};
  const stage3Output = previousStages[3] || {};
  const recapOutline = stage3Output.episode_recap_outline || {};

  const prompt = `
You are creating detailed paragraph-level outlines for an EPISODE RECAP blog post.

## Episode Context
**Podcast:** ${evergreen?.podcast_info?.name || 'The Podcast'}
**Host:** ${evergreen?.therapist_profile?.name || 'The Host'}
**Episode Crux:** ${stage1Output.episode_crux || 'No crux available'}

## High-Level Outline
**Title:** ${recapOutline.working_title || 'Episode Recap'}
**Hook:** ${recapOutline.hook?.approach || 'No hook defined'}
**Episode Covers:** ${recapOutline.what_episode_covers || 'No description'}

## Key Insights to Cover:
${(recapOutline.key_insights || []).map((insight, i) =>
  `${i + 1}. ${insight.insight_title || 'Insight'}: ${insight.supporting_quote || 'No quote'}`
).join('\n')}

## Available Quotes:
${(stage2Output.quotes || []).slice(0, 6).map((q, i) => `${i + 1}. "${q.text}" — ${q.speaker}`).join('\n')}

## Task
Break down each section into detailed paragraphs. For each paragraph, specify:
1. Main point to convey
2. Supporting elements (quotes, examples, concepts)
3. Transition note to next paragraph

Keep paragraphs focused (2-4 sentences each). Target ~750 words total.
`;

  const response = await callOpenAIWithFunctions(
    prompt,
    [EPISODE_RECAP_PARAGRAPHS_SCHEMA],
    {
      episodeId,
      stageNumber: 4,
      subStage: 'episode_recap_paragraphs',
      functionCall: 'episode_recap_paragraphs',
      temperature: 0.6,
      maxTokens: 8192,
    }
  );

  const result = response.functionCall;
  if (!result) {
    throw new ValidationError('functionCall', 'Episode Recap paragraph generation returned no result (response may have been truncated)');
  }
  validateSectionDetails(result, 'Episode Recap', episodeId);

  logger.info('  ✓ Episode Recap paragraph outlines created', {
    episodeId,
    sectionCount: result.section_details.length,
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
// TOPIC ARTICLE PARAGRAPHS (runs in parallel)
// ============================================================================

async function createTopicArticleParagraphs(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.info('  → Creating Topic Article paragraph outlines...', { episodeId });

  const stage1Output = previousStages[1] || {};
  const stage2Output = previousStages[2] || {};
  const stage3Output = previousStages[3] || {};
  const topicOutline = stage3Output.topic_article_outline || {};
  const selectedIdea = stage3Output.selected_blog_idea || {};

  const prompt = `
You are creating detailed paragraph-level outlines for a STANDALONE Topic Article.

## Article Context
**Title:** ${topicOutline.working_title || selectedIdea.title || 'Topic Article'}
**Angle:** ${selectedIdea.angle || 'No angle specified'}
**Target Audience:** ${evergreen?.podcast_info?.target_audience || 'General audience'}

## High-Level Outline
**Hook:** ${topicOutline.hook?.approach || 'No hook defined'}
**Problem Addressed:** ${topicOutline.problem_addressed || 'No problem specified'}

## Sections:
${(topicOutline.sections || []).map((section, i) =>
  `${i + 1}. ${section.section_title || 'Section'}: ${section.purpose || 'No purpose'}`
).join('\n')}

## Available Quotes:
${(stage2Output.quotes || []).slice(0, 6).map((q, i) => `${i + 1}. "${q.text}" — ${q.speaker}`).join('\n')}

## Available Tips:
${(stage2Output.tips || []).slice(0, 4).map((t, i) => `${i + 1}. ${t.title || t.tip || 'Tip'}`).join('\n')}

## Task
Break down each section into detailed paragraphs. For each paragraph, specify:
1. Main point to convey
2. Supporting elements (quotes, examples, concepts)
3. Transition note to next paragraph

This is a STANDALONE article - it should provide complete value without requiring the episode.
Keep paragraphs focused (2-4 sentences each). Target ~1200 words total.
`;

  const response = await callOpenAIWithFunctions(
    prompt,
    [TOPIC_ARTICLE_PARAGRAPHS_SCHEMA],
    {
      episodeId,
      stageNumber: 4,
      subStage: 'topic_article_paragraphs',
      functionCall: 'topic_article_paragraphs',
      temperature: 0.6,
      maxTokens: 8192,
    }
  );

  const result = response.functionCall;
  if (!result) {
    throw new ValidationError('functionCall', 'Topic Article paragraph generation returned no result (response may have been truncated)');
  }
  validateSectionDetails(result, 'Topic Article', episodeId);

  logger.info('  ✓ Topic Article paragraph outlines created', {
    episodeId,
    sectionCount: result.section_details.length,
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
 * Creates paragraph-level outlines for BOTH articles in PARALLEL.
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.previousStages - Previous stage outputs (0-3)
 * @returns {Promise<Object>} Result with dual paragraph outlines
 */
export async function outlineParagraphs(context) {
  const { episodeId, previousStages } = context;

  logger.stageStart(4, 'Dual Article Paragraph Outlines (Parallel)', episodeId);

  // Validate we have Stage 3 dual outlines
  const stage3Output = previousStages[3];
  if (!stage3Output?.episode_recap_outline || !stage3Output?.topic_article_outline) {
    throw new ValidationError('previousStages[3]', 'Stage 3 must provide dual article outlines');
  }

  logger.info('Creating paragraph outlines for both articles in parallel', {
    episodeId,
    hasRecapOutline: !!stage3Output.episode_recap_outline,
    hasTopicOutline: !!stage3Output.topic_article_outline,
  });

  // Generate BOTH paragraph outlines in PARALLEL
  const [recapResult, topicResult] = await Promise.all([
    createEpisodeRecapParagraphs(context),
    createTopicArticleParagraphs(context),
  ]);

  // Aggregate results - dual article format
  const outputData = {
    episode_recap: recapResult.data,
    topic_article: topicResult.data,
    // Also include flat section_details for backward compatibility
    section_details: [
      ...recapResult.data.section_details,
      ...topicResult.data.section_details,
    ],
  };

  // Calculate totals (both run in parallel)
  const totalInputTokens = recapResult.inputTokens + topicResult.inputTokens;
  const totalOutputTokens = recapResult.outputTokens + topicResult.outputTokens;
  const totalCost = recapResult.cost + topicResult.cost;
  const totalDurationMs = Math.max(recapResult.durationMs, topicResult.durationMs);

  logger.stageComplete(4, 'Dual Article Paragraph Outlines (Parallel)', episodeId, totalDurationMs, totalCost);

  logger.info('Dual paragraph outlines complete', {
    episodeId,
    recapSections: recapResult.data.section_details.length,
    topicSections: topicResult.data.section_details.length,
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

export default outlineParagraphs;
