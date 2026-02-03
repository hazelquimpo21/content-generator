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

import { callClaudeStructured } from '../lib/api-client-anthropic.js';
import { loadPrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// FUNCTION CALLING SCHEMA
// ============================================================================

const EMAIL_SCHEMA = {
  type: 'object',
  properties: {
    subject_lines: {
      type: 'array',
      items: { type: 'string' },
      minItems: 5,
      maxItems: 5,
      description: 'Five email subject line options (under 50 characters each)',
    },
    preview_text: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
      description: 'Three preview text options (40-90 characters each)',
    },
    email_body: {
      type: 'string',
      description: 'Full email body in markdown format (200-350 words)',
    },
    followup_email: {
      type: 'string',
      description: 'Optional shorter follow-up email (100-150 words)',
    },
  },
  required: ['subject_lines', 'preview_text', 'email_body'],
};

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

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

export async function generateEmail(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.stageStart(9, 'Email Campaign', episodeId);

  const refinedPost = previousStages[7]?.output_text;
  const headlines = previousStages[5];
  const quotes = previousStages[2];
  const episodeTitle = previousStages[1]?.episode_basics?.title || 'Latest Episode';

  if (!refinedPost) {
    throw new ValidationError('previousStages.7', 'Missing refined post for email');
  }

  // Handle dual-article format vs legacy
  let blogContent = refinedPost;
  if (typeof refinedPost === 'object') {
    // For email, use Episode Recap (promotes the episode)
    blogContent = refinedPost.episode_recap || refinedPost.topic_article || '';
  }

  // Build template variables for the prompt file
  const templateVars = {
    PODCAST_NAME: evergreen?.podcast_info?.name || 'The Podcast',
    THERAPIST_NAME: evergreen?.therapist_profile?.name || 'The Host',
    CREDENTIALS: evergreen?.therapist_profile?.credentials || '',
    EPISODE_TITLE: episodeTitle,
    TARGET_AUDIENCE: evergreen?.podcast_info?.target_audience || 'listeners interested in mental health',
    STAGE_7_OUTPUT: blogContent,
    STAGE_2_OUTPUT: JSON.stringify(quotes, null, 2),
    STAGE_5_OUTPUT: JSON.stringify(headlines, null, 2),
  };

  // Load the prompt file
  let promptContent;
  try {
    promptContent = await loadPrompt('stage-09-email-campaign', templateVars, {
      includeNeverUse: true,
      includeQualityFrameworks: false,
    });
  } catch (error) {
    logger.error('Failed to load email campaign prompt', {
      error: error.message,
    });
    throw new ValidationError('prompt', `Failed to load email prompt: ${error.message}`);
  }

  // System prompt focuses on persona - no JSON instructions
  const systemPrompt = `You are an email marketing expert specializing in therapy and mental health newsletters.
Write emails that feel like they're from a friend who happens to be a therapist.
Tailor your tone and content to resonate with the target audience.`;

  // Use function calling to get structured output
  const response = await callClaudeStructured(promptContent, {
    system: systemPrompt,
    toolName: 'generate_email_campaign',
    toolDescription: 'Generate email newsletter content with subject lines, preview text, and body',
    inputSchema: EMAIL_SCHEMA,
    episodeId,
    stageNumber: 9,
    temperature: 0.7,
    maxTokens: 2000,
  });

  // Function calling returns structured data directly in toolInput
  const outputData = response.toolInput;

  if (!outputData) {
    logger.error('No structured output from email generation', { episodeId });
    throw new ValidationError('response', 'Failed to generate email content');
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
