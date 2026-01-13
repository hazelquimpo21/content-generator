/**
 * ============================================================================
 * STAGES ROUTES
 * ============================================================================
 * API endpoints for viewing and managing stage outputs.
 *
 * Routes:
 * GET  /api/stages/:id          - Get single stage
 * PUT  /api/stages/:id          - Update stage (edit output)
 * POST /api/stages/:id/regenerate - Regenerate a stage
 * ============================================================================
 */

import { Router } from 'express';
import { stageRepo, episodeRepo } from '../../lib/supabase-client.js';
import { regenerateStage } from '../../orchestrator/episode-processor.js';
import { ValidationError } from '../../lib/errors.js';
import logger from '../../lib/logger.js';

const router = Router();

/**
 * GET /api/stages/:id
 * Get a single stage output by stage ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find stage by ID - need to query directly
    const { db } = await import('../../lib/supabase-client.js');
    const { data: stage, error } = await db
      .from('stage_outputs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !stage) {
      throw new ValidationError('id', 'Stage not found');
    }

    res.json({ stage });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/stages/:id
 * Update a stage output (for manual editing)
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { output_data, output_text } = req.body;

    const updates = {};
    if (output_data !== undefined) updates.output_data = output_data;
    if (output_text !== undefined) updates.output_text = output_text;

    const stage = await stageRepo.update(id, updates);

    logger.info('Stage output updated', {
      stageId: id,
      stageNumber: stage.stage_number,
    });

    res.json({ stage });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/stages/:id/regenerate
 * Regenerate a single stage with AI
 */
router.post('/:id/regenerate', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find the stage
    const { db } = await import('../../lib/supabase-client.js');
    const { data: stage, error } = await db
      .from('stage_outputs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !stage) {
      throw new ValidationError('id', 'Stage not found');
    }

    // Return immediately
    res.status(202).json({
      stage_id: id,
      status: 'processing',
      message: 'Stage regeneration started',
    });

    // Regenerate in background
    regenerateStage(stage.episode_id, stage.stage_number)
      .catch(err => {
        logger.error('Stage regeneration failed', {
          stageId: id,
          error: err.message,
        });
      });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stages/episode/:episodeId
 * Get all stages for an episode
 */
router.get('/episode/:episodeId', async (req, res, next) => {
  try {
    const { episodeId } = req.params;

    const stages = await stageRepo.findAllByEpisode(episodeId);

    res.json({ stages });
  } catch (error) {
    next(error);
  }
});

export default router;
