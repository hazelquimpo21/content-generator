/**
 * ============================================================================
 * STAGE 0: CONTENT BRIEF
 * ============================================================================
 * Analyzes podcast transcripts to create a comprehensive content brief for
 * the writing team. This is the foundational analysis that all downstream
 * stages build upon.
 *
 * This stage ALWAYS runs (not conditional like the old preprocessing stage).
 *
 * Purpose:
 * --------
 * Transform a raw transcript into a usable content brief containing:
 * - Episode metadata (name, subtitle, host, guest)
 * - SEO overview paragraph
 * - 4 key themes with actionable takeaways
 * - 4 topic tags
 * - Promotion information
 *
 * Philosophy:
 * -----------
 * - Human-readable output for the writing team (output_text)
 * - Structured data for downstream AI stages (output_data)
 * - Uses "They Ask, You Answer" methodology
 * - Specific, actionable, and emotionally resonant
 *
 * Output:
 * -------
 * - output_text: Human-readable content brief (markdown)
 * - output_data: Structured JSON for downstream stages
 *
 * Model: Claude Sonnet 4 (quality analysis is worth the cost)
 * ============================================================================
 */

import { callClaudeStructured } from '../lib/api-client-anthropic.js';
import { loadStagePrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Use Claude Sonnet for quality analysis
const CONTENT_BRIEF_MODEL = 'claude-sonnet-4-20250514';

// ============================================================================
// JSON SCHEMA FOR STRUCTURED OUTPUT
// ============================================================================

const CONTENT_BRIEF_SCHEMA = {
  type: 'object',
  description: 'Structured content brief for a podcast episode',
  properties: {
    episode_name: {
      type: 'string',
      description: 'Compelling episode title (40-70 characters)',
    },
    episode_subtitle: {
      type: 'string',
      description: 'One complete sentence explaining what the episode covers',
    },
    host_name: {
      type: 'string',
      description: 'Host name from transcript/metadata, or "Unknown"',
    },
    guest_name: {
      type: ['string', 'null'],
      description: 'Guest name, or null if no guest',
    },
    guest_bio: {
      type: ['string', 'null'],
      description: '1-2 sentence guest bio, or null if no guest',
    },
    seo_overview: {
      type: 'string',
      description: 'SEO paragraph overview (3-5 sentences) explaining what listeners will learn',
    },
    themes: {
      type: 'array',
      description: 'Exactly 4 key themes from the episode',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Clear, specific theme name',
          },
          what_was_discussed: {
            type: 'string',
            description: 'Short explanation of what was said (2-3 sentences)',
          },
          practical_value: {
            type: 'string',
            description: 'What the listener can do with it - specific, actionable (2-3 sentences)',
          },
        },
        required: ['name', 'what_was_discussed', 'practical_value'],
      },
      minItems: 4,
      maxItems: 4,
    },
    tags: {
      type: 'array',
      description: 'Exactly 4 topic tags for categorization and SEO',
      items: { type: 'string' },
      minItems: 4,
      maxItems: 4,
    },
    has_promotion: {
      type: 'boolean',
      description: 'Whether there is something to promote',
    },
    promotion_details: {
      type: ['string', 'null'],
      description: 'What to promote (offer, CTA, lead magnet, etc.), or null',
    },
    date_released: {
      type: ['string', 'null'],
      description: 'Release date in YYYY-MM-DD format, or null if not available',
    },
  },
  required: [
    'episode_name',
    'episode_subtitle',
    'host_name',
    'seo_overview',
    'themes',
    'tags',
    'has_promotion',
  ],
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates the content brief output
 * @param {Object} data - Structured output from Claude
 * @throws {ValidationError} If validation fails
 * @returns {boolean} True if validation passes
 */
function validateOutput(data) {
  logger.debug('Validating content brief output', {
    hasEpisodeName: !!data.episode_name,
    hasSubtitle: !!data.episode_subtitle,
    themesCount: data.themes?.length,
    tagsCount: data.tags?.length,
  });

  // Validate required fields
  if (!data.episode_name || data.episode_name.length < 10) {
    throw new ValidationError('episode_name', 'Episode name is missing or too short');
  }

  if (!data.episode_subtitle || data.episode_subtitle.length < 20) {
    throw new ValidationError('episode_subtitle', 'Episode subtitle is missing or too short');
  }

  if (!data.seo_overview || data.seo_overview.length < 100) {
    throw new ValidationError('seo_overview', 'SEO overview is missing or too short');
  }

  // Validate themes
  if (!Array.isArray(data.themes) || data.themes.length !== 4) {
    throw new ValidationError('themes', `Must have exactly 4 themes (got ${data.themes?.length || 0})`);
  }

  for (let i = 0; i < data.themes.length; i++) {
    const theme = data.themes[i];
    if (!theme.name || !theme.what_was_discussed || !theme.practical_value) {
      throw new ValidationError(`themes[${i}]`, 'Theme missing required fields');
    }
  }

  // Validate tags
  if (!Array.isArray(data.tags) || data.tags.length !== 4) {
    throw new ValidationError('tags', `Must have exactly 4 tags (got ${data.tags?.length || 0})`);
  }

  logger.info('Content brief validation passed', {
    episodeName: data.episode_name.substring(0, 50),
    themesCount: data.themes.length,
    tagsCount: data.tags.length,
    hasGuest: !!data.guest_name,
  });

  return true;
}

/**
 * Formats the structured data into a human-readable content brief
 * @param {Object} data - Structured content brief data
 * @returns {string} Human-readable markdown brief
 */
function formatHumanReadableBrief(data) {
  const lines = [
    `# Content Brief: ${data.episode_name}`,
    '',
    '## Episode Details',
    `**Subtitle:** ${data.episode_subtitle}`,
    `**Host:** ${data.host_name}`,
  ];

  if (data.guest_name) {
    lines.push(`**Guest:** ${data.guest_name}`);
    if (data.guest_bio) {
      lines.push(`**Guest Bio:** ${data.guest_bio}`);
    }
  } else {
    lines.push('**Guest:** None');
  }

  if (data.date_released) {
    lines.push(`**Date Released:** ${data.date_released}`);
  }

  lines.push('');
  lines.push('## SEO Overview');
  lines.push(data.seo_overview);
  lines.push('');
  lines.push('## Key Themes');

  for (let i = 0; i < data.themes.length; i++) {
    const theme = data.themes[i];
    lines.push('');
    lines.push(`### Theme ${i + 1}: ${theme.name}`);
    lines.push(`**What was discussed:** ${theme.what_was_discussed}`);
    lines.push(`**Practical value:** ${theme.practical_value}`);
  }

  lines.push('');
  lines.push('## Topics/Tags');
  lines.push(data.tags.join(', '));
  lines.push('');
  lines.push('## Promotion');
  lines.push(`**Has promotion:** ${data.has_promotion ? 'Yes' : 'No'}`);
  if (data.has_promotion && data.promotion_details) {
    lines.push(`**What to promote:** ${data.promotion_details}`);
  }

  return lines.join('\n');
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Creates a content brief from a podcast transcript
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript text
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.episodeContext - Episode-specific context (optional)
 * @returns {Promise<Object>} Content brief result with output_data and output_text
 */
export async function createContentBrief(context) {
  const { episodeId, transcript, evergreen, episodeContext = {} } = context;

  logger.stageStart(0, 'Content Brief', episodeId);

  // Calculate transcript metrics
  const transcriptWords = transcript?.split(/\s+/).length || 0;
  const transcriptChars = transcript?.length || 0;

  logger.info('Stage 0: Creating content brief', {
    episodeId,
    transcriptWords,
    transcriptChars,
    model: CONTENT_BRIEF_MODEL,
  });

  // Validate transcript
  if (!transcript || transcriptChars < 500) {
    logger.error('Stage 0: Transcript too short or missing', {
      episodeId,
      transcriptChars,
    });
    throw new ValidationError('transcript', 'Transcript is required and must be at least 500 characters');
  }

  // Load prompt with context
  const prompt = await loadStagePrompt('stage-00-content-brief', {
    transcript,
    evergreen,
    previousStages: {},
    episodeContext,
  });

  // Build system prompt
  const systemPrompt = `You are an expert podcast content analyst creating a content brief for a writing team.

Your analysis should be:
- Specific and actionable (not generic)
- Written in a frank, straightforward way
- Emotionally resonant and authentic
- Using language familiar to the target audience

IMPORTANT RULES:
- Do NOT extract quotes (Stage 2 handles this)
- Do NOT invent facts not in the transcript
- Avoid: delve, elevate, unleash, unlock, maze, demystify
- Avoid rhetorical questions and semicolons
- Never use "in a world..."

Extract the structured content brief using the provided tool.`;

  // Call Claude Sonnet with structured output
  logger.info('Stage 0: Calling Claude Sonnet API', {
    episodeId,
    model: CONTENT_BRIEF_MODEL,
    promptLength: prompt.length,
  });

  let response;
  try {
    response = await callClaudeStructured(prompt, {
      model: CONTENT_BRIEF_MODEL,
      system: systemPrompt,
      episodeId,
      stageNumber: 0,
      temperature: 0.7, // Slightly higher for creative analysis
      maxTokens: 4096,
      toolName: 'create_content_brief',
      toolDescription: 'Create a structured content brief from a podcast transcript',
      inputSchema: CONTENT_BRIEF_SCHEMA,
    });
  } catch (apiError) {
    logger.error('Stage 0: Claude API call failed', {
      episodeId,
      errorName: apiError.name,
      errorMessage: apiError.message,
    });
    throw apiError;
  }

  logger.info('Stage 0: Received response', {
    episodeId,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    durationMs: response.durationMs,
    cost: response.cost,
  });

  // Extract structured data from tool response
  const outputData = response.toolInput;

  // Validate output
  validateOutput(outputData);

  // Generate human-readable brief from structured data
  const outputText = formatHumanReadableBrief(outputData);

  logger.stageComplete(0, 'Content Brief', episodeId, response.durationMs, response.cost);
  logger.info('Stage 0: Content brief created', {
    episodeId,
    episodeName: outputData.episode_name,
    themesCount: outputData.themes.length,
    hasGuest: !!outputData.guest_name,
    briefLength: outputText.length,
  });

  return {
    output_data: outputData,
    output_text: outputText,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

// Export aliases for compatibility
export { createContentBrief as preprocessTranscript };
export default createContentBrief;
