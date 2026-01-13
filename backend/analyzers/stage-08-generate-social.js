/**
 * ============================================================================
 * STAGE 8: SOCIAL MEDIA CONTENT GENERATION
 * ============================================================================
 * Creates platform-specific social media content to promote the blog post.
 *
 * Input: Stage 7 refined post + quotes + headlines
 * Output: Social content for Instagram, Twitter, LinkedIn, Facebook (JSON)
 * Model: Claude Sonnet 4 (Anthropic)
 * ============================================================================
 */

import { callClaude } from '../lib/api-client-anthropic.js';
import { loadStagePrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// VALIDATION
// ============================================================================

function validateOutput(data) {
  // Check Instagram posts
  if (!data.instagram || !Array.isArray(data.instagram) || data.instagram.length < 2) {
    throw new ValidationError('instagram', 'Need at least 2 Instagram posts');
  }

  // Check Twitter threads
  if (!data.twitter || !Array.isArray(data.twitter) || data.twitter.length < 3) {
    throw new ValidationError('twitter', 'Need at least 3 Twitter posts');
  }

  // Check LinkedIn posts
  if (!data.linkedin || !Array.isArray(data.linkedin) || data.linkedin.length < 1) {
    throw new ValidationError('linkedin', 'Need at least 1 LinkedIn post');
  }

  // Check Facebook posts
  if (!data.facebook || !Array.isArray(data.facebook) || data.facebook.length < 1) {
    throw new ValidationError('facebook', 'Need at least 1 Facebook post');
  }

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

export async function generateSocial(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.stageStart(8, 'Social Content', episodeId);

  const refinedPost = previousStages[7]?.output_text;
  const quotes = previousStages[2]?.key_quotes;
  const headlines = previousStages[5];

  if (!refinedPost) {
    throw new ValidationError('previousStages.7', 'Missing refined post for social content');
  }

  const systemPrompt = `You are a social media content expert specializing in therapy and mental health content.
Create authentic, engaging content that avoids engagement bait and sounds human.
Output ONLY valid JSON with no additional text or code blocks.`;

  const userPrompt = `
Create social media content to promote this blog post.

PODCAST: ${evergreen?.podcast_info?.name || 'The Podcast'}
HOST: ${evergreen?.therapist_profile?.name || 'The Host'}

BLOG POST:
${refinedPost}

KEY QUOTES:
${JSON.stringify(quotes, null, 2)}

AVAILABLE HEADLINES:
${JSON.stringify(headlines, null, 2)}

Generate content in this exact JSON structure:
{
  "instagram": [
    {
      "type": "short",
      "content": "...",
      "hashtags": ["#tag1", "#tag2"]
    },
    {
      "type": "medium",
      "content": "...",
      "hashtags": ["#tag1", "#tag2", "#tag3"]
    },
    {
      "type": "long",
      "content": "...",
      "hashtags": ["#tag1", "#tag2", "#tag3"]
    }
  ],
  "twitter": [
    { "content": "...", "type": "standalone" },
    { "content": "...", "type": "thread_opener" }
  ],
  "linkedin": [
    { "content": "..." }
  ],
  "facebook": [
    { "content": "..." }
  ]
}

REQUIREMENTS:
- Instagram: 3 posts (short 100-150 chars, medium 200-400 chars, long 500-800 chars)
- Twitter: 5 posts (200-280 chars each)
- LinkedIn: 2 posts (500-1000 chars each)
- Facebook: 2 posts (300-600 chars each)
- Max 5 hashtags per Instagram post, none for other platforms
- No engagement bait ("Who relates?!")
- Sound human, not like a brand`;

  const response = await callClaude(userPrompt, {
    system: systemPrompt,
    episodeId,
    stageNumber: 8,
    temperature: 0.8,
    maxTokens: 3000,
  });

  // Parse the JSON response
  let outputData;
  try {
    outputData = parseJsonResponse(response.content);
  } catch (error) {
    logger.error('Failed to parse social content JSON', {
      error: error.message,
      content: response.content.substring(0, 500),
    });
    throw new ValidationError('response', 'Failed to parse social content JSON');
  }

  validateOutput(outputData);

  logger.stageComplete(8, 'Social Content', episodeId, response.durationMs, response.cost);

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

export default generateSocial;
