/**
 * ============================================================================
 * TRANSCRIPT ANALYZER - Quick Metadata Extraction
 * ============================================================================
 * Uses Claude 3.5 Haiku for fast, affordable transcript analysis to
 * auto-populate episode fields. This is a lightweight analysis meant for
 * the "New Episode" form, NOT the full Stage 1 analysis.
 *
 * Why Claude 3.5 Haiku?
 * - Very fast (designed for quick responses)
 * - Affordable ($0.80/MTok input, $4.00/MTok output)
 * - Already integrated in the project
 * - Good quality for metadata extraction
 *
 * Alternatives considered:
 * - Groq: Free tier, but requires new integration
 * - Mistral: Cheaper, but requires new integration
 * - GPT-4o-mini: Similar price, already have OpenAI integration
 *
 * This module provides a quick 2-3 second analysis to extract:
 * - Episode title (suggested)
 * - Guest name and credentials
 * - Main topics/keywords
 * - Brief episode summary
 *
 * Usage:
 *   import { analyzeTranscriptQuick } from './lib/transcript-analyzer.js';
 *   const metadata = await analyzeTranscriptQuick(transcript);
 *
 * ============================================================================
 */

import { callClaudeStructured } from './api-client-anthropic.js';
import logger from './logger.js';
import { calculateCost } from './cost-calculator.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Use Haiku for fast, affordable analysis
const ANALYSIS_MODEL = 'claude-3-5-haiku-20241022';

// Maximum transcript length to send (in characters)
// For longer transcripts, we'll send a truncated version
const MAX_TRANSCRIPT_LENGTH = 15000;

// Minimum transcript length for analysis
const MIN_TRANSCRIPT_LENGTH = 200;

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

/**
 * JSON Schema for the structured output from Claude
 * This schema enforces the exact structure we need for auto-population
 */
const TRANSCRIPT_METADATA_SCHEMA = {
  type: 'object',
  properties: {
    suggested_title: {
      type: 'string',
      description: 'A suggested episode title based on the main topic (concise, engaging)',
    },
    guest_name: {
      type: ['string', 'null'],
      description: 'Name of the guest speaker if present in the transcript, null if solo episode',
    },
    guest_credentials: {
      type: ['string', 'null'],
      description: 'Guest credentials/title if mentioned (e.g., "PhD, Clinical Psychologist")',
    },
    main_topics: {
      type: 'array',
      items: { type: 'string' },
      description: 'Top 3-5 main topics or themes discussed',
    },
    brief_summary: {
      type: 'string',
      description: 'A 1-2 sentence summary of what this episode covers',
    },
    episode_type: {
      type: 'string',
      enum: ['interview', 'solo', 'panel', 'qa', 'unknown'],
      description: 'The type of episode based on the number and role of speakers',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score for the extraction (0-1)',
    },
  },
  required: [
    'suggested_title',
    'guest_name',
    'guest_credentials',
    'main_topics',
    'brief_summary',
    'episode_type',
    'confidence',
  ],
};

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const ANALYSIS_SYSTEM_PROMPT = `You are an expert podcast transcript analyzer. Your job is to quickly extract key metadata from podcast transcripts.

Guidelines:
- Be concise and accurate
- If information is not present, use null
- Extract guest names and credentials exactly as mentioned
- Suggest engaging, SEO-friendly titles
- Focus on the main therapeutic/mental health themes
- Keep summaries brief (1-2 sentences max)

Episode type classification:
- "interview": Features a host interviewing one or more guests
- "solo": Host speaking alone
- "panel": Multiple hosts or co-hosts discussing together
- "qa": Question and answer format with audience
- "unknown": Cannot determine format

For confidence:
- 1.0: Very clear transcript with obvious metadata
- 0.7-0.9: Good transcript, some inference needed
- 0.4-0.6: Unclear transcript, best guesses
- Below 0.4: Very unclear, low confidence in results`;

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Quickly analyzes a transcript to extract metadata for auto-population.
 * Uses Claude 3.5 Haiku for fast, affordable extraction.
 *
 * @param {string} transcript - The podcast transcript to analyze
 * @param {Object} [options] - Analysis options
 * @param {number} [options.maxLength] - Max transcript length to send
 * @returns {Promise<Object>} Extracted metadata with usage stats
 *
 * @example
 * const result = await analyzeTranscriptQuick(transcriptText);
 * console.log(result.metadata.suggested_title);
 * console.log(result.metadata.guest_name);
 */
export async function analyzeTranscriptQuick(transcript, options = {}) {
  const { maxLength = MAX_TRANSCRIPT_LENGTH } = options;

  // Validate input
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('Transcript must be a non-empty string');
  }

  if (transcript.length < MIN_TRANSCRIPT_LENGTH) {
    throw new Error(`Transcript too short (minimum ${MIN_TRANSCRIPT_LENGTH} characters)`);
  }

  logger.debug('📝 Starting quick transcript analysis', {
    transcriptLength: transcript.length,
    maxLength,
  });

  // Truncate long transcripts (take beginning, middle sample, and end)
  let processedTranscript = transcript;
  if (transcript.length > maxLength) {
    const chunkSize = Math.floor(maxLength / 3);
    const beginning = transcript.slice(0, chunkSize);
    const middleStart = Math.floor(transcript.length / 2) - Math.floor(chunkSize / 2);
    const middle = transcript.slice(middleStart, middleStart + chunkSize);
    const end = transcript.slice(-chunkSize);

    processedTranscript = `[TRANSCRIPT BEGINNING]\n${beginning}\n\n[TRANSCRIPT MIDDLE SECTION]\n${middle}\n\n[TRANSCRIPT END]\n${end}`;

    logger.debug('📏 Transcript truncated for analysis', {
      originalLength: transcript.length,
      processedLength: processedTranscript.length,
    });
  }

  // Build the analysis prompt
  const userPrompt = `Analyze this podcast transcript and extract the key metadata.

TRANSCRIPT:
${processedTranscript}

Extract the metadata using the provided tool.`;

  const startTime = Date.now();

  try {
    // Call Claude with structured output
    const response = await callClaudeStructured(userPrompt, {
      toolName: 'extract_transcript_metadata',
      toolDescription: 'Extracts episode metadata from a podcast transcript for auto-populating form fields',
      inputSchema: TRANSCRIPT_METADATA_SCHEMA,
      model: ANALYSIS_MODEL,
      system: ANALYSIS_SYSTEM_PROMPT,
      temperature: 0.2, // Low temperature for consistent extraction
      maxTokens: 1024, // Small output for metadata
    });

    const durationMs = Date.now() - startTime;

    logger.info('✅ Quick transcript analysis complete', {
      durationMs,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      cost: response.cost,
      confidence: response.toolInput.confidence,
    });

    return {
      metadata: response.toolInput,
      usage: {
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        totalTokens: response.totalTokens,
        cost: response.cost,
        durationMs,
      },
    };
  } catch (error) {
    logger.error('❌ Quick transcript analysis failed', {
      error: error.message,
      transcriptLength: transcript.length,
      durationMs: Date.now() - startTime,
    });

    throw error;
  }
}

/**
 * Estimates the cost of running quick analysis on a transcript
 *
 * @param {string} transcript - The transcript to estimate
 * @returns {Object} Cost estimate
 */
export function estimateQuickAnalysisCost(transcript) {
  const truncatedLength = Math.min(transcript.length, MAX_TRANSCRIPT_LENGTH);

  // Rough token estimate: ~4 chars per token
  const inputTokens = Math.ceil(truncatedLength / 4) + 200; // +200 for system prompt
  const outputTokens = 300; // Typical metadata output size

  const cost = calculateCost(ANALYSIS_MODEL, inputTokens, outputTokens);

  return {
    estimatedCost: cost,
    formattedCost: `$${cost.toFixed(4)}`,
    inputTokens,
    outputTokens,
    model: ANALYSIS_MODEL,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  analyzeTranscriptQuick,
  estimateQuickAnalysisCost,
  ANALYSIS_MODEL,
  MIN_TRANSCRIPT_LENGTH,
  MAX_TRANSCRIPT_LENGTH,
};
