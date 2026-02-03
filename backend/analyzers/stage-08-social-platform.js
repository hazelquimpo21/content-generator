/**
 * ============================================================================
 * STAGE 8: PLATFORM-SPECIFIC SOCIAL CONTENT GENERATION
 * ============================================================================
 * Creates social media content for a single platform.
 *
 * This analyzer is called once per platform (instagram, twitter, linkedin, facebook)
 * and runs in parallel with other platform analyzers for faster processing.
 *
 * Input: Stage 7 refined posts (dual or single) + quotes + headlines + platform
 * Output: 5 posts for the specified platform (JSON)
 * Model: Claude Sonnet 4 (Anthropic)
 *
 * Dual Article Support:
 * - For dual-article episodes, uses Episode Recap as primary source (promotes episode)
 * - Topic Article is included as additional context for content variety
 * - Falls back to legacy single-article format for older episodes
 * ============================================================================
 */

import { callClaudeStructured } from '../lib/api-client-anthropic.js';
import { loadPrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// PLATFORM CONFIGURATION
// ============================================================================

const PLATFORMS = {
  instagram: {
    name: 'Instagram',
    promptFile: 'stage-08-instagram',
    minPosts: 5,
    maxPosts: 5,
    // Instagram posts require hashtags
    postSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Post length type: short, medium, or long' },
        content: { type: 'string', description: 'The caption text' },
        hook_type: { type: 'string', description: 'Hook type used: bold_claim, recognition, story, reframe, or question' },
        hashtags: { type: 'array', items: { type: 'string' }, description: '3-5 relevant hashtags' },
      },
      required: ['type', 'content', 'hook_type', 'hashtags'],
    },
  },
  twitter: {
    name: 'Twitter/X',
    promptFile: 'stage-08-twitter',
    minPosts: 5,
    maxPosts: 5,
    postSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Post type: standalone, thread_opener, hot_take, quotable, or conversation' },
        content: { type: 'string', description: 'The tweet text (under 280 characters)' },
        hook_type: { type: 'string', description: 'Hook type: contrarian, pattern_interrupt, specific, permission, or framework' },
      },
      required: ['type', 'content', 'hook_type'],
    },
  },
  linkedin: {
    name: 'LinkedIn',
    promptFile: 'stage-08-linkedin',
    minPosts: 5,
    maxPosts: 5,
    postSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Post type: personal_insight, observation, myth_bust, story, or practical' },
        content: { type: 'string', description: 'The post text (500-1000 characters)' },
        hook_type: { type: 'string', description: 'Hook type: confession, pattern, counterintuitive, question_reframe, or wisdom' },
      },
      required: ['type', 'content', 'hook_type'],
    },
  },
  facebook: {
    name: 'Facebook',
    promptFile: 'stage-08-facebook',
    minPosts: 5,
    maxPosts: 5,
    postSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Post type: conversation, story, reflection, question, or helpful' },
        content: { type: 'string', description: 'The post text (300-600 characters)' },
        hook_type: { type: 'string', description: 'Hook type: invitation, shared_experience, curiosity, helpful, or story' },
      },
      required: ['type', 'content', 'hook_type'],
    },
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates the output for a specific platform
 */
function validateOutput(data, platform) {
  const config = PLATFORMS[platform];

  if (!data.posts || !Array.isArray(data.posts)) {
    throw new ValidationError('posts', `${config.name}: posts must be an array`);
  }

  if (data.posts.length < config.minPosts) {
    throw new ValidationError('posts', `${config.name}: Need at least ${config.minPosts} posts, got ${data.posts.length}`);
  }

  // Validate each post has required fields
  data.posts.forEach((post, index) => {
    if (!post.content || typeof post.content !== 'string') {
      throw new ValidationError(`posts[${index}].content`, `${config.name}: Post ${index + 1} missing content`);
    }
    if (!post.type || typeof post.type !== 'string') {
      throw new ValidationError(`posts[${index}].type`, `${config.name}: Post ${index + 1} missing type`);
    }

    // Instagram-specific: validate hashtags
    if (platform === 'instagram') {
      if (!post.hashtags || !Array.isArray(post.hashtags)) {
        throw new ValidationError(`posts[${index}].hashtags`, `Instagram: Post ${index + 1} missing hashtags array`);
      }
    }
  });

  return true;
}

/**
 * Builds the tool schema for a platform's social posts
 * @param {string} platform - Platform identifier
 * @returns {Object} Tool schema for callClaudeStructured
 */
function buildToolSchema(platform) {
  const config = PLATFORMS[platform];

  return {
    type: 'object',
    properties: {
      posts: {
        type: 'array',
        items: config.postSchema,
        minItems: config.minPosts,
        maxItems: config.maxPosts,
        description: `Array of ${config.minPosts} ${config.name} posts`,
      },
    },
    required: ['posts'],
  };
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Generates social content for a specific platform.
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.previousStages - Outputs from completed stages
 * @param {string} platform - Platform identifier (instagram, twitter, linkedin, facebook)
 * @returns {Promise<Object>} Stage result with output_data, tokens, and cost
 */
export async function generateSocialForPlatform(context, platform) {
  const { episodeId, evergreen, previousStages } = context;

  // Validate platform
  if (!PLATFORMS[platform]) {
    throw new ValidationError('platform', `Unknown platform: ${platform}. Valid: ${Object.keys(PLATFORMS).join(', ')}`);
  }

  const config = PLATFORMS[platform];

  logger.stageStart(8, `Social Content (${config.name})`, episodeId);
  logger.info(`🎯 Generating ${config.name} content`, {
    platform,
    episodeId,
  });

  // Get required inputs from previous stages
  const stage7Output = previousStages[7]?.output_text;
  const quotes = previousStages[2]?.quotes;
  const qaPairs = previousStages[2]?.qa_pairs || []; // New: Q&A pairs for content ideas
  const headlines = previousStages[5];
  const episodeAnalysis = previousStages[1];

  if (!stage7Output) {
    throw new ValidationError('previousStages.7', 'Missing refined post for social content');
  }

  // ============================================================================
  // HANDLE DUAL ARTICLE FORMAT vs LEGACY
  // ============================================================================
  // Dual format: { episode_recap: "...", topic_article: "..." }
  // Legacy format: "single article string..."
  const isDualFormat = stage7Output && typeof stage7Output === 'object' &&
    (stage7Output.episode_recap || stage7Output.topic_article);

  let primaryContent;
  let secondaryContent = null;

  if (isDualFormat) {
    // For social posts that promote the episode, Episode Recap is primary
    primaryContent = stage7Output.episode_recap || stage7Output.topic_article || '';
    secondaryContent = stage7Output.topic_article || null;

    logger.info('Stage 8: Using dual-article format', {
      episodeId,
      platform,
      hasEpisodeRecap: !!stage7Output.episode_recap,
      hasTopicArticle: !!stage7Output.topic_article,
    });
  } else {
    // Legacy single-article format
    primaryContent = typeof stage7Output === 'string' ? stage7Output : '';
    logger.info('Stage 8: Using legacy single-article format', {
      episodeId,
      platform,
    });
  }

  // Build combined content string for prompt
  // Primary (Episode Recap) is the main source, Topic Article adds variety
  let combinedContent = primaryContent;
  if (secondaryContent) {
    combinedContent += `\n\n---\n\n## ADDITIONAL CONTEXT: Topic Article\n\n${secondaryContent}`;
  }

  // Build template variables for prompt
  const templateVars = {
    PODCAST_NAME: evergreen?.podcast_info?.name || 'The Podcast',
    THERAPIST_NAME: evergreen?.therapist_profile?.name || 'The Host',
    CREDENTIALS: evergreen?.therapist_profile?.credentials || '',
    EPISODE_TITLE: episodeAnalysis?.episode_basics?.title || 'This Episode',
    TARGET_AUDIENCE: evergreen?.podcast_info?.target_audience || 'listeners interested in mental health',
    STAGE_7_OUTPUT: combinedContent,
    STAGE_2_OUTPUT: JSON.stringify(quotes, null, 2),
    STAGE_2_QA: JSON.stringify(qaPairs, null, 2), // New: Q&A pairs for social inspiration
    STAGE_5_OUTPUT: JSON.stringify(headlines, null, 2),
  };

  // Load platform-specific prompt
  let promptContent;
  try {
    promptContent = await loadPrompt(config.promptFile, templateVars, {
      includeNeverUse: true,
      includeQualityFrameworks: false,
    });
  } catch (error) {
    logger.error('Failed to load prompt file', {
      platform,
      promptFile: config.promptFile,
      error: error.message,
    });
    throw new ValidationError('prompt', `Failed to load ${config.name} prompt: ${error.message}`);
  }

  // System prompt focuses on persona/role - no JSON instructions needed
  // Function calling schema handles the structured output
  const systemPrompt = `You are a ${config.name} content expert specializing in therapy and mental health content.
Create authentic, engaging content that avoids engagement bait and sounds like a real person.
Follow the platform-specific guidelines in the prompt carefully.`;

  // Use function calling to get structured output
  const response = await callClaudeStructured(promptContent, {
    system: systemPrompt,
    toolName: `generate_${platform}_posts`,
    toolDescription: `Generate ${config.minPosts} engaging ${config.name} posts based on the blog content`,
    inputSchema: buildToolSchema(platform),
    episodeId,
    stageNumber: 8,
    temperature: 0.8,
    maxTokens: 2000,
  });

  // Function calling returns structured data directly in toolInput
  const outputData = response.toolInput;

  if (!outputData) {
    logger.error(`No structured output from ${config.name} content generation`, {
      platform,
      episodeId,
    });
    throw new ValidationError('response', `Failed to generate ${config.name} content`);
  }

  // Validate output
  validateOutput(outputData, platform);

  logger.stageComplete(8, `Social Content (${config.name})`, episodeId, response.durationMs, response.cost);
  logger.info(`✅ Generated ${outputData.posts.length} ${config.name} posts`, {
    platform,
    postCount: outputData.posts.length,
    episodeId,
    costUsd: response.cost?.toFixed(4),
  });

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

// ============================================================================
// PLATFORM-SPECIFIC EXPORTS
// ============================================================================
// These provide convenient wrappers for each platform

export async function generateInstagram(context) {
  return generateSocialForPlatform(context, 'instagram');
}

export async function generateTwitter(context) {
  return generateSocialForPlatform(context, 'twitter');
}

export async function generateLinkedIn(context) {
  return generateSocialForPlatform(context, 'linkedin');
}

export async function generateFacebook(context) {
  return generateSocialForPlatform(context, 'facebook');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const SOCIAL_PLATFORMS = Object.keys(PLATFORMS);

export default {
  generateSocialForPlatform,
  generateInstagram,
  generateTwitter,
  generateLinkedIn,
  generateFacebook,
  SOCIAL_PLATFORMS,
  PLATFORMS,
};
