/**
 * ============================================================================
 * EPISODES ROUTES
 * ============================================================================
 * API endpoints for managing podcast episodes.
 *
 * Routes:
 * GET    /api/episodes              - List all episodes
 * POST   /api/episodes              - Create new episode
 * GET    /api/episodes/:id          - Get episode with stages
 * GET    /api/episodes/:id/stages   - Get all stages for episode (polling)
 * GET    /api/episodes/:id/status   - Get processing status
 * PUT    /api/episodes/:id          - Update episode
 * DELETE /api/episodes/:id          - Delete episode
 * POST   /api/episodes/:id/process  - Start processing
 * POST   /api/episodes/:id/pause    - Pause processing
 * ============================================================================
 */

import { Router } from 'express';
import { episodeRepo, stageRepo } from '../../lib/supabase-client.js';
import { processEpisode, getProcessingStatus } from '../../orchestrator/episode-processor.js';
import { estimateEpisodeCost } from '../../lib/cost-calculator.js';
import { ValidationError } from '../../lib/errors.js';
import logger from '../../lib/logger.js';

const router = Router();

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
 * List all episodes with optional filtering
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    const result = await episodeRepo.list({
      status,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

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
 * Create a new episode from transcript
 */
router.post('/', async (req, res, next) => {
  try {
    const { transcript, episode_context } = req.body;

    // Validate transcript
    validateTranscript(transcript);

    // Create episode
    const episode = await episodeRepo.create({
      transcript,
      episode_context: episode_context || {},
    });

    // Calculate cost estimate
    const estimate = estimateEpisodeCost(transcript);

    logger.info('Episode created', { episodeId: episode.id });

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
 * Get a single episode with all stage outputs
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.debug('Fetching episode with stages', { episodeId: id });
    const episode = await episodeRepo.findByIdWithStages(id);

    res.json({ episode, stages: episode.stages });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/episodes/:id/stages
 * Get all stage outputs for an episode (dedicated endpoint for polling)
 */
router.get('/:id/stages', async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.debug('Fetching stages for episode', { episodeId: id });

    // Fetch episode with all stages
    const episode = await episodeRepo.findById(id);

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
 * Update episode metadata
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, status, episode_context } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (status !== undefined) updates.status = status;
    if (episode_context !== undefined) updates.episode_context = episode_context;

    const episode = await episodeRepo.update(id, updates);

    res.json({ episode });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/episodes/:id
 * Delete an episode and all related data
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    await episodeRepo.delete(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/episodes/:id/process
 * Start processing an episode through the 9-stage pipeline
 */
router.post('/:id/process', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start_from_stage = 1 } = req.body;

    // Verify episode exists and is in valid state
    const episode = await episodeRepo.findById(id);

    if (!['draft', 'paused', 'error'].includes(episode.status)) {
      throw new ValidationError('status', `Cannot process episode with status: ${episode.status}`);
    }

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
          error: error.message,
        });
      });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/episodes/:id/status
 * Get current processing status
 */
router.get('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;

    const status = await getProcessingStatus(id);

    res.json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/episodes/:id/pause
 * Pause processing (will complete current stage)
 */
router.post('/:id/pause', async (req, res, next) => {
  try {
    const { id } = req.params;

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
