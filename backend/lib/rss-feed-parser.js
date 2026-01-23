/**
 * ============================================================================
 * RSS FEED PARSER SERVICE
 * ============================================================================
 * Parses podcast RSS feeds to extract show metadata and episode information.
 * Uses rss-parser for flexibility with various RSS formats.
 *
 * Features:
 * - Parse RSS feed from URL
 * - Extract show metadata (title, description, artwork, etc.)
 * - Extract episode list with audio URLs and metadata
 * - Handle various RSS formats and iTunes extensions
 * ============================================================================
 */

import Parser from 'rss-parser';
import logger from './logger.js';

// ============================================================================
// PARSER CONFIGURATION
// ============================================================================

/**
 * Custom fields to extract from RSS feeds.
 * These handle iTunes namespace and other podcast-specific fields.
 */
const customFields = {
  feed: [
    ['itunes:author', 'itunesAuthor'],
    ['itunes:image', 'itunesImage', { keepArray: false }],
    ['itunes:category', 'itunesCategories', { keepArray: true }],
    ['itunes:explicit', 'itunesExplicit'],
    ['itunes:summary', 'itunesSummary'],
    ['language', 'language'],
  ],
  item: [
    ['itunes:duration', 'itunesDuration'],
    ['itunes:episode', 'itunesEpisode'],
    ['itunes:season', 'itunesSeason'],
    ['itunes:image', 'itunesImage', { keepArray: false }],
    ['itunes:explicit', 'itunesExplicit'],
    ['itunes:summary', 'itunesSummary'],
  ],
};

/**
 * Create configured parser instance.
 */
function createParser() {
  return new Parser({
    customFields,
    timeout: 30000, // 30 second timeout
    headers: {
      'User-Agent': 'PodcastContentPipeline/1.0 (RSS Feed Parser)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    },
  });
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Parses a podcast RSS feed from URL.
 *
 * @param {string} feedUrl - URL of the RSS feed
 * @returns {Promise<Object>} Parsed feed with metadata and episodes
 *
 * @example
 * const feed = await parsePodcastFeed('https://example.com/feed.xml');
 * // Returns: {
 * //   meta: { title, description, author, artworkUrl, ... },
 * //   episodes: [{ guid, title, audioUrl, duration, publishedAt, ... }, ...]
 * // }
 */
export async function parsePodcastFeed(feedUrl) {
  if (!feedUrl) {
    throw new Error('Feed URL is required');
  }

  // Validate URL format
  try {
    new URL(feedUrl);
  } catch {
    throw new Error('Invalid feed URL format');
  }

  logger.info('Parsing podcast RSS feed', { feedUrl });
  const startTime = Date.now();

  try {
    const parser = createParser();
    const feed = await parser.parseURL(feedUrl);

    const durationMs = Date.now() - startTime;
    const episodeCount = feed.items?.length || 0;

    logger.info('RSS feed parsed successfully', {
      feedUrl,
      title: feed.title,
      episodeCount,
      durationMs,
    });

    // Extract and normalize metadata
    const meta = extractFeedMeta(feed);
    const episodes = extractEpisodes(feed.items || []);

    return {
      meta,
      episodes,
      raw: {
        title: feed.title,
        lastBuildDate: feed.lastBuildDate,
        pubDate: feed.pubDate,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error('Failed to parse RSS feed', {
      feedUrl,
      error: error.message,
      durationMs,
    });

    // Provide more helpful error messages
    if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      throw new Error('Could not reach the feed URL. Please check the URL is correct.');
    }
    if (error.message.includes('404')) {
      throw new Error('Feed not found. Please check the URL is correct.');
    }
    if (error.message.includes('Invalid XML') || error.message.includes('parse')) {
      throw new Error('The URL does not contain a valid RSS feed.');
    }
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      throw new Error('Feed request timed out. Please try again.');
    }

    throw new Error(`Failed to parse feed: ${error.message}`);
  }
}

/**
 * Parses RSS feed from XML string.
 *
 * @param {string} xmlString - XML content of the RSS feed
 * @returns {Promise<Object>} Parsed feed with metadata and episodes
 */
export async function parsePodcastFeedXml(xmlString) {
  if (!xmlString) {
    throw new Error('XML string is required');
  }

  logger.debug('Parsing RSS feed from XML string', {
    xmlLength: xmlString.length,
  });

  try {
    const parser = createParser();
    const feed = await parser.parseString(xmlString);

    const meta = extractFeedMeta(feed);
    const episodes = extractEpisodes(feed.items || []);

    logger.info('RSS feed XML parsed successfully', {
      title: meta.title,
      episodeCount: episodes.length,
    });

    return {
      meta,
      episodes,
    };
  } catch (error) {
    logger.error('Failed to parse RSS XML', {
      error: error.message,
    });
    throw new Error(`Failed to parse RSS XML: ${error.message}`);
  }
}

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

/**
 * Extracts normalized metadata from parsed feed.
 *
 * @param {Object} feed - Parsed feed object
 * @returns {Object} Normalized metadata
 */
function extractFeedMeta(feed) {
  // Get artwork URL from various possible fields
  const artworkUrl =
    getItunesImageUrl(feed.itunesImage) ||
    feed.image?.url ||
    feed.image?.link ||
    null;

  // Get author from various possible fields
  const author =
    feed.itunesAuthor ||
    feed.author ||
    feed.creator ||
    feed.managingEditor ||
    null;

  // Get description, preferring iTunes summary
  const description =
    feed.itunesSummary ||
    feed.description ||
    null;

  // Extract categories from iTunes categories
  const categories = extractCategories(feed.itunesCategories);

  return {
    title: feed.title || 'Untitled Podcast',
    description: cleanHtml(description),
    author,
    artworkUrl,
    websiteUrl: feed.link || null,
    language: feed.language || 'en',
    categories,
    explicit: feed.itunesExplicit === 'yes' || feed.itunesExplicit === 'true',
    feedUrl: feed.feedUrl || null,
  };
}

/**
 * Extracts and normalizes episodes from parsed feed items.
 *
 * @param {Array} items - Feed items array
 * @returns {Array} Normalized episode objects
 */
function extractEpisodes(items) {
  return items.map((item, index) => {
    // Get audio URL from enclosure
    const audioUrl = item.enclosure?.url || null;
    const audioType = item.enclosure?.type || 'audio/mpeg';
    const audioLength = item.enclosure?.length ? parseInt(item.enclosure.length, 10) : null;

    // Get artwork URL (episode-specific or fallback to show artwork)
    const artworkUrl = getItunesImageUrl(item.itunesImage) || null;

    // Parse duration from iTunes duration field
    const durationSeconds = parseDuration(item.itunesDuration);

    // Get published date
    const publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : null;

    // Get episode/season numbers
    const episodeNumber = item.itunesEpisode || null;
    const seasonNumber = item.itunesSeason || null;

    // Generate guid (use item guid, or fallback to audio URL or index)
    const guid = item.guid || item.id || audioUrl || `episode-${index}`;

    return {
      guid,
      title: item.title || 'Untitled Episode',
      description: cleanHtml(item.itunesSummary || item.contentSnippet || item.content || ''),
      audioUrl,
      audioType,
      audioLength,
      durationSeconds,
      publishedAt,
      artworkUrl,
      episodeNumber,
      seasonNumber,
      explicit: item.itunesExplicit === 'yes' || item.itunesExplicit === 'true',
      link: item.link || null,
    };
  }).filter(ep => ep.audioUrl); // Only return episodes with audio
}

/**
 * Extracts image URL from iTunes image field.
 * Handles both string and object formats.
 *
 * @param {string|Object} itunesImage - iTunes image field
 * @returns {string|null} Image URL or null
 */
function getItunesImageUrl(itunesImage) {
  if (!itunesImage) return null;

  if (typeof itunesImage === 'string') {
    return itunesImage;
  }

  // Handle object format: { $: { href: 'url' } } or { href: 'url' }
  if (typeof itunesImage === 'object') {
    return itunesImage.href || itunesImage.$?.href || null;
  }

  return null;
}

/**
 * Extracts categories from iTunes categories array.
 *
 * @param {Array|undefined} itunesCategories - iTunes categories
 * @returns {Array<string>} Category names
 */
function extractCategories(itunesCategories) {
  if (!itunesCategories || !Array.isArray(itunesCategories)) {
    return [];
  }

  const categories = [];

  for (const cat of itunesCategories) {
    if (typeof cat === 'string') {
      categories.push(cat);
    } else if (typeof cat === 'object') {
      // Handle object format: { $: { text: 'Category' } }
      const text = cat.$?.text || cat.text || cat._;
      if (text) categories.push(text);

      // Also get subcategories if present
      if (cat['itunes:category']) {
        const subCats = Array.isArray(cat['itunes:category'])
          ? cat['itunes:category']
          : [cat['itunes:category']];
        for (const sub of subCats) {
          const subText = sub?.$?.text || sub?.text;
          if (subText) categories.push(subText);
        }
      }
    }
  }

  // Remove duplicates
  return [...new Set(categories)];
}

/**
 * Parses iTunes duration string into seconds.
 * Handles formats: "HH:MM:SS", "MM:SS", "SS", or just seconds as number.
 *
 * @param {string|number} duration - Duration value
 * @returns {number|null} Duration in seconds or null
 */
function parseDuration(duration) {
  if (!duration) return null;

  // If already a number, return as-is
  if (typeof duration === 'number') {
    return duration;
  }

  // Parse string format
  const str = String(duration).trim();

  // Try parsing as simple number (seconds)
  const asNumber = parseInt(str, 10);
  if (!isNaN(asNumber) && !str.includes(':')) {
    return asNumber;
  }

  // Parse HH:MM:SS or MM:SS format
  const parts = str.split(':').map(p => parseInt(p, 10));

  if (parts.some(isNaN)) {
    return null;
  }

  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    // SS
    return parts[0];
  }

  return null;
}

/**
 * Cleans HTML tags from text content.
 *
 * @param {string|null} html - HTML string
 * @returns {string} Plain text
 */
function cleanHtml(html) {
  if (!html) return '';

  return html
    .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
    .replace(/&nbsp;/g, ' ')   // Replace nbsp
    .replace(/&amp;/g, '&')    // Replace amp
    .replace(/&lt;/g, '<')     // Replace lt
    .replace(/&gt;/g, '>')     // Replace gt
    .replace(/&quot;/g, '"')   // Replace quot
    .replace(/&#39;/g, "'")    // Replace apos
    .replace(/\s+/g, ' ')      // Collapse whitespace
    .trim();
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates if a URL looks like an RSS feed URL.
 * Does basic checks without actually fetching the URL.
 *
 * @param {string} url - URL to validate
 * @returns {Object} Validation result
 */
export function validateFeedUrl(url) {
  if (!url) {
    return { valid: false, error: 'URL is required' };
  }

  try {
    const parsed = new URL(url);

    // Must be http or https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL must use http or https protocol' };
    }

    // Check for common non-feed URLs
    const pathname = parsed.pathname.toLowerCase();
    const blockedExtensions = ['.html', '.htm', '.php', '.asp', '.aspx', '.jpg', '.png', '.gif'];
    if (blockedExtensions.some(ext => pathname.endsWith(ext))) {
      return { valid: false, error: 'URL appears to be a webpage, not an RSS feed' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  parsePodcastFeed,
  parsePodcastFeedXml,
  validateFeedUrl,
};
