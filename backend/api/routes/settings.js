/**
 * ============================================================================
 * USER SETTINGS ROUTES
 * ============================================================================
 * API endpoints for managing user-specific settings.
 * Each user has their own settings for content generation customization.
 *
 * Routes:
 * GET  /api/settings         - Get current user's settings
 * PUT  /api/settings         - Update current user's settings
 *
 * Settings Structure:
 * - therapist_profile: Creator/host profile info
 * - podcast_info: Show/podcast details
 * - voice_guidelines: AI writing style preferences
 * - seo_defaults: SEO and marketing defaults
 *
 * Note: These settings are user-scoped. The previous /api/evergreen
 * endpoint remains for system defaults (superadmin only).
 * ============================================================================
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../middleware/auth-middleware.js';
import { ValidationError, DatabaseError, NotFoundError } from '../../lib/errors.js';
import logger from '../../lib/logger.js';

const router = Router();

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

// ============================================================================
// SUPABASE CLIENT (lazy initialization)
// ============================================================================

let supabaseClient = null;

/**
 * Gets or creates the Supabase client.
 * @returns {Object} Supabase client instance
 */
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
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates URL format.
 * @param {string} url - URL to validate
 * @param {string} fieldName - Field name for error message
 * @throws {ValidationError} If URL is invalid
 */
function validateUrl(url, fieldName) {
  if (!url) return; // URLs are optional

  try {
    new URL(url);
  } catch {
    throw new ValidationError(fieldName, 'Invalid URL format');
  }
}

/**
 * Validates settings section structure.
 * @param {Object} section - Settings section to validate
 * @param {string} sectionName - Section name for logging
 */
function validateSettingsSection(section, sectionName) {
  if (section === undefined) return; // Section is optional

  if (typeof section !== 'object' || section === null || Array.isArray(section)) {
    throw new ValidationError(sectionName, 'Must be a JSON object');
  }
}

/**
 * Validates therapist profile data.
 * @param {Object} profile - Therapist profile object
 */
function validateTherapistProfile(profile) {
  validateSettingsSection(profile, 'therapist_profile');

  if (profile) {
    // Validate website URL if present
    if (profile.website) {
      validateUrl(profile.website, 'therapist_profile.website');
    }

    // Validate social links if present
    if (profile.social_links && typeof profile.social_links === 'object') {
      for (const [platform, url] of Object.entries(profile.social_links)) {
        if (url) validateUrl(url, `therapist_profile.social_links.${platform}`);
      }
    }
  }
}

/**
 * Validates podcast info data.
 * @param {Object} info - Podcast info object
 */
function validatePodcastInfo(info) {
  validateSettingsSection(info, 'podcast_info');

  // Validate content_pillars is array if present
  if (info && info.content_pillars !== undefined) {
    if (!Array.isArray(info.content_pillars)) {
      throw new ValidationError('podcast_info.content_pillars', 'Must be an array');
    }
  }
}

/**
 * Validates voice guidelines data.
 * @param {Object} guidelines - Voice guidelines object
 */
function validateVoiceGuidelines(guidelines) {
  validateSettingsSection(guidelines, 'voice_guidelines');

  if (guidelines) {
    // Validate tone is array if present
    if (guidelines.tone !== undefined && !Array.isArray(guidelines.tone)) {
      throw new ValidationError('voice_guidelines.tone', 'Must be an array');
    }

    // Validate examples is array if present
    if (guidelines.examples !== undefined && !Array.isArray(guidelines.examples)) {
      throw new ValidationError('voice_guidelines.examples', 'Must be an array');
    }

    // Validate avoid is array if present
    if (guidelines.avoid !== undefined && !Array.isArray(guidelines.avoid)) {
      throw new ValidationError('voice_guidelines.avoid', 'Must be an array');
    }
  }
}

/**
 * Validates SEO defaults data.
 * @param {Object} defaults - SEO defaults object
 */
function validateSeoDefaults(defaults) {
  validateSettingsSection(defaults, 'seo_defaults');

  if (defaults) {
    // Validate default_hashtags is array if present
    if (defaults.default_hashtags !== undefined && !Array.isArray(defaults.default_hashtags)) {
      throw new ValidationError('seo_defaults.default_hashtags', 'Must be an array');
    }

    // Validate cta_preferences is array if present
    if (defaults.cta_preferences !== undefined && !Array.isArray(defaults.cta_preferences)) {
      throw new ValidationError('seo_defaults.cta_preferences', 'Must be an array');
    }
  }
}

// ============================================================================
// HELPER: Ensure user settings exist
// ============================================================================

/**
 * Ensures user settings exist, creating them if necessary.
 * This handles the case where settings weren't created by trigger.
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User settings
 */
async function ensureUserSettings(userId) {
  const supabase = getSupabase();

  // Try to get existing settings
  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (settings) {
    return settings;
  }

  // Settings don't exist - create them
  if (error && error.code === 'PGRST116') {
    logger.info('Settings: Creating default settings for user', { userId });

    // Try to get defaults from evergreen_content
    const { data: defaults } = await supabase
      .from('evergreen_content')
      .select('therapist_profile, podcast_info, voice_guidelines, seo_defaults')
      .limit(1)
      .single();

    const { data: newSettings, error: insertError } = await supabase
      .from('user_settings')
      .insert({
        user_id: userId,
        therapist_profile: defaults?.therapist_profile || {},
        podcast_info: defaults?.podcast_info || {},
        voice_guidelines: defaults?.voice_guidelines || {},
        seo_defaults: defaults?.seo_defaults || {},
      })
      .select()
      .single();

    if (insertError) {
      // Race condition - try to get again
      const { data: retrySettings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (retrySettings) return retrySettings;

      logger.error('Settings: Failed to create user settings', {
        userId,
        error: insertError.message,
      });
      throw new DatabaseError('insert', 'Failed to create user settings');
    }

    return newSettings;
  }

  // Some other error
  if (error) {
    logger.error('Settings: Error fetching user settings', {
      userId,
      error: error.message,
    });
    throw new DatabaseError('select', 'Failed to fetch user settings');
  }

  return settings;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/settings
 * Gets the current user's settings.
 *
 * Response:
 *   {
 *     settings: {
 *       therapist_profile: {...},
 *       podcast_info: {...},
 *       voice_guidelines: {...},
 *       seo_defaults: {...}
 *     }
 *   }
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    logger.debug('Settings: Fetching user settings', {
      userId: req.user.id,
    });

    const settings = await ensureUserSettings(req.user.id);

    logger.debug('Settings: User settings retrieved', {
      userId: req.user.id,
      hasTherapistProfile: !!settings.therapist_profile && Object.keys(settings.therapist_profile).length > 0,
      hasPodcastInfo: !!settings.podcast_info && Object.keys(settings.podcast_info).length > 0,
    });

    res.json({
      settings: {
        therapist_profile: settings.therapist_profile || {},
        podcast_info: settings.podcast_info || {},
        voice_guidelines: settings.voice_guidelines || {},
        seo_defaults: settings.seo_defaults || {},
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/settings
 * Updates the current user's settings.
 * Only provided sections are updated (partial update supported).
 *
 * Request body:
 *   {
 *     therapist_profile?: {...},
 *     podcast_info?: {...},
 *     voice_guidelines?: {...},
 *     seo_defaults?: {...}
 *   }
 *
 * Response:
 *   { settings: {...} }
 */
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const { therapist_profile, podcast_info, voice_guidelines, seo_defaults } = req.body;

    // Validate all provided sections
    validateTherapistProfile(therapist_profile);
    validatePodcastInfo(podcast_info);
    validateVoiceGuidelines(voice_guidelines);
    validateSeoDefaults(seo_defaults);

    logger.info('Settings: Update requested', {
      userId: req.user.id,
      sectionsToUpdate: [
        therapist_profile !== undefined && 'therapist_profile',
        podcast_info !== undefined && 'podcast_info',
        voice_guidelines !== undefined && 'voice_guidelines',
        seo_defaults !== undefined && 'seo_defaults',
      ].filter(Boolean),
    });

    // Build update object (only include provided sections)
    const updates = {};
    if (therapist_profile !== undefined) updates.therapist_profile = therapist_profile;
    if (podcast_info !== undefined) updates.podcast_info = podcast_info;
    if (voice_guidelines !== undefined) updates.voice_guidelines = voice_guidelines;
    if (seo_defaults !== undefined) updates.seo_defaults = seo_defaults;

    // If no updates provided, just return current settings
    if (Object.keys(updates).length === 0) {
      const settings = await ensureUserSettings(req.user.id);
      return res.json({ settings });
    }

    // Ensure settings exist before updating
    await ensureUserSettings(req.user.id);

    // Update settings
    const supabase = getSupabase();
    const { data: settings, error } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      logger.error('Settings: Update failed', {
        userId: req.user.id,
        error: error.message,
        errorCode: error.code,
      });
      throw new DatabaseError('update', 'Failed to update settings');
    }

    logger.info('Settings: Updated successfully', {
      userId: req.user.id,
      updatedSections: Object.keys(updates),
    });

    res.json({
      settings: {
        therapist_profile: settings.therapist_profile || {},
        podcast_info: settings.podcast_info || {},
        voice_guidelines: settings.voice_guidelines || {},
        seo_defaults: settings.seo_defaults || {},
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

export default router;
