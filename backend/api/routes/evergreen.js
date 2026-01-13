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
    logger.info('📥 GET /api/evergreen - Fetching evergreen content');

    const evergreen = await evergreenRepo.get();

    logger.info('📤 GET /api/evergreen - Success', {
      hasTherapistProfile: !!evergreen.therapist_profile && Object.keys(evergreen.therapist_profile).length > 0,
      hasPodcastInfo: !!evergreen.podcast_info && Object.keys(evergreen.podcast_info).length > 0,
      hasVoiceGuidelines: !!evergreen.voice_guidelines && Object.keys(evergreen.voice_guidelines).length > 0,
      hasSeoDefaults: !!evergreen.seo_defaults && Object.keys(evergreen.seo_defaults).length > 0,
    });

    res.json({ evergreen });
  } catch (error) {
    logger.error('❌ GET /api/evergreen - Failed', {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    });
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
    logger.info('📥 PUT /api/evergreen - Received update request', {
      contentType: req.headers['content-type'],
      bodyKeys: req.body ? Object.keys(req.body) : [],
      hasTherapistProfile: req.body?.therapist_profile !== undefined,
      hasPodcastInfo: req.body?.podcast_info !== undefined,
      hasVoiceGuidelines: req.body?.voice_guidelines !== undefined,
      hasSeoDefaults: req.body?.seo_defaults !== undefined,
    });

    // Log detailed body info for debugging
    if (req.body) {
      logger.debug('PUT /api/evergreen - Request body details', {
        therapistProfileKeys: req.body.therapist_profile ? Object.keys(req.body.therapist_profile) : null,
        podcastInfoKeys: req.body.podcast_info ? Object.keys(req.body.podcast_info) : null,
        voiceGuidelinesKeys: req.body.voice_guidelines ? Object.keys(req.body.voice_guidelines) : null,
        seoDefaultsKeys: req.body.seo_defaults ? Object.keys(req.body.seo_defaults) : null,
      });
    } else {
      logger.warn('PUT /api/evergreen - Request body is empty or undefined');
    }

    const {
      therapist_profile,
      podcast_info,
      voice_guidelines,
      seo_defaults,
    } = req.body;

    // Build updates object with only provided fields
    const updates = {};

    if (therapist_profile !== undefined) {
      logger.debug('Validating therapist_profile', {
        fields: Object.keys(therapist_profile),
        name: therapist_profile.name,
        hasWebsite: !!therapist_profile.website,
      });
      validateTherapistProfile(therapist_profile);
      updates.therapist_profile = therapist_profile;
      logger.debug('therapist_profile validation passed');
    }

    if (podcast_info !== undefined) {
      logger.debug('Validating podcast_info', {
        fields: Object.keys(podcast_info),
        name: podcast_info.name,
        contentPillarsCount: Array.isArray(podcast_info.content_pillars) ? podcast_info.content_pillars.length : 0,
      });
      validatePodcastInfo(podcast_info);
      updates.podcast_info = podcast_info;
      logger.debug('podcast_info validation passed');
    }

    if (voice_guidelines !== undefined) {
      logger.debug('Processing voice_guidelines', {
        fields: Object.keys(voice_guidelines),
        toneCount: Array.isArray(voice_guidelines.tone) ? voice_guidelines.tone.length : 0,
        avoidCount: Array.isArray(voice_guidelines.avoid) ? voice_guidelines.avoid.length : 0,
      });
      updates.voice_guidelines = voice_guidelines;
    }

    if (seo_defaults !== undefined) {
      logger.debug('Processing seo_defaults', {
        fields: Object.keys(seo_defaults),
      });
      updates.seo_defaults = seo_defaults;
    }

    // Must have at least one field to update
    if (Object.keys(updates).length === 0) {
      logger.warn('PUT /api/evergreen - No valid fields to update', {
        receivedKeys: Object.keys(req.body || {}),
      });
      throw new ValidationError('body', 'No valid fields to update');
    }

    logger.info('PUT /api/evergreen - Calling evergreenRepo.update', {
      sectionsToUpdate: Object.keys(updates),
    });

    const evergreen = await evergreenRepo.update(updates);

    logger.info('📤 PUT /api/evergreen - Update successful', {
      sectionsUpdated: Object.keys(updates),
      returnedDataId: evergreen?.id,
      updatedAt: evergreen?.updated_at,
    });

    res.json({
      evergreen,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('❌ PUT /api/evergreen - Failed', {
      errorName: error.name,
      errorMessage: error.message,
      errorField: error.field,
      stack: error.stack,
    });
    next(error);
  }
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateTherapistProfile(profile) {
  if (typeof profile !== 'object') {
    logger.validationError('therapist_profile', 'Must be an object', typeof profile);
    throw new ValidationError('therapist_profile', 'Must be an object');
  }

  // Name and credentials are required if profile is being set
  if (profile.name !== undefined && !profile.name) {
    logger.validationError('therapist_profile.name', 'Name is required but empty', profile.name);
    throw new ValidationError('therapist_profile.name', 'Name is required');
  }

  // Validate website URL if provided
  if (profile.website) {
    try {
      new URL(profile.website);
    } catch {
      logger.validationError('therapist_profile.website', 'Invalid URL format', profile.website);
      throw new ValidationError('therapist_profile.website', 'Invalid URL format');
    }
  }
}

function validatePodcastInfo(info) {
  if (typeof info !== 'object') {
    logger.validationError('podcast_info', 'Must be an object', typeof info);
    throw new ValidationError('podcast_info', 'Must be an object');
  }

  // Name is required if podcast info is being set
  if (info.name !== undefined && !info.name) {
    logger.validationError('podcast_info.name', 'Podcast name is required but empty', info.name);
    throw new ValidationError('podcast_info.name', 'Podcast name is required');
  }

  // Validate content_pillars is array if provided
  if (info.content_pillars && !Array.isArray(info.content_pillars)) {
    logger.validationError('podcast_info.content_pillars', 'Must be an array', typeof info.content_pillars);
    throw new ValidationError('podcast_info.content_pillars', 'Must be an array');
  }
}

export default router;
