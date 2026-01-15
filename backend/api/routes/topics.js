/**
 * ============================================================================
 * TOPICS ROUTES
 * ============================================================================
 * API endpoints for managing content topics.
 * Topics are granular tags that can be associated with content pillars.
 * All routes require authentication. Topics are user-scoped.
 *
 * Routes:
 * GET    /api/topics              - List user's topics with pillar associations
 * POST   /api/topics              - Create a new topic
 * PUT    /api/topics/:id          - Update a topic
 * DELETE /api/topics/:id          - Delete a topic
 * POST   /api/topics/:id/pillars  - Update pillar associations for a topic
 *
 * Authorization:
 * - Users can only access their own topics
 * ============================================================================
 */

import { Router } from 'express';
import { db } from '../../lib/supabase-client.js';
import { ValidationError, AuthorizationError, NotFoundError, DatabaseError } from '../../lib/errors.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import logger from '../../lib/logger.js';

const router = Router();

// ============================================================================
// AUTHORIZATION HELPER
// ============================================================================

/**
 * Verifies that the authenticated user owns the topic.
 */
function checkTopicAccess(topic, user, action = 'access') {
  if (topic.user_id !== user.id) {
    logger.warn('Topic access denied', {
      topicId: topic.id,
      topicOwnerId: topic.user_id,
      requesterId: user.id,
      action,
    });
    throw new AuthorizationError(
      'topic',
      `You do not have permission to ${action} this topic`
    );
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/topics
 * List all topics for the authenticated user with pillar associations.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    logger.debug('Listing topics', { userId: req.user.id });

    // Use the helper function to get topics with pillars and content counts
    const { data, error } = await db.rpc('get_topics_with_pillars', {
      p_user_id: req.user.id,
    });

    if (error) {
      logger.error('Failed to list topics', {
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
      });

      // Fallback to simple query if RPC doesn't exist
      const { data: topics, error: fallbackError } = await db
        .from('topics')
        .select('*')
        .eq('user_id', req.user.id)
        .order('name');

      if (fallbackError) {
        throw new DatabaseError('select', `Failed to list topics: ${fallbackError.message}`);
      }

      // Get associations manually
      const topicsWithPillars = await Promise.all(
        (topics || []).map(async (topic) => {
          const { data: associations } = await db
            .from('topic_pillar_associations')
            .select('pillar_id, content_pillars(id, name)')
            .eq('topic_id', topic.id);

          const { count } = await db
            .from('content_library')
            .select('id', { count: 'exact', head: true })
            .contains('topic_ids', [topic.id]);

          return {
            ...topic,
            pillar_ids: associations?.map(a => a.pillar_id) || [],
            pillar_names: associations?.map(a => a.content_pillars?.name).filter(Boolean) || [],
            content_count: count || 0,
          };
        })
      );

      return res.json({ topics: topicsWithPillars });
    }

    // Transform RPC result to consistent format
    const topics = (data || []).map(row => ({
      id: row.topic_id,
      name: row.topic_name,
      pillar_ids: row.pillar_ids || [],
      pillar_names: row.pillar_names || [],
      content_count: parseInt(row.content_count) || 0,
    }));

    logger.info('Topics retrieved', {
      userId: req.user.id,
      count: topics.length,
    });

    res.json({ topics });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/topics
 * Create a new topic.
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, pillar_ids } = req.body;

    logger.info('Creating topic', {
      userId: req.user.id,
      name,
      pillarCount: pillar_ids?.length || 0,
    });

    // Validate
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('name', 'Topic name is required');
    }

    if (name.trim().length > 100) {
      throw new ValidationError('name', 'Topic name must be under 100 characters');
    }

    // Create topic
    const { data: topic, error } = await db
      .from('topics')
      .insert({
        user_id: req.user.id,
        name: name.trim(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ValidationError('name', 'A topic with this name already exists');
      }
      throw new DatabaseError('insert', `Failed to create topic: ${error.message}`);
    }

    // Create pillar associations if provided
    if (pillar_ids && Array.isArray(pillar_ids) && pillar_ids.length > 0) {
      const associations = pillar_ids.map(pillar_id => ({
        topic_id: topic.id,
        pillar_id,
      }));

      const { error: assocError } = await db
        .from('topic_pillar_associations')
        .insert(associations);

      if (assocError) {
        logger.warn('Failed to create pillar associations', {
          topicId: topic.id,
          error: assocError.message,
        });
      }
    }

    logger.info('Topic created', {
      userId: req.user.id,
      topicId: topic.id,
      name: topic.name,
    });

    res.status(201).json({
      topic: {
        ...topic,
        pillar_ids: pillar_ids || [],
        content_count: 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/topics/:id
 * Update a topic.
 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    logger.info('Updating topic', {
      topicId: id,
      userId: req.user.id,
    });

    // Fetch existing topic
    const { data: existingTopic, error: fetchError } = await db
      .from('topics')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingTopic) {
      throw new NotFoundError('topic', id);
    }

    // Check authorization
    checkTopicAccess(existingTopic, req.user, 'update');

    // Validate
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('name', 'Topic name cannot be empty');
      }
      if (name.trim().length > 100) {
        throw new ValidationError('name', 'Topic name must be under 100 characters');
      }
    }

    // Update
    const { data: topic, error } = await db
      .from('topics')
      .update({ name: name.trim() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ValidationError('name', 'A topic with this name already exists');
      }
      throw new DatabaseError('update', `Failed to update topic: ${error.message}`);
    }

    logger.info('Topic updated', {
      topicId: id,
      userId: req.user.id,
    });

    res.json({ topic });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/topics/:id
 * Delete a topic.
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info('Deleting topic', {
      topicId: id,
      userId: req.user.id,
    });

    // Fetch existing topic
    const { data: existingTopic, error: fetchError } = await db
      .from('topics')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingTopic) {
      throw new NotFoundError('topic', id);
    }

    // Check authorization
    checkTopicAccess(existingTopic, req.user, 'delete');

    // Delete (cascades to associations)
    const { error } = await db
      .from('topics')
      .delete()
      .eq('id', id);

    if (error) {
      throw new DatabaseError('delete', `Failed to delete topic: ${error.message}`);
    }

    // Also remove from content_library topic_ids arrays
    // This is a best-effort cleanup
    await db.rpc('array_remove_all', {
      table_name: 'content_library',
      column_name: 'topic_ids',
      value_to_remove: id,
    }).catch(() => {
      // RPC may not exist, that's okay - manual cleanup if needed
      logger.debug('Could not auto-remove topic from content_library');
    });

    logger.info('Topic deleted', {
      topicId: id,
      userId: req.user.id,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/topics/:id/pillars
 * Update pillar associations for a topic.
 */
router.post('/:id/pillars', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { pillar_ids } = req.body;

    logger.info('Updating topic pillar associations', {
      topicId: id,
      userId: req.user.id,
      pillarCount: pillar_ids?.length || 0,
    });

    // Fetch existing topic
    const { data: existingTopic, error: fetchError } = await db
      .from('topics')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingTopic) {
      throw new NotFoundError('topic', id);
    }

    // Check authorization
    checkTopicAccess(existingTopic, req.user, 'update');

    // Validate pillar_ids
    if (!Array.isArray(pillar_ids)) {
      throw new ValidationError('pillar_ids', 'pillar_ids must be an array');
    }

    // Delete existing associations
    await db
      .from('topic_pillar_associations')
      .delete()
      .eq('topic_id', id);

    // Create new associations
    if (pillar_ids.length > 0) {
      const associations = pillar_ids.map(pillar_id => ({
        topic_id: id,
        pillar_id,
      }));

      const { error: insertError } = await db
        .from('topic_pillar_associations')
        .insert(associations);

      if (insertError) {
        throw new DatabaseError('insert', `Failed to update associations: ${insertError.message}`);
      }
    }

    logger.info('Topic pillar associations updated', {
      topicId: id,
      userId: req.user.id,
      pillarIds: pillar_ids,
    });

    res.json({
      topic_id: id,
      pillar_ids,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
