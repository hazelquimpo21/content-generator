/**
 * ============================================================================
 * STAGE 7: DUAL ARTICLE REFINEMENT PASS WITH CLAUDE
 * ============================================================================
 * Polishes BOTH blog post drafts (Episode Recap + Topic Article) to improve
 * flow, remove AI patterns, and ensure voice consistency.
 *
 * Input: Stage 6 dual drafts + voice guidelines
 * Output: Two refined blog posts in Markdown (object: { episode_recap, topic_article })
 * Model: Claude Sonnet 4 (Anthropic)
 *
 * Backward Compatibility:
 * - Handles legacy single-article format (Stage 6 output_text as string)
 * - Returns object format for new dual-article episodes
 * ============================================================================
 */

import { callClaudeEditor } from '../lib/api-client-anthropic.js';
import { loadStagePrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates a single refined article
 * @param {string} content - Article content
 * @param {string} articleType - 'episode_recap' or 'topic_article' (for error messages)
 * @returns {Object} Validation result with isValid and issues
 */
function validateArticle(content, articleType) {
  const issues = [];

  if (!content || content.trim().length < 500) {
    issues.push(`${articleType}: Content too short (< 500 chars)`);
  }

  // Check markdown structure preserved
  if (content && !content.includes('#')) {
    issues.push(`${articleType}: Missing headers`);
  }

  // Check word count
  const wordCount = content ? content.split(/\s+/).length : 0;
  if (wordCount < 600) {
    issues.push(`${articleType}: Word count too low (${wordCount} < 600)`);
  }

  return {
    isValid: issues.length === 0,
    issues,
    wordCount,
  };
}

/**
 * Legacy validation for single article (backward compatibility)
 */
function validateOutput(content) {
  const result = validateArticle(content, 'article');
  if (!result.isValid) {
    throw new ValidationError('content', result.issues.join('; '));
  }
  return true;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Builds the refinement instructions for Claude
 * @param {Object} voiceGuidelines - Voice guidelines from evergreen
 * @param {string} articleType - Type of article being refined
 * @returns {string} Instructions text
 */
function buildInstructions(voiceGuidelines, articleType) {
  const articleContext = articleType === 'episode_recap'
    ? 'This is an Episode Recap that promotes the podcast episode.'
    : 'This is a standalone Topic Article (does not mention the podcast).';

  return `
Please refine this blog post with these specific goals:

${articleContext}

1. **Language Polish**
   - Fix any awkward phrasing
   - Smooth transitions between paragraphs
   - Vary sentence length and structure

2. **Remove AI Patterns**
   - Eliminate phrases like "It's important to note", "In today's world", "Let's explore"
   - Remove anything that sounds formulaic or robotic

3. **Voice Consistency**
   - Maintain warm, conversational tone
   - Keep first-person perspective
   - Preserve the authentic voice described in guidelines

4. **Quality Checks**
   - Verify clinical accuracy
   - Ensure advice is appropriate
   - Confirm ~750 word target

Voice Guidelines:
${JSON.stringify(voiceGuidelines || {}, null, 2)}

IMPORTANT: Only polish - do not add new content or remove key information.
`;
}

/**
 * Detects if Stage 6 output is dual-article format (object) or legacy (string)
 * @param {*} outputText - Stage 6 output_text
 * @returns {boolean} True if dual-article format
 */
function isDualArticleFormat(outputText) {
  return outputText && typeof outputText === 'object' &&
    (outputText.episode_recap || outputText.topic_article);
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Refines blog post drafts with Claude's editing capabilities.
 * Handles both dual-article format (new) and single-article format (legacy).
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {Object} context.evergreen - Evergreen settings (voice guidelines)
 * @param {Object} context.previousStages - Previous stage outputs (including stage 6)
 * @returns {Promise<Object>} Result with refined output_text (object or string)
 */
export async function refineWithClaude(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.stageStart(7, 'Dual Article Refinement Pass', episodeId);

  // Get the draft(s) from stage 6
  const stage6Output = previousStages[6]?.output_text;

  if (!stage6Output) {
    throw new ValidationError('previousStages.6', 'Missing Stage 6 draft for refinement');
  }

  // Detect format: dual-article (object) or legacy (string)
  const isDual = isDualArticleFormat(stage6Output);

  logger.info('Stage 7: Detecting input format', {
    episodeId,
    isDualArticle: isDual,
    hasEpisodeRecap: isDual ? !!stage6Output.episode_recap : false,
    hasTopicArticle: isDual ? !!stage6Output.topic_article : false,
  });

  // ============================================================================
  // DUAL ARTICLE FORMAT (new)
  // ============================================================================
  if (isDual) {
    const { episode_recap, topic_article } = stage6Output;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let totalDurationMs = 0;

    const refinedArticles = {
      episode_recap: null,
      topic_article: null,
    };
    const validationResults = {};

    // Refine Episode Recap
    if (episode_recap) {
      logger.info('Refining Episode Recap...', { episodeId });
      const recapInstructions = buildInstructions(evergreen?.voice_guidelines, 'episode_recap');

      const recapResponse = await callClaudeEditor(episode_recap, recapInstructions, {
        episodeId,
        stageNumber: 7,
        subStage: 'episode_recap',
      });

      refinedArticles.episode_recap = recapResponse.content.trim();
      validationResults.episode_recap = validateArticle(refinedArticles.episode_recap, 'episode_recap');

      totalInputTokens += recapResponse.inputTokens || 0;
      totalOutputTokens += recapResponse.outputTokens || 0;
      totalCost += recapResponse.cost || 0;
      totalDurationMs += recapResponse.durationMs || 0;

      logger.info('Episode Recap refined', {
        episodeId,
        wordCount: validationResults.episode_recap.wordCount,
        isValid: validationResults.episode_recap.isValid,
      });
    }

    // Refine Topic Article
    if (topic_article) {
      logger.info('Refining Topic Article...', { episodeId });
      const topicInstructions = buildInstructions(evergreen?.voice_guidelines, 'topic_article');

      const topicResponse = await callClaudeEditor(topic_article, topicInstructions, {
        episodeId,
        stageNumber: 7,
        subStage: 'topic_article',
      });

      refinedArticles.topic_article = topicResponse.content.trim();
      validationResults.topic_article = validateArticle(refinedArticles.topic_article, 'topic_article');

      totalInputTokens += topicResponse.inputTokens || 0;
      totalOutputTokens += topicResponse.outputTokens || 0;
      totalCost += topicResponse.cost || 0;
      totalDurationMs += topicResponse.durationMs || 0;

      logger.info('Topic Article refined', {
        episodeId,
        wordCount: validationResults.topic_article.wordCount,
        isValid: validationResults.topic_article.isValid,
      });
    }

    // Log any validation issues (but don't fail - content is usable)
    const allIssues = [
      ...(validationResults.episode_recap?.issues || []),
      ...(validationResults.topic_article?.issues || []),
    ];
    if (allIssues.length > 0) {
      logger.warn('Stage 7: Refinement completed with issues', {
        episodeId,
        issues: allIssues,
      });
    }

    logger.stageComplete(7, 'Dual Article Refinement Pass', episodeId, totalDurationMs, totalCost);

    return {
      output_data: {
        episode_recap: validationResults.episode_recap ? {
          word_count: validationResults.episode_recap.wordCount,
          validation_issues: validationResults.episode_recap.issues,
        } : null,
        topic_article: validationResults.topic_article ? {
          word_count: validationResults.topic_article.wordCount,
          validation_issues: validationResults.topic_article.issues,
        } : null,
      },
      output_text: refinedArticles,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: totalCost,
    };
  }

  // ============================================================================
  // LEGACY SINGLE ARTICLE FORMAT (backward compatibility)
  // ============================================================================
  logger.info('Stage 7: Processing legacy single-article format', { episodeId });

  const instructions = buildInstructions(evergreen?.voice_guidelines, 'legacy');

  const response = await callClaudeEditor(stage6Output, instructions, {
    episodeId,
    stageNumber: 7,
  });

  const outputText = response.content.trim();

  validateOutput(outputText);

  logger.stageComplete(7, 'Refinement Pass (Legacy)', episodeId, response.durationMs, response.cost);

  return {
    output_data: null,
    output_text: outputText,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

export default refineWithClaude;
