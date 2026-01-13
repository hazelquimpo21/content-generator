# User Authentication & Superadmin Implementation Plan

## Overview

This document provides a comprehensive implementation plan for adding multi-user authentication with Supabase Magic Link and a superadmin system to the Podcast-to-Content Pipeline application.

**Key Requirements:**
- Multi-user support with profiles
- Supabase Magic Link authentication (passwordless)
- Superadmin role (hazel@theclever.io) with exclusive admin page access
- Admin indicator bar for superadmin users
- User-scoped data (episodes, settings per user)
- Comprehensive error logging and code comments

---

## Architecture Decisions

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTHENTICATION FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. User visits app (unauthenticated)                                      │
│      │                                                                      │
│      ▼                                                                      │
│   ┌─────────────────┐                                                       │
│   │  Login Page     │  User enters email                                    │
│   │  /login         │                                                       │
│   └────────┬────────┘                                                       │
│            │                                                                │
│            ▼                                                                │
│   2. POST /api/auth/magic-link                                              │
│      │                                                                      │
│      ├─── Supabase sends magic link email                                   │
│      │                                                                      │
│      ▼                                                                      │
│   ┌─────────────────┐                                                       │
│   │  Check Email    │  User clicks link in email                            │
│   │  Page           │                                                       │
│   └────────┬────────┘                                                       │
│            │                                                                │
│            ▼                                                                │
│   3. /auth/callback?token=xxx (Supabase redirect)                           │
│      │                                                                      │
│      ├─── Supabase verifies token                                           │
│      ├─── Creates/updates user session                                      │
│      ├─── Creates user profile if first login (via DB trigger)              │
│      │                                                                      │
│      ▼                                                                      │
│   ┌─────────────────┐                                                       │
│   │  Dashboard      │  User is now authenticated                            │
│   │  /              │  Session stored in localStorage                       │
│   └─────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### User Roles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER ROLES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────────────────────────────────┐                              │
│   │          SUPERADMIN                       │                              │
│   │          hazel@theclever.io               │                              │
│   ├──────────────────────────────────────────┤                              │
│   │  • Can access ALL pages including /admin  │                              │
│   │  • Sees admin indicator bar at top        │                              │
│   │  • Can view all users' episodes           │                              │
│   │  • Can manage system-wide settings        │                              │
│   │  • Can view cost/performance analytics    │                              │
│   │  • Can retry failed stages for any user   │                              │
│   └──────────────────────────────────────────┘                              │
│                        │                                                    │
│                        │ inherits                                           │
│                        ▼                                                    │
│   ┌──────────────────────────────────────────┐                              │
│   │          USER (Standard)                  │                              │
│   ├──────────────────────────────────────────┤                              │
│   │  • Can access Dashboard                   │                              │
│   │  • Can access Settings (own profile)      │                              │
│   │  • Can create/view/edit OWN episodes      │                              │
│   │  • Can view processing status             │                              │
│   │  • Can review generated content           │                              │
│   │  • CANNOT access /admin page              │                              │
│   └──────────────────────────────────────────┘                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Scoping Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA SCOPING                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USER-SCOPED DATA (isolated per user):                                      │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │  • episodes         → user_id foreign key                         │      │
│  │  • stage_outputs    → via episode_id (cascades from episodes)     │      │
│  │  • api_usage_log    → via episode_id (cascades from episodes)     │      │
│  │  • user_settings    → NEW TABLE: per-user evergreen content       │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  SYSTEM-WIDE DATA (shared/admin-only):                                      │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │  • evergreen_content → Becomes system defaults (optional seed)    │      │
│  │  • system_logs       → Admin-only access                          │      │
│  │  • users             → Supabase auth.users + profiles table       │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  RLS POLICY STRATEGY:                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │  • Users can only SELECT/INSERT/UPDATE/DELETE their own data      │      │
│  │  • Superadmin can SELECT all data (via is_superadmin check)       │      │
│  │  • Service role bypasses RLS for backend operations               │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema Updates

### 1.1 Create User Profiles Table

**File:** `supabase/migrations/002_user_auth.sql`

```sql
-- ============================================================================
-- USER PROFILES TABLE
-- ============================================================================
-- Extends Supabase auth.users with application-specific profile data.
-- Created automatically via trigger when user first signs up.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  -- Primary key matches Supabase auth.users.id for easy joins
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- User email (denormalized from auth.users for convenience)
  email TEXT NOT NULL,

  -- Display name (optional, can be set by user)
  display_name TEXT,

  -- Role: 'user' (default) or 'superadmin'
  -- Only hazel@theclever.io should have 'superadmin'
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- Index for role-based queries (admin lookups)
CREATE INDEX idx_user_profiles_role ON user_profiles(role);

-- Index for email lookups
CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- Trigger to update updated_at on changes
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- AUTO-CREATE PROFILE ON USER SIGNUP
-- ============================================================================
-- This trigger fires when a new user is created in auth.users.
-- It automatically creates a corresponding user_profiles row.
-- The superadmin role is assigned if the email matches hazel@theclever.io.
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    -- Assign superadmin role if email matches, otherwise 'user'
    CASE WHEN NEW.email = 'hazel@theclever.io' THEN 'superadmin' ELSE 'user' END,
    -- Default display name from email prefix
    SPLIT_PART(NEW.email, '@', 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

### 1.2 Create User Settings Table

**File:** `supabase/migrations/002_user_auth.sql` (continued)

```sql
-- ============================================================================
-- USER SETTINGS TABLE
-- ============================================================================
-- Per-user evergreen content (therapist profile, podcast info, voice guidelines).
-- Each user has their own settings for content generation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign key to user_profiles
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Therapist/creator profile information
  -- Example: { "name": "Dr. Emily Carter", "credentials": "PhD, LMFT", "bio": "...", "website": "..." }
  therapist_profile JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Podcast/show information
  -- Example: { "name": "The Mindful Therapist", "tagline": "...", "target_audience": "..." }
  podcast_info JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Voice and tone guidelines for AI generation
  -- Example: { "tone": ["warm", "professional"], "examples": ["..."], "avoid": ["..."] }
  voice_guidelines JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- SEO and marketing preferences
  -- Example: { "default_hashtags": ["#therapy"], "cta_preferences": ["..."] }
  seo_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Each user can only have one settings row
  UNIQUE(user_id)
);

-- Index for user lookups
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);

-- Trigger for updated_at
CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- AUTO-CREATE SETTINGS ON PROFILE CREATION
-- ============================================================================
-- When a user profile is created, automatically create default settings.
-- Optionally copies from evergreen_content as defaults.
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user_settings()
RETURNS TRIGGER AS $$
DECLARE
  default_settings RECORD;
BEGIN
  -- Try to get defaults from evergreen_content (system defaults)
  SELECT
    therapist_profile,
    podcast_info,
    voice_guidelines,
    seo_defaults
  INTO default_settings
  FROM public.evergreen_content
  LIMIT 1;

  -- Insert user settings with defaults (or empty if no system defaults)
  INSERT INTO public.user_settings (user_id, therapist_profile, podcast_info, voice_guidelines, seo_defaults)
  VALUES (
    NEW.id,
    COALESCE(default_settings.therapist_profile, '{}'::jsonb),
    COALESCE(default_settings.podcast_info, '{}'::jsonb),
    COALESCE(default_settings.voice_guidelines, '{}'::jsonb),
    COALESCE(default_settings.seo_defaults, '{}'::jsonb)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on user_profiles insert
CREATE OR REPLACE TRIGGER on_user_profile_created
  AFTER INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_settings();
```

### 1.3 Update Episodes Table for User Scoping

**File:** `supabase/migrations/002_user_auth.sql` (continued)

```sql
-- ============================================================================
-- ADD USER_ID TO EPISODES TABLE
-- ============================================================================
-- Links each episode to the user who created it.
-- Enables per-user data isolation via RLS.
-- ============================================================================

-- Add user_id column to episodes
ALTER TABLE episodes
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE;

-- Index for user-scoped queries
CREATE INDEX IF NOT EXISTS idx_episodes_user_id ON episodes(user_id);

-- Composite index for common query pattern (user + status)
CREATE INDEX IF NOT EXISTS idx_episodes_user_status ON episodes(user_id, status);
```

### 1.4 Row-Level Security Policies

**File:** `supabase/migrations/002_user_auth.sql` (continued)

```sql
-- ============================================================================
-- ROW-LEVEL SECURITY POLICIES
-- ============================================================================
-- These policies enforce data isolation:
-- - Users can only access their own data
-- - Superadmins can access all data
-- - Service role bypasses RLS (for backend operations)
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTION: Check if current user is superadmin
-- ============================================================================
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'superadmin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- USER_PROFILES POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Superadmin can view all profiles" ON user_profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile (except role)
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()));

-- Superadmins can view all profiles
CREATE POLICY "Superadmin can view all profiles" ON user_profiles
  FOR SELECT USING (is_superadmin());

-- ============================================================================
-- USER_SETTINGS POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
DROP POLICY IF EXISTS "Superadmin can view all settings" ON user_settings;

-- Users can view their own settings
CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Superadmins can view all settings
CREATE POLICY "Superadmin can view all settings" ON user_settings
  FOR SELECT USING (is_superadmin());

-- ============================================================================
-- EPISODES POLICIES
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON episodes;
DROP POLICY IF EXISTS "Allow all for service role" ON episodes;

-- Users can view their own episodes
CREATE POLICY "Users can view own episodes" ON episodes
  FOR SELECT USING (auth.uid() = user_id OR is_superadmin());

-- Users can insert their own episodes
CREATE POLICY "Users can insert own episodes" ON episodes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own episodes
CREATE POLICY "Users can update own episodes" ON episodes
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own episodes
CREATE POLICY "Users can delete own episodes" ON episodes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- STAGE_OUTPUTS POLICIES
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON stage_outputs;
DROP POLICY IF EXISTS "Allow all for service role" ON stage_outputs;

-- Users can view stages for their own episodes
CREATE POLICY "Users can view own stage outputs" ON stage_outputs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = stage_outputs.episode_id
      AND (episodes.user_id = auth.uid() OR is_superadmin())
    )
  );

-- Users can update stages for their own episodes
CREATE POLICY "Users can update own stage outputs" ON stage_outputs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = stage_outputs.episode_id
      AND episodes.user_id = auth.uid()
    )
  );

-- ============================================================================
-- API_USAGE_LOG POLICIES
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON api_usage_log;
DROP POLICY IF EXISTS "Allow all for service role" ON api_usage_log;

-- Users can view usage logs for their own episodes
CREATE POLICY "Users can view own api usage" ON api_usage_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM episodes
      WHERE episodes.id = api_usage_log.episode_id
      AND (episodes.user_id = auth.uid() OR is_superadmin())
    )
  );

-- Only superadmin can view all usage logs (for admin dashboard)
CREATE POLICY "Superadmin can view all api usage" ON api_usage_log
  FOR SELECT USING (is_superadmin());

-- ============================================================================
-- EVERGREEN_CONTENT POLICIES (System defaults - admin only write)
-- ============================================================================

-- Anyone authenticated can read system defaults
CREATE POLICY "Authenticated users can read evergreen" ON evergreen_content
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only superadmin can update system defaults
CREATE POLICY "Superadmin can update evergreen" ON evergreen_content
  FOR UPDATE USING (is_superadmin());
```

---

## Phase 2: Backend Implementation

### 2.1 Auth Middleware

**File:** `backend/api/middleware/auth-middleware.js` (~200 lines)

```javascript
/**
 * Authentication Middleware
 *
 * Verifies Supabase JWT tokens and attaches user context to requests.
 * Supports both authenticated and public routes via different middlewares.
 *
 * @module middleware/auth-middleware
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../lib/logger.js';
import { AuthenticationError, AuthorizationError } from '../../lib/errors.js';

// Initialize Supabase client for auth verification
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY // Use anon key for auth verification
);

/**
 * Extract and verify JWT token from Authorization header.
 * Attaches user object to req.user if valid.
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Express next function
 * @throws {AuthenticationError} If token is missing or invalid
 */
export async function requireAuth(req, res, next) {
  const correlationId = req.correlationId || 'unknown';

  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or malformed authorization header', {
        correlationId,
        path: req.path,
        hasHeader: !!authHeader
      });
      throw new AuthenticationError('Missing authorization token');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('Token verification failed', {
        correlationId,
        error: error?.message,
        path: req.path
      });
      throw new AuthenticationError('Invalid or expired token');
    }

    // Fetch user profile with role information
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, display_name, role, created_at')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      logger.error('User profile not found', {
        correlationId,
        userId: user.id,
        error: profileError?.message
      });
      throw new AuthenticationError('User profile not found');
    }

    // Attach user context to request
    req.user = {
      id: profile.id,
      email: profile.email,
      displayName: profile.display_name,
      role: profile.role,
      isSuperadmin: profile.role === 'superadmin',
      createdAt: profile.created_at
    };

    // Update last login timestamp (fire and forget)
    supabase
      .from('user_profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(() => {})
      .catch((err) => {
        logger.debug('Failed to update last_login_at', { userId: user.id, error: err.message });
      });

    logger.debug('User authenticated successfully', {
      correlationId,
      userId: profile.id,
      email: profile.email,
      role: profile.role
    });

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        correlationId
      });
    }

    logger.error('Unexpected error in auth middleware', {
      correlationId,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed',
      correlationId
    });
  }
}

/**
 * Middleware to require superadmin role.
 * Must be used AFTER requireAuth middleware.
 *
 * @param {Request} req - Express request (must have req.user)
 * @param {Response} res - Express response
 * @param {Function} next - Express next function
 * @throws {AuthorizationError} If user is not superadmin
 */
export function requireSuperadmin(req, res, next) {
  const correlationId = req.correlationId || 'unknown';

  if (!req.user) {
    logger.error('requireSuperadmin called without req.user', { correlationId });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication context missing',
      correlationId
    });
  }

  if (!req.user.isSuperadmin) {
    logger.warn('Non-superadmin attempted to access admin route', {
      correlationId,
      userId: req.user.id,
      email: req.user.email,
      path: req.path
    });

    return res.status(403).json({
      error: 'Access denied',
      message: 'Superadmin privileges required',
      correlationId
    });
  }

  logger.debug('Superadmin access granted', {
    correlationId,
    userId: req.user.id,
    path: req.path
  });

  next();
}

/**
 * Optional auth middleware - does not fail if no token provided.
 * Useful for routes that work differently for authenticated vs anonymous users.
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Express next function
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  // If token provided, verify it
  try {
    await requireAuth(req, res, next);
  } catch (error) {
    // Token invalid - treat as anonymous
    req.user = null;
    next();
  }
}

export default { requireAuth, requireSuperadmin, optionalAuth };
```

### 2.2 Auth Routes

**File:** `backend/api/routes/auth.js` (~250 lines)

```javascript
/**
 * Authentication Routes
 *
 * Handles magic link authentication flow:
 * - POST /api/auth/magic-link - Send magic link email
 * - POST /api/auth/verify - Verify token (handled by frontend/Supabase)
 * - POST /api/auth/logout - Invalidate session
 * - GET /api/auth/me - Get current user info
 *
 * @module routes/auth
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import logger from '../../lib/logger.js';
import { ValidationError } from '../../lib/errors.js';
import { requireAuth } from '../middleware/auth-middleware.js';

const router = express.Router();

// Supabase client for auth operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * POST /api/auth/magic-link
 *
 * Sends a magic link email to the provided email address.
 * User clicks link to authenticate - no password required.
 */
router.post('/magic-link', async (req, res) => {
  const correlationId = req.correlationId || 'unknown';
  const { email } = req.body;

  try {
    // Validate email
    if (!email || typeof email !== 'string') {
      throw new ValidationError('email', 'Email is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('email', 'Invalid email format');
    }

    const normalizedEmail = email.toLowerCase().trim();

    logger.info('Magic link requested', {
      correlationId,
      email: normalizedEmail
    });

    // Send magic link via Supabase
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback`
      }
    });

    if (error) {
      logger.error('Failed to send magic link', {
        correlationId,
        email: normalizedEmail,
        error: error.message
      });

      return res.status(500).json({
        error: 'Failed to send magic link',
        message: 'Please try again later',
        correlationId
      });
    }

    logger.info('Magic link sent successfully', {
      correlationId,
      email: normalizedEmail
    });

    return res.status(200).json({
      success: true,
      message: 'Magic link sent! Check your email.',
      email: normalizedEmail
    });

  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.message,
        field: error.field,
        correlationId
      });
    }

    logger.error('Unexpected error sending magic link', {
      correlationId,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to send magic link',
      correlationId
    });
  }
});

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's information.
 * Requires valid authentication token.
 */
router.get('/me', requireAuth, async (req, res) => {
  const correlationId = req.correlationId || 'unknown';

  try {
    // req.user is populated by requireAuth middleware
    const { id, email, displayName, role, isSuperadmin, createdAt } = req.user;

    // Fetch user settings summary
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('therapist_profile, podcast_info')
      .eq('user_id', id)
      .single();

    // Get episode count for this user
    const { count: episodeCount } = await supabaseAdmin
      .from('episodes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    logger.debug('User info retrieved', {
      correlationId,
      userId: id
    });

    return res.status(200).json({
      user: {
        id,
        email,
        displayName,
        role,
        isSuperadmin,
        createdAt,
        hasCompletedProfile: !!(settings?.therapist_profile?.name),
        episodeCount: episodeCount || 0
      }
    });

  } catch (error) {
    logger.error('Error fetching user info', {
      correlationId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch user info',
      correlationId
    });
  }
});

/**
 * POST /api/auth/logout
 *
 * Signs out the current user.
 * Invalidates the session on Supabase side.
 */
router.post('/logout', requireAuth, async (req, res) => {
  const correlationId = req.correlationId || 'unknown';

  try {
    logger.info('User logout requested', {
      correlationId,
      userId: req.user.id,
      email: req.user.email
    });

    // Sign out on Supabase (invalidates all sessions for this user)
    const { error } = await supabase.auth.signOut();

    if (error) {
      logger.warn('Supabase signout returned error', {
        correlationId,
        error: error.message
      });
      // Continue anyway - token will expire naturally
    }

    logger.info('User logged out successfully', {
      correlationId,
      userId: req.user.id
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Error during logout', {
      correlationId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Logout failed',
      correlationId
    });
  }
});

/**
 * PATCH /api/auth/profile
 *
 * Updates the current user's profile information.
 */
router.patch('/profile', requireAuth, async (req, res) => {
  const correlationId = req.correlationId || 'unknown';
  const { displayName } = req.body;

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const updates = {};

    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.length > 100) {
        throw new ValidationError('displayName', 'Display name must be a string under 100 characters');
      }
      updates.display_name = displayName.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
        correlationId
      });
    }

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('User profile updated', {
      correlationId,
      userId: req.user.id,
      updates: Object.keys(updates)
    });

    return res.status(200).json({
      success: true,
      profile: {
        id: data.id,
        email: data.email,
        displayName: data.display_name,
        role: data.role
      }
    });

  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.message,
        correlationId
      });
    }

    logger.error('Error updating profile', {
      correlationId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update profile',
      correlationId
    });
  }
});

export default router;
```

### 2.3 Update Server.js

**File:** `backend/api/server.js` (modifications)

```javascript
// Add to imports
import authRoutes from './routes/auth.js';
import { requireAuth, requireSuperadmin } from './middleware/auth-middleware.js';

// Add auth routes (public - no auth required)
app.use('/api/auth', authRoutes);

// Protect existing routes with auth middleware
app.use('/api/episodes', requireAuth, episodesRouter);
app.use('/api/stages', requireAuth, stagesRouter);
app.use('/api/evergreen', requireAuth, evergreenRouter);

// Admin routes require superadmin role
app.use('/api/admin', requireAuth, requireSuperadmin, adminRouter);
```

### 2.4 Update Episodes Routes for User Scoping

**File:** `backend/api/routes/episodes.js` (modifications)

Key changes needed:
1. Add `user_id` when creating episodes
2. Filter queries by `user_id` for non-superadmins
3. Verify ownership before updates/deletes

```javascript
// In POST /api/episodes handler
const episodeData = {
  transcript,
  episode_context: episodeContext,
  user_id: req.user.id, // <-- Add user_id from auth context
  status: 'draft'
};

// In GET /api/episodes handler
const query = supabase.from('episodes').select('*');

// Non-superadmins only see their own episodes
if (!req.user.isSuperadmin) {
  query.eq('user_id', req.user.id);
}

// In GET /api/episodes/:id handler - verify ownership
const episode = await episodeRepo.findById(id);
if (!episode) {
  return res.status(404).json({ error: 'Episode not found' });
}
if (!req.user.isSuperadmin && episode.user_id !== req.user.id) {
  return res.status(403).json({ error: 'Access denied' });
}
```

### 2.5 Update Settings Routes for User Scoping

**File:** `backend/api/routes/settings.js` (new file, replaces evergreen.js for user settings)

```javascript
/**
 * User Settings Routes
 *
 * Manages per-user settings (therapist profile, podcast info, etc.)
 * Each user has their own settings that are used for content generation.
 *
 * @module routes/settings
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import logger from '../../lib/logger.js';
import { ValidationError } from '../../lib/errors.js';
import { requireAuth } from '../middleware/auth-middleware.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * GET /api/settings
 *
 * Returns the current user's settings.
 */
router.get('/', async (req, res) => {
  const correlationId = req.correlationId || 'unknown';

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      // If no settings exist, create default
      if (error.code === 'PGRST116') {
        const { data: newSettings } = await supabase
          .from('user_settings')
          .insert({ user_id: req.user.id })
          .select()
          .single();

        return res.status(200).json({ settings: newSettings });
      }
      throw error;
    }

    logger.debug('User settings retrieved', {
      correlationId,
      userId: req.user.id
    });

    return res.status(200).json({ settings: data });

  } catch (error) {
    logger.error('Error fetching user settings', {
      correlationId,
      userId: req.user.id,
      error: error.message
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch settings',
      correlationId
    });
  }
});

/**
 * PUT /api/settings
 *
 * Updates the current user's settings.
 */
router.put('/', async (req, res) => {
  const correlationId = req.correlationId || 'unknown';
  const { therapist_profile, podcast_info, voice_guidelines, seo_defaults } = req.body;

  try {
    const updates = {};

    if (therapist_profile !== undefined) {
      updates.therapist_profile = therapist_profile;
    }
    if (podcast_info !== undefined) {
      updates.podcast_info = podcast_info;
    }
    if (voice_guidelines !== undefined) {
      updates.voice_guidelines = voice_guidelines;
    }
    if (seo_defaults !== undefined) {
      updates.seo_defaults = seo_defaults;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
        correlationId
      });
    }

    const { data, error } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('User settings updated', {
      correlationId,
      userId: req.user.id,
      updatedFields: Object.keys(updates)
    });

    return res.status(200).json({
      success: true,
      settings: data
    });

  } catch (error) {
    logger.error('Error updating user settings', {
      correlationId,
      userId: req.user.id,
      error: error.message
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update settings',
      correlationId
    });
  }
});

export default router;
```

### 2.6 Add Error Types

**File:** `backend/lib/errors.js` (additions)

```javascript
/**
 * Authentication Error
 * Thrown when authentication fails (missing/invalid token).
 */
export class AuthenticationError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
    this.retryable = false;
  }
}

/**
 * Authorization Error
 * Thrown when user lacks permission for an action.
 */
export class AuthorizationError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
    this.retryable = false;
  }
}
```

---

## Phase 3: Frontend Implementation

### 3.1 Auth Context

**File:** `frontend/src/contexts/AuthContext.jsx` (~200 lines)

```jsx
/**
 * Authentication Context
 *
 * Provides authentication state and methods throughout the app.
 * Handles Supabase session management and user data.
 *
 * @module contexts/AuthContext
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { api } from '../utils/api-client';

// Initialize Supabase client for frontend
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const AuthContext = createContext(null);

/**
 * Auth Provider Component
 * Wraps app and provides authentication state/methods.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Fetch user profile from backend
   */
  const fetchUserProfile = useCallback(async (accessToken) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }

      const data = await response.json();
      setUser(data.user);
      return data.user;
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setError(err.message);
      return null;
    }
  }, []);

  /**
   * Initialize auth state on mount
   */
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.access_token) {
        fetchUserProfile(session.access_token);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        setSession(session);

        if (session?.access_token) {
          await fetchUserProfile(session.access_token);
        } else {
          setUser(null);
        }

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchUserProfile]);

  /**
   * Send magic link to email
   */
  const sendMagicLink = async (email) => {
    setError(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send magic link');
      }

      return { success: true, message: data.message };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  /**
   * Sign out current user
   */
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    } catch (err) {
      console.error('Error signing out:', err);
      setError(err.message);
    }
  };

  /**
   * Get current access token for API calls
   */
  const getAccessToken = () => session?.access_token || null;

  const value = {
    user,
    session,
    loading,
    error,
    isAuthenticated: !!session,
    isSuperadmin: user?.isSuperadmin || false,
    sendMagicLink,
    signOut,
    getAccessToken,
    clearError: () => setError(null)
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { supabase };
```

### 3.2 Protected Route Component

**File:** `frontend/src/components/auth/ProtectedRoute.jsx` (~80 lines)

```jsx
/**
 * Protected Route Component
 *
 * Wraps routes that require authentication.
 * Redirects to login if user is not authenticated.
 * Optionally checks for superadmin role.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../shared/Spinner';

export function ProtectedRoute({ children, requireSuperadmin = false }) {
  const { isAuthenticated, isSuperadmin, loading } = useAuth();
  const location = useLocation();

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="auth-loading">
        <Spinner size="large" />
        <p>Checking authentication...</p>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check superadmin requirement
  if (requireSuperadmin && !isSuperadmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
```

### 3.3 Login Page

**File:** `frontend/src/pages/Login.jsx` (~200 lines)

```jsx
/**
 * Login Page
 *
 * Handles magic link authentication flow.
 * Users enter email and receive a link to sign in.
 */

import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import Card from '../components/shared/Card';
import './Login.css';

export default function Login() {
  const { isAuthenticated, sendMagicLink, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [message, setMessage] = useState('');
  const location = useLocation();

  // Redirect if already authenticated
  if (isAuthenticated) {
    const from = location.state?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    setStatus('sending');

    const result = await sendMagicLink(email);

    if (result.success) {
      setStatus('sent');
      setMessage(result.message);
    } else {
      setStatus('error');
      setMessage(result.error);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>Welcome</h1>
          <p>Sign in to access your content pipeline</p>
        </div>

        <Card className="login-card">
          {status === 'sent' ? (
            <div className="login-success">
              <div className="success-icon">✉️</div>
              <h2>Check your email</h2>
              <p>We've sent a magic link to <strong>{email}</strong></p>
              <p className="hint">Click the link in your email to sign in.</p>
              <Button
                variant="ghost"
                onClick={() => setStatus('idle')}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <Input
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={status === 'sending'}
                error={status === 'error' ? message : null}
              />

              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={status === 'sending'}
                disabled={!email || status === 'sending'}
              >
                {status === 'sending' ? 'Sending...' : 'Send Magic Link'}
              </Button>
            </form>
          )}
        </Card>

        <p className="login-footer">
          No password needed. We'll email you a secure link to sign in.
        </p>
      </div>
    </div>
  );
}
```

### 3.4 Auth Callback Page

**File:** `frontend/src/pages/AuthCallback.jsx` (~100 lines)

```jsx
/**
 * Auth Callback Page
 *
 * Handles the redirect from Supabase magic link.
 * Verifies the token and redirects to dashboard on success.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../contexts/AuthContext';
import Spinner from '../components/shared/Spinner';
import './AuthCallback.css';

export default function AuthCallback() {
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase handles the token verification automatically
        // by reading from the URL hash/params
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (data.session) {
          // Success - redirect to dashboard
          navigate('/', { replace: true });
        } else {
          // No session - check for error in URL
          const errorDescription = searchParams.get('error_description');
          if (errorDescription) {
            throw new Error(errorDescription);
          }
          throw new Error('Authentication failed. Please try again.');
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err.message);
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  if (error) {
    return (
      <div className="auth-callback error">
        <div className="callback-content">
          <h2>Authentication Failed</h2>
          <p>{error}</p>
          <a href="/login">Try again</a>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-callback">
      <div className="callback-content">
        <Spinner size="large" />
        <h2>Signing you in...</h2>
        <p>Please wait while we verify your credentials.</p>
      </div>
    </div>
  );
}
```

### 3.5 Superadmin Bar Component

**File:** `frontend/src/components/layout/AdminBar.jsx` (~80 lines)

```jsx
/**
 * Admin Bar Component
 *
 * Displayed at the top of the page for superadmin users.
 * Provides quick access to admin functions and indicates admin mode.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './AdminBar.css';

export default function AdminBar() {
  const { user, isSuperadmin } = useAuth();

  // Only render for superadmins
  if (!isSuperadmin) {
    return null;
  }

  return (
    <div className="admin-bar">
      <div className="admin-bar-content">
        <div className="admin-indicator">
          <span className="admin-icon">🔒</span>
          <span className="admin-label">Superadmin Mode</span>
        </div>

        <nav className="admin-nav">
          <Link to="/admin" className="admin-link">
            📊 Analytics
          </Link>
          <Link to="/admin/users" className="admin-link">
            👥 Users
          </Link>
          <Link to="/admin/costs" className="admin-link">
            💰 Costs
          </Link>
          <Link to="/admin/errors" className="admin-link">
            ⚠️ Errors
          </Link>
        </nav>

        <div className="admin-user">
          Logged in as <strong>{user?.email}</strong>
        </div>
      </div>
    </div>
  );
}
```

### 3.6 Update App.jsx Router

**File:** `frontend/src/App.jsx` (updated)

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AdminBar from './components/layout/AdminBar';
import Layout from './components/Layout';

// Pages
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import NewEpisode from './pages/NewEpisode';
import ProcessingScreen from './pages/ProcessingScreen';
import ReviewHub from './pages/ReviewHub';
import Settings from './pages/Settings';
import AdminDashboard from './pages/AdminDashboard';
import NotFound from './pages/NotFound';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Admin bar appears at top for superadmins */}
        <AdminBar />

        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout><Dashboard /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/new" element={
            <ProtectedRoute>
              <Layout><NewEpisode /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/episode/:id/processing" element={
            <ProtectedRoute>
              <Layout><ProcessingScreen /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/episode/:id" element={
            <ProtectedRoute>
              <Layout><ReviewHub /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/settings" element={
            <ProtectedRoute>
              <Layout><Settings /></Layout>
            </ProtectedRoute>
          } />

          {/* Superadmin-only routes */}
          <Route path="/admin/*" element={
            <ProtectedRoute requireSuperadmin>
              <Layout><AdminDashboard /></Layout>
            </ProtectedRoute>
          } />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
```

### 3.7 Update API Client with Auth

**File:** `frontend/src/utils/api-client.js` (updated)

```javascript
/**
 * API Client with Authentication
 *
 * Wrapper around fetch that automatically includes auth token.
 * Handles token refresh and unauthorized responses.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Get auth token from localStorage (set by Supabase)
 */
function getAuthToken() {
  const supabaseKey = Object.keys(localStorage).find(key =>
    key.startsWith('sb-') && key.endsWith('-auth-token')
  );

  if (!supabaseKey) return null;

  try {
    const data = JSON.parse(localStorage.getItem(supabaseKey));
    return data?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Make authenticated API request
 */
async function request(endpoint, options = {}) {
  const token = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 - redirect to login
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Authentication required');
  }

  // Handle 403 - access denied
  if (response.status === 403) {
    throw new Error('Access denied');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'API request failed');
  }

  return response.json();
}

// Export API methods
export const api = {
  get: (endpoint) => request(endpoint),
  post: (endpoint, data) => request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: (endpoint, data) => request(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (endpoint, data) => request(endpoint, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),

  // Convenience methods
  episodes: {
    list: () => api.get('/api/episodes'),
    get: (id) => api.get(`/api/episodes/${id}`),
    create: (data) => api.post('/api/episodes', data),
    update: (id, data) => api.patch(`/api/episodes/${id}`, data),
    delete: (id) => api.delete(`/api/episodes/${id}`),
    process: (id) => api.post(`/api/episodes/${id}/process`),
  },

  settings: {
    get: () => api.get('/api/settings'),
    update: (data) => api.put('/api/settings', data),
  },

  auth: {
    me: () => api.get('/api/auth/me'),
    logout: () => api.post('/api/auth/logout'),
  },

  admin: {
    costs: () => api.get('/api/admin/costs'),
    performance: () => api.get('/api/admin/performance'),
    errors: () => api.get('/api/admin/errors'),
    users: () => api.get('/api/admin/users'),
  },
};
```

### 3.8 Update Settings Page for User Settings

**File:** `frontend/src/pages/Settings.jsx` (updated)

The Settings page now loads/saves from `/api/settings` which returns the user's own settings instead of the global evergreen content.

---

## Phase 4: Environment Variables

### Backend `.env` additions

```bash
# Existing
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# New - for auth verification
SUPABASE_ANON_KEY=your-anon-key

# New - frontend URL for magic link redirect
FRONTEND_URL=http://localhost:5173
```

### Frontend `.env` additions

```bash
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## Phase 5: Implementation Checklist

### Database (Priority 1)

- [ ] Create migration file `002_user_auth.sql`
- [ ] Create `user_profiles` table
- [ ] Create `user_settings` table
- [ ] Add `user_id` column to `episodes` table
- [ ] Create trigger for auto-creating user profile on signup
- [ ] Create trigger for auto-creating user settings on profile creation
- [ ] Create helper function `is_superadmin()`
- [ ] Create RLS policies for all tables
- [ ] Test RLS policies work correctly
- [ ] Run migration on Supabase

### Backend (Priority 2)

- [ ] Add `AuthenticationError` and `AuthorizationError` to errors.js
- [ ] Create `auth-middleware.js` with `requireAuth` and `requireSuperadmin`
- [ ] Create `auth.js` routes (magic-link, me, logout, profile)
- [ ] Create `settings.js` routes (user-scoped settings)
- [ ] Update `server.js` to wire up auth middleware and routes
- [ ] Update `episodes.js` routes for user scoping
- [ ] Update `stages.js` routes for user scoping
- [ ] Update `admin.js` routes to require superadmin
- [ ] Add comprehensive logging throughout
- [ ] Test all endpoints with authenticated requests

### Frontend (Priority 3)

- [ ] Create `AuthContext.jsx` with Supabase integration
- [ ] Create `ProtectedRoute.jsx` component
- [ ] Create `Login.jsx` page
- [ ] Create `AuthCallback.jsx` page
- [ ] Create `AdminBar.jsx` component
- [ ] Update `App.jsx` with auth routing
- [ ] Update `api-client.js` to include auth token
- [ ] Update `Settings.jsx` to use user settings
- [ ] Update `Sidebar.jsx` to show/hide admin link based on role
- [ ] Add logout button to UI
- [ ] Test complete auth flow

### Documentation (Priority 4)

- [ ] Update PROJECT-OVERVIEW.md with multi-user support
- [ ] Update DATABASE-SCHEMA.md with new tables
- [ ] Update API-ENDPOINTS.md with auth endpoints
- [ ] Update PAGE-SPECIFICATIONS.md with login page
- [ ] Update IMPLEMENTATION-GUIDE.md with auth phase
- [ ] Update README.md with auth setup instructions

### Testing (Priority 5)

- [ ] Test magic link email delivery
- [ ] Test login flow end-to-end
- [ ] Test user scoping (users can only see own episodes)
- [ ] Test superadmin access (can see all episodes)
- [ ] Test admin page protection
- [ ] Test session persistence across page refreshes
- [ ] Test logout functionality
- [ ] Test error handling for invalid tokens

---

## File Structure Summary

```
backend/
├── api/
│   ├── middleware/
│   │   ├── auth-middleware.js     # NEW - Auth verification
│   │   ├── error-handler.js       # Updated - Handle auth errors
│   │   └── logger-middleware.js   # Existing
│   │
│   ├── routes/
│   │   ├── auth.js                # NEW - Auth endpoints
│   │   ├── settings.js            # NEW - User settings
│   │   ├── episodes.js            # Updated - User scoping
│   │   ├── stages.js              # Updated - User scoping
│   │   ├── admin.js               # Updated - Superadmin only
│   │   └── evergreen.js           # Existing - System defaults
│   │
│   └── server.js                  # Updated - Auth middleware
│
├── lib/
│   └── errors.js                  # Updated - Auth error types
│
└── package.json                   # Updated - Dependencies

frontend/
├── src/
│   ├── contexts/
│   │   └── AuthContext.jsx        # NEW - Auth state management
│   │
│   ├── components/
│   │   ├── auth/
│   │   │   └── ProtectedRoute.jsx # NEW - Route protection
│   │   │
│   │   └── layout/
│   │       ├── AdminBar.jsx       # NEW - Superadmin indicator
│   │       └── Layout.jsx         # Existing
│   │
│   ├── pages/
│   │   ├── Login.jsx              # NEW - Login page
│   │   ├── AuthCallback.jsx       # NEW - Magic link callback
│   │   ├── Settings.jsx           # Updated - User settings
│   │   └── ...                    # Existing pages
│   │
│   ├── utils/
│   │   └── api-client.js          # Updated - Auth tokens
│   │
│   └── App.jsx                    # Updated - Auth routing
│
└── package.json                   # Updated - Dependencies

supabase/
└── migrations/
    ├── 001_initial_schema.sql     # Existing
    └── 002_user_auth.sql          # NEW - Auth schema
```

---

## Security Considerations

### Authentication Security

1. **Magic Link Expiry**: Supabase magic links expire after 1 hour by default
2. **Session Duration**: JWT tokens are valid for 1 hour, auto-refreshed
3. **Token Storage**: Stored in localStorage by Supabase client
4. **HTTPS**: All production traffic must use HTTPS

### Authorization Security

1. **RLS Enforcement**: Database enforces user isolation at query level
2. **Backend Validation**: Double-check ownership in route handlers
3. **Superadmin Hardcoded**: Only `hazel@theclever.io` can be superadmin
4. **Role Immutable**: Users cannot change their own role

### Best Practices

1. **Never trust client**: Always verify auth server-side
2. **Log access attempts**: Track unauthorized access attempts
3. **Rate limit**: Limit magic link requests (built into Supabase)
4. **Audit trail**: Log sensitive operations (admin access, deletions)

---

## Error Handling Strategy

### Authentication Errors

| Error | HTTP Code | User Message |
|-------|-----------|--------------|
| Missing token | 401 | "Please sign in to continue" |
| Invalid token | 401 | "Your session has expired. Please sign in again." |
| Profile not found | 401 | "Account setup incomplete. Please try signing in again." |

### Authorization Errors

| Error | HTTP Code | User Message |
|-------|-----------|--------------|
| Not owner | 403 | "You don't have permission to access this resource" |
| Not superadmin | 403 | "This feature is only available to administrators" |

### Logging Format

```javascript
// Successful authentication
logger.info('User authenticated', {
  userId: 'uuid',
  email: 'user@example.com',
  role: 'user',
  correlationId: 'xxx'
});

// Failed authentication
logger.warn('Authentication failed', {
  reason: 'invalid_token',
  path: '/api/episodes',
  correlationId: 'xxx'
});

// Authorization denied
logger.warn('Authorization denied', {
  userId: 'uuid',
  requiredRole: 'superadmin',
  actualRole: 'user',
  path: '/api/admin/costs',
  correlationId: 'xxx'
});
```

---

## Testing Strategy

### Unit Tests

```javascript
// auth-middleware.test.js
describe('requireAuth', () => {
  test('passes with valid token', async () => { });
  test('rejects missing token', async () => { });
  test('rejects invalid token', async () => { });
  test('attaches user to request', async () => { });
});

describe('requireSuperadmin', () => {
  test('passes for superadmin', async () => { });
  test('rejects non-superadmin', async () => { });
});
```

### Integration Tests

```javascript
// auth-flow.test.js
describe('Authentication Flow', () => {
  test('magic link creates user on first login', async () => { });
  test('existing user can login', async () => { });
  test('protected route requires auth', async () => { });
  test('admin route requires superadmin', async () => { });
});
```

### E2E Tests

```javascript
// auth-e2e.test.js
describe('E2E Auth Flow', () => {
  test('user can request magic link', async () => { });
  test('user can sign in via magic link', async () => { });
  test('user sees only their episodes', async () => { });
  test('superadmin sees admin link', async () => { });
  test('non-admin cannot access /admin', async () => { });
});
```

---

## Migration Notes

### For Existing Data

If there are existing episodes without `user_id`:

```sql
-- Option 1: Assign to superadmin
UPDATE episodes
SET user_id = (SELECT id FROM user_profiles WHERE role = 'superadmin' LIMIT 1)
WHERE user_id IS NULL;

-- Option 2: Delete orphaned episodes
DELETE FROM episodes WHERE user_id IS NULL;

-- After cleanup, make user_id NOT NULL
ALTER TABLE episodes ALTER COLUMN user_id SET NOT NULL;
```

### Rollback Plan

If issues arise:

1. Remove auth middleware from server.js
2. Keep database changes (they're backward compatible)
3. Frontend can continue working without auth

---

**This plan provides a complete roadmap for implementing user authentication and superadmin functionality. Follow the phases in order, testing each component before moving to the next.**
