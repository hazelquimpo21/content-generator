/**
 * ============================================================================
 * EPISODES ROUTES
 * ============================================================================
 * API endpoints for managing podcast episodes.
 * All routes require authentication. Episodes are user-scoped.
 *
 * Routes:
 * GET    /api/episodes              - List user's episodes
 * POST   /api/episodes              - Create new episode (owned by user)
 * GET    /api/episodes/:id          - Get episode with stages (owner or superadmin)
 * GET    /api/episodes/:id/stages   - Get all stages for episode (polling)
 * GET    /api/episodes/:id/status   - Get processing status
 * PUT    /api/episodes/:id          - Update episode (owner only)
 * DELETE /api/episodes/:id          - Delete episode (owner or superadmin)
 * POST   /api/episodes/:id/process  - Start processing (owner only)
 * POST   /api/episodes/:id/pause    - Pause processing (owner only)
 *
 * Authorization:
 * - Users can only access their own episodes
 * - Superadmins can access all episodes
 * ============================================================================
 */

import { Router } from 'express';
import { episodeRepo, stageRepo } from '../../lib/supabase-client.js';
import { processEpisode, getProcessingStatus } from '../../orchestrator/episode-processor.js';
import { estimateEpisodeCost } from '../../lib/cost-calculator.js';
import { ValidationError, AuthorizationError, NotFoundError } from '../../lib/errors.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import logger from '../../lib/logger.js';

const router = Router();

// ============================================================================
// AUTHORIZATION HELPER
// ============================================================================

/**
 * Verifies that the authenticated user can access the specified episode.
 * Users can only access their own episodes. Superadmins can access all.
 *
 * @param {Object} episode - Episode object from database
 * @param {Object} user - Authenticated user from req.user
 * @param {string} action - Action being performed (for error messages)
 * @throws {AuthorizationError} If user cannot access the episode
 */
function checkEpisodeAccess(episode, user, action = 'access') {
  // Superadmins can access all episodes
  if (user.role === 'superadmin') {
    return;
  }

  // Legacy episodes without user_id are accessible to all authenticated users
  if (!episode.user_id) {
    return;
  }

  // Check ownership
  if (episode.user_id !== user.id) {
    logger.warn('Episode access denied', {
      episodeId: episode.id,
      episodeOwnerId: episode.user_id,
      requesterId: user.id,
      action,
    });
    throw new AuthorizationError(
      'episode',
      `You do not have permission to ${action} this episode`
    );
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateTranscript(transcript) {
  if (!transcript || typeof transcript !== 'string') {
    throw new ValidationError('transcript', 'Transcript is required');
  }

  if (transcript.length < 500) {
    throw new ValidationError('transcript', 'Transcript must be at least 500 characters');
  }

  if (transcript.length > 100000) {
    throw new ValidationError('transcript', 'Transcript must be under 100,000 characters');
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/episodes
 * List episodes for the authenticated user.
 * Superadmins can see all episodes, regular users only see their own.
 *
 * Query params:
 * - status: Filter by episode status
 * - limit: Max results (default 50)
 * - offset: Pagination offset (default 0)
 * - all: If 'true' and user is superadmin, show all episodes
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0, all } = req.query;

    logger.debug('Listing episodes', {
      userId: req.user.id,
      role: req.user.role,
      showAll: all === 'true',
    });

    // Build list options
    const listOptions = {
      status,
      limit: parseInt(limit),
      offset: parseInt(offset),
    };

    // User-scope episodes unless superadmin requesting all
    if (req.user.role !== 'superadmin' || all !== 'true') {
      listOptions.userId = req.user.id;
    }

    const result = await episodeRepo.list(listOptions);

    res.json({
      episodes: result.episodes,
      total: result.total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/episodes
 * Create a new episode from transcript.
 * The episode is automatically owned by the authenticated user.
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { transcript, episode_context } = req.body;

    // Validate transcript
    validateTranscript(transcript);

    logger.info('Creating episode', {
      userId: req.user.id,
      transcriptLength: transcript.length,
    });

    // Create episode with user ownership
    const episode = await episodeRepo.create({
      transcript,
      episode_context: episode_context || {},
      user_id: req.user.id,  // Associate with authenticated user
    });

    // Calculate cost estimate
    const estimate = estimateEpisodeCost(transcript);

    logger.info('Episode created', {
      episodeId: episode.id,
      userId: req.user.id,
    });

    res.status(201).json({
      episode,
      estimate: {
        cost: estimate.formattedCost,
        time: estimate.formattedTime,
        wordCount: transcript.split(/\s+/).length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/episodes/:id
 * Get a single episode with all stage outputs.
 * User must own the episode or be a superadmin.
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.debug('Fetching episode with stages', {
      episodeId: id,
      userId: req.user.id,
    });

    const episode = await episodeRepo.findByIdWithStages(id);

    // Check authorization
    checkEpisodeAccess(episode, req.user, 'view');

    res.json({ episode, stages: episode.stages });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/episodes/:id/stages
 * Get all stage outputs for an episode (dedicated endpoint for polling).
 * User must own the episode or be a superadmin.
 */
router.get('/:id/stages', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.debug('Fetching stages for episode', {
      episodeId: id,
      userId: req.user.id,
    });

    // Fetch episode
    const episode = await episodeRepo.findById(id);

    // Check authorization
    checkEpisodeAccess(episode, req.user, 'view');

    // Then get all stages
    const stages = await stageRepo.findAllByEpisode(id);

    logger.debug('Stages retrieved', {
      episodeId: id,
      stageCount: stages.length,
      completedCount: stages.filter(s => s.status === 'completed').length,
      processingCount: stages.filter(s => s.status === 'processing').length,
    });

    // Return full episode object to match frontend expectations
    res.json({
      episode,
      stages,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/episodes/:id
 * Update episode metadata.
 * User must own the episode to update it.
 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, status, episode_context } = req.body;

    // Fetch episode first to check ownership
    const existingEpisode = await episodeRepo.findById(id);

    // Check authorization (only owner can update)
    checkEpisodeAccess(existingEpisode, req.user, 'update');

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (status !== undefined) updates.status = status;
    if (episode_context !== undefined) updates.episode_context = episode_context;

    logger.info('Updating episode', {
      episodeId: id,
      userId: req.user.id,
      fields: Object.keys(updates),
    });

    const episode = await episodeRepo.update(id, updates);

    res.json({ episode });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/episodes/:id
 * Delete an episode and all related data.
 * User must own the episode or be a superadmin.
 *
 * NOTE: Cannot delete episodes that are currently processing.
 * The cascade delete in the database will automatically remove
 * all associated stage_outputs records.
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.debug('Delete episode request received', {
      episodeId: id,
      userId: req.user.id,
    });

    // Fetch episode first to check ownership and status
    const episode = await episodeRepo.findById(id);

    // Check authorization (owner or superadmin can delete)
    checkEpisodeAccess(episode, req.user, 'delete');

    // Prevent deletion of episodes that are currently processing
    // This avoids orphaned stage updates and race conditions
    if (episode.status === 'processing') {
      logger.warn('Attempted to delete processing episode', {
        episodeId: id,
        userId: req.user.id,
        currentStage: episode.current_stage,
      });
      throw new ValidationError(
        'status',
        'Cannot delete an episode while it is being processed. Please wait for processing to complete or pause the episode first.'
      );
    }

    logger.info('Deleting episode', {
      episodeId: id,
      userId: req.user.id,
      deletedBy: req.user.role === 'superadmin' ? 'superadmin' : 'owner',
      episodeStatus: episode.status,
      totalCostUsd: episode.total_cost_usd,
    });

    await episodeRepo.delete(id);

    logger.info('Episode deleted successfully', {
      episodeId: id,
      userId: req.user.id,
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete episode', {
      episodeId: req.params.id,
      userId: req.user?.id,
      error: error.message,
    });
    next(error);
  }
});

/**
 * POST /api/episodes/:id/process
 * Start processing an episode through the 9-stage pipeline.
 * User must own the episode to start processing.
 */
router.post('/:id/process', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    // Default to stage 0 (preprocessing) for fresh starts
    // Stage 0 handles long transcript preprocessing with Claude Haiku
    const { start_from_stage = 0 } = req.body;

    // Verify episode exists
    const episode = await episodeRepo.findById(id);

    // Check authorization (only owner can process)
    checkEpisodeAccess(episode, req.user, 'process');

    if (!['draft', 'paused', 'error'].includes(episode.status)) {
      throw new ValidationError('status', `Cannot process episode with status: ${episode.status}`);
    }

    logger.info('Starting episode processing', {
      episodeId: id,
      userId: req.user.id,
      startFromStage: start_from_stage,
    });

    // Get cost estimate
    const estimate = estimateEpisodeCost(episode.transcript);

    // Return immediately - processing happens async
    res.status(202).json({
      episode_id: id,
      status: 'processing',
      message: 'Processing started',
      estimated_duration_seconds: estimate.estimatedTimeSeconds,
      estimated_cost_usd: estimate.totalCost.toFixed(2),
    });

    // Start processing in background (don't await)
    processEpisode(id, { startFromStage: start_from_stage })
      .catch(error => {
        logger.error('Background processing failed', {
          episodeId: id,
          userId: req.user.id,
          error: error.message,
        });
      });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/episodes/:id/status
 * Get current processing status.
 * User must own the episode or be a superadmin.
 */
router.get('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch episode first to check ownership
    const episode = await episodeRepo.findById(id);

    // Check authorization
    checkEpisodeAccess(episode, req.user, 'view');

    const status = await getProcessingStatus(id);

    res.json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/episodes/:id/pause
 * Pause processing (will complete current stage).
 * User must own the episode to pause it.
 */
router.post('/:id/pause', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch episode first to check ownership
    const existingEpisode = await episodeRepo.findById(id);

    // Check authorization (only owner can pause)
    checkEpisodeAccess(existingEpisode, req.user, 'pause');

    logger.info('Pausing episode processing', {
      episodeId: id,
      userId: req.user.id,
    });

    const episode = await episodeRepo.update(id, { status: 'paused' });

    res.json({
      episode_id: id,
      status: 'paused',
      current_stage: episode.current_stage,
      message: 'Processing will pause after current stage completes',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
