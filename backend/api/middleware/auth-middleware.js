/**
 * ============================================================================
 * AUTHENTICATION MIDDLEWARE
 * ============================================================================
 * Provides Express middleware for authentication and authorization.
 *
 * Middleware Functions:
 * - requireAuth: Validates JWT from Authorization header, attaches user to req
 * - requireSuperadmin: Requires authenticated user with superadmin role
 * - optionalAuth: Attaches user if token present, but allows anonymous access
 *
 * Usage:
 *   import { requireAuth, requireSuperadmin } from './middleware/auth-middleware.js';
 *   router.get('/protected', requireAuth, handler);
 *   router.get('/admin', requireAuth, requireSuperadmin, handler);
 *
 * Request object after auth:
 *   req.user = {
 *     id: 'uuid',
 *     email: 'user@example.com',
 *     role: 'user' | 'superadmin'
 *   }
 * ============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import { AuthenticationError, AuthorizationError } from '../../lib/errors.js';
import logger from '../../lib/logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

// Superadmin email (hardcoded as per requirements)
const SUPERADMIN_EMAIL = 'hazel@theclever.io';

// ============================================================================
// SUPABASE AUTH CLIENT
// ============================================================================

/**
 * Supabase client configured for auth verification.
 * Uses the service role key to validate tokens and fetch user data.
 */
let supabaseAuth = null;

/**
 * Gets or creates the Supabase auth client (lazy initialization).
 * This prevents errors during module import if env vars aren't set.
 * @returns {Object} Supabase client instance
 */
function getSupabaseAuth() {
  if (!supabaseAuth) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      logger.error('Auth middleware: Missing Supabase configuration', {
        hasUrl: !!SUPABASE_URL,
        hasKey: !!SUPABASE_SERVICE_KEY,
      });
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set for authentication');
    }

    supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseAuth;
}

// ============================================================================
// TOKEN EXTRACTION HELPER
// ============================================================================

/**
 * Extracts JWT token from the Authorization header.
 * Supports both "Bearer <token>" and raw token formats.
 *
 * @param {Object} req - Express request object
 * @returns {string|null} JWT token or null if not present
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // Handle "Bearer <token>" format (standard OAuth 2.0)
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // Handle raw token format (less common but supported)
  return authHeader.trim();
}

// ============================================================================
// USER PROFILE HELPER
// ============================================================================

/**
 * Fetches user profile from database.
 * Creates profile if it doesn't exist (handles race conditions on signup).
 *
 * @param {string} userId - User UUID from Supabase auth
 * @param {string} email - User email for profile creation
 * @returns {Promise<Object>} User profile with role
 */
async function getUserProfile(userId, email) {
  const db = getSupabaseAuth();

  logger.debug('Auth middleware: Fetching user profile', { userId, email });

  // Try to get existing profile
  const { data: profile, error } = await db
    .from('user_profiles')
    .select('id, email, role, display_name')
    .eq('id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned (not found) - that's ok, we'll create it
    logger.error('Auth middleware: Error fetching user profile', {
      userId,
      error: error.message,
      errorCode: error.code,
    });
    throw new AuthenticationError('Failed to verify user profile');
  }

  // Profile exists - return it
  if (profile) {
    logger.debug('Auth middleware: User profile found', {
      userId,
      role: profile.role,
    });
    return profile;
  }

  // Profile doesn't exist - create it (handles race condition where trigger hasn't fired yet)
  logger.info('Auth middleware: Creating missing user profile', { userId, email });

  const role = email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase() ? 'superadmin' : 'user';

  const { data: newProfile, error: insertError } = await db
    .from('user_profiles')
    .insert({
      id: userId,
      email: email,
      role: role,
      display_name: email.split('@')[0],
    })
    .select()
    .single();

  if (insertError) {
    // If insert fails, it might be a race condition - try selecting again
    logger.warn('Auth middleware: Profile insert failed, retrying select', {
      userId,
      error: insertError.message,
    });

    const { data: retryProfile } = await db
      .from('user_profiles')
      .select('id, email, role, display_name')
      .eq('id', userId)
      .single();

    if (retryProfile) {
      return retryProfile;
    }

    throw new AuthenticationError('Failed to create user profile');
  }

  logger.info('Auth middleware: User profile created', {
    userId,
    email,
    role: newProfile.role,
  });

  return newProfile;
}

// ============================================================================
// MIDDLEWARE: requireAuth
// ============================================================================

/**
 * Middleware that requires valid authentication.
 * Validates JWT from Authorization header and attaches user to request.
 *
 * After this middleware:
 *   req.user = { id, email, role, display_name }
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function requireAuth(req, res, next) {
  try {
    // Extract token from Authorization header
    const token = extractToken(req);

    if (!token) {
      logger.debug('Auth middleware: No authorization token provided', {
        path: req.path,
        method: req.method,
      });
      throw new AuthenticationError('No authentication token provided');
    }

    // Verify token with Supabase
    const db = getSupabaseAuth();
    const { data: { user }, error } = await db.auth.getUser(token);

    if (error || !user) {
      logger.warn('Auth middleware: Token verification failed', {
        path: req.path,
        error: error?.message || 'No user returned',
      });
      throw new AuthenticationError('Invalid or expired token');
    }

    // Fetch user profile (includes role)
    const profile = await getUserProfile(user.id, user.email);

    // Attach user info to request for use in route handlers
    req.user = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      display_name: profile.display_name,
      // Include the raw token for any downstream Supabase operations
      token: token,
    };

    // Update last login time (fire and forget - don't wait)
    db.from('user_profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(() => {})
      .catch(err => {
        logger.debug('Auth middleware: Failed to update last_login_at', {
          userId: user.id,
          error: err.message,
        });
      });

    logger.debug('Auth middleware: Authentication successful', {
      userId: user.id,
      email: user.email,
      role: profile.role,
      path: req.path,
    });

    next();
  } catch (error) {
    // If it's already one of our custom errors, pass it through
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      next(error);
      return;
    }

    // Log unexpected errors and convert to AuthenticationError
    logger.error('Auth middleware: Unexpected error during authentication', {
      error: error.message,
      stack: error.stack,
    });
    next(new AuthenticationError('Authentication failed'));
  }
}

// ============================================================================
// MIDDLEWARE: requireSuperadmin
// ============================================================================

/**
 * Middleware that requires superadmin role.
 * Must be used AFTER requireAuth middleware.
 *
 * @param {Object} req - Express request object (must have req.user from requireAuth)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function requireSuperadmin(req, res, next) {
  // Ensure requireAuth ran first
  if (!req.user) {
    logger.error('Auth middleware: requireSuperadmin called without prior requireAuth');
    return next(new AuthenticationError('Authentication required'));
  }

  // Check for superadmin role
  if (req.user.role !== 'superadmin') {
    logger.warn('Auth middleware: Superadmin access denied', {
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      path: req.path,
      method: req.method,
    });

    return next(new AuthorizationError(
      'admin',
      'This resource requires superadmin privileges',
      'superadmin'
    ));
  }

  logger.debug('Auth middleware: Superadmin access granted', {
    userId: req.user.id,
    path: req.path,
  });

  next();
}

// ============================================================================
// MIDDLEWARE: optionalAuth
// ============================================================================

/**
 * Middleware that performs optional authentication.
 * If a valid token is present, attaches user to request.
 * If no token or invalid token, continues without error (req.user will be null).
 *
 * Useful for routes that should work for both authenticated and anonymous users,
 * but provide enhanced features for authenticated users.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);

    // No token - continue as anonymous
    if (!token) {
      req.user = null;
      return next();
    }

    // Verify token with Supabase
    const db = getSupabaseAuth();
    const { data: { user }, error } = await db.auth.getUser(token);

    // Invalid token - continue as anonymous (don't error)
    if (error || !user) {
      req.user = null;
      logger.debug('Auth middleware (optional): Invalid token, continuing as anonymous', {
        path: req.path,
        error: error?.message,
      });
      return next();
    }

    // Valid token - fetch profile and attach user
    const profile = await getUserProfile(user.id, user.email);
    req.user = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      display_name: profile.display_name,
      token: token,
    };

    logger.debug('Auth middleware (optional): User authenticated', {
      userId: user.id,
      path: req.path,
    });

    next();
  } catch (error) {
    // For optional auth, we don't fail on errors - just continue as anonymous
    logger.warn('Auth middleware (optional): Error during authentication, continuing as anonymous', {
      error: error.message,
      path: req.path,
    });
    req.user = null;
    next();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  requireAuth,
  requireSuperadmin,
  optionalAuth,
};
