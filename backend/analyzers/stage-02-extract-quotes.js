/**
 * ============================================================================
 * STAGE 2: CONTENT BUILDING BLOCKS EXTRACTION
 * ============================================================================
 * Extracts quotes, tips, "They Ask You Answer" Q&As, and blog post ideas
 * from the podcast transcript.
 *
 * This is the SOLE source of these building blocks for the entire pipeline.
 * All downstream stages (blog, social, email) reference these.
 *
 * Architecture Notes:
 * -------------------
 * - Uses Claude Haiku (fast, cheap, excellent at extraction tasks)
 * - ALWAYS uses the ORIGINAL transcript (not Stage 0 summary)
 * - This ensures quotes are verbatim and accurate
 * - Uses tool_use for guaranteed structured JSON output
 *
 * Output Structure:
 * -----------------
 * {
 *   quotes: [...],        // 8-12 verbatim quotes
 *   tips: [...],          // 3-5 actionable tips
 *   qa_pairs: [...],      // 5 "They Ask, You Answer" Q&As
 *   blog_ideas: [...]     // 6 blog post topic ideas
 * }
 *
 * Input: Original transcript + Stage 0 themes for context
 * Model: Claude Haiku (fast, accurate extraction)
 * ============================================================================
 */

import { callClaudeStructured } from '../lib/api-client-anthropic.js';
import { loadStagePrompt } from '../lib/prompt-loader.js';
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

const REQUIRED_QA_COUNT = 5;
const REQUIRED_BLOG_IDEAS = 6;

// ============================================================================
// JSON SCHEMA FOR TOOL_USE
// ============================================================================

const CONTENT_BUILDING_BLOCKS_SCHEMA = {
  type: 'object',
  description: 'Extracted content building blocks from the podcast transcript',
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
            description: 'Best suggested use for this quote',
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
            description: 'Category of tip',
          },
        },
        required: ['tip', 'context', 'category'],
      },
      minItems: MIN_TIPS,
      maxItems: MAX_TIPS,
    },
    qa_pairs: {
      type: 'array',
      description: 'Exactly 5 "They Ask, You Answer" question and answer pairs',
      items: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'A question the target audience might ask before they know the host exists. Written naturally.',
          },
          answer: {
            type: 'string',
            description: 'A thorough answer (3-5 sentences) based on what was discussed in the episode.',
          },
        },
        required: ['question', 'answer'],
      },
      minItems: REQUIRED_QA_COUNT,
      maxItems: REQUIRED_QA_COUNT,
    },
    blog_ideas: {
      type: 'array',
      description: 'Exactly 6 blog post topic ideas pulled from the episode content',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'A compelling working title for the blog post',
          },
          angle: {
            type: 'string',
            description: 'One sentence explaining the hook or angle',
          },
          why_it_resonates: {
            type: 'string',
            description: 'Why this topic would resonate with the target audience',
          },
          searchability: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'How likely someone is to Google this topic',
          },
        },
        required: ['title', 'angle', 'why_it_resonates'],
      },
      minItems: REQUIRED_BLOG_IDEAS,
      maxItems: REQUIRED_BLOG_IDEAS,
    },
    extraction_notes: {
      type: 'string',
      description: 'Brief notes about the extraction process',
    },
  },
  required: ['quotes', 'tips', 'qa_pairs', 'blog_ideas'],
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates the extracted content building blocks output.
 * @param {Object} data - The extracted data from Claude
 * @throws {ValidationError} If validation fails
 * @returns {boolean} True if validation passes
 */
function validateOutput(data) {
  logger.debug('Validating content building blocks output', {
    hasQuotes: !!data.quotes,
    quoteCount: data.quotes?.length || 0,
    hasTips: !!data.tips,
    tipCount: data.tips?.length || 0,
    hasQAPairs: !!data.qa_pairs,
    qaCount: data.qa_pairs?.length || 0,
    hasBlogIdeas: !!data.blog_ideas,
    blogIdeasCount: data.blog_ideas?.length || 0,
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
  }

  // Validate Q&A pairs
  if (!data.qa_pairs || !Array.isArray(data.qa_pairs)) {
    throw new ValidationError('qa_pairs', 'Missing or invalid qa_pairs array');
  }

  if (data.qa_pairs.length !== REQUIRED_QA_COUNT) {
    throw new ValidationError('qa_pairs', `Need exactly ${REQUIRED_QA_COUNT} Q&A pairs, got ${data.qa_pairs.length}`);
  }

  for (let i = 0; i < data.qa_pairs.length; i++) {
    const qa = data.qa_pairs[i];

    if (!qa.question || typeof qa.question !== 'string') {
      throw new ValidationError(`qa_pairs[${i}].question`, 'Question is required');
    }

    if (!qa.answer || typeof qa.answer !== 'string') {
      throw new ValidationError(`qa_pairs[${i}].answer`, 'Answer is required');
    }

    // Check answer length (should be 3-5 sentences, roughly 50-150 words)
    const answerWords = qa.answer.split(/\s+/).length;
    if (answerWords < 30) {
      logger.warn('Q&A answer may be too short', { qaIndex: i, answerWords });
    }
  }

  // Validate blog ideas
  if (!data.blog_ideas || !Array.isArray(data.blog_ideas)) {
    throw new ValidationError('blog_ideas', 'Missing or invalid blog_ideas array');
  }

  if (data.blog_ideas.length !== REQUIRED_BLOG_IDEAS) {
    throw new ValidationError('blog_ideas', `Need exactly ${REQUIRED_BLOG_IDEAS} blog ideas, got ${data.blog_ideas.length}`);
  }

  for (let i = 0; i < data.blog_ideas.length; i++) {
    const idea = data.blog_ideas[i];

    if (!idea.title || typeof idea.title !== 'string') {
      throw new ValidationError(`blog_ideas[${i}].title`, 'Blog idea title is required');
    }

    if (!idea.angle || typeof idea.angle !== 'string') {
      throw new ValidationError(`blog_ideas[${i}].angle`, 'Blog idea angle is required');
    }

    if (!idea.why_it_resonates || typeof idea.why_it_resonates !== 'string') {
      throw new ValidationError(`blog_ideas[${i}].why_it_resonates`, 'Blog idea resonance explanation is required');
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

  const searchabilityCounts = data.blog_ideas.reduce((acc, b) => {
    if (b.searchability) acc[b.searchability] = (acc[b.searchability] || 0) + 1;
    return acc;
  }, {});

  logger.info('Content building blocks validation passed', {
    totalQuotes: data.quotes.length,
    totalTips: data.tips.length,
    totalQAPairs: data.qa_pairs.length,
    totalBlogIdeas: data.blog_ideas.length,
    quoteUsageDistribution: quoteUsageCounts,
    tipCategoryDistribution: tipCategoryCounts,
    blogIdeaSearchability: searchabilityCounts,
  });

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Extracts content building blocks from the podcast transcript:
 * - Verbatim quotes
 * - Actionable tips
 * - "They Ask, You Answer" Q&A pairs
 * - Blog post ideas
 *
 * This function is the CANONICAL source of these elements for the entire pipeline.
 * Downstream stages (blog, social, email) all reference these.
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - ORIGINAL transcript (always used, not summary)
 * @param {Object} context.evergreen - Evergreen content settings
 * @param {Object} context.previousStages - Previous stage outputs (uses Stage 0 for context)
 * @param {Object} context.speakerData - Speaker diarization data (if available)
 * @param {string} context.transcriptFormat - 'plain' or 'speaker_labeled'
 * @returns {Promise<Object>} Result with output_data containing all building blocks
 */
export async function extractContentBuildingBlocks(context) {
  const { episodeId, transcript, evergreen, previousStages = {}, speakerData, transcriptFormat } = context;

  logger.stageStart(2, 'Content Building Blocks Extraction', episodeId);

  // Always use ORIGINAL transcript for accurate extraction
  const originalTranscript = transcript;

  // Check if we have speaker diarization data
  const hasSpeakerData = speakerData?.hasSpeakerDiarization && speakerData?.speakers?.length > 0;

  logger.debug('Using ORIGINAL transcript for extraction', {
    episodeId,
    transcriptLength: originalTranscript?.length,
    wordCount: originalTranscript?.split(/\s+/).length || 0,
    hasSpeakerDiarization: hasSpeakerData,
    speakerCount: speakerData?.speakers?.length || 0,
    transcriptFormat: transcriptFormat || 'plain',
  });

  // Get context from Stage 0 content brief
  const stage0Output = previousStages[0] || {};
  const themes = stage0Output.themes || [];
  const episodeName = stage0Output.episode_name || '';
  const hostName = stage0Output.host_name || evergreen?.therapist_profile?.name || 'Host';
  const guestName = stage0Output.guest_name || null;
  const targetAudience = evergreen?.podcast_info?.target_audience || 'general audience';

  // Build speaker context if diarization data is available
  let speakerContext = '';
  if (hasSpeakerData) {
    const speakerList = speakerData.speakers.map(s => {
      const label = s.label || s.speaker_id || `Speaker ${s.id}`;
      const role = s.role ? ` (${s.role})` : '';
      return `- ${label}${role}`;
    }).join('\n');
    speakerContext = `\n\n## Known Speakers
${speakerList}

IMPORTANT: Use these exact speaker names when attributing quotes.`;
  }

  // Build the system prompt (conversational, human tone)
  const systemPrompt = `You're a content strategist who knows how to mine a conversation for gold. You pull out the moments worth quoting, the advice worth sharing, the questions the audience is secretly asking, and the article ideas hiding in the conversation.

You're extracting four types of content:

1. QUOTES (8-12): Verbatim, word-for-word moments someone would screenshot and share. Must be exact quotes from the transcript.

2. TIPS (3-5): Specific, actionable advice people can use TODAY. Not vague platitudes like "practice self-care" but real actions.

3. "THEY ASK, YOU ANSWER" Q&As (exactly 5): Questions the target audience is already asking before they know this host exists. Things they'd type into Google or ask a friend. Each answer should be thorough (3-5 sentences) based on episode content.

4. BLOG POST IDEAS (exactly 6): Standalone article topics from this episode's content. Mix of specific/narrow topics and broader explorations. At least 2 should be highly searchable.

Write like a human. Be specific. Avoid AI clichés.`;

  const userPrompt = `## Episode Context

**Podcast:** ${evergreen?.podcast_info?.name || 'Podcast'}
**Host:** ${hostName}
${guestName ? `**Guest:** ${guestName}` : ''}
${episodeName ? `**Episode:** ${episodeName}` : ''}
**Target Audience:** ${targetAudience}

${themes.length > 0 ? `**Key Themes:**
${themes.map(t => `- ${t.name}: ${t.what_was_discussed}`).join('\n')}` : ''}${speakerContext}

## Instructions

Extract the four types of content described above. For quotes, they must be EXACT verbatim text. For Q&As, write questions as people would naturally ask them. For blog ideas, think about what would actually get clicks and help people.

## Full Transcript

${originalTranscript}`;

  // Call Claude Haiku with tool_use
  const response = await callClaudeStructured(userPrompt, {
    model: EXTRACTION_MODEL,
    system: systemPrompt,
    toolName: 'extract_content_building_blocks',
    toolDescription: 'Extract quotes, tips, Q&As, and blog ideas from the podcast transcript',
    inputSchema: CONTENT_BUILDING_BLOCKS_SCHEMA,
    episodeId,
    stageNumber: 2,
    temperature: 0.4, // Slightly higher for creative ideation
    maxTokens: 8000,
  });

  // Extract the structured output
  const outputData = response.toolInput;

  logger.debug('Received extraction response', {
    episodeId,
    quoteCount: outputData.quotes?.length || 0,
    tipCount: outputData.tips?.length || 0,
    qaCount: outputData.qa_pairs?.length || 0,
    blogIdeasCount: outputData.blog_ideas?.length || 0,
  });

  // Validate the output
  validateOutput(outputData);

  // Log success
  logger.stageComplete(2, 'Content Building Blocks Extraction', episodeId, response.durationMs, response.cost);

  logger.info('Content building blocks extraction complete', {
    episodeId,
    totalQuotes: outputData.quotes.length,
    totalTips: outputData.tips.length,
    totalQAPairs: outputData.qa_pairs.length,
    totalBlogIdeas: outputData.blog_ideas.length,
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
export { extractContentBuildingBlocks as extractQuotesAndTips };
export { extractContentBuildingBlocks as extractQuotes };
export default extractContentBuildingBlocks;
