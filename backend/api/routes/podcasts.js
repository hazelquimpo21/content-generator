/**
 * ============================================================================
 * PODCAST RSS FEED ROUTES
 * ============================================================================
 * API endpoints for managing podcast RSS feeds, searching for podcasts,
 * importing episode history, and transcribing episodes from feeds.
 *
 * Routes:
 * POST   /api/podcasts/search              - Search for podcasts by name
 * POST   /api/podcasts/lookup              - Look up podcast by RSS URL
 * GET    /api/podcasts/feeds               - List user's connected feeds
 * POST   /api/podcasts/feeds               - Connect a new podcast feed
 * GET    /api/podcasts/feeds/:id           - Get feed with episodes
 * POST   /api/podcasts/feeds/:id/sync      - Sync feed (fetch new episodes)
 * DELETE /api/podcasts/feeds/:id           - Disconnect a feed
 * POST   /api/podcasts/episodes/:id/transcribe - Transcribe a feed episode
 * GET    /api/podcasts/status              - Check API availability
 *
 * Authorization:
 * - All routes require authentication
 * ============================================================================
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../middleware/auth-middleware.js';
import { ValidationError, DatabaseError, NotFoundError } from '../../lib/errors.js';
import logger from '../../lib/logger.js';
import {
  isPodcastIndexAvailable,
  getPodcastIndexStatus,
  searchPodcasts,
  getPodcastByFeedUrl,
} from '../../lib/podcastindex-client.js';
import {
  parsePodcastFeed,
  validateFeedUrl,
} from '../../lib/rss-feed-parser.js';
import { transcribeAudioWithChunking } from '../../lib/audio-transcription.js';

const router = Router();

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

// ============================================================================
// ROUTES: SEARCH & LOOKUP
// ============================================================================

/**
 * GET /api/podcasts/status
 * Check API availability and configuration status.
 */
router.get('/status', requireAuth, (req, res) => {
  res.json({
    success: true,
    podcastIndex: getPodcastIndexStatus(),
    features: {
      search: isPodcastIndexAvailable(),
      directFeedParsing: true,
    },
  });
});

/**
 * POST /api/podcasts/search
 * Search for podcasts by name using PodcastIndex API.
 *
 * Request Body:
 *   { query: "podcast name", limit?: 10 }
 *
 * Response:
 *   { results: [{ title, feedUrl, author, artworkUrl, ... }] }
 */
router.post('/search', requireAuth, async (req, res, next) => {
  try {
    const { query, limit = 10 } = req.body;

    if (!query || query.trim().length < 2) {
      throw new ValidationError('query', 'Search query must be at least 2 characters');
    }

    // Check if PodcastIndex is available
    if (!isPodcastIndexAvailable()) {
      throw new ValidationError(
        'configuration',
        'Podcast search is not available. PodcastIndex API credentials not configured.'
      );
    }

    logger.info('Podcast search requested', {
      userId: req.user.id,
      query,
      limit,
    });

    const results = await searchPodcasts(query, { limit });

    logger.info('Podcast search completed', {
      userId: req.user.id,
      query,
      resultCount: results.length,
    });

    res.json({
      success: true,
      results,
      query,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/podcasts/lookup
 * Look up podcast metadata by RSS feed URL.
 * First tries PodcastIndex, then falls back to direct parsing.
 *
 * Request Body:
 *   { url: "https://feed.example.com/rss" }
 *
 * Response:
 *   { podcast: { title, feedUrl, author, ... }, source: "podcastindex" | "direct" }
 */
router.post('/lookup', requireAuth, async (req, res, next) => {
  try {
    const { url } = req.body;

    if (!url) {
      throw new ValidationError('url', 'Feed URL is required');
    }

    // Validate URL format
    const validation = validateFeedUrl(url);
    if (!validation.valid) {
      throw new ValidationError('url', validation.error);
    }

    logger.info('Podcast lookup requested', {
      userId: req.user.id,
      url,
    });

    let podcast = null;
    let source = 'direct';

    // Try PodcastIndex first (faster, has additional metadata)
    if (isPodcastIndexAvailable()) {
      try {
        podcast = await getPodcastByFeedUrl(url);
        if (podcast) {
          source = 'podcastindex';
          logger.info('Podcast found in PodcastIndex', {
            userId: req.user.id,
            title: podcast.title,
          });
        }
      } catch (error) {
        logger.warn('PodcastIndex lookup failed, falling back to direct parsing', {
          userId: req.user.id,
          error: error.message,
        });
      }
    }

    // Fall back to direct RSS parsing
    if (!podcast) {
      const feed = await parsePodcastFeed(url);
      podcast = {
        ...feed.meta,
        feedUrl: url,
        episodeCount: feed.episodes.length,
      };
      source = 'direct';
      logger.info('Podcast parsed directly from RSS', {
        userId: req.user.id,
        title: podcast.title,
        episodeCount: podcast.episodeCount,
      });
    }

    res.json({
      success: true,
      podcast,
      source,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ROUTES: FEED MANAGEMENT
// ============================================================================

/**
 * GET /api/podcasts/feeds
 * List all connected podcast feeds for the current user.
 */
router.get('/feeds', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabase();

    logger.debug('Listing podcast feeds', { userId: req.user.id });

    const { data: feeds, error } = await supabase
      .from('podcast_feeds')
      .select(`
        *,
        feed_episodes(count)
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list podcast feeds', {
        userId: req.user.id,
        error: error.message,
      });
      throw new DatabaseError('select', 'Failed to list podcast feeds');
    }

    // Get processed counts for each feed
    const feedsWithCounts = await Promise.all((feeds || []).map(async (feed) => {
      const { count: processedCount } = await supabase
        .from('feed_episodes')
        .select('*', { count: 'exact', head: true })
        .eq('feed_id', feed.id)
        .eq('status', 'processed');

      return {
        ...feed,
        totalEpisodes: feed.feed_episodes?.[0]?.count || 0,
        processedEpisodes: processedCount || 0,
      };
    }));

    res.json({
      success: true,
      feeds: feedsWithCounts,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/podcasts/feeds
 * Connect a new podcast feed.
 *
 * Request Body:
 *   { feedUrl: "https://...", podcastIndexId?: "123" }
 */
router.post('/feeds', requireAuth, async (req, res, next) => {
  try {
    const { feedUrl, podcastIndexId } = req.body;

    if (!feedUrl) {
      throw new ValidationError('feedUrl', 'Feed URL is required');
    }

    // Validate URL format
    const validation = validateFeedUrl(feedUrl);
    if (!validation.valid) {
      throw new ValidationError('feedUrl', validation.error);
    }

    logger.info('Connecting podcast feed', {
      userId: req.user.id,
      feedUrl,
    });

    // Parse the feed to get metadata and episodes
    const feed = await parsePodcastFeed(feedUrl);

    const supabase = getSupabase();

    // Check if feed already connected
    const { data: existing } = await supabase
      .from('podcast_feeds')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('feed_url', feedUrl)
      .single();

    if (existing) {
      throw new ValidationError('feedUrl', 'This podcast feed is already connected');
    }

    // Create the feed record
    const { data: podcastFeed, error: feedError } = await supabase
      .from('podcast_feeds')
      .insert({
        user_id: req.user.id,
        feed_url: feedUrl,
        podcastindex_id: podcastIndexId || null,
        title: feed.meta.title,
        description: feed.meta.description,
        author: feed.meta.author,
        artwork_url: feed.meta.artworkUrl,
        website_url: feed.meta.websiteUrl,
        language: feed.meta.language,
        categories: feed.meta.categories || [],
        episode_count: feed.episodes.length,
        last_synced_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (feedError) {
      logger.error('Failed to create podcast feed', {
        userId: req.user.id,
        error: feedError.message,
      });
      throw new DatabaseError('insert', 'Failed to connect podcast feed');
    }

    // Insert episodes
    if (feed.episodes.length > 0) {
      const episodeRecords = feed.episodes.map(ep => ({
        feed_id: podcastFeed.id,
        user_id: req.user.id,
        guid: ep.guid,
        title: ep.title,
        description: ep.description?.substring(0, 5000) || null, // Limit description length
        audio_url: ep.audioUrl,
        duration_seconds: ep.durationSeconds,
        published_at: ep.publishedAt,
        artwork_url: ep.artworkUrl,
        episode_number: ep.episodeNumber,
        status: 'available',
      }));

      const { error: episodesError } = await supabase
        .from('feed_episodes')
        .insert(episodeRecords);

      if (episodesError) {
        logger.error('Failed to insert feed episodes', {
          userId: req.user.id,
          feedId: podcastFeed.id,
          error: episodesError.message,
        });
        // Don't throw - feed is connected, episodes can be synced later
      }
    }

    logger.info('Podcast feed connected successfully', {
      userId: req.user.id,
      feedId: podcastFeed.id,
      title: podcastFeed.title,
      episodeCount: feed.episodes.length,
    });

    res.status(201).json({
      success: true,
      feed: {
        ...podcastFeed,
        totalEpisodes: feed.episodes.length,
        processedEpisodes: 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/podcasts/feeds/:id
 * Get a specific feed with its episodes.
 */
router.get('/feeds/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    const supabase = getSupabase();

    // Get feed
    const { data: feed, error: feedError } = await supabase
      .from('podcast_feeds')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (feedError || !feed) {
      throw new NotFoundError('podcast_feed', id);
    }

    // Build episodes query
    // Use explicit FK hint to avoid ambiguity (bidirectional relationship)
    let episodesQuery = supabase
      .from('feed_episodes')
      .select('*, linked_episode:episodes!episode_id(id, title, status, current_stage)', { count: 'exact' })
      .eq('feed_id', id)
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      episodesQuery = episodesQuery.eq('status', status);
    }

    const { data: episodes, error: episodesError, count } = await episodesQuery;

    if (episodesError) {
      logger.error('Failed to fetch feed episodes', {
        feedId: id,
        error: episodesError.message,
      });
      throw new DatabaseError('select', 'Failed to fetch episodes');
    }

    // Get status counts
    const { data: statusCounts } = await supabase
      .from('feed_episodes')
      .select('status')
      .eq('feed_id', id);

    const counts = {
      available: 0,
      transcribing: 0,
      processed: 0,
      error: 0,
    };
    (statusCounts || []).forEach(ep => {
      if (counts[ep.status] !== undefined) {
        counts[ep.status]++;
      }
    });

    res.json({
      success: true,
      feed,
      episodes: episodes || [],
      total: count || 0,
      counts,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/podcasts/feeds/:id/sync
 * Sync a feed to fetch new episodes.
 */
router.post('/feeds/:id/sync', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const supabase = getSupabase();

    // Get feed
    const { data: feed, error: feedError } = await supabase
      .from('podcast_feeds')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (feedError || !feed) {
      throw new NotFoundError('podcast_feed', id);
    }

    logger.info('Syncing podcast feed', {
      userId: req.user.id,
      feedId: id,
      feedUrl: feed.feed_url,
    });

    // Parse the feed
    let parsedFeed;
    try {
      parsedFeed = await parsePodcastFeed(feed.feed_url);
    } catch (parseError) {
      // Update feed with sync error
      await supabase
        .from('podcast_feeds')
        .update({
          sync_error: parseError.message,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', id);

      throw parseError;
    }

    // Get existing episode guids
    const { data: existingEpisodes } = await supabase
      .from('feed_episodes')
      .select('guid')
      .eq('feed_id', id);

    const existingGuids = new Set((existingEpisodes || []).map(e => e.guid));

    // Find new episodes
    const newEpisodes = parsedFeed.episodes.filter(ep => !existingGuids.has(ep.guid));

    // Insert new episodes
    if (newEpisodes.length > 0) {
      const episodeRecords = newEpisodes.map(ep => ({
        feed_id: id,
        user_id: req.user.id,
        guid: ep.guid,
        title: ep.title,
        description: ep.description?.substring(0, 5000) || null,
        audio_url: ep.audioUrl,
        duration_seconds: ep.durationSeconds,
        published_at: ep.publishedAt,
        artwork_url: ep.artworkUrl,
        episode_number: ep.episodeNumber,
        status: 'available',
      }));

      await supabase
        .from('feed_episodes')
        .insert(episodeRecords);
    }

    // Update feed metadata
    await supabase
      .from('podcast_feeds')
      .update({
        title: parsedFeed.meta.title,
        description: parsedFeed.meta.description,
        author: parsedFeed.meta.author,
        artwork_url: parsedFeed.meta.artworkUrl,
        episode_count: parsedFeed.episodes.length,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq('id', id);

    logger.info('Podcast feed synced successfully', {
      userId: req.user.id,
      feedId: id,
      newEpisodes: newEpisodes.length,
      totalEpisodes: parsedFeed.episodes.length,
    });

    res.json({
      success: true,
      newEpisodes: newEpisodes.length,
      totalEpisodes: parsedFeed.episodes.length,
      feed: {
        ...feed,
        title: parsedFeed.meta.title,
        episode_count: parsedFeed.episodes.length,
        last_synced_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/podcasts/feeds/:id
 * Disconnect a podcast feed.
 */
router.delete('/feeds/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const supabase = getSupabase();

    // Verify ownership
    const { data: feed } = await supabase
      .from('podcast_feeds')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (!feed) {
      throw new NotFoundError('podcast_feed', id);
    }

    // Delete feed (cascades to feed_episodes)
    const { error } = await supabase
      .from('podcast_feeds')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Failed to delete podcast feed', {
        feedId: id,
        error: error.message,
      });
      throw new DatabaseError('delete', 'Failed to disconnect podcast feed');
    }

    logger.info('Podcast feed disconnected', {
      userId: req.user.id,
      feedId: id,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ROUTES: EPISODE TRANSCRIPTION
// ============================================================================

/**
 * POST /api/podcasts/episodes/:id/transcribe
 * Transcribe a feed episode.
 * Downloads audio from feed, transcribes, and creates an episode.
 *
 * Request Body (optional):
 *   { title?: "Custom title", startProcessing?: false }
 */
router.post('/episodes/:id/transcribe', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, startProcessing = false } = req.body;

    const supabase = getSupabase();

    // Get feed episode
    const { data: feedEpisode, error: fetchError } = await supabase
      .from('feed_episodes')
      .select('*, podcast_feeds(*)')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !feedEpisode) {
      throw new NotFoundError('feed_episode', id);
    }

    // Check if already processed
    if (feedEpisode.status === 'processed' && feedEpisode.episode_id) {
      return res.json({
        success: true,
        message: 'Episode already transcribed',
        episodeId: feedEpisode.episode_id,
        alreadyProcessed: true,
      });
    }

    // Check if currently transcribing
    if (feedEpisode.status === 'transcribing') {
      return res.status(409).json({
        error: 'Episode is currently being transcribed',
        status: 'transcribing',
      });
    }

    if (!feedEpisode.audio_url) {
      throw new ValidationError('audio_url', 'Episode has no audio URL');
    }

    logger.info('Starting feed episode transcription', {
      userId: req.user.id,
      feedEpisodeId: id,
      title: feedEpisode.title,
      audioUrl: feedEpisode.audio_url,
    });

    // Mark as transcribing
    await supabase
      .from('feed_episodes')
      .update({ status: 'transcribing' })
      .eq('id', id);

    try {
      // Download audio
      logger.info('Downloading audio from feed', {
        feedEpisodeId: id,
        audioUrl: feedEpisode.audio_url,
      });

      const audioResponse = await fetch(feedEpisode.audio_url, {
        headers: {
          'User-Agent': 'PodcastContentPipeline/1.0',
        },
      });

      if (!audioResponse.ok) {
        throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
      }

      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      logger.info('Audio downloaded, starting transcription', {
        feedEpisodeId: id,
        audioSizeMB: (audioBuffer.length / (1024 * 1024)).toFixed(2),
      });

      // Transcribe
      const transcriptionResult = await transcribeAudioWithChunking(audioBuffer, {
        filename: `${feedEpisode.title || 'episode'}.mp3`,
        mimeType: 'audio/mpeg',
        responseFormat: 'text',
      });

      // Validate transcript length
      if (!transcriptionResult.transcript || transcriptionResult.transcript.length < 500) {
        throw new Error(
          `Transcription too short (${transcriptionResult.transcript?.length || 0} chars). ` +
          'Minimum 500 characters required.'
        );
      }

      // Create episode
      const { episodeRepo } = await import('../../lib/supabase-client.js');

      const episode = await episodeRepo.create({
        transcript: transcriptionResult.transcript,
        title: title || feedEpisode.title || `Episode from ${feedEpisode.podcast_feeds?.title || 'feed'}`,
        episode_context: {
          source: 'rss_feed',
          feedEpisodeId: id,
          feedId: feedEpisode.feed_id,
          originalTitle: feedEpisode.title,
          publishedAt: feedEpisode.published_at,
          audioUrl: feedEpisode.audio_url,
          durationSeconds: feedEpisode.duration_seconds,
        },
        user_id: req.user.id,
        source_type: 'audio',
        audio_metadata: {
          source: 'rss_feed',
          original_url: feedEpisode.audio_url,
          duration_seconds: transcriptionResult.audioDurationSeconds,
          transcription_cost_usd: transcriptionResult.estimatedCost,
          transcription_model: transcriptionResult.model,
          transcribed_at: new Date().toISOString(),
        },
        feed_episode_id: id,
      });

      // Update feed episode status
      await supabase
        .from('feed_episodes')
        .update({
          status: 'processed',
          episode_id: episode.id,
          error_message: null,
        })
        .eq('id', id);

      logger.info('Feed episode transcribed and episode created', {
        userId: req.user.id,
        feedEpisodeId: id,
        episodeId: episode.id,
        transcriptLength: transcriptionResult.transcript.length,
        transcriptionCost: transcriptionResult.estimatedCost,
      });

      // Optionally start processing
      if (startProcessing) {
        // Import and trigger processing
        // This would trigger the content generation pipeline
        logger.info('Starting episode processing', { episodeId: episode.id });
        // Processing logic would go here
      }

      res.status(201).json({
        success: true,
        episode: {
          id: episode.id,
          title: episode.title,
          status: episode.status,
          transcriptLength: transcriptionResult.transcript.length,
        },
        transcription: {
          audioDurationMinutes: transcriptionResult.audioDurationMinutes,
          cost: transcriptionResult.estimatedCost,
          formattedCost: transcriptionResult.formattedCost,
        },
      });
    } catch (transcriptionError) {
      // Update feed episode with error
      await supabase
        .from('feed_episodes')
        .update({
          status: 'error',
          error_message: transcriptionError.message,
        })
        .eq('id', id);

      throw transcriptionError;
    }
  } catch (error) {
    logger.error('Feed episode transcription failed', {
      feedEpisodeId: req.params.id,
      error: error.message,
    });
    next(error);
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

export default router;
