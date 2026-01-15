/**
 * ============================================================================
 * CONTENT CALENDAR ROUTES
 * ============================================================================
 * API endpoints for managing scheduled content on the calendar.
 * All routes require authentication. Content is user-scoped.
 *
 * Routes:
 * GET    /api/calendar              - List calendar items (with date range)
 * POST   /api/calendar              - Schedule content
 * GET    /api/calendar/:id          - Get single calendar item
 * PUT    /api/calendar/:id          - Update calendar item
 * DELETE /api/calendar/:id          - Delete calendar item
 * PATCH  /api/calendar/:id/status   - Update item status
 *
 * Authorization:
 * - Users can only access their own calendar items
 * - Superadmins can access all calendar items
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

const VALID_CONTENT_TYPES = ['blog', 'social', 'email'];
const VALID_PLATFORMS = ['generic', 'instagram', 'twitter', 'linkedin', 'facebook'];
const VALID_STATUSES = ['draft', 'scheduled', 'published', 'cancelled'];

// ============================================================================
// AUTHORIZATION HELPER
// ============================================================================

/**
 * Verifies that the authenticated user can access the specified calendar item.
 * Users can only access their own items. Superadmins can access all.
 *
 * @param {Object} item - Calendar item object from database
 * @param {Object} user - Authenticated user from req.user
 * @param {string} action - Action being performed (for error messages)
 * @throws {AuthorizationError} If user cannot access the item
 */
function checkCalendarAccess(item, user, action = 'access') {
  if (user.role === 'superadmin') {
    return;
  }

  if (item.user_id !== user.id) {
    logger.warn('Calendar item access denied', {
      itemId: item.id,
      itemOwnerId: item.user_id,
      requesterId: user.id,
      action,
    });
    throw new AuthorizationError(
      'calendar_item',
      `You do not have permission to ${action} this calendar item`
    );
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates calendar item data for creation
 * @param {Object} data - Calendar item data
 * @throws {ValidationError} If validation fails
 */
function validateCalendarItem(data) {
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

  if (!data.scheduled_date) {
    throw new ValidationError('scheduled_date', 'Scheduled date is required');
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(data.scheduled_date)) {
    throw new ValidationError('scheduled_date', 'Date must be in YYYY-MM-DD format');
  }

  // Validate the date is valid
  const date = new Date(data.scheduled_date);
  if (isNaN(date.getTime())) {
    throw new ValidationError('scheduled_date', 'Invalid date value');
  }

  // Validate time format if provided (HH:MM or HH:MM:SS)
  if (data.scheduled_time) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
    if (!timeRegex.test(data.scheduled_time)) {
      throw new ValidationError('scheduled_time', 'Time must be in HH:MM or HH:MM:SS format');
    }
  }

  // Validate status if provided
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    throw new ValidationError(
      'status',
      `Status must be one of: ${VALID_STATUSES.join(', ')}`
    );
  }

  // Validate content if provided
  if (data.full_content && data.full_content.length > 100000) {
    throw new ValidationError('full_content', 'Content must be under 100,000 characters');
  }
}

/**
 * Generates content preview from full content
 * @param {string} content - Full content text
 * @param {number} maxLength - Maximum preview length
 * @returns {string|null} Content preview
 */
function generateContentPreview(content, maxLength = 200) {
  if (!content) return null;
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/calendar
 * List calendar items for the authenticated user.
 *
 * Query params:
 * - start_date: Start of date range (YYYY-MM-DD) - required unless episode_id provided
 * - end_date: End of date range (YYYY-MM-DD) - required unless episode_id provided
 * - episode_id: Filter by source episode (optional, bypasses date requirement)
 * - content_type: Filter by content type
 * - platform: Filter by platform
 * - status: Filter by status
 * - limit: Max results (default 100)
 * - offset: Pagination offset (default 0)
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const {
      start_date,
      end_date,
      episode_id,
      content_type,
      platform,
      status,
      topic_id,
      limit = 100,
      offset = 0,
    } = req.query;

    logger.debug('Listing calendar items', {
      userId: req.user.id,
      dateRange: { start_date, end_date },
      filters: { content_type, platform, status, episode_id, topic_id },
      pagination: { limit, offset },
    });

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    // Validate date range - required unless episode_id is provided
    if (!episode_id) {
      if (!start_date || !end_date) {
        throw new ValidationError('date_range', 'Both start_date and end_date are required (or provide episode_id)');
      }
      if (!dateRegex.test(start_date) || !dateRegex.test(end_date)) {
        throw new ValidationError('date_range', 'Dates must be in YYYY-MM-DD format');
      }
    } else {
      // Validate date format if provided with episode_id
      if (start_date && !dateRegex.test(start_date)) {
        throw new ValidationError('start_date', 'Date must be in YYYY-MM-DD format');
      }
      if (end_date && !dateRegex.test(end_date)) {
        throw new ValidationError('end_date', 'Date must be in YYYY-MM-DD format');
      }
    }

    // Build query
    let query = db
      .from('content_calendar')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true, nullsFirst: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Apply date range if provided
    if (start_date) {
      query = query.gte('scheduled_date', start_date);
    }
    if (end_date) {
      query = query.lte('scheduled_date', end_date);
    }

    // Apply filters
    if (episode_id) {
      query = query.eq('episode_id', episode_id);
    }
    if (content_type) {
      query = query.eq('content_type', content_type);
    }
    if (platform) {
      query = query.eq('platform', platform);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (topic_id) {
      query = query.contains('topic_ids', [topic_id]);
    }

    const { data: items, error, count } = await query;

    if (error) {
      logger.error('Failed to list calendar items', {
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        filters: { start_date, end_date, episode_id },
      });
      throw new DatabaseError('select', `Failed to list calendar items: ${error.message}`);
    }

    logger.info('Calendar items retrieved', {
      userId: req.user.id,
      count: items?.length || 0,
      total: count || 0,
      dateRange: { start_date, end_date },
      filters: { content_type, platform, status, episode_id },
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
 * POST /api/calendar
 * Schedule content on the calendar.
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      title,
      content_type,
      platform,
      scheduled_date,
      scheduled_time,
      full_content,
      status = 'scheduled',
      episode_id,
      library_item_id,
      notes,
      metadata,
      topic_ids,
    } = req.body;

    logger.info('Scheduling content', {
      userId: req.user.id,
      content_type,
      platform,
      scheduled_date,
      scheduled_time,
      hasContent: !!full_content,
      hasEpisodeId: !!episode_id,
      hasLibraryItemId: !!library_item_id,
      topicCount: topic_ids?.length || 0,
    });

    // Validate input
    validateCalendarItem({
      title,
      content_type,
      platform,
      scheduled_date,
      scheduled_time,
      status,
      full_content,
    });

    // Generate content preview
    const content_preview = generateContentPreview(full_content);

    // Build insert data
    const insertData = {
      user_id: req.user.id,
      title: title.trim(),
      content_type,
      platform: platform || null,
      scheduled_date,
      scheduled_time: scheduled_time || null,
      content_preview,
      full_content: full_content?.trim() || null,
      status,
      episode_id: episode_id || null,
      library_item_id: library_item_id || null,
      notes: notes?.trim() || null,
      metadata: metadata || {},
      topic_ids: topic_ids || [],
    };

    const { data: item, error } = await db
      .from('content_calendar')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.error('Failed to schedule content', {
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        contentType: content_type,
        scheduledDate: scheduled_date,
      });
      throw new DatabaseError('insert', `Failed to schedule content: ${error.message}`);
    }

    logger.info('Content scheduled', {
      userId: req.user.id,
      itemId: item.id,
      contentType: item.content_type,
      platform: item.platform,
      scheduledDate: item.scheduled_date,
      scheduledTime: item.scheduled_time,
      status: item.status,
    });

    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/calendar/:id
 * Get single calendar item.
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.debug('Fetching calendar item', {
      itemId: id,
      userId: req.user.id,
    });

    const { data: item, error } = await db
      .from('content_calendar')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !item) {
      logger.warn('Calendar item not found', {
        itemId: id,
        userId: req.user.id,
        error: error?.message,
      });
      throw new NotFoundError('calendar_item', id);
    }

    // Check authorization
    checkCalendarAccess(item, req.user, 'view');

    logger.debug('Calendar item retrieved', {
      itemId: id,
      userId: req.user.id,
      contentType: item.content_type,
      scheduledDate: item.scheduled_date,
    });

    res.json({ item });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/calendar/:id
 * Update calendar item.
 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      scheduled_date,
      scheduled_time,
      full_content,
      platform,
      notes,
      metadata,
    } = req.body;

    logger.info('Updating calendar item', {
      itemId: id,
      userId: req.user.id,
      updateFields: Object.keys(req.body).filter(k => req.body[k] !== undefined),
    });

    // Fetch existing item
    const { data: existingItem, error: fetchError } = await db
      .from('content_calendar')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingItem) {
      logger.warn('Calendar item not found for update', {
        itemId: id,
        userId: req.user.id,
      });
      throw new NotFoundError('calendar_item', id);
    }

    // Check authorization
    checkCalendarAccess(existingItem, req.user, 'update');

    // Build updates
    const updates = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new ValidationError('title', 'Title cannot be empty');
      }
      updates.title = title.trim();
    }

    if (scheduled_date !== undefined) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(scheduled_date)) {
        throw new ValidationError('scheduled_date', 'Date must be in YYYY-MM-DD format');
      }
      updates.scheduled_date = scheduled_date;
    }

    if (scheduled_time !== undefined) {
      if (scheduled_time !== null) {
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
        if (!timeRegex.test(scheduled_time)) {
          throw new ValidationError('scheduled_time', 'Time must be in HH:MM or HH:MM:SS format');
        }
      }
      updates.scheduled_time = scheduled_time;
    }

    if (full_content !== undefined) {
      if (full_content && full_content.length > 100000) {
        throw new ValidationError('full_content', 'Content must be under 100,000 characters');
      }
      updates.full_content = full_content?.trim() || null;
      updates.content_preview = generateContentPreview(full_content);
    }

    if (platform !== undefined) {
      if (platform !== null && !VALID_PLATFORMS.includes(platform)) {
        throw new ValidationError('platform', `Platform must be one of: ${VALID_PLATFORMS.join(', ')}`);
      }
      updates.platform = platform;
    }

    if (notes !== undefined) {
      updates.notes = notes?.trim() || null;
    }

    if (metadata !== undefined) {
      updates.metadata = metadata;
    }

    // Perform update
    const { data: item, error } = await db
      .from('content_calendar')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update calendar item', {
        itemId: id,
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
      });
      throw new DatabaseError('update', `Failed to update calendar item: ${error.message}`);
    }

    logger.info('Calendar item updated', {
      itemId: id,
      userId: req.user.id,
      updatedFields: Object.keys(updates),
      newScheduledDate: item.scheduled_date,
    });

    res.json({ item });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/calendar/:id
 * Delete calendar item.
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info('Deleting calendar item', {
      itemId: id,
      userId: req.user.id,
    });

    // Fetch existing item
    const { data: existingItem, error: fetchError } = await db
      .from('content_calendar')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingItem) {
      logger.warn('Calendar item not found for deletion', {
        itemId: id,
        userId: req.user.id,
      });
      throw new NotFoundError('calendar_item', id);
    }

    // Check authorization
    checkCalendarAccess(existingItem, req.user, 'delete');

    // Delete item
    const { error } = await db
      .from('content_calendar')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Failed to delete calendar item', {
        itemId: id,
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
      });
      throw new DatabaseError('delete', `Failed to delete calendar item: ${error.message}`);
    }

    logger.info('Calendar item deleted', {
      itemId: id,
      userId: req.user.id,
      contentType: existingItem.content_type,
      scheduledDate: existingItem.scheduled_date,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/calendar/:id/status
 * Update calendar item status.
 */
router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, publish_url } = req.body;

    logger.info('Updating calendar item status', {
      itemId: id,
      userId: req.user.id,
      newStatus: status,
    });

    // Validate status
    if (!status || !VALID_STATUSES.includes(status)) {
      throw new ValidationError(
        'status',
        `Status must be one of: ${VALID_STATUSES.join(', ')}`
      );
    }

    // Fetch existing item
    const { data: existingItem, error: fetchError } = await db
      .from('content_calendar')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingItem) {
      logger.warn('Calendar item not found for status update', {
        itemId: id,
        userId: req.user.id,
      });
      throw new NotFoundError('calendar_item', id);
    }

    // Check authorization
    checkCalendarAccess(existingItem, req.user, 'update');

    // Build update data
    const updates = { status };

    // If marking as published, record the timestamp and optional URL
    if (status === 'published') {
      updates.published_at = new Date().toISOString();
      if (publish_url) {
        updates.publish_url = publish_url;
      }
    }

    // If un-publishing, clear the published_at timestamp
    if (existingItem.status === 'published' && status !== 'published') {
      updates.published_at = null;
      updates.publish_url = null;
    }

    // Perform update
    const { data: item, error } = await db
      .from('content_calendar')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update calendar item status', {
        itemId: id,
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
        attemptedStatus: status,
      });
      throw new DatabaseError('update', `Failed to update status: ${error.message}`);
    }

    logger.info('Calendar item status updated', {
      itemId: id,
      userId: req.user.id,
      previousStatus: existingItem.status,
      newStatus: item.status,
      publishedAt: item.published_at,
    });

    res.json({ item });
  } catch (error) {
    next(error);
  }
});

export default router;
