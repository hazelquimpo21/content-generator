/**
 * ============================================================================
 * PODCASTINDEX API CLIENT
 * ============================================================================
 * Client for the PodcastIndex.org API - a free, open podcast database.
 * Used for searching podcasts by name and looking up RSS feed URLs.
 *
 * API Documentation: https://podcastindex-org.github.io/docs-api/
 * Get free API credentials: https://api.podcastindex.org
 *
 * Features:
 * - Search podcasts by title
 * - Look up podcast by feed URL
 * - Get podcast metadata and episode count
 * ============================================================================
 */

import crypto from 'crypto';
import logger from './logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PODCASTINDEX_API_KEY = process.env.PODCASTINDEX_API_KEY;
const PODCASTINDEX_API_SECRET = process.env.PODCASTINDEX_API_SECRET;
const PODCASTINDEX_BASE_URL = 'https://api.podcastindex.org/api/1.0';

// User agent required by PodcastIndex API
const USER_AGENT = 'PodcastContentPipeline/1.0';

// ============================================================================
// AVAILABILITY CHECK
// ============================================================================

/**
 * Checks if PodcastIndex API is configured and available.
 * @returns {boolean} True if API credentials are set
 */
export function isPodcastIndexAvailable() {
  return !!(PODCASTINDEX_API_KEY && PODCASTINDEX_API_SECRET);
}

/**
 * Gets the configuration status for the API.
 * @returns {Object} Configuration status
 */
export function getPodcastIndexStatus() {
  return {
    available: isPodcastIndexAvailable(),
    hasApiKey: !!PODCASTINDEX_API_KEY,
    hasApiSecret: !!PODCASTINDEX_API_SECRET,
  };
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Generates authentication headers for PodcastIndex API requests.
 * PodcastIndex uses a SHA-1 hash of (key + secret + timestamp) for auth.
 *
 * @returns {Object} Headers object for fetch requests
 */
function getAuthHeaders() {
  if (!isPodcastIndexAvailable()) {
    throw new Error('PodcastIndex API credentials not configured. Set PODCASTINDEX_API_KEY and PODCASTINDEX_API_SECRET.');
  }

  // Unix timestamp (seconds)
  const authDate = Math.floor(Date.now() / 1000);

  // SHA-1 hash of key + secret + timestamp
  const authHeader = crypto
    .createHash('sha1')
    .update(PODCASTINDEX_API_KEY + PODCASTINDEX_API_SECRET + authDate)
    .digest('hex');

  return {
    'X-Auth-Key': PODCASTINDEX_API_KEY,
    'X-Auth-Date': authDate.toString(),
    'Authorization': authHeader,
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
  };
}

// ============================================================================
// API METHODS
// ============================================================================

/**
 * Makes a request to the PodcastIndex API.
 *
 * @param {string} endpoint - API endpoint (e.g., '/search/byterm')
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} API response data
 */
async function apiRequest(endpoint, params = {}) {
  const url = new URL(`${PODCASTINDEX_BASE_URL}${endpoint}`);

  // Add query parameters
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  }

  logger.debug('PodcastIndex API request', {
    endpoint,
    params,
  });

  const startTime = Date.now();

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('PodcastIndex API error', {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        durationMs,
      });
      throw new Error(`PodcastIndex API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    logger.debug('PodcastIndex API response', {
      endpoint,
      status: data.status,
      count: data.count,
      durationMs,
    });

    return data;
  } catch (error) {
    logger.error('PodcastIndex API request failed', {
      endpoint,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Searches for podcasts by title/term.
 *
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number} [options.limit=10] - Maximum results to return
 * @returns {Promise<Array>} Array of podcast results
 *
 * @example
 * const results = await searchPodcasts('The Daily');
 * // Returns: [{ id, title, feedUrl, description, author, artwork, ... }, ...]
 */
export async function searchPodcasts(query, options = {}) {
  const { limit = 10 } = options;

  if (!query || query.trim().length < 2) {
    throw new Error('Search query must be at least 2 characters');
  }

  logger.info('Searching podcasts', { query, limit });

  const response = await apiRequest('/search/byterm', {
    q: query,
    max: limit,
  });

  if (!response.feeds || !Array.isArray(response.feeds)) {
    return [];
  }

  // Transform to simplified format
  const results = response.feeds.map(feed => ({
    id: feed.id,
    podcastIndexId: feed.id,
    title: feed.title,
    feedUrl: feed.url,
    description: feed.description,
    author: feed.author,
    artworkUrl: feed.artwork || feed.image,
    websiteUrl: feed.link,
    language: feed.language,
    categories: extractCategories(feed),
    episodeCount: feed.episodeCount,
    lastUpdateTime: feed.lastUpdateTime,
    explicit: feed.explicit === 1,
  }));

  logger.info('Podcast search completed', {
    query,
    resultCount: results.length,
  });

  return results;
}

/**
 * Looks up a podcast by its RSS feed URL.
 *
 * @param {string} feedUrl - RSS feed URL
 * @returns {Promise<Object|null>} Podcast metadata or null if not found
 *
 * @example
 * const podcast = await getPodcastByFeedUrl('https://example.com/feed.xml');
 */
export async function getPodcastByFeedUrl(feedUrl) {
  if (!feedUrl) {
    throw new Error('Feed URL is required');
  }

  logger.info('Looking up podcast by feed URL', { feedUrl });

  try {
    const response = await apiRequest('/podcasts/byfeedurl', {
      url: feedUrl,
    });

    if (!response.feed || response.status === 'false') {
      logger.info('Podcast not found in PodcastIndex', { feedUrl });
      return null;
    }

    const feed = response.feed;

    return {
      id: feed.id,
      podcastIndexId: feed.id,
      title: feed.title,
      feedUrl: feed.url,
      description: feed.description,
      author: feed.author,
      artworkUrl: feed.artwork || feed.image,
      websiteUrl: feed.link,
      language: feed.language,
      categories: extractCategories(feed),
      episodeCount: feed.episodeCount,
      lastUpdateTime: feed.lastUpdateTime,
      explicit: feed.explicit === 1,
    };
  } catch (error) {
    // If API returns error, the feed might not be in PodcastIndex
    if (error.message.includes('404') || error.message.includes('not found')) {
      logger.info('Podcast not found in PodcastIndex', { feedUrl });
      return null;
    }
    throw error;
  }
}

/**
 * Looks up a podcast by its PodcastIndex ID.
 *
 * @param {string|number} podcastId - PodcastIndex podcast ID
 * @returns {Promise<Object|null>} Podcast metadata or null if not found
 */
export async function getPodcastById(podcastId) {
  if (!podcastId) {
    throw new Error('Podcast ID is required');
  }

  logger.info('Looking up podcast by ID', { podcastId });

  try {
    const response = await apiRequest('/podcasts/byfeedid', {
      id: podcastId,
    });

    if (!response.feed || response.status === 'false') {
      return null;
    }

    const feed = response.feed;

    return {
      id: feed.id,
      podcastIndexId: feed.id,
      title: feed.title,
      feedUrl: feed.url,
      description: feed.description,
      author: feed.author,
      artworkUrl: feed.artwork || feed.image,
      websiteUrl: feed.link,
      language: feed.language,
      categories: extractCategories(feed),
      episodeCount: feed.episodeCount,
      lastUpdateTime: feed.lastUpdateTime,
      explicit: feed.explicit === 1,
    };
  } catch (error) {
    if (error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

/**
 * Gets episodes for a podcast by feed ID.
 *
 * @param {string|number} feedId - PodcastIndex feed ID
 * @param {Object} options - Options
 * @param {number} [options.limit=100] - Maximum episodes to return
 * @returns {Promise<Array>} Array of episode metadata
 */
export async function getEpisodesByFeedId(feedId, options = {}) {
  const { limit = 100 } = options;

  if (!feedId) {
    throw new Error('Feed ID is required');
  }

  logger.info('Getting episodes by feed ID', { feedId, limit });

  const response = await apiRequest('/episodes/byfeedid', {
    id: feedId,
    max: limit,
  });

  if (!response.items || !Array.isArray(response.items)) {
    return [];
  }

  return response.items.map(item => ({
    id: item.id,
    guid: item.guid,
    title: item.title,
    description: item.description,
    audioUrl: item.enclosureUrl,
    audioType: item.enclosureType,
    audioLength: item.enclosureLength,
    duration: item.duration,
    publishedAt: item.datePublished ? new Date(item.datePublished * 1000).toISOString() : null,
    artworkUrl: item.image || item.feedImage,
    episodeNumber: item.episode,
    seasonNumber: item.season,
    explicit: item.explicit === 1,
  }));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extracts categories from a PodcastIndex feed response.
 * Categories can be in various formats depending on the feed.
 *
 * @param {Object} feed - Feed object from API response
 * @returns {Array<string>} Array of category names
 */
function extractCategories(feed) {
  const categories = [];

  // Check numbered category fields (category1, category2, etc.)
  for (let i = 1; i <= 10; i++) {
    const cat = feed[`category${i}`];
    if (cat && typeof cat === 'string') {
      categories.push(cat);
    }
  }

  // Also check categories object if present
  if (feed.categories && typeof feed.categories === 'object') {
    for (const key of Object.keys(feed.categories)) {
      const cat = feed.categories[key];
      if (cat && typeof cat === 'string' && !categories.includes(cat)) {
        categories.push(cat);
      }
    }
  }

  return categories;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  isPodcastIndexAvailable,
  getPodcastIndexStatus,
  searchPodcasts,
  getPodcastByFeedUrl,
  getPodcastById,
  getEpisodesByFeedId,
};
