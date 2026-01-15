/**
 * ============================================================================
 * STAGE 2: QUOTE EXTRACTION
 * ============================================================================
 * Extracts key verbatim quotes from the podcast transcript.
 *
 * This is the SOLE source of quotes for the entire pipeline.
 * All downstream stages (blog, social, email) use quotes from this stage.
 *
 * Architecture Notes:
 * -------------------
 * - Uses Claude Haiku (fast, cheap, excellent at extraction tasks)
 * - ALWAYS uses the ORIGINAL transcript (not Stage 0 summary)
 * - This ensures quotes are verbatim and accurate
 * - Uses tool_use for guaranteed structured JSON output
 *
 * Quote Structure (standardized across the pipeline):
 * ---------------------------------------------------
 * {
 *   text: "The actual quote...",           // Verbatim quote (required)
 *   speaker: "Dr. Jane Smith",             // Who said it (required)
 *   context: "Why this matters...",        // Significance (optional)
 *   usage: "headline|pullquote|social|key_point"  // Suggested use (optional)
 * }
 *
 * Input: Original transcript + Stage 1 analysis for context
 * Output: Array of 8-12 quotes with standardized structure
 * Model: Claude Haiku (fast, accurate extraction)
 * ============================================================================
 */

import { callClaudeStructured } from '../lib/api-client-anthropic.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Model for quote extraction - Haiku is perfect for precise extraction tasks
const QUOTE_EXTRACTION_MODEL = 'claude-3-5-haiku-20241022';

// Target quote count
const MIN_QUOTES = 5;
const MAX_QUOTES = 15;
const TARGET_QUOTES = 10;

// ============================================================================
// JSON SCHEMA FOR TOOL_USE
// ============================================================================
// This schema is used with Claude's tool_use for guaranteed structured output.
// Fields marked as required will always be present in the output.
// ============================================================================

const QUOTE_EXTRACTION_SCHEMA = {
  type: 'object',
  description: 'Extracted quotes from the podcast transcript',
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
    extraction_notes: {
      type: 'string',
      description: 'Brief notes about the quote extraction (e.g., "Found strong quotes on attachment theory, fewer on practical exercises")',
    },
  },
  required: ['quotes'],
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates the extracted quotes output.
 * Ensures quotes are present, properly structured, and meet quality standards.
 *
 * @param {Object} data - The extracted data from Claude
 * @throws {ValidationError} If validation fails
 * @returns {boolean} True if validation passes
 */
function validateOutput(data) {
  logger.debug('🔍 Validating quote extraction output', {
    hasQuotes: !!data.quotes,
    quoteCount: data.quotes?.length || 0,
  });

  // Check quotes array exists
  if (!data.quotes || !Array.isArray(data.quotes)) {
    logger.error('❌ Validation failed: quotes missing or invalid', {
      exists: !!data.quotes,
      isArray: Array.isArray(data.quotes),
    });
    throw new ValidationError('quotes', 'Missing or invalid quotes array');
  }

  // Check minimum quote count
  if (data.quotes.length < MIN_QUOTES) {
    logger.error('❌ Validation failed: not enough quotes', {
      count: data.quotes.length,
      minimum: MIN_QUOTES,
    });
    throw new ValidationError('quotes', `Need at least ${MIN_QUOTES} quotes, got ${data.quotes.length}`);
  }

  // Validate each quote
  for (let i = 0; i < data.quotes.length; i++) {
    const quote = data.quotes[i];

    // Check required fields
    if (!quote.text || typeof quote.text !== 'string') {
      throw new ValidationError(`quotes[${i}].text`, 'Quote text is required');
    }

    if (!quote.speaker || typeof quote.speaker !== 'string') {
      throw new ValidationError(`quotes[${i}].speaker`, 'Speaker is required');
    }

    // Check quote length (should be substantial but not too long)
    const wordCount = quote.text.split(/\s+/).length;
    if (wordCount < 8) {
      logger.warn('⚠️ Quote may be too short', {
        quoteIndex: i,
        wordCount,
        text: quote.text.substring(0, 50),
      });
    }

    if (wordCount > 80) {
      logger.warn('⚠️ Quote may be too long', {
        quoteIndex: i,
        wordCount,
        text: quote.text.substring(0, 50) + '...',
      });
    }
  }

  // Log success with stats
  const usageCounts = data.quotes.reduce((acc, q) => {
    if (q.usage) {
      acc[q.usage] = (acc[q.usage] || 0) + 1;
    }
    return acc;
  }, {});

  const speakers = [...new Set(data.quotes.map(q => q.speaker))];

  logger.info('✅ Quote extraction validation passed', {
    totalQuotes: data.quotes.length,
    uniqueSpeakers: speakers.length,
    speakers,
    usageDistribution: usageCounts,
    hasExtractionNotes: !!data.extraction_notes,
  });

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Extracts key verbatim quotes from the podcast transcript.
 *
 * This function is the CANONICAL source of quotes for the entire pipeline.
 * Downstream stages (blog, social, email) all reference these quotes.
 *
 * Key Design Decisions:
 * ---------------------
 * 1. Always uses ORIGINAL transcript (not Stage 0 summary) for verbatim accuracy
 * 2. Uses Claude Haiku - fast, cheap, excellent at extraction
 * 3. Uses tool_use for guaranteed JSON structure
 * 4. Standardized output format used by all downstream stages
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - ORIGINAL transcript (always used, not summary)
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.previousStages - Previous stage outputs (uses Stage 1 for context)
 * @returns {Promise<Object>} Result with output_data containing quotes array
 */
export async function extractQuotes(context) {
  const { episodeId, transcript, evergreen, previousStages } = context;

  logger.stageStart(2, 'Quote Extraction', episodeId);

  // -------------------------------------------------------------------------
  // IMPORTANT: Always use ORIGINAL transcript for quote extraction
  // This ensures quotes are verbatim and accurate, even if Stage 0 preprocessed
  // -------------------------------------------------------------------------
  const originalTranscript = transcript;

  logger.debug('📝 Using ORIGINAL transcript for quote extraction', {
    episodeId,
    transcriptLength: originalTranscript?.length,
    wordCount: originalTranscript?.split(/\s+/).length || 0,
    wasPreprocessed: previousStages[0]?.preprocessed === true,
  });

  // Get context from Stage 1 analysis (helps guide quote selection)
  const stage1Output = previousStages[1] || {};
  const episodeCrux = stage1Output.episode_crux || '';
  const keyThemes = stage1Output.key_themes || [];

  // -------------------------------------------------------------------------
  // Build the prompt for Claude Haiku
  // -------------------------------------------------------------------------
  const systemPrompt = `You are an expert content curator specializing in extracting powerful, quotable moments from podcast transcripts.

Your task is to find the most impactful verbatim quotes that could be used for:
- Headlines and article titles
- Pull quotes in blog posts
- Social media posts
- Key takeaway callouts

CRITICAL REQUIREMENTS:
- Quotes MUST be EXACT verbatim text from the transcript
- Do NOT paraphrase, clean up grammar, or modify the quotes in any way
- Include quotes from different parts of the conversation
- Capture a mix of insightful, practical, and emotionally resonant quotes
- Aim for ${TARGET_QUOTES} quotes total`;

  const userPrompt = `## Episode Context

**Podcast:** ${evergreen?.podcast_info?.name || 'Podcast'}
**Host:** ${evergreen?.therapist_profile?.name || 'Host'}

${episodeCrux ? `**Episode Crux:** ${episodeCrux}` : ''}

${keyThemes.length > 0 ? `**Key Themes:**
${keyThemes.map(t => `- ${t.theme}: ${t.description}`).join('\n')}` : ''}

## Instructions

Extract ${TARGET_QUOTES} powerful verbatim quotes from this transcript. Focus on:
1. **Headline-worthy statements** - Bold, attention-grabbing insights
2. **Practical wisdom** - Actionable advice listeners can apply
3. **Emotional resonance** - Moments that will connect with readers
4. **Expert insights** - Credible, authoritative statements
5. **Unique perspectives** - Fresh takes not commonly heard

For each quote:
- Copy the EXACT words from the transcript (verbatim)
- Note who said it
- Explain briefly why it's significant (context)
- Suggest the best use (headline, pullquote, social, or key_point)

## Full Transcript

${originalTranscript}`;

  // -------------------------------------------------------------------------
  // Call Claude Haiku with tool_use for structured output
  // -------------------------------------------------------------------------
  const response = await callClaudeStructured(userPrompt, {
    model: QUOTE_EXTRACTION_MODEL,
    system: systemPrompt,
    toolName: 'extract_quotes',
    toolDescription: 'Extract key verbatim quotes from the podcast transcript',
    inputSchema: QUOTE_EXTRACTION_SCHEMA,
    episodeId,
    stageNumber: 2,
    temperature: 0.3, // Low temperature for accurate extraction
    maxTokens: 4096,
  });

  // Extract the structured output
  const outputData = response.toolInput;

  logger.debug('📥 Received quote extraction response', {
    episodeId,
    quoteCount: outputData.quotes?.length || 0,
    hasExtractionNotes: !!outputData.extraction_notes,
  });

  // Validate the output
  validateOutput(outputData);

  // Log success with detailed stats
  const avgQuoteLength = Math.round(
    outputData.quotes.reduce((sum, q) => sum + q.text.split(/\s+/).length, 0) / outputData.quotes.length
  );

  logger.stageComplete(2, 'Quote Extraction', episodeId, response.durationMs, response.cost);

  logger.info('📝 Quote extraction complete', {
    episodeId,
    totalQuotes: outputData.quotes.length,
    avgQuoteWords: avgQuoteLength,
    model: QUOTE_EXTRACTION_MODEL,
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

export default extractQuotes;
