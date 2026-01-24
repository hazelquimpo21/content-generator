/**
 * ============================================================================
 * STAGE 6: DUAL BLOG POST DRAFT GENERATION
 * ============================================================================
 * Writes TWO complete ~750 word blog posts based on the Stage 3 outlines:
 *   1. Episode Recap - promotes the podcast episode
 *   2. Topic Article - standalone piece based on selected blog idea
 *
 * Input: All previous stage outputs (0-3)
 * Output: Two complete blog posts in Markdown (text)
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

// Word count requirements per article
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
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Checks if the blog post has required markdown structure
 * @param {string} content - Blog post content
 * @returns {Object} Structure analysis
 */
function analyzeStructure(content) {
  const lines = content.split('\n');

  const h1Count = lines.filter(l => l.match(/^# [^#]/)).length;
  const h2Count = lines.filter(l => l.match(/^## [^#]/)).length;
  const blockquoteLines = lines.filter(l => l.trim().startsWith('>'));
  const blockquoteCount = blockquoteLines.length;

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

/**
 * Parses the AI response to extract both articles
 * @param {string} fullResponse - Complete response with both articles
 * @returns {Object} Object with episode_recap and topic_article
 */
function parseArticles(fullResponse) {
  // Look for the article separators
  const article1Marker = /^#\s*ARTICLE\s*1[:\s]*EPISODE\s*RECAP/im;
  const article2Marker = /^#\s*ARTICLE\s*2[:\s]*TOPIC\s*ARTICLE/im;

  let episodeRecap = '';
  let topicArticle = '';

  // Find positions
  const match1 = fullResponse.match(article1Marker);
  const match2 = fullResponse.match(article2Marker);

  if (match1 && match2) {
    const pos1 = fullResponse.indexOf(match1[0]);
    const pos2 = fullResponse.indexOf(match2[0]);

    // Extract articles
    if (pos1 < pos2) {
      episodeRecap = fullResponse.substring(pos1 + match1[0].length, pos2).trim();
      topicArticle = fullResponse.substring(pos2 + match2[0].length).trim();
    } else {
      topicArticle = fullResponse.substring(pos2 + match2[0].length, pos1).trim();
      episodeRecap = fullResponse.substring(pos1 + match1[0].length).trim();
    }
  } else {
    // Fallback: try to split by horizontal rule or double newlines
    const parts = fullResponse.split(/\n---+\n|\n\n#{1,2}\s*Article\s*2/i);
    if (parts.length >= 2) {
      episodeRecap = parts[0].trim();
      topicArticle = parts.slice(1).join('\n').trim();
    } else {
      // Last resort: treat entire response as one article
      logger.warn('Could not parse two articles from response, treating as single article');
      episodeRecap = fullResponse.trim();
      topicArticle = '';
    }
  }

  // Clean up any remaining article markers from the content
  episodeRecap = episodeRecap.replace(/^#\s*ARTICLE\s*1[:\s]*EPISODE\s*RECAP\s*/im, '').trim();
  topicArticle = topicArticle.replace(/^#\s*ARTICLE\s*2[:\s]*TOPIC\s*ARTICLE\s*/im, '').trim();

  return { episodeRecap, topicArticle };
}

// ============================================================================
// ARTICLE VALIDATION
// ============================================================================

/**
 * Validates a single article
 * @param {string} content - Article content
 * @param {string} articleType - 'episode_recap' or 'topic_article'
 * @param {string} episodeId - Episode ID for logging
 * @returns {Object} Validation result
 */
function validateArticle(content, articleType, episodeId) {
  const trimmedContent = content.trim();
  const charCount = trimmedContent.length;
  const wordCount = countWords(trimmedContent);
  const structure = analyzeStructure(trimmedContent);
  const aiPatterns = detectAIPatterns(trimmedContent);

  logger.info(`Validating ${articleType}`, {
    episodeId,
    charCount,
    wordCount,
    targetWords: IDEAL_WORD_COUNT,
    structure: {
      h1Count: structure.h1Count,
      h2Count: structure.h2Count,
      blockquoteCount: structure.blockquoteCount,
    },
  });

  // Validation checks
  const issues = [];

  if (charCount < MIN_CHAR_LENGTH) {
    issues.push(`Too short: ${charCount} chars (need ${MIN_CHAR_LENGTH})`);
  }

  if (wordCount < MIN_WORD_COUNT) {
    issues.push(`Too short: ${wordCount} words (need ${MIN_WORD_COUNT})`);
  }

  if (!structure.hasTitle) {
    issues.push('Missing H1 title');
  }

  if (!structure.hasSections) {
    issues.push('Needs at least 2 H2 sections');
  }

  if (issues.length > 0) {
    logger.warn(`${articleType} has issues`, { episodeId, issues });
  }

  return {
    isValid: issues.length === 0,
    issues,
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
 * Generates two complete blog post drafts:
 *   1. Episode Recap - promotes the podcast episode
 *   2. Topic Article - standalone piece based on selected blog idea
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript
 * @param {Object} context.evergreen - Evergreen settings
 * @param {Object} context.previousStages - Outputs from stages 0-3
 * @returns {Promise<Object>} Result with both articles
 */
export async function draftBlogPosts(context) {
  const { episodeId, transcript, evergreen, previousStages } = context;

  logger.stageStart(6, 'Dual Blog Draft Generation', episodeId);

  // ============================================================================
  // STEP 1: Compile context from previous stages
  // ============================================================================
  logger.debug('Compiling blog context from previous stages', { episodeId });

  const compiled = compileBlogContext(previousStages, evergreen, {
    includeTranscript: false,
  });

  // Get the Stage 3 outlines
  const stage3Output = previousStages[3];
  if (!stage3Output?.episode_recap_outline || !stage3Output?.topic_article_outline) {
    throw new ValidationError('previousStages[3]', 'Stage 3 must provide both article outlines');
  }

  logger.info('Blog context compiled', {
    episodeId,
    contextLength: compiled.fullContext.length,
    quoteCount: compiled.quoteCount,
    hasRecapOutline: !!stage3Output.episode_recap_outline,
    hasTopicOutline: !!stage3Output.topic_article_outline,
  });

  // ============================================================================
  // STEP 2: Load prompt template with compiled context
  // ============================================================================
  const prompt = await loadPrompt('stage-06-draft-generation', {
    COMPILED_BLOG_CONTEXT: compiled.fullContext,
  });

  // ============================================================================
  // STEP 3: Call OpenAI for text generation
  // ============================================================================
  const systemPrompt = `You are an expert blog writer specializing in therapy and mental health content.

Your task is to write TWO complete blog posts, each approximately ${IDEAL_WORD_COUNT} words.

CRITICAL REQUIREMENTS:
1. Each blog post MUST be at least ${MIN_WORD_COUNT} words
2. Each must include a title (H1) and at least 3 section headings (H2)
3. Integrate 2-3 quotes as blockquotes in each article
4. Do NOT include meta-commentary or word counts
5. Clearly separate the two articles with headers

ARTICLE 1: EPISODE RECAP
- Promotes the podcast episode
- Summarizes key insights
- Ends with CTA to listen

ARTICLE 2: TOPIC ARTICLE
- Standalone piece (doesn't mention the podcast)
- Based on the selected blog idea from the outlines
- Provides real value on its own

Write both complete blog posts now.`;

  let response;
  let retryCount = 0;

  while (retryCount <= MAX_SHORT_CONTENT_RETRIES) {
    logger.info('Calling OpenAI for dual blog draft generation', {
      episodeId,
      attempt: retryCount + 1,
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
        maxTokens: 6000, // Enough for ~1500 words total + markdown overhead
      }
    );

    const fullOutput = response.content.trim();

    // Parse the two articles from the response
    const { episodeRecap, topicArticle } = parseArticles(fullOutput);

    // Validate both articles
    const recapValidation = validateArticle(episodeRecap, 'episode_recap', episodeId);
    const topicValidation = validateArticle(topicArticle, 'topic_article', episodeId);

    // Check if both are valid
    const bothValid = recapValidation.isValid && topicValidation.isValid;

    if (bothValid) {
      logger.info('Both blog posts generated successfully', {
        episodeId,
        recapWordCount: recapValidation.wordCount,
        topicWordCount: topicValidation.wordCount,
        attempts: retryCount + 1,
      });

      logger.stageComplete(6, 'Dual Blog Draft Generation', episodeId, response.durationMs, response.cost);

      return {
        output_data: {
          episode_recap: {
            word_count: recapValidation.wordCount,
            char_count: recapValidation.charCount,
            structure: recapValidation.structure,
            ai_patterns_detected: recapValidation.aiPatterns,
          },
          topic_article: {
            word_count: topicValidation.wordCount,
            char_count: topicValidation.charCount,
            structure: topicValidation.structure,
            ai_patterns_detected: topicValidation.aiPatterns,
          },
          selected_blog_idea: stage3Output.selected_blog_idea,
        },
        output_text: {
          episode_recap: episodeRecap,
          topic_article: topicArticle,
        },
        input_tokens: response.inputTokens,
        output_tokens: response.outputTokens,
        cost_usd: response.cost,
      };
    }

    // Log validation issues
    const allIssues = [
      ...recapValidation.issues.map(i => `Recap: ${i}`),
      ...topicValidation.issues.map(i => `Topic: ${i}`),
    ];

    if (retryCount >= MAX_SHORT_CONTENT_RETRIES) {
      logger.error('Blog post generation failed after retries', {
        episodeId,
        totalAttempts: retryCount + 1,
        issues: allIssues,
      });

      // Return what we have even if not perfect
      logger.stageComplete(6, 'Dual Blog Draft Generation (with issues)', episodeId, response.durationMs, response.cost);

      return {
        output_data: {
          episode_recap: {
            word_count: recapValidation.wordCount,
            char_count: recapValidation.charCount,
            structure: recapValidation.structure,
            ai_patterns_detected: recapValidation.aiPatterns,
            validation_issues: recapValidation.issues,
          },
          topic_article: {
            word_count: topicValidation.wordCount,
            char_count: topicValidation.charCount,
            structure: topicValidation.structure,
            ai_patterns_detected: topicValidation.aiPatterns,
            validation_issues: topicValidation.issues,
          },
          selected_blog_idea: stage3Output.selected_blog_idea,
        },
        output_text: {
          episode_recap: episodeRecap,
          topic_article: topicArticle,
        },
        input_tokens: response.inputTokens,
        output_tokens: response.outputTokens,
        cost_usd: response.cost,
      };
    }

    logger.warn('Blog posts have issues, retrying', {
      episodeId,
      attempt: retryCount + 1,
      issues: allIssues,
    });

    retryCount++;
  }

  throw new ValidationError('content', 'Blog post generation failed after all retries');
}

// Export aliases for compatibility
export { draftBlogPosts as draftBlogPost };
export default draftBlogPosts;
