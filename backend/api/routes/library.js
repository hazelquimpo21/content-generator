/**
 * ============================================================================
 * CONTENT LIBRARY ROUTES
 * ============================================================================
 * API endpoints for managing saved content pieces.
 * All routes require authentication. Content is user-scoped.
 *
 * Routes:
 * GET    /api/library              - List user's library items
 * POST   /api/library              - Save content to library
 * GET    /api/library/stats        - Get library statistics
 * GET    /api/library/:id          - Get single library item
 * PUT    /api/library/:id          - Update library item
 * DELETE /api/library/:id          - Delete library item
 * POST   /api/library/:id/favorite - Toggle favorite status
 *
 * Authorization:
 * - Users can only access their own library items
 * - Superadmins can access all library items
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

const VALID_CONTENT_TYPES = ['blog', 'social', 'email', 'headline', 'quote'];
const VALID_PLATFORMS = ['generic', 'instagram', 'twitter', 'linkedin', 'facebook'];

// ============================================================================
// AUTHORIZATION HELPER
// ============================================================================

/**
 * Verifies that the authenticated user can access the specified library item.
 * Users can only access their own items. Superadmins can access all.
 *
 * @param {Object} item - Library item object from database
 * @param {Object} user - Authenticated user from req.user
 * @param {string} action - Action being performed (for error messages)
 * @throws {AuthorizationError} If user cannot access the item
 */
function checkLibraryAccess(item, user, action = 'access') {
  if (user.role === 'superadmin') {
    return;
  }

  if (item.user_id !== user.id) {
    logger.warn('Library item access denied', {
      itemId: item.id,
      itemOwnerId: item.user_id,
      requesterId: user.id,
      action,
    });
    throw new AuthorizationError(
      'library_item',
      `You do not have permission to ${action} this library item`
    );
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates library item data for creation
 * @param {Object} data - Library item data
 * @throws {ValidationError} If validation fails
 */
function validateLibraryItem(data) {
  if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
    throw new ValidationError('title', 'Title is required');
  }

  if (data.title.length > 500) {
    throw new ValidationError('title', 'Title must be under 500 characters');
  }

  if (!data.content_type || !VALID_CONTENT_TYPES.includes(data.content_type)) {
    throw new ValidationError(
      'content_type',
      `Content type must be one of: ${VALID_CONTENT_TYPES.join(', ')}`
    );
  }

  if (data.platform && !VALID_PLATFORMS.includes(data.platform)) {
    throw new ValidationError(
      'platform',
      `Platform must be one of: ${VALID_PLATFORMS.join(', ')}`
    );
  }

  if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
    throw new ValidationError('content', 'Content is required');
  }

  if (data.content.length > 100000) {
    throw new ValidationError('content', 'Content must be under 100,000 characters');
  }

  // Validate source_stage if provided
  if (data.source_stage !== undefined && data.source_stage !== null) {
    if (typeof data.source_stage !== 'number' || data.source_stage < 0 || data.source_stage > 9) {
      throw new ValidationError('source_stage', 'Source stage must be a number between 0 and 9');
    }
  }

  // Validate tags if provided
  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) {
      throw new ValidationError('tags', 'Tags must be an array');
    }
    if (data.tags.some(tag => typeof tag !== 'string')) {
      throw new ValidationError('tags', 'All tags must be strings');
    }
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/library
 * List library items for the authenticated user.
 *
 * Query params:
 * - content_type: Filter by content type
 * - platform: Filter by platform
 * - episode_id: Filter by episode
 * - favorite: Filter favorites only (true)
 * - search: Search in title and content
 * - limit: Max results (default 50)
 * - offset: Pagination offset (default 0)
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const {
      content_type,
      platform,
      episode_id,
      favorite,
      search,
      limit = 50,
      offset = 0,
    } = req.query;

    logger.debug('Listing library items', {
      userId: req.user.id,
      filters: { content_type, platform, episode_id, favorite, search },
      pagination: { limit, offset },
    });

    // Build query
    let query = db
      .from('content_library')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Apply filters
    if (content_type) {
      query = query.eq('content_type', content_type);
    }
    if (platform) {
      query = query.eq('platform', platform);
    }
    if (episode_id) {
      query = query.eq('episode_id', episode_id);
    }
    if (favorite === 'true') {
      query = query.eq('is_favorite', true);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    }

    const { data: items, error, count } = await query;

    if (error) {
      logger.error('Failed to list library items', {
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
      });
      throw new DatabaseError('select', `Failed to list library items: ${error.message}`);
    }

    logger.info('Library items retrieved', {
      userId: req.user.id,
      count: items?.length || 0,
      total: count || 0,
      filters: { content_type, platform, episode_id, favorite, search },
    });

    res.json({
      items: items || [],
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/library/stats
 * Get library statistics for the authenticated user.
 */
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    logger.debug('Fetching library stats', { userId: req.user.id });

    const { data, error } = await db.rpc('get_library_stats', {
      p_user_id: req.user.id,
    });

    if (error) {
      logger.error('Failed to get library stats', {
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
      });

      // Fallback: manual count if function doesn't exist
      const { data: items, error: countError } = await db
        .from('content_library')
        .select('content_type, is_favorite')
        .eq('user_id', req.user.id);

      if (countError) {
        throw new DatabaseError('select', `Failed to get library stats: ${countError.message}`);
      }

      // Calculate stats manually
      const stats = {
        total_items: items?.length || 0,
        blog_count: items?.filter(i => i.content_type === 'blog').length || 0,
        social_count: items?.filter(i => i.content_type === 'social').length || 0,
        email_count: items?.filter(i => i.content_type === 'email').length || 0,
        headline_count: items?.filter(i => i.content_type === 'headline').length || 0,
        quote_count: items?.filter(i => i.content_type === 'quote').length || 0,
        favorite_count: items?.filter(i => i.is_favorite).length || 0,
      };

      logger.info('Library stats retrieved (fallback)', {
        userId: req.user.id,
        stats,
      });

      return res.json({ stats });
    }

    const stats = data?.[0] || {
      total_items: 0,
      blog_count: 0,
      social_count: 0,
      email_count: 0,
      headline_count: 0,
      quote_count: 0,
      favorite_count: 0,
    };

    logger.info('Library stats retrieved', {
      userId: req.user.id,
      totalItems: stats.total_items,
    });

    res.json({ stats });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/library
 * Save content to library.
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      title,
      content_type,
      platform,
      content,
      metadata,
      episode_id,
      source_stage,
      source_sub_stage,
      tags,
    } = req.body;

    logger.info('Saving content to library', {
      userId: req.user.id,
      content_type,
      platform,
      contentLength: content?.length,
      hasEpisodeId: !!episode_id,
      sourceStage: source_stage,
    });

    // Validate input
    validateLibraryItem({
      title,
      content_type,
      platform,
      content,
      source_stage,
      tags,
    });

    // Build insert data
    const insertData = {
      user_id: req.user.id,
      title: title.trim(),
      content_type,
      platform: platform || null,
      content: content.trim(),
      metadata: metadata || {},
      episode_id: episode_id || null,
      source_stage: source_stage ?? null,
      source_sub_stage: source_sub_stage || null,
      tags: tags || [],
      is_favorite: false,
    };

    const { data: item, error } = await db
      .from('content_library')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.error('Failed to save to library', {
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        contentType: content_type,
      });
      throw new DatabaseError('insert', `Failed to save to library: ${error.message}`);
    }

    logger.info('Content saved to library', {
      userId: req.user.id,
      itemId: item.id,
      contentType: item.content_type,
      platform: item.platform,
      episodeId: item.episode_id,
    });

    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/library/:id
 * Get single library item.
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.debug('Fetching library item', {
      itemId: id,
      userId: req.user.id,
    });

    const { data: item, error } = await db
      .from('content_library')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !item) {
      logger.warn('Library item not found', {
        itemId: id,
        userId: req.user.id,
        error: error?.message,
      });
      throw new NotFoundError('library_item', id);
    }

    // Check authorization
    checkLibraryAccess(item, req.user, 'view');

    logger.debug('Library item retrieved', {
      itemId: id,
      userId: req.user.id,
      contentType: item.content_type,
    });

    res.json({ item });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/library/:id
 * Update library item.
 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, content, metadata, tags, platform } = req.body;

    logger.info('Updating library item', {
      itemId: id,
      userId: req.user.id,
      updateFields: Object.keys(req.body).filter(k => req.body[k] !== undefined),
    });

    // Fetch existing item
    const { data: existingItem, error: fetchError } = await db
      .from('content_library')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingItem) {
      logger.warn('Library item not found for update', {
        itemId: id,
        userId: req.user.id,
      });
      throw new NotFoundError('library_item', id);
    }

    // Check authorization
    checkLibraryAccess(existingItem, req.user, 'update');

    // Build updates
    const updates = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new ValidationError('title', 'Title cannot be empty');
      }
      updates.title = title.trim();
    }
    if (content !== undefined) {
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new ValidationError('content', 'Content cannot be empty');
      }
      updates.content = content.trim();
    }
    if (metadata !== undefined) {
      updates.metadata = metadata;
    }
    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        throw new ValidationError('tags', 'Tags must be an array');
      }
      updates.tags = tags;
    }
    if (platform !== undefined) {
      if (platform !== null && !VALID_PLATFORMS.includes(platform)) {
        throw new ValidationError('platform', `Platform must be one of: ${VALID_PLATFORMS.join(', ')}`);
      }
      updates.platform = platform;
    }

    // Perform update
    const { data: item, error } = await db
      .from('content_library')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update library item', {
        itemId: id,
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
      });
      throw new DatabaseError('update', `Failed to update library item: ${error.message}`);
    }

    logger.info('Library item updated', {
      itemId: id,
      userId: req.user.id,
      updatedFields: Object.keys(updates),
    });

    res.json({ item });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/library/:id
 * Delete library item.
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info('Deleting library item', {
      itemId: id,
      userId: req.user.id,
    });

    // Fetch existing item
    const { data: existingItem, error: fetchError } = await db
      .from('content_library')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingItem) {
      logger.warn('Library item not found for deletion', {
        itemId: id,
        userId: req.user.id,
      });
      throw new NotFoundError('library_item', id);
    }

    // Check authorization
    checkLibraryAccess(existingItem, req.user, 'delete');

    // Delete item
    const { error } = await db
      .from('content_library')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Failed to delete library item', {
        itemId: id,
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
      });
      throw new DatabaseError('delete', `Failed to delete library item: ${error.message}`);
    }

    logger.info('Library item deleted', {
      itemId: id,
      userId: req.user.id,
      contentType: existingItem.content_type,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/library/:id/favorite
 * Toggle favorite status.
 */
router.post('/:id/favorite', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.debug('Toggling favorite status', {
      itemId: id,
      userId: req.user.id,
    });

    // Fetch existing item
    const { data: existingItem, error: fetchError } = await db
      .from('content_library')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingItem) {
      throw new NotFoundError('library_item', id);
    }

    // Check authorization
    checkLibraryAccess(existingItem, req.user, 'update');

    // Toggle favorite
    const newFavoriteStatus = !existingItem.is_favorite;

    const { data: item, error } = await db
      .from('content_library')
      .update({ is_favorite: newFavoriteStatus })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to toggle favorite', {
        itemId: id,
        userId: req.user.id,
        error: error.message,
      });
      throw new DatabaseError('update', `Failed to toggle favorite: ${error.message}`);
    }

    logger.info('Favorite status toggled', {
      itemId: id,
      userId: req.user.id,
      isFavorite: newFavoriteStatus,
    });

    res.json({ item, is_favorite: newFavoriteStatus });
  } catch (error) {
    next(error);
  }
});

export default router;
