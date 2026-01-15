/**
 * ============================================================================
 * STAGE 8: PLATFORM-SPECIFIC SOCIAL CONTENT GENERATION
 * ============================================================================
 * Creates social media content for a single platform.
 *
 * This analyzer is called once per platform (instagram, twitter, linkedin, facebook)
 * and runs in parallel with other platform analyzers for faster processing.
 *
 * Input: Stage 7 refined post + quotes + headlines + platform identifier
 * Output: 5 posts for the specified platform (JSON)
 * Model: Claude Sonnet 4 (Anthropic)
 * ============================================================================
 */

import { callClaude } from '../lib/api-client-anthropic.js';
import { loadPrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// PLATFORM CONFIGURATION
// ============================================================================

const PLATFORMS = {
  instagram: {
    name: 'Instagram',
    promptFile: 'stage-08-instagram',  // Without .md extension
    minPosts: 5,
    maxPosts: 5,
  },
  twitter: {
    name: 'Twitter/X',
    promptFile: 'stage-08-twitter',
    minPosts: 5,
    maxPosts: 5,
  },
  linkedin: {
    name: 'LinkedIn',
    promptFile: 'stage-08-linkedin',
    minPosts: 5,
    maxPosts: 5,
  },
  facebook: {
    name: 'Facebook',
    promptFile: 'stage-08-facebook',
    minPosts: 5,
    maxPosts: 5,
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
 * Parses JSON from Claude's response (handles markdown code blocks)
 */
function parseJsonResponse(content) {
  // Try to extract JSON from code block
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);

  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }

  // Try parsing the whole content
  return JSON.parse(content);
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
  const refinedPost = previousStages[7]?.output_text;
  const quotes = previousStages[2]?.quotes;
  const headlines = previousStages[5];
  const episodeAnalysis = previousStages[1];

  if (!refinedPost) {
    throw new ValidationError('previousStages.7', 'Missing refined post for social content');
  }

  // Build template variables for prompt
  const templateVars = {
    PODCAST_NAME: evergreen?.podcast_info?.name || 'The Podcast',
    THERAPIST_NAME: evergreen?.therapist_profile?.name || 'The Host',
    CREDENTIALS: evergreen?.therapist_profile?.credentials || '',
    EPISODE_TITLE: episodeAnalysis?.episode_basics?.title || 'This Episode',
    TARGET_AUDIENCE: evergreen?.podcast_info?.target_audience || 'listeners interested in mental health',
    STAGE_7_OUTPUT: refinedPost,
    STAGE_2_OUTPUT: JSON.stringify(quotes, null, 2),
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

  const systemPrompt = `You are a ${config.name} content expert specializing in therapy and mental health content.
Create authentic, engaging content that avoids engagement bait and sounds human.
Output ONLY valid JSON with no additional text or code blocks.`;

  const response = await callClaude(promptContent, {
    system: systemPrompt,
    episodeId,
    stageNumber: 8,
    subStage: platform,
    temperature: 0.8,
    maxTokens: 2000,
  });

  // Parse the JSON response
  let outputData;
  try {
    outputData = parseJsonResponse(response.content);
  } catch (error) {
    logger.error(`Failed to parse ${config.name} content JSON`, {
      platform,
      error: error.message,
      content: response.content.substring(0, 500),
    });
    throw new ValidationError('response', `Failed to parse ${config.name} content JSON`);
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
