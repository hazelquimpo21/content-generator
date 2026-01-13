/**
 * ============================================================================
 * STAGE 6: BLOG POST DRAFT GENERATION
 * ============================================================================
 * Writes the complete ~750 word blog post based on all previous stage outputs.
 *
 * Input: All previous stage outputs (1-5)
 * Output: Complete blog post in Markdown (text)
 * Model: GPT-5 mini (OpenAI)
 * ============================================================================
 */

import { callOpenAI } from '../lib/api-client-openai.js';
import { loadStagePrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates the generated blog post
 * @param {string} content - Generated markdown content
 * @throws {ValidationError} If validation fails
 */
function validateOutput(content) {
  if (!content || content.trim().length < 500) {
    throw new ValidationError('content', 'Blog post is too short');
  }

  // Check for basic markdown structure
  if (!content.includes('#')) {
    throw new ValidationError('content', 'Blog post is missing headers');
  }

  // Estimate word count
  const wordCount = content.split(/\s+/).length;

  if (wordCount < 600) {
    throw new ValidationError('content', `Blog post too short: ${wordCount} words (minimum 600)`);
  }

  if (wordCount > 1000) {
    logger.warn('Blog post exceeds target length', { wordCount });
  }

  // Check for common AI patterns to warn about (not block)
  const aiPatterns = [
    'in today\'s world',
    'dive deep',
    'let\'s explore',
    'first and foremost',
    'it\'s important to note',
  ];

  for (const pattern of aiPatterns) {
    if (content.toLowerCase().includes(pattern)) {
      logger.warn('Blog post may contain AI pattern', { pattern });
    }
  }

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Generates a complete blog post draft
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript
 * @param {Object} context.evergreen - Evergreen settings
 * @param {Object} context.previousStages - Outputs from stages 1-5
 * @returns {Promise<Object>} Result with output_text and usage stats
 */
export async function draftBlogPost(context) {
  const { episodeId, transcript, evergreen, previousStages } = context;

  logger.stageStart(6, 'Draft Generation', episodeId);

  // Load prompt with all context from previous stages
  const prompt = await loadStagePrompt('stage-06-draft-generation', {
    transcript,
    evergreen,
    previousStages,
  });

  // Call OpenAI for text generation (not function calling)
  const response = await callOpenAI(
    [
      {
        role: 'system',
        content: `You are an expert blog writer specializing in therapy and mental health content.
Write in a warm, professional, conversational tone. Follow the outlines provided exactly.
Output ONLY the blog post in Markdown format. No explanations or meta-commentary.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    {
      episodeId,
      stageNumber: 6,
      temperature: 0.7,
      maxTokens: 2500, // Enough for ~750 words + markdown
    }
  );

  // Get the generated content
  const outputText = response.content.trim();

  // Validate the output
  validateOutput(outputText);

  logger.stageComplete(6, 'Draft Generation', episodeId, response.durationMs, response.cost);

  return {
    output_data: null,
    output_text: outputText,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

export default draftBlogPost;
