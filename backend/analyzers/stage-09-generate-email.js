/**
 * ============================================================================
 * STAGE 9: EMAIL CAMPAIGN CONTENT
 * ============================================================================
 * Creates email newsletter content including subject lines, preview text,
 * and the full email body.
 *
 * Input: Stage 7 refined post + headlines
 * Output: Email campaign content (JSON)
 * Model: Claude Sonnet 4 (Anthropic)
 * ============================================================================
 */

import { callClaude } from '../lib/api-client-anthropic.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// VALIDATION
// ============================================================================

function validateOutput(data) {
  // Check subject lines
  if (!data.subject_lines || data.subject_lines.length < 5) {
    throw new ValidationError('subject_lines', 'Need at least 5 subject line options');
  }

  // Check preview text
  if (!data.preview_text || data.preview_text.length < 3) {
    throw new ValidationError('preview_text', 'Need at least 3 preview text options');
  }

  // Check email body
  if (!data.email_body || data.email_body.length < 200) {
    throw new ValidationError('email_body', 'Email body is too short');
  }

  return true;
}

/**
 * Parses JSON from Claude's response
 */
function parseJsonResponse(content) {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);

  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }

  return JSON.parse(content);
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

export async function generateEmail(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.stageStart(9, 'Email Campaign', episodeId);

  const refinedPost = previousStages[7]?.output_text;
  const headlines = previousStages[5];
  const episodeTitle = previousStages[1]?.episode_basics?.title || 'Latest Episode';

  if (!refinedPost) {
    throw new ValidationError('previousStages.7', 'Missing refined post for email');
  }

  const systemPrompt = `You are an email marketing expert specializing in therapy and mental health newsletters.
Write emails that feel like they're from a friend who happens to be a therapist.
Output ONLY valid JSON with no additional text or code blocks.`;

  const userPrompt = `
Create email newsletter content to promote this blog post.

PODCAST: ${evergreen?.podcast_info?.name || 'The Podcast'}
HOST: ${evergreen?.therapist_profile?.name || 'The Host'}
CREDENTIALS: ${evergreen?.therapist_profile?.credentials || ''}
EPISODE: ${episodeTitle}

BLOG POST:
${refinedPost}

AVAILABLE HEADLINES:
${JSON.stringify(headlines, null, 2)}

EMAIL SIGNATURE:
${evergreen?.seo_defaults?.email_signature || ''}

Generate content in this exact JSON structure:
{
  "subject_lines": [
    "Subject line 1 (<50 chars)",
    "Subject line 2",
    "Subject line 3",
    "Subject line 4",
    "Subject line 5"
  ],
  "preview_text": [
    "Preview text 1 (40-90 chars)",
    "Preview text 2",
    "Preview text 3"
  ],
  "email_body": "Full email body in markdown format (200-350 words)...",
  "followup_email": "Optional shorter follow-up email (100-150 words)..."
}

REQUIREMENTS:
- Subject lines under 50 characters
- Varied approaches: question, statement, teaser, personal
- Preview text complements subject line
- Email body: warm opening, key insights, clear CTA
- Sound like a friend, not a corporation
- One clear call-to-action
- No "Hope this finds you well"
- No excessive exclamation marks`;

  const response = await callClaude(userPrompt, {
    system: systemPrompt,
    episodeId,
    stageNumber: 9,
    temperature: 0.7,
    maxTokens: 2000,
  });

  // Parse the JSON response
  let outputData;
  try {
    outputData = parseJsonResponse(response.content);
  } catch (error) {
    logger.error('Failed to parse email content JSON', {
      error: error.message,
      content: response.content.substring(0, 500),
    });
    throw new ValidationError('response', 'Failed to parse email content JSON');
  }

  validateOutput(outputData);

  logger.stageComplete(9, 'Email Campaign', episodeId, response.durationMs, response.cost);

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

export default generateEmail;
