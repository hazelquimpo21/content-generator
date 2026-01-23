/**
 * ============================================================================
 * STAGE 2: QUOTES AND TIPS EXTRACTION
 * ============================================================================
 * Extracts key verbatim quotes AND actionable tips from the podcast transcript.
 *
 * This is the SOLE source of quotes and tips for the entire pipeline.
 * All downstream stages (blog, social, email) reference these.
 *
 * Architecture Notes:
 * -------------------
 * - Uses Claude Haiku (fast, cheap, excellent at extraction tasks)
 * - ALWAYS uses the ORIGINAL transcript (not Stage 0 summary)
 * - This ensures quotes are verbatim and accurate
 * - Uses tool_use for guaranteed structured JSON output
 *
 * Quote Structure:
 * ----------------
 * {
 *   text: "The actual quote...",           // Verbatim quote (required)
 *   speaker: "Dr. Jane Smith",             // Who said it (required)
 *   context: "Why this matters...",        // Significance (optional)
 *   usage: "headline|pullquote|social|key_point"  // Suggested use (optional)
 * }
 *
 * Tip Structure:
 * --------------
 * {
 *   tip: "Specific actionable advice",     // The tip itself (required)
 *   context: "When/why to use this",       // Context (required)
 *   category: "mindset|communication|..."  // Category (required)
 * }
 *
 * Input: Original transcript + Stage 0 themes for context
 * Output: Array of 8-12 quotes + 3-5 tips
 * Model: Claude Haiku (fast, accurate extraction)
 * ============================================================================
 */

import { callClaudeStructured } from '../lib/api-client-anthropic.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Model for extraction - Haiku is perfect for precise extraction tasks
const EXTRACTION_MODEL = 'claude-3-5-haiku-20241022';

// Target counts
const MIN_QUOTES = 5;
const MAX_QUOTES = 15;
const TARGET_QUOTES = 10;

const MIN_TIPS = 3;
const MAX_TIPS = 7;
const TARGET_TIPS = 5;

// ============================================================================
// JSON SCHEMA FOR TOOL_USE
// ============================================================================

const QUOTES_AND_TIPS_SCHEMA = {
  type: 'object',
  description: 'Extracted quotes and tips from the podcast transcript',
  properties: {
    quotes: {
      type: 'array',
      description: `Array of ${TARGET_QUOTES} key verbatim quotes from the transcript`,
      items: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The exact verbatim quote from the transcript (15-60 words). Must be word-for-word accurate.',
          },
          speaker: {
            type: 'string',
            description: 'Name of the person who said this quote (e.g., "Dr. Sarah Chen" or "Host")',
          },
          context: {
            type: 'string',
            description: 'Brief explanation of why this quote is significant or what it illustrates (1-2 sentences)',
          },
          usage: {
            type: 'string',
            enum: ['headline', 'pullquote', 'social', 'key_point'],
            description: 'Best suggested use for this quote: headline (attention-grabbing), pullquote (article highlight), social (social media post), key_point (illustrates main argument)',
          },
        },
        required: ['text', 'speaker'],
      },
      minItems: MIN_QUOTES,
      maxItems: MAX_QUOTES,
    },
    tips: {
      type: 'array',
      description: `Array of ${TARGET_TIPS} specific, actionable tips from the episode`,
      items: {
        type: 'object',
        properties: {
          tip: {
            type: 'string',
            description: 'Specific, actionable advice that listeners can immediately apply. Be concrete, not vague.',
          },
          context: {
            type: 'string',
            description: 'When or why to use this tip (1 sentence)',
          },
          category: {
            type: 'string',
            enum: ['mindset', 'communication', 'practice', 'boundary', 'self-care', 'relationship', 'professional'],
            description: 'Category of tip: mindset (thinking shifts), communication (what to say), practice (habits/routines), boundary (limits/rules), self-care (wellness), relationship (interpersonal), professional (work/career)',
          },
        },
        required: ['tip', 'context', 'category'],
      },
      minItems: MIN_TIPS,
      maxItems: MAX_TIPS,
    },
    extraction_notes: {
      type: 'string',
      description: 'Brief notes about the extraction (e.g., "Found strong quotes on attachment theory, fewer practical tips on communication")',
    },
  },
  required: ['quotes', 'tips'],
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates the extracted quotes and tips output.
 * @param {Object} data - The extracted data from Claude
 * @throws {ValidationError} If validation fails
 * @returns {boolean} True if validation passes
 */
function validateOutput(data) {
  logger.debug('Validating quotes and tips extraction output', {
    hasQuotes: !!data.quotes,
    quoteCount: data.quotes?.length || 0,
    hasTips: !!data.tips,
    tipCount: data.tips?.length || 0,
  });

  // Validate quotes array
  if (!data.quotes || !Array.isArray(data.quotes)) {
    throw new ValidationError('quotes', 'Missing or invalid quotes array');
  }

  if (data.quotes.length < MIN_QUOTES) {
    throw new ValidationError('quotes', `Need at least ${MIN_QUOTES} quotes, got ${data.quotes.length}`);
  }

  // Validate each quote
  for (let i = 0; i < data.quotes.length; i++) {
    const quote = data.quotes[i];

    if (!quote.text || typeof quote.text !== 'string') {
      throw new ValidationError(`quotes[${i}].text`, 'Quote text is required');
    }

    if (!quote.speaker || typeof quote.speaker !== 'string') {
      throw new ValidationError(`quotes[${i}].speaker`, 'Speaker is required');
    }

    // Check quote length
    const wordCount = quote.text.split(/\s+/).length;
    if (wordCount < 8) {
      logger.warn('Quote may be too short', { quoteIndex: i, wordCount });
    }
    if (wordCount > 80) {
      logger.warn('Quote may be too long', { quoteIndex: i, wordCount });
    }
  }

  // Validate tips array
  if (!data.tips || !Array.isArray(data.tips)) {
    throw new ValidationError('tips', 'Missing or invalid tips array');
  }

  if (data.tips.length < MIN_TIPS) {
    throw new ValidationError('tips', `Need at least ${MIN_TIPS} tips, got ${data.tips.length}`);
  }

  // Validate each tip
  for (let i = 0; i < data.tips.length; i++) {
    const tip = data.tips[i];

    if (!tip.tip || typeof tip.tip !== 'string') {
      throw new ValidationError(`tips[${i}].tip`, 'Tip text is required');
    }

    if (!tip.context || typeof tip.context !== 'string') {
      throw new ValidationError(`tips[${i}].context`, 'Tip context is required');
    }

    if (!tip.category) {
      throw new ValidationError(`tips[${i}].category`, 'Tip category is required');
    }

    // Check tip specificity (should be actionable, not vague)
    if (tip.tip.length < 20) {
      logger.warn('Tip may be too vague', { tipIndex: i, tip: tip.tip });
    }
  }

  // Log success stats
  const quoteUsageCounts = data.quotes.reduce((acc, q) => {
    if (q.usage) acc[q.usage] = (acc[q.usage] || 0) + 1;
    return acc;
  }, {});

  const tipCategoryCounts = data.tips.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + 1;
    return acc;
  }, {});

  logger.info('Quotes and tips extraction validation passed', {
    totalQuotes: data.quotes.length,
    totalTips: data.tips.length,
    quoteUsageDistribution: quoteUsageCounts,
    tipCategoryDistribution: tipCategoryCounts,
  });

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Extracts key verbatim quotes and actionable tips from the podcast transcript.
 *
 * This function is the CANONICAL source of quotes and tips for the entire pipeline.
 * Downstream stages (blog, social, email) all reference these.
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - ORIGINAL transcript (always used, not summary)
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.previousStages - Previous stage outputs (uses Stage 0 for context)
 * @returns {Promise<Object>} Result with output_data containing quotes and tips arrays
 */
export async function extractQuotesAndTips(context) {
  const { episodeId, transcript, evergreen, previousStages = {} } = context;

  logger.stageStart(2, 'Quotes & Tips Extraction', episodeId);

  // Always use ORIGINAL transcript for accurate extraction
  const originalTranscript = transcript;

  logger.debug('Using ORIGINAL transcript for extraction', {
    episodeId,
    transcriptLength: originalTranscript?.length,
    wordCount: originalTranscript?.split(/\s+/).length || 0,
  });

  // Get context from Stage 0 content brief (themes guide extraction)
  const stage0Output = previousStages[0] || {};
  const themes = stage0Output.themes || [];
  const episodeName = stage0Output.episode_name || '';

  // Build the system prompt
  const systemPrompt = `You are an expert content curator specializing in extracting two things from podcast transcripts:

1. **Powerful verbatim quotes** - word-for-word statements that could be headlines, pull quotes, or social posts
2. **Actionable tips** - specific, practical advice listeners can immediately apply

CRITICAL REQUIREMENTS FOR QUOTES:
- Quotes MUST be EXACT verbatim text from the transcript
- Do NOT paraphrase, clean up grammar, or modify quotes
- Include quotes from different parts of the conversation
- Mix of insightful, practical, and emotionally resonant quotes

CRITICAL REQUIREMENTS FOR TIPS:
- Tips must be SPECIFIC and ACTIONABLE (not vague platitudes)
- Good: "When you notice yourself spiraling, name five things you can see"
- Bad: "Practice mindfulness" (too vague)
- Tips should be things someone can do TODAY`;

  const userPrompt = `## Episode Context

**Podcast:** ${evergreen?.podcast_info?.name || 'Podcast'}
**Host:** ${evergreen?.therapist_profile?.name || 'Host'}
${episodeName ? `**Episode:** ${episodeName}` : ''}

${themes.length > 0 ? `**Key Themes:**
${themes.map(t => `- ${t.name}: ${t.what_was_discussed}`).join('\n')}` : ''}

## Instructions

### Extract ${TARGET_QUOTES} Quotes
Focus on:
1. **Headline-worthy statements** - Bold, attention-grabbing insights
2. **Practical wisdom** - Actionable advice listeners can apply
3. **Emotional resonance** - Moments that will connect with readers
4. **Expert insights** - Credible, authoritative statements
5. **Unique perspectives** - Fresh takes not commonly heard

### Extract ${TARGET_TIPS} Tips
Focus on:
1. **Immediate applicability** - Can do this today
2. **Specificity** - Exact action, not vague advice
3. **Memorability** - Easy to recall and share
4. **Variety** - Different categories (mindset, communication, practice, etc.)

## Full Transcript

${originalTranscript}`;

  // Call Claude Haiku with tool_use
  const response = await callClaudeStructured(userPrompt, {
    model: EXTRACTION_MODEL,
    system: systemPrompt,
    toolName: 'extract_quotes_and_tips',
    toolDescription: 'Extract verbatim quotes and actionable tips from the podcast transcript',
    inputSchema: QUOTES_AND_TIPS_SCHEMA,
    episodeId,
    stageNumber: 2,
    temperature: 0.3, // Low temperature for accurate extraction
    maxTokens: 6000,
  });

  // Extract the structured output
  const outputData = response.toolInput;

  logger.debug('Received extraction response', {
    episodeId,
    quoteCount: outputData.quotes?.length || 0,
    tipCount: outputData.tips?.length || 0,
  });

  // Validate the output
  validateOutput(outputData);

  // Log success
  logger.stageComplete(2, 'Quotes & Tips Extraction', episodeId, response.durationMs, response.cost);

  logger.info('Quotes and tips extraction complete', {
    episodeId,
    totalQuotes: outputData.quotes.length,
    totalTips: outputData.tips.length,
    model: EXTRACTION_MODEL,
    cost: response.cost,
  });

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

// Export with aliases for compatibility
export { extractQuotesAndTips as extractQuotes };
export default extractQuotesAndTips;
