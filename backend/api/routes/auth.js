/**
 * ============================================================================
 * AUTHENTICATION ROUTES
 * ============================================================================
 * API endpoints for user authentication using Supabase Magic Link.
 *
 * Routes:
 * POST  /api/auth/magic-link     - Send magic link email to user
 * GET   /api/auth/me             - Get current authenticated user
 * POST  /api/auth/logout         - Invalidate current session
 * PUT   /api/auth/profile        - Update user profile (display name)
 *
 * Authentication Flow:
 * 1. Frontend calls POST /api/auth/magic-link with email
 * 2. Supabase sends magic link email to user
 * 3. User clicks link, redirected to frontend /auth/callback
 * 4. Frontend exchanges code for session using Supabase client
 * 5. Frontend stores session and includes token in Authorization header
 * 6. Backend validates token via requireAuth middleware
 *
 * Note: Most auth logic happens client-side with Supabase JS SDK.
 * These routes provide backend support and user management.
 * ============================================================================
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../middleware/auth-middleware.js';
import { ValidationError, DatabaseError } from '../../lib/errors.js';
import logger from '../../lib/logger.js';

const router = Router();

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Superadmin email (for logging/auditing)
const SUPERADMIN_EMAIL = 'hazel@theclever.io';

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
 * Validates email format.
 * @param {string} email - Email to validate
 * @throws {ValidationError} If email is invalid
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new ValidationError('email', 'Email is required');
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    throw new ValidationError('email', 'Invalid email format');
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/auth/magic-link
 * Sends a magic link email to the specified address.
 * The user clicks the link to authenticate (passwordless login).
 *
 * Request body:
 *   { email: "user@example.com" }
 *
 * Response:
 *   { success: true, message: "Magic link sent" }
 */
router.post('/magic-link', async (req, res, next) => {
  try {
    const { email } = req.body;

    // Validate email
    validateEmail(email);
    const normalizedEmail = email.trim().toLowerCase();

    logger.info('Auth: Magic link requested', {
      email: normalizedEmail,
      isSuperadmin: normalizedEmail === SUPERADMIN_EMAIL.toLowerCase(),
    });

    // Send magic link via Supabase
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        // Redirect URL after clicking magic link
        emailRedirectTo: `${FRONTEND_URL}/auth/callback`,
      },
    });

    if (error) {
      logger.error('Auth: Failed to send magic link', {
        email: normalizedEmail,
        error: error.message,
        errorStatus: error.status,
      });

      // Don't expose internal error details to client
      throw new ValidationError('email', 'Failed to send magic link. Please try again.');
    }

    logger.info('Auth: Magic link sent successfully', {
      email: normalizedEmail,
    });

    res.json({
      success: true,
      message: 'Magic link sent! Check your email inbox.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Returns the current authenticated user's information.
 * Requires valid authentication token in Authorization header.
 *
 * Response:
 *   {
 *     user: {
 *       id: "uuid",
 *       email: "user@example.com",
 *       role: "user" | "superadmin",
 *       display_name: "John",
 *       onboarding_complete: boolean,
 *       onboarding_percent: number
 *     }
 *   }
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    logger.debug('Auth: User info requested', {
      userId: req.user.id,
    });

    // Fetch brand discovery status to determine onboarding completion
    const supabase = getSupabase();
    const { data: brandDiscovery } = await supabase
      .from('brand_discovery')
      .select('overall_completion_percent, brand_dna')
      .eq('user_id', req.user.id)
      .single();

    // Consider onboarding complete if:
    // - At least 2 modules are done (50% with weighted scoring means roughly 2 modules)
    // - OR brand_dna has been generated
    const completionPercent = brandDiscovery?.overall_completion_percent || 0;
    const hasBrandDna = !!brandDiscovery?.brand_dna;
    const onboardingComplete = hasBrandDna || completionPercent >= 50;

    // User info is already attached by requireAuth middleware
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        display_name: req.user.display_name,
        is_superadmin: req.user.role === 'superadmin',
        onboarding_complete: onboardingComplete,
        onboarding_percent: completionPercent,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Invalidates the current session.
 * Note: Client should also clear local storage/session state.
 *
 * Response:
 *   { success: true, message: "Logged out successfully" }
 */
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    logger.info('Auth: User logout', {
      userId: req.user.id,
      email: req.user.email,
    });

    // Sign out via Supabase (invalidates the token)
    const supabase = getSupabase();
    const { error } = await supabase.auth.admin.signOut(req.user.token);

    if (error) {
      // Log but don't fail - client should clear session anyway
      logger.warn('Auth: Server-side logout warning', {
        userId: req.user.id,
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/auth/profile
 * Updates the current user's profile information.
 * Currently only allows updating display_name.
 *
 * Request body:
 *   { display_name: "New Name" }
 *
 * Response:
 *   { profile: { id, email, role, display_name } }
 */
router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const { display_name } = req.body;

    // Validate display_name if provided
    if (display_name !== undefined) {
      if (typeof display_name !== 'string') {
        throw new ValidationError('display_name', 'Must be a string');
      }
      if (display_name.length > 100) {
        throw new ValidationError('display_name', 'Must be 100 characters or less');
      }
    }

    logger.info('Auth: Profile update requested', {
      userId: req.user.id,
      fields: Object.keys(req.body),
    });

    // Build update object (only allowed fields)
    const updates = {};
    if (display_name !== undefined) {
      updates.display_name = display_name.trim();
    }

    // If no valid updates, return current profile
    if (Object.keys(updates).length === 0) {
      return res.json({
        profile: {
          id: req.user.id,
          email: req.user.email,
          role: req.user.role,
          display_name: req.user.display_name,
        },
      });
    }

    // Update profile in database
    const supabase = getSupabase();
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      logger.error('Auth: Profile update failed', {
        userId: req.user.id,
        error: error.message,
      });
      throw new DatabaseError('update', 'Failed to update profile');
    }

    logger.info('Auth: Profile updated successfully', {
      userId: req.user.id,
      updatedFields: Object.keys(updates),
    });

    res.json({
      profile: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        display_name: profile.display_name,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/users
 * Lists all users (superadmin only).
 * Useful for user management in admin dashboard.
 *
 * Query params:
 *   limit: number (default 50)
 *   offset: number (default 0)
 *
 * Response:
 *   { users: [...], total: number }
 */
router.get('/users', requireAuth, async (req, res, next) => {
  try {
    // Only superadmins can list users
    if (req.user.role !== 'superadmin') {
      throw new ValidationError('authorization', 'Only superadmins can list users');
    }

    const { limit = 50, offset = 0 } = req.query;

    logger.info('Auth: User list requested by superadmin', {
      requesterId: req.user.id,
    });

    const supabase = getSupabase();
    const { data: users, error, count } = await supabase
      .from('user_profiles')
      .select('id, email, role, display_name, created_at, last_login_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) {
      logger.error('Auth: Failed to list users', {
        error: error.message,
      });
      throw new DatabaseError('select', 'Failed to list users');
    }

    res.json({
      users: users || [],
      total: count || 0,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

export default router;
