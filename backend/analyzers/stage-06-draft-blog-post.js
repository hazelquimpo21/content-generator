/**
 * ============================================================================
 * STAGE 6: DUAL BLOG POST DRAFT GENERATION (Sequential)
 * ============================================================================
 *
 * DESIGN PHILOSOPHY: Focused Analyzers
 * ------------------------------------
 * AI analyzers produce better results when they have a clear, focused task.
 * Rather than asking one API call to write TWO different articles (which
 * splits attention and requires complex parsing), we make two sequential
 * calls - each focused on one article type.
 *
 * Benefits of this approach:
 * - Each article gets the model's full attention
 * - No complex parsing logic (each call returns one clean article)
 * - Can retry individual articles if one fails validation
 * - Cleaner, more maintainable code
 * - Follows the same pattern as Stage 8 (social platforms)
 *
 * The two articles:
 *   1. Episode Recap (6a) - promotes the podcast episode
 *   2. Topic Article (6b) - standalone piece based on selected blog idea
 *
 * Input: All previous stage outputs (0-5)
 * Output: Two complete blog posts in Markdown (text)
 * Model: GPT-5 mini (OpenAI)
 * ============================================================================
 */

import { callOpenAI } from '../lib/api-client-openai.js';
import { loadPrompt } from '../lib/prompt-loader.js';
import { compileBlogContext } from '../lib/blog-content-compiler.js';
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

// Max retries per article
const MAX_RETRIES_PER_ARTICLE = 1;

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
// SINGLE ARTICLE GENERATOR
// ============================================================================

/**
 * Generates a single blog article with retry logic
 *
 * @param {Object} options - Generation options
 * @param {string} options.articleType - 'episode_recap' or 'topic_article'
 * @param {string} options.promptFile - Prompt template filename (without .md)
 * @param {string} options.compiledContext - Compiled blog context
 * @param {string} options.episodeId - Episode ID for logging
 * @param {Object} options.evergreen - Evergreen settings (voice, podcast info)
 * @returns {Promise<Object>} Article content and metadata
 */
async function generateSingleArticle({ articleType, promptFile, compiledContext, episodeId, evergreen }) {
  const stageLabel = articleType === 'episode_recap' ? '6a' : '6b';

  logger.info(`Generating ${articleType}`, { episodeId, stage: stageLabel });

  // Load the focused prompt for this article type
  const prompt = await loadPrompt(promptFile, {
    COMPILED_BLOG_CONTEXT: compiledContext,
    PODCAST_NAME: evergreen.podcastName || 'the podcast',
    THERAPIST_NAME: evergreen.therapistName || 'the host',
    TARGET_AUDIENCE: evergreen.targetAudience || 'listeners interested in mental health',
    VOICE_GUIDELINES: evergreen.voiceGuidelines || 'Warm, conversational, professional',
  });

  const systemPrompt = `You are an expert blog writer specializing in therapy and mental health content.

Your task is to write ONE complete blog post, approximately ${IDEAL_WORD_COUNT} words.

CRITICAL REQUIREMENTS:
1. The blog post MUST be at least ${MIN_WORD_COUNT} words
2. Include a title (H1) and at least 3 section headings (H2)
3. Integrate 2-3 quotes as blockquotes
4. Do NOT include meta-commentary or word counts
5. Output ONLY the article in Markdown format

Write the complete blog post now.`;

  let lastResponse = null;
  let lastValidation = null;

  for (let attempt = 0; attempt <= MAX_RETRIES_PER_ARTICLE; attempt++) {
    logger.info(`Calling OpenAI for ${articleType}`, {
      episodeId,
      attempt: attempt + 1,
      stage: stageLabel,
    });

    const response = await callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      {
        episodeId,
        stageNumber: 6,
        temperature: 0.7,
        maxTokens: 3000, // Enough for ~750 words + markdown
      }
    );

    lastResponse = response;
    const articleContent = response.content.trim();
    const validation = validateArticle(articleContent, articleType, episodeId);
    lastValidation = validation;

    if (validation.isValid) {
      logger.info(`${articleType} generated successfully`, {
        episodeId,
        wordCount: validation.wordCount,
        attempts: attempt + 1,
        stage: stageLabel,
      });

      return {
        content: articleContent,
        validation,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost,
        durationMs: response.durationMs,
      };
    }

    if (attempt < MAX_RETRIES_PER_ARTICLE) {
      logger.warn(`${articleType} failed validation, retrying`, {
        episodeId,
        attempt: attempt + 1,
        issues: validation.issues,
        stage: stageLabel,
      });
    }
  }

  // Return what we have even if not perfect
  logger.warn(`${articleType} completed with validation issues`, {
    episodeId,
    issues: lastValidation.issues,
    stage: stageLabel,
  });

  return {
    content: lastResponse.content.trim(),
    validation: lastValidation,
    inputTokens: lastResponse.inputTokens,
    outputTokens: lastResponse.outputTokens,
    cost: lastResponse.cost,
    durationMs: lastResponse.durationMs,
    hasIssues: true,
  };
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Generates two complete blog post drafts sequentially:
 *   1. Episode Recap - promotes the podcast episode
 *   2. Topic Article - standalone piece based on selected blog idea
 *
 * Each article is generated in a separate, focused API call. This follows
 * the "focused analyzer" philosophy: AI produces better results when it
 * has one clear task rather than multiple tasks in a single prompt.
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {string} context.transcript - Full transcript
 * @param {Object} context.evergreen - Evergreen settings
 * @param {Object} context.previousStages - Outputs from stages 0-5
 * @returns {Promise<Object>} Result with both articles
 */
export async function draftBlogPosts(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.stageStart(6, 'Dual Blog Draft Generation (Sequential)', episodeId);

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
  // STEP 2: Generate Episode Recap (focused API call)
  // ============================================================================
  const recapResult = await generateSingleArticle({
    articleType: 'episode_recap',
    promptFile: 'stage-06a-episode-recap',
    compiledContext: compiled.fullContext,
    episodeId,
    evergreen,
  });

  // ============================================================================
  // STEP 3: Generate Topic Article (focused API call)
  // ============================================================================
  const topicResult = await generateSingleArticle({
    articleType: 'topic_article',
    promptFile: 'stage-06b-topic-article',
    compiledContext: compiled.fullContext,
    episodeId,
    evergreen,
  });

  // ============================================================================
  // STEP 4: Combine results and return
  // ============================================================================
  const totalCost = recapResult.cost + topicResult.cost;
  const totalInputTokens = recapResult.inputTokens + topicResult.inputTokens;
  const totalOutputTokens = recapResult.outputTokens + topicResult.outputTokens;
  const totalDurationMs = recapResult.durationMs + topicResult.durationMs;

  logger.info('Both blog posts generated', {
    episodeId,
    recapWordCount: recapResult.validation.wordCount,
    topicWordCount: topicResult.validation.wordCount,
    totalCost,
  });

  logger.stageComplete(6, 'Dual Blog Draft Generation (Sequential)', episodeId, totalDurationMs, totalCost);

  return {
    output_data: {
      episode_recap: {
        word_count: recapResult.validation.wordCount,
        char_count: recapResult.validation.charCount,
        structure: recapResult.validation.structure,
        ai_patterns_detected: recapResult.validation.aiPatterns,
        ...(recapResult.hasIssues && { validation_issues: recapResult.validation.issues }),
      },
      topic_article: {
        word_count: topicResult.validation.wordCount,
        char_count: topicResult.validation.charCount,
        structure: topicResult.validation.structure,
        ai_patterns_detected: topicResult.validation.aiPatterns,
        ...(topicResult.hasIssues && { validation_issues: topicResult.validation.issues }),
      },
      selected_blog_idea: stage3Output.selected_blog_idea,
    },
    output_text: {
      episode_recap: recapResult.content,
      topic_article: topicResult.content,
    },
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cost_usd: totalCost,
  };
}

// Export aliases for compatibility
export { draftBlogPosts as draftBlogPost };
export default draftBlogPosts;
