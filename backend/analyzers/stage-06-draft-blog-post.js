/**
 * ============================================================================
 * STAGE 6: BLOG POST DRAFT GENERATION
 * ============================================================================
 * Writes the complete ~750 word blog post based on all previous stage outputs.
 *
 * Key Changes (fixing "blog post too short" error):
 * -------------------------------------------------
 * 1. Uses BlogContentCompiler to assemble rich context from previous stages
 * 2. Enhanced validation with detailed diagnostics
 * 3. Retry logic for short content
 * 4. Better error messages for debugging
 *
 * Input: All previous stage outputs (1-5)
 * Output: Complete blog post in Markdown (text)
 * Model: GPT-5 mini (OpenAI)
 * ============================================================================
 */

import { callOpenAI } from '../lib/api-client-openai.js';
import { loadPrompt } from '../lib/prompt-loader.js';
import { compileBlogContext, TARGET_TOTAL_WORDS } from '../lib/blog-content-compiler.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Word count requirements
const MIN_WORD_COUNT = 600;
const IDEAL_WORD_COUNT = 750;
const MAX_WORD_COUNT = 1000;

// Character length minimum (backup check)
const MIN_CHAR_LENGTH = 3000; // ~600 words is roughly 3000 chars

// Max retries for short content
const MAX_SHORT_CONTENT_RETRIES = 1;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Counts words in a text string
 * @param {string} text - Text to count words in
 * @returns {number} Word count
 */
function countWords(text) {
  if (!text) return 0;
  // Split on whitespace and filter empty strings
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Checks if the blog post has required markdown structure
 * @param {string} content - Blog post content
 * @returns {Object} Structure analysis
 */
function analyzeStructure(content) {
  const lines = content.split('\n');

  // Count headings
  const h1Count = lines.filter(l => l.match(/^# [^#]/)).length;
  const h2Count = lines.filter(l => l.match(/^## [^#]/)).length;

  // Count blockquotes
  const blockquoteLines = lines.filter(l => l.trim().startsWith('>'));
  const blockquoteCount = blockquoteLines.length;

  // Count paragraphs (non-empty, non-heading, non-blockquote lines)
  const paragraphCount = lines.filter(l => {
    const trimmed = l.trim();
    return trimmed.length > 0
      && !trimmed.startsWith('#')
      && !trimmed.startsWith('>')
      && !trimmed.startsWith('---')
      && !trimmed.startsWith('```');
  }).length;

  return {
    h1Count,
    h2Count,
    blockquoteCount,
    paragraphCount,
    hasTitle: h1Count >= 1,
    hasSections: h2Count >= 2,
    hasQuotes: blockquoteCount >= 2,
    isStructureValid: h1Count >= 1 && h2Count >= 2,
  };
}

/**
 * Checks for common AI patterns that should be avoided
 * @param {string} content - Blog post content
 * @returns {string[]} List of detected AI patterns
 */
function detectAIPatterns(content) {
  const patterns = [
    { regex: /in today's (world|fast-paced|busy)/i, name: "In today's world..." },
    { regex: /have you ever (wondered|felt|thought)/i, name: 'Have you ever...' },
    { regex: /let's (dive|explore|take a closer look)/i, name: "Let's dive/explore..." },
    { regex: /it's important to (note|remember|understand)/i, name: "It's important to note..." },
    { regex: /first and foremost/i, name: 'First and foremost' },
    { regex: /at the end of the day/i, name: 'At the end of the day' },
    { regex: /delve (into|deeper)/i, name: 'Delve into' },
    { regex: /navigate the landscape/i, name: 'Navigate the landscape' },
    { regex: /game-?changer/i, name: 'Game-changer' },
    { regex: /self-care isn't selfish/i, name: "Self-care isn't selfish" },
    { regex: /you can't pour from an empty cup/i, name: 'Empty cup cliche' },
    { regex: /healing isn't linear/i, name: "Healing isn't linear" },
  ];

  const detected = [];
  const lowerContent = content.toLowerCase();

  for (const { regex, name } of patterns) {
    if (regex.test(lowerContent)) {
      detected.push(name);
    }
  }

  return detected;
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validates the generated blog post with detailed diagnostics
 *
 * @param {string} content - Generated markdown content
 * @param {string} episodeId - Episode ID for logging
 * @returns {Object} Validation result with details
 * @throws {ValidationError} If validation fails
 */
function validateOutput(content, episodeId) {
  logger.debug('🔍 Validating blog post output', { episodeId });

  // Basic content check
  if (!content || content.trim().length === 0) {
    logger.error('❌ Validation failed: Empty content', { episodeId });
    throw new ValidationError('content', 'Blog post is empty');
  }

  const trimmedContent = content.trim();
  const charCount = trimmedContent.length;
  const wordCount = countWords(trimmedContent);
  const structure = analyzeStructure(trimmedContent);
  const aiPatterns = detectAIPatterns(trimmedContent);

  // Log detailed diagnostics
  logger.info('📊 Blog post validation diagnostics', {
    episodeId,
    charCount,
    wordCount,
    targetWords: IDEAL_WORD_COUNT,
    minWords: MIN_WORD_COUNT,
    structure: {
      h1Count: structure.h1Count,
      h2Count: structure.h2Count,
      blockquoteCount: structure.blockquoteCount,
      paragraphCount: structure.paragraphCount,
    },
    aiPatternsDetected: aiPatterns.length,
    aiPatterns: aiPatterns.length > 0 ? aiPatterns : undefined,
  });

  // Character length check (backup)
  if (charCount < MIN_CHAR_LENGTH) {
    logger.error('❌ Validation failed: Content too short (char count)', {
      episodeId,
      charCount,
      minRequired: MIN_CHAR_LENGTH,
      contentPreview: trimmedContent.substring(0, 200),
    });
    throw new ValidationError(
      'content',
      `Blog post is too short (${charCount} characters, need at least ${MIN_CHAR_LENGTH})`
    );
  }

  // Word count check
  if (wordCount < MIN_WORD_COUNT) {
    logger.error('❌ Validation failed: Content too short (word count)', {
      episodeId,
      wordCount,
      minRequired: MIN_WORD_COUNT,
      targetWords: IDEAL_WORD_COUNT,
      shortBy: MIN_WORD_COUNT - wordCount,
    });
    throw new ValidationError(
      'content',
      `Blog post too short: ${wordCount} words (minimum ${MIN_WORD_COUNT}, target ${IDEAL_WORD_COUNT})`
    );
  }

  // Structure check
  if (!structure.hasTitle) {
    logger.warn('⚠️ Blog post missing H1 title', { episodeId });
    throw new ValidationError('content', 'Blog post is missing a title (H1 heading)');
  }

  if (!structure.hasSections) {
    logger.warn('⚠️ Blog post has insufficient sections', {
      episodeId,
      h2Count: structure.h2Count,
    });
    throw new ValidationError('content', 'Blog post needs at least 2 section headings (H2)');
  }

  // Warn about word count (not errors)
  if (wordCount > MAX_WORD_COUNT) {
    logger.warn('⚠️ Blog post exceeds target length', {
      episodeId,
      wordCount,
      maxTarget: MAX_WORD_COUNT,
    });
  }

  // Warn about AI patterns (not errors, just log)
  if (aiPatterns.length > 0) {
    logger.warn('⚠️ Blog post contains AI patterns (consider review)', {
      episodeId,
      patterns: aiPatterns,
    });
  }

  // Warn about missing quotes
  if (!structure.hasQuotes) {
    logger.warn('⚠️ Blog post has few or no blockquotes', {
      episodeId,
      blockquoteCount: structure.blockquoteCount,
    });
  }

  logger.info('✅ Blog post validation passed', {
    episodeId,
    wordCount,
    structure: structure.isStructureValid ? 'valid' : 'needs review',
  });

  return {
    isValid: true,
    wordCount,
    charCount,
    structure,
    aiPatterns,
  };
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Generates a complete blog post draft using the compiled context
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript
 * @param {Object} context.evergreen - Evergreen settings
 * @param {Object} context.previousStages - Outputs from stages 1-5
 * @returns {Promise<Object>} Result with output_text and usage stats
 */
export async function draftBlogPost(context) {
  const { episodeId, transcript, evergreen, previousStages } = context;

  logger.stageStart(6, 'Draft Generation', episodeId);

  // ============================================================================
  // STEP 1: Compile context from previous stages
  // ============================================================================
  logger.debug('📚 Compiling blog context from previous stages', { episodeId });

  const compiled = compileBlogContext(previousStages, evergreen, {
    includeTranscript: false, // Don't include full transcript to save tokens
  });

  logger.info('📚 Blog context compiled', {
    episodeId,
    contextLength: compiled.fullContext.length,
    quoteCount: compiled.quoteCount,
    sectionCount: compiled.sectionCount,
  });

  // ============================================================================
  // STEP 2: Load prompt template with compiled context
  // ============================================================================
  const prompt = await loadPrompt('stage-06-draft-generation', {
    COMPILED_BLOG_CONTEXT: compiled.fullContext,
  });

  logger.debug('📝 Prompt loaded', {
    episodeId,
    promptLength: prompt.length,
  });

  // ============================================================================
  // STEP 3: Call OpenAI for text generation
  // ============================================================================
  const systemPrompt = `You are an expert blog writer specializing in therapy and mental health content.

Your task is to write a COMPLETE blog post of approximately ${TARGET_TOTAL_WORDS} words.

CRITICAL REQUIREMENTS:
1. The blog post MUST be at least ${MIN_WORD_COUNT} words
2. Include a title (H1) and at least 3 section headings (H2)
3. Integrate 2-3 quotes as blockquotes
4. Do NOT include meta-commentary or word counts
5. Output ONLY the blog post in Markdown format

Write the complete blog post now.`;

  let response;
  let validationResult;
  let retryCount = 0;

  // Retry loop for handling short content
  while (retryCount <= MAX_SHORT_CONTENT_RETRIES) {
    logger.info('🚀 Calling OpenAI for blog draft generation', {
      episodeId,
      attempt: retryCount + 1,
      maxAttempts: MAX_SHORT_CONTENT_RETRIES + 1,
    });

    response = await callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      {
        episodeId,
        stageNumber: 6,
        temperature: 0.7,
        maxTokens: 3000, // Enough for ~750 words + markdown overhead
      }
    );

    const outputText = response.content.trim();
    const wordCount = countWords(outputText);

    logger.debug('📥 Received response from OpenAI', {
      episodeId,
      attempt: retryCount + 1,
      wordCount,
      charCount: outputText.length,
    });

    // Try to validate
    try {
      validationResult = validateOutput(outputText, episodeId);

      // If validation passed, we're done
      logger.info('✅ Blog post generation successful', {
        episodeId,
        wordCount: validationResult.wordCount,
        attempts: retryCount + 1,
      });

      // Return successful result
      logger.stageComplete(6, 'Draft Generation', episodeId, response.durationMs, response.cost);

      return {
        output_data: {
          word_count: validationResult.wordCount,
          char_count: validationResult.charCount,
          structure: validationResult.structure,
          ai_patterns_detected: validationResult.aiPatterns,
        },
        output_text: outputText,
        input_tokens: response.inputTokens,
        output_tokens: response.outputTokens,
        cost_usd: response.cost,
      };

    } catch (validationError) {
      // If this was our last retry, throw the error
      if (retryCount >= MAX_SHORT_CONTENT_RETRIES) {
        logger.error('❌ Blog post generation failed after retries', {
          episodeId,
          totalAttempts: retryCount + 1,
          lastWordCount: wordCount,
          error: validationError.message,
        });
        throw validationError;
      }

      // Log retry attempt
      logger.warn('⚠️ Blog post too short, retrying with emphasis', {
        episodeId,
        attempt: retryCount + 1,
        wordCount,
        minRequired: MIN_WORD_COUNT,
        error: validationError.message,
      });

      retryCount++;
    }
  }

  // This shouldn't be reached, but just in case
  throw new ValidationError('content', 'Blog post generation failed after all retries');
}

export default draftBlogPost;
