/**
 * ============================================================================
 * CONTENT PILLARS ROUTES
 * ============================================================================
 * API endpoints for managing content pillars.
 * Pillars are high-level brand themes that contain multiple topics.
 * All routes require authentication. Pillars are user-scoped.
 *
 * Routes:
 * GET    /api/pillars              - List user's pillars with topic associations
 * POST   /api/pillars              - Create a new pillar
 * PUT    /api/pillars/:id          - Update a pillar
 * DELETE /api/pillars/:id          - Delete a pillar
 * POST   /api/pillars/:id/topics   - Update topic associations for a pillar
 *
 * Authorization:
 * - Users can only access their own pillars
 * ============================================================================
 */

import { Router } from 'express';
import { db } from '../../lib/supabase-client.js';
import { ValidationError, AuthorizationError, NotFoundError, DatabaseError } from '../../lib/errors.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import logger from '../../lib/logger.js';

const router = Router();

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_PILLAR_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

// ============================================================================
// AUTHORIZATION HELPER
// ============================================================================

/**
 * Verifies that the authenticated user owns the pillar.
 */
function checkPillarAccess(pillar, user, action = 'access') {
  if (pillar.user_id !== user.id) {
    logger.warn('Pillar access denied', {
      pillarId: pillar.id,
      pillarOwnerId: pillar.user_id,
      requesterId: user.id,
      action,
    });
    throw new AuthorizationError(
      'pillar',
      `You do not have permission to ${action} this pillar`
    );
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/pillars
 * List all pillars for the authenticated user with topic associations.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    logger.debug('Listing pillars', { userId: req.user.id });

    // Use the helper function to get pillars with topics and content counts
    const { data, error } = await db.rpc('get_pillars_with_topics', {
      p_user_id: req.user.id,
    });

    if (error) {
      logger.error('Failed to list pillars via RPC', {
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
      });

      // Fallback to simple query if RPC doesn't exist
      const { data: pillars, error: fallbackError } = await db
        .from('content_pillars')
        .select('*')
        .eq('user_id', req.user.id)
        .order('name');

      if (fallbackError) {
        throw new DatabaseError('select', `Failed to list pillars: ${fallbackError.message}`);
      }

      // Get associations manually
      const pillarsWithTopics = await Promise.all(
        (pillars || []).map(async (pillar) => {
          const { data: associations } = await db
            .from('topic_pillar_associations')
            .select('topic_id, topics(id, name)')
            .eq('pillar_id', pillar.id);

          const topicIds = associations?.map(a => a.topic_id) || [];

          // Count content items that have any of these topics
          let contentCount = 0;
          if (topicIds.length > 0) {
            const { count } = await db
              .from('content_library')
              .select('id', { count: 'exact', head: true })
              .overlaps('topic_ids', topicIds);
            contentCount = count || 0;
          }

          return {
            ...pillar,
            topic_ids: topicIds,
            topic_names: associations?.map(a => a.topics?.name).filter(Boolean) || [],
            content_count: contentCount,
          };
        })
      );

      return res.json({ pillars: pillarsWithTopics });
    }

    // Transform RPC result to consistent format
    const pillars = (data || []).map(row => ({
      id: row.pillar_id,
      name: row.pillar_name,
      description: row.pillar_description,
      color: row.pillar_color,
      topic_ids: row.topic_ids || [],
      topic_names: row.topic_names || [],
      content_count: parseInt(row.content_count) || 0,
    }));

    logger.info('Pillars retrieved', {
      userId: req.user.id,
      count: pillars.length,
    });

    res.json({ pillars });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pillars
 * Create a new pillar.
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, description, color, topic_ids } = req.body;

    logger.info('Creating pillar', {
      userId: req.user.id,
      name,
      topicCount: topic_ids?.length || 0,
    });

    // Validate
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('name', 'Pillar name is required');
    }

    if (name.trim().length > 100) {
      throw new ValidationError('name', 'Pillar name must be under 100 characters');
    }

    if (description && description.length > 500) {
      throw new ValidationError('description', 'Description must be under 500 characters');
    }

    // Get existing pillar count for default color
    const { count: existingCount } = await db
      .from('content_pillars')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    const defaultColor = DEFAULT_PILLAR_COLORS[(existingCount || 0) % DEFAULT_PILLAR_COLORS.length];

    // Create pillar
    const { data: pillar, error } = await db
      .from('content_pillars')
      .insert({
        user_id: req.user.id,
        name: name.trim(),
        description: description?.trim() || null,
        color: color || defaultColor,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ValidationError('name', 'A pillar with this name already exists');
      }
      throw new DatabaseError('insert', `Failed to create pillar: ${error.message}`);
    }

    // Create topic associations if provided
    if (topic_ids && Array.isArray(topic_ids) && topic_ids.length > 0) {
      const associations = topic_ids.map(topic_id => ({
        topic_id,
        pillar_id: pillar.id,
      }));

      const { error: assocError } = await db
        .from('topic_pillar_associations')
        .insert(associations);

      if (assocError) {
        logger.warn('Failed to create topic associations', {
          pillarId: pillar.id,
          error: assocError.message,
        });
      }
    }

    logger.info('Pillar created', {
      userId: req.user.id,
      pillarId: pillar.id,
      name: pillar.name,
    });

    res.status(201).json({
      pillar: {
        ...pillar,
        topic_ids: topic_ids || [],
        content_count: 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/pillars/:id
 * Update a pillar.
 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    logger.info('Updating pillar', {
      pillarId: id,
      userId: req.user.id,
    });

    // Fetch existing pillar
    const { data: existingPillar, error: fetchError } = await db
      .from('content_pillars')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingPillar) {
      throw new NotFoundError('pillar', id);
    }

    // Check authorization
    checkPillarAccess(existingPillar, req.user, 'update');

    // Build updates
    const updates = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('name', 'Pillar name cannot be empty');
      }
      if (name.trim().length > 100) {
        throw new ValidationError('name', 'Pillar name must be under 100 characters');
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      if (description && description.length > 500) {
        throw new ValidationError('description', 'Description must be under 500 characters');
      }
      updates.description = description?.trim() || null;
    }

    if (color !== undefined) {
      updates.color = color;
    }

    // Update
    const { data: pillar, error } = await db
      .from('content_pillars')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ValidationError('name', 'A pillar with this name already exists');
      }
      throw new DatabaseError('update', `Failed to update pillar: ${error.message}`);
    }

    logger.info('Pillar updated', {
      pillarId: id,
      userId: req.user.id,
    });

    res.json({ pillar });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/pillars/:id
 * Delete a pillar.
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info('Deleting pillar', {
      pillarId: id,
      userId: req.user.id,
    });

    // Fetch existing pillar
    const { data: existingPillar, error: fetchError } = await db
      .from('content_pillars')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingPillar) {
      throw new NotFoundError('pillar', id);
    }

    // Check authorization
    checkPillarAccess(existingPillar, req.user, 'delete');

    // Delete (cascades to associations)
    const { error } = await db
      .from('content_pillars')
      .delete()
      .eq('id', id);

    if (error) {
      throw new DatabaseError('delete', `Failed to delete pillar: ${error.message}`);
    }

    logger.info('Pillar deleted', {
      pillarId: id,
      userId: req.user.id,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pillars/:id/topics
 * Update topic associations for a pillar.
 */
router.post('/:id/topics', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { topic_ids } = req.body;

    logger.info('Updating pillar topic associations', {
      pillarId: id,
      userId: req.user.id,
      topicCount: topic_ids?.length || 0,
    });

    // Fetch existing pillar
    const { data: existingPillar, error: fetchError } = await db
      .from('content_pillars')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingPillar) {
      throw new NotFoundError('pillar', id);
    }

    // Check authorization
    checkPillarAccess(existingPillar, req.user, 'update');

    // Validate topic_ids
    if (!Array.isArray(topic_ids)) {
      throw new ValidationError('topic_ids', 'topic_ids must be an array');
    }

    // Delete existing associations
    await db
      .from('topic_pillar_associations')
      .delete()
      .eq('pillar_id', id);

    // Create new associations
    if (topic_ids.length > 0) {
      const associations = topic_ids.map(topic_id => ({
        topic_id,
        pillar_id: id,
      }));

      const { error: insertError } = await db
        .from('topic_pillar_associations')
        .insert(associations);

      if (insertError) {
        throw new DatabaseError('insert', `Failed to update associations: ${insertError.message}`);
      }
    }

    logger.info('Pillar topic associations updated', {
      pillarId: id,
      userId: req.user.id,
      topicIds: topic_ids,
    });

    res.json({
      pillar_id: id,
      topic_ids,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
