/**
 * Scraper Service for Profile Enrichment
 *
 * Handles website scraping, content analysis, and scrape job management.
 * Uses cheerio for HTML parsing and AI for content extraction.
 *
 * @module services/scraper-service
 */

import * as cheerio from 'cheerio';
import logger from '../lib/logger.js';
import { getServiceClient } from '../lib/supabase-client.js';
import { callClaude } from '../lib/api-client-anthropic.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SCRAPER_CONFIG = {
  // Request settings
  timeout: 15000, // 15 second timeout
  maxRedirects: 3,
  userAgent:
    'Mozilla/5.0 (compatible; ContentPipelineBot/1.0; +https://contentpipeline.app)',

  // Content extraction - elements to remove
  removeSelectors: [
    'script',
    'style',
    'noscript',
    'iframe',
    'nav',
    'header',
    'footer',
    '.navigation',
    '.nav',
    '.menu',
    '.sidebar',
    '.cookie-banner',
    '.popup',
    '.modal',
    '[role="navigation"]',
    '[role="banner"]',
    '.social-links',
    '.share-buttons',
    '.comments',
  ],

  // Main content selectors (tried in order)
  contentSelectors: [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '.main-content',
    '.page-content',
    '.entry-content',
    '.post-content',
    '#content',
    '#main',
    '.about-content',
    '.bio',
  ],

  // About page URL patterns to try
  aboutPagePatterns: [
    '/about',
    '/about-me',
    '/about-us',
    '/bio',
    '/meet-me',
    '/our-story',
    '/who-we-are',
    '/my-story',
  ],

  // Services page URL patterns to try
  servicesPagePatterns: [
    '/services',
    '/work-with-me',
    '/offerings',
    '/what-i-do',
    '/how-i-help',
    '/therapy',
    '/coaching',
    '/counseling',
  ],
};

// ============================================================================
// SCRAPE JOB MANAGEMENT
// ============================================================================

/**
 * Create a new scrape job.
 *
 * @param {string} userId - User ID
 * @param {Object} params - Job parameters
 * @param {string} params.type - Job type (website, podcast_rss, bio_text)
 * @param {string} [params.url] - Target URL
 * @param {string} [params.text] - Input text (for bio_text type)
 * @returns {Promise<Object>} Created job record
 */
async function createScrapeJob(userId, { type, url, text }) {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('scrape_jobs')
    .insert({
      user_id: userId,
      job_type: type,
      target_url: url,
      input_text: text,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create scrape job', { userId, type, error: error.message });
    throw new Error(`Failed to create scrape job: ${error.message}`);
  }

  logger.info('Created scrape job', { jobId: data.id, userId, type });
  return data;
}

/**
 * Get a scrape job by ID (with user ownership check).
 *
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} Job record or null
 */
async function getScrapeJob(userId, jobId) {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to fetch scrape job: ${error.message}`);
  }

  return data;
}

/**
 * Get recent scrape jobs for a user.
 *
 * @param {string} userId - User ID
 * @param {number} limit - Max jobs to return
 * @returns {Promise<Array>} Array of job records
 */
async function getUserScrapeJobs(userId, limit = 10) {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch scrape jobs: ${error.message}`);
  }

  return data || [];
}

/**
 * Update a scrape job.
 *
 * @param {string} jobId - Job ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated job record
 */
async function updateScrapeJob(jobId, updates) {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('scrape_jobs')
    .update(updates)
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update scrape job: ${error.message}`);
  }

  return data;
}

// ============================================================================
// SCRAPE JOB PROCESSING
// ============================================================================

/**
 * Process a scrape job (async, runs in background).
 *
 * @param {string} jobId - Job ID to process
 */
async function processScrapeJob(jobId) {
  const supabase = getServiceClient();

  // Get the job
  const { data: job, error } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error || !job) {
    logger.error('Scrape job not found', { jobId });
    return;
  }

  const logContext = { jobId, userId: job.user_id, type: job.job_type };

  try {
    // Update status to processing
    await updateScrapeJob(jobId, {
      status: 'processing',
      started_at: new Date().toISOString(),
    });

    logger.info('Processing scrape job', logContext);

    let rawContent = {};
    let extractedData = {};

    switch (job.job_type) {
      case 'website':
        rawContent = await scrapeWebsite(job.target_url);
        extractedData = await analyzeWebsiteContent(rawContent);
        break;

      case 'podcast_rss':
        rawContent = await fetchPodcastRss(job.target_url);
        extractedData = await analyzePodcastContent(rawContent);
        break;

      case 'bio_text':
        rawContent = { text: job.input_text };
        extractedData = await analyzeBioText(job.input_text);
        break;

      default:
        throw new Error(`Unknown job type: ${job.job_type}`);
    }

    // Update job with results
    await updateScrapeJob(jobId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      raw_content: rawContent,
      extracted_data: extractedData,
    });

    logger.info('Scrape job completed', { ...logContext, fieldsExtracted: Object.keys(extractedData) });
  } catch (err) {
    logger.error('Scrape job failed', { ...logContext, error: err.message });

    await updateScrapeJob(jobId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: err.message,
      error_code: categorizeError(err),
    });
  }
}

// ============================================================================
// WEBSITE SCRAPING
// ============================================================================

/**
 * Scrape a website (homepage + about + services pages).
 *
 * @param {string} url - Website URL
 * @returns {Promise<Object>} Scraped content by page
 */
async function scrapeWebsite(url) {
  const results = {
    homepage: null,
    about: null,
    services: null,
  };

  // Normalize URL
  const baseUrl = normalizeUrl(url);

  // Scrape homepage
  results.homepage = await scrapePage(baseUrl);

  // Try to find and scrape about page
  const aboutUrl = await findPage(baseUrl, SCRAPER_CONFIG.aboutPagePatterns);
  if (aboutUrl) {
    results.about = await scrapePage(aboutUrl);
  }

  // Try to find and scrape services page
  const servicesUrl = await findPage(baseUrl, SCRAPER_CONFIG.servicesPagePatterns);
  if (servicesUrl) {
    results.services = await scrapePage(servicesUrl);
  }

  return results;
}

/**
 * Scrape a single page.
 *
 * @param {string} url - Page URL
 * @returns {Promise<Object>} Page content
 */
async function scrapePage(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SCRAPER_CONFIG.timeout);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': SCRAPER_CONFIG.userAgent },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove unwanted elements
    for (const selector of SCRAPER_CONFIG.removeSelectors) {
      $(selector).remove();
    }

    // Find main content
    let content = '';
    for (const selector of SCRAPER_CONFIG.contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }

    // Fallback to body if no main content found
    if (!content) {
      content = $('body').text();
    }

    // Clean up text
    content = cleanText(content);

    return {
      url,
      title: $('title').text().trim(),
      content,
      wordCount: content.split(/\s+/).length,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw err;
  }
}

/**
 * Find a page by trying common URL patterns.
 *
 * @param {string} baseUrl - Base website URL
 * @param {Array<string>} patterns - URL patterns to try
 * @returns {Promise<string|null>} Found URL or null
 */
async function findPage(baseUrl, patterns) {
  const base = new URL(baseUrl);

  for (const pattern of patterns) {
    const testUrl = new URL(pattern, base).href;
    try {
      const response = await fetch(testUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': SCRAPER_CONFIG.userAgent },
        redirect: 'follow',
      });

      if (response.ok) {
        return testUrl;
      }
    } catch {
      // Continue to next pattern
    }
  }

  return null;
}

// ============================================================================
// PODCAST RSS HANDLING
// ============================================================================

/**
 * Fetch and parse a podcast RSS feed.
 *
 * @param {string} rssUrl - RSS feed URL
 * @returns {Promise<Object>} Podcast info
 */
async function fetchPodcastRss(rssUrl) {
  const response = await fetch(rssUrl, {
    headers: { 'User-Agent': SCRAPER_CONFIG.userAgent },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  // Extract podcast info from RSS
  const channel = $('channel');

  return {
    title: channel.find('> title').first().text(),
    description: channel.find('> description').first().text(),
    author: channel.find('itunes\\:author').first().text() || channel.find('> author').first().text(),
    link: channel.find('> link').first().text(),
    image: channel.find('itunes\\:image').attr('href') || channel.find('image > url').first().text(),
    categories: channel.find('itunes\\:category').map((_, el) => $(el).attr('text')).get(),
    episodeCount: channel.find('item').length,
    latestEpisode: channel.find('item').first().find('title').text(),
  };
}

// ============================================================================
// AI CONTENT ANALYSIS
// ============================================================================

/**
 * Analyze scraped website content with AI.
 *
 * @param {Object} rawContent - Scraped content
 * @returns {Promise<Object>} Extracted profile data
 */
async function analyzeWebsiteContent(rawContent) {
  // Combine all content
  const combinedContent = [
    rawContent.homepage?.content,
    rawContent.about?.content,
    rawContent.services?.content,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');

  if (!combinedContent || combinedContent.length < 100) {
    return { error: 'Insufficient content scraped' };
  }

  // Truncate if too long
  const truncatedContent = combinedContent.slice(0, 15000);

  return await analyzeContentWithAI(truncatedContent, 'website');
}

/**
 * Analyze podcast RSS content with AI.
 *
 * @param {Object} rawContent - Podcast info from RSS
 * @returns {Promise<Object>} Extracted profile data
 */
async function analyzePodcastContent(rawContent) {
  const content = `
Podcast Title: ${rawContent.title}
Description: ${rawContent.description}
Author: ${rawContent.author}
Categories: ${rawContent.categories?.join(', ')}
Episode Count: ${rawContent.episodeCount}
Latest Episode: ${rawContent.latestEpisode}
  `.trim();

  return await analyzeContentWithAI(content, 'podcast');
}

/**
 * Analyze pasted bio text with AI.
 *
 * @param {string} text - Bio text
 * @returns {Promise<Object>} Extracted profile data
 */
async function analyzeBioText(text) {
  return await analyzeContentWithAI(text, 'bio');
}

/**
 * Run AI analysis on content.
 *
 * @param {string} content - Content to analyze
 * @param {string} sourceType - Type of content (website, podcast, bio)
 * @returns {Promise<Object>} Extracted data with confidence scores
 */
async function analyzeContentWithAI(content, sourceType) {
  const prompt = buildAnalysisPrompt(content, sourceType);

  try {
    const response = await callClaude(prompt, {
      model: 'claude-3-5-haiku-20241022',
      maxTokens: 2000,
    });

    // Parse the JSON response (callClaude returns { content: string })
    const responseText = response.content;

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      [null, responseText];
    const jsonStr = jsonMatch[1].trim();

    try {
      return JSON.parse(jsonStr);
    } catch {
      logger.warn('Failed to parse AI response as JSON', { responseText: responseText.substring(0, 500) });
      // Return partial data
      return {
        parseError: true,
        rawResponse: responseText.substring(0, 1000),
      };
    }
  } catch (err) {
    logger.error('AI analysis failed', { error: err.message });
    throw new Error(`AI analysis failed: ${err.message}`);
  }
}

/**
 * Build the analysis prompt for AI.
 *
 * @param {string} content - Content to analyze
 * @param {string} sourceType - Type of content
 * @returns {string} Prompt text
 */
function buildAnalysisPrompt(content, sourceType) {
  return `You are analyzing ${sourceType} content for a therapist or coach to extract profile information.

## Content to Analyze

${content}

## Instructions

Extract profile information from this content. For each field, provide:
- value: The extracted value (or null if not found)
- confidence: A score from 0.0 to 1.0 indicating your confidence

Return ONLY valid JSON in this exact structure:

\`\`\`json
{
  "name": { "value": "Full name if found", "confidence": 0.9 },
  "credentials": { "value": "Degrees and certifications (PhD, LMFT, etc.)", "confidence": 0.8 },
  "business_name": { "value": "Practice or business name", "confidence": 0.7 },
  "location": { "value": "City, State or region", "confidence": 0.6 },
  "bio_excerpt": { "value": "2-3 sentence bio summary", "confidence": 0.8 },
  "podcast_name": { "value": "Podcast name if mentioned", "confidence": 0.7 },
  "newsletter_name": { "value": "Newsletter name if mentioned", "confidence": 0.6 },
  "primary_revenue": { "value": "Main service type (1:1 therapy, coaching, courses, etc.)", "confidence": 0.7 },
  "client_types": { "value": ["Client type 1", "Client type 2"], "confidence": 0.7 },
  "client_problems": { "value": ["Problem 1", "Problem 2"], "confidence": 0.7 },
  "differentiator": { "value": "What makes them unique", "confidence": 0.6 },
  "modalities": { "value": ["CBT", "EMDR", "etc."], "confidence": 0.8 },
  "specialties": { "value": ["Anxiety", "Trauma", "etc."], "confidence": 0.8 },
  "tone_signals": {
    "clinical_relatable": { "value": 65, "confidence": 0.7 },
    "formal_casual": { "value": 40, "confidence": 0.6 }
  }
}
\`\`\`

Notes:
- Only include fields where you have reasonable confidence
- Set confidence honestly (0.5 = uncertain, 0.8+ = confident)
- For tone_signals: 0 = strongly first trait, 100 = strongly second trait, 50 = balanced
- clinical_relatable: 0 = very clinical/academic, 100 = very relatable/personal
- formal_casual: 0 = very formal, 100 = very casual
- Extract verbatim phrases when possible
- If a field is not found or unclear, set value to null`;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalize a URL (add https if missing, etc.).
 *
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
}

/**
 * Clean extracted text.
 *
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
    .trim()
    .slice(0, 50000); // Max 50k chars per page
}

/**
 * Categorize an error for reporting.
 *
 * @param {Error} error - The error
 * @returns {string} Error category
 */
function categorizeError(error) {
  const message = error.message?.toLowerCase() || '';

  if (message.includes('timeout') || message.includes('abort')) {
    return 'TIMEOUT';
  }
  if (message.includes('403') || message.includes('forbidden')) {
    return 'BLOCKED';
  }
  if (message.includes('404') || message.includes('not found')) {
    return 'NOT_FOUND';
  }
  if (message.includes('5') && message.includes('http')) {
    return 'SERVER_ERROR';
  }
  if (message.includes('enotfound') || message.includes('network')) {
    return 'NETWORK_ERROR';
  }
  if (message.includes('parse') || message.includes('json')) {
    return 'PARSE_ERROR';
  }

  return 'UNKNOWN';
}

export {
  createScrapeJob,
  getScrapeJob,
  getUserScrapeJobs,
  updateScrapeJob,
  processScrapeJob,
  scrapeWebsite,
  scrapePage,
  analyzeWebsiteContent,
  analyzeBioText,
};
