/**
 * ============================================================================
 * EVERGREEN CONTENT ROUTES
 * ============================================================================
 * API endpoints for managing therapist profile, podcast info, and voice guidelines.
 *
 * Routes:
 * GET /api/evergreen - Get all evergreen content
 * PUT /api/evergreen - Update evergreen content
 * ============================================================================
 */

import { Router } from 'express';
import { evergreenRepo } from '../../lib/supabase-client.js';
import { ValidationError } from '../../lib/errors.js';
import logger from '../../lib/logger.js';

const router = Router();

/**
 * GET /api/evergreen
 * Get all evergreen content (therapist profile, podcast info, etc.)
 */
router.get('/', async (req, res, next) => {
  try {
    const evergreen = await evergreenRepo.get();

    res.json({ evergreen });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/evergreen
 * Update evergreen content
 * Can update partial sections (only what's provided)
 */
router.put('/', async (req, res, next) => {
  try {
    const {
      therapist_profile,
      podcast_info,
      voice_guidelines,
      seo_defaults,
    } = req.body;

    // Build updates object with only provided fields
    const updates = {};

    if (therapist_profile !== undefined) {
      validateTherapistProfile(therapist_profile);
      updates.therapist_profile = therapist_profile;
    }

    if (podcast_info !== undefined) {
      validatePodcastInfo(podcast_info);
      updates.podcast_info = podcast_info;
    }

    if (voice_guidelines !== undefined) {
      updates.voice_guidelines = voice_guidelines;
    }

    if (seo_defaults !== undefined) {
      updates.seo_defaults = seo_defaults;
    }

    // Must have at least one field to update
    if (Object.keys(updates).length === 0) {
      throw new ValidationError('body', 'No valid fields to update');
    }

    const evergreen = await evergreenRepo.update(updates);

    logger.info('Evergreen content updated', {
      sections: Object.keys(updates),
    });

    res.json({
      evergreen,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateTherapistProfile(profile) {
  if (typeof profile !== 'object') {
    throw new ValidationError('therapist_profile', 'Must be an object');
  }

  // Name and credentials are required if profile is being set
  if (profile.name !== undefined && !profile.name) {
    throw new ValidationError('therapist_profile.name', 'Name is required');
  }

  // Validate website URL if provided
  if (profile.website) {
    try {
      new URL(profile.website);
    } catch {
      throw new ValidationError('therapist_profile.website', 'Invalid URL format');
    }
  }
}

function validatePodcastInfo(info) {
  if (typeof info !== 'object') {
    throw new ValidationError('podcast_info', 'Must be an object');
  }

  // Name is required if podcast info is being set
  if (info.name !== undefined && !info.name) {
    throw new ValidationError('podcast_info.name', 'Podcast name is required');
  }

  // Validate content_pillars is array if provided
  if (info.content_pillars && !Array.isArray(info.content_pillars)) {
    throw new ValidationError('podcast_info.content_pillars', 'Must be an array');
  }
}

export default router;
