/**
 * ============================================================================
 * AUTHENTICATION CONTEXT
 * ============================================================================
 * Provides authentication state and functions throughout the application.
 * Uses Supabase for magic link authentication.
 *
 * Usage:
 *   import { useAuth } from '../contexts/AuthContext';
 *   const { user, signIn, signOut, loading } = useAuth();
 *
 * Provides:
 * - user: Current authenticated user (null if not logged in)
 * - session: Current Supabase session
 * - loading: True during initial auth check
 * - signIn: Send magic link email
 * - signOut: Log out current user
 * - isSuperadmin: Check if current user is superadmin
 * - getToken: Get current session token for API calls
 * ============================================================================
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Supabase configuration from environment variables
// These should be set in frontend/.env or .env.local
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Flag to track if Supabase is properly configured
const IS_SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// Validate configuration
if (!IS_SUPABASE_CONFIGURED) {
  console.error(
    'AuthContext: Missing Supabase configuration.\n' +
    'To fix this, create a frontend/.env file with:\n' +
    '  VITE_SUPABASE_URL=https://your-project.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=your-anon-key-here\n' +
    'Get these values from: https://app.supabase.com/project/YOUR_PROJECT/settings/api'
  );
}

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

/**
 * Supabase client for frontend authentication.
 * Uses the anon key which respects RLS policies.
 * Only created if configuration is present.
 */
let supabase = null;

if (IS_SUPABASE_CONFIGURED) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // Store session in localStorage
      storage: localStorage,
      // Auto-refresh tokens before expiry
      autoRefreshToken: true,
      // Persist session across page reloads
      persistSession: true,
      // Detect session from URL (for magic link callback)
      detectSessionInUrl: true,
    },
  });
}

// ============================================================================
// AUTH CONTEXT
// ============================================================================

/**
 * Authentication context value type
 * @typedef {Object} AuthContextValue
 * @property {Object|null} user - Current user profile
 * @property {Object|null} session - Current Supabase session
 * @property {boolean} loading - Loading state during auth check
 * @property {string|null} error - Error message if any
 * @property {Function} signIn - Send magic link email
 * @property {Function} signOut - Log out user
 * @property {Function} isSuperadmin - Check if user is superadmin
 * @property {Function} getToken - Get current session token
 * @property {Function} refreshUser - Refresh user profile from backend
 */

const AuthContext = createContext(null);

// ============================================================================
// AUTH PROVIDER COMPONENT
// ============================================================================

/**
 * AuthProvider component that wraps the application.
 * Provides authentication state and functions to all children.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function AuthProvider({ children }) {
  // State
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!IS_SUPABASE_CONFIGURED ? false : true);
  const [error, setError] = useState(
    IS_SUPABASE_CONFIGURED ? null : 'Supabase not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to frontend/.env'
  );
  const [configError, setConfigError] = useState(!IS_SUPABASE_CONFIGURED);

  // ========================================================================
  // FETCH USER PROFILE FROM BACKEND
  // ========================================================================

  /**
   * Fetches the user profile from the backend API.
   * This includes role information (user/superadmin).
   *
   * @param {string} accessToken - The session access token
   * @returns {Promise<Object|null>} User profile or null on error
   */
  const fetchUserProfile = useCallback(async (accessToken) => {
    if (!accessToken) {
      console.warn('AuthContext: No access token provided for profile fetch');
      return null;
    }

    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('AuthContext: Failed to fetch user profile', {
          status: response.status,
        });
        return null;
      }

      const data = await response.json();
      console.log('AuthContext: User profile fetched', {
        userId: data.user?.id,
        role: data.user?.role,
      });
      return data.user;
    } catch (err) {
      console.error('AuthContext: Error fetching user profile', err);
      return null;
    }
  }, []);

  // ========================================================================
  // INITIALIZE AUTH STATE
  // ========================================================================

  useEffect(() => {
    /**
     * Initialize authentication state on mount.
     * Checks for existing session and sets up auth state listener.
     */
    const initAuth = async () => {
      // Skip initialization if Supabase is not configured
      if (!IS_SUPABASE_CONFIGURED || !supabase) {
        console.warn('AuthContext: Skipping initialization - Supabase not configured');
        return;
      }

      try {
        console.log('AuthContext: Initializing authentication');

        // Get current session
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('AuthContext: Error getting session', sessionError);
          setError(sessionError.message);
          setLoading(false);
          return;
        }

        if (currentSession) {
          console.log('AuthContext: Existing session found', {
            userId: currentSession.user?.id,
            expiresAt: currentSession.expires_at,
          });

          setSession(currentSession);

          // Fetch user profile from backend (includes role)
          const profile = await fetchUserProfile(currentSession.access_token);
          if (profile) {
            setUser(profile);
          } else {
            // Fallback to basic Supabase user info
            setUser({
              id: currentSession.user.id,
              email: currentSession.user.email,
              role: 'user',
            });
          }
        } else {
          console.log('AuthContext: No existing session');
        }

        setLoading(false);
      } catch (err) {
        console.error('AuthContext: Error during initialization', err);
        setError(err.message);
        setLoading(false);
      }
    };

    initAuth();

    // Skip setting up listener if Supabase is not configured
    if (!IS_SUPABASE_CONFIGURED || !supabase) {
      return;
    }

    // ======================================================================
    // AUTH STATE CHANGE LISTENER
    // ======================================================================

    /**
     * Listen for authentication state changes.
     * Handles sign in, sign out, and token refresh events.
     */
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('AuthContext: Auth state changed', { event, hasSession: !!newSession });

      switch (event) {
        case 'SIGNED_IN':
          console.log('AuthContext: User signed in');
          setSession(newSession);

          // Fetch user profile from backend
          const profile = await fetchUserProfile(newSession.access_token);
          if (profile) {
            setUser(profile);
          } else {
            setUser({
              id: newSession.user.id,
              email: newSession.user.email,
              role: 'user',
            });
          }
          setError(null);
          break;

        case 'SIGNED_OUT':
          console.log('AuthContext: User signed out');
          setSession(null);
          setUser(null);
          setError(null);
          break;

        case 'TOKEN_REFRESHED':
          console.log('AuthContext: Token refreshed');
          setSession(newSession);
          break;

        case 'USER_UPDATED':
          console.log('AuthContext: User updated');
          if (newSession) {
            setSession(newSession);
            // Re-fetch profile in case it changed
            const updatedProfile = await fetchUserProfile(newSession.access_token);
            if (updatedProfile) {
              setUser(updatedProfile);
            }
          }
          break;

        default:
          console.log('AuthContext: Unhandled auth event', event);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      console.log('AuthContext: Cleaning up auth listener');
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  // ========================================================================
  // AUTH FUNCTIONS
  // ========================================================================

  /**
   * Send magic link email to the specified address.
   *
   * @param {string} email - Email address to send magic link to
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  const signIn = async (email) => {
    // Check if Supabase is configured
    if (!IS_SUPABASE_CONFIGURED || !supabase) {
      const errorMsg = 'Authentication not available. Please configure Supabase environment variables.';
      console.error('AuthContext:', errorMsg);
      return { success: false, error: errorMsg };
    }

    try {
      console.log('AuthContext: Sending magic link to', email);
      setError(null);

      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          // Redirect back to our app after clicking the link
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signInError) {
        console.error('AuthContext: Magic link failed', signInError);
        setError(signInError.message);
        return { success: false, error: signInError.message };
      }

      console.log('AuthContext: Magic link sent successfully');
      return { success: true };
    } catch (err) {
      console.error('AuthContext: Error sending magic link', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  /**
   * Sign out the current user.
   *
   * @returns {Promise<void>}
   */
  const signOut = async () => {
    // If Supabase is not configured, just clear local state
    if (!IS_SUPABASE_CONFIGURED || !supabase) {
      setSession(null);
      setUser(null);
      return;
    }

    try {
      console.log('AuthContext: Signing out');
      setError(null);

      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        console.error('AuthContext: Sign out failed', signOutError);
        setError(signOutError.message);
      }

      // Clear local state regardless of API result
      setSession(null);
      setUser(null);

      console.log('AuthContext: Sign out complete');
    } catch (err) {
      console.error('AuthContext: Error signing out', err);
      setError(err.message);
      // Still clear local state
      setSession(null);
      setUser(null);
    }
  };

  /**
   * Check if the current user is a superadmin.
   *
   * @returns {boolean} True if user is superadmin
   */
  const isSuperadmin = useCallback(() => {
    return user?.role === 'superadmin' || user?.is_superadmin === true;
  }, [user]);

  /**
   * Get the current session access token.
   * Useful for making authenticated API calls.
   *
   * @returns {string|null} Access token or null if not logged in
   */
  const getToken = useCallback(() => {
    return session?.access_token || null;
  }, [session]);

  /**
   * Refresh user profile from backend.
   * Call this after updating user data to sync state.
   *
   * @returns {Promise<void>}
   */
  const refreshUser = async () => {
    if (!session?.access_token) {
      console.warn('AuthContext: Cannot refresh user without session');
      return;
    }

    const profile = await fetchUserProfile(session.access_token);
    if (profile) {
      setUser(profile);
    }
  };

  // ========================================================================
  // CONTEXT VALUE
  // ========================================================================

  const value = {
    // State
    user,
    session,
    loading,
    error,
    configError, // True if Supabase is not configured

    // Auth functions
    signIn,
    signOut,

    // Utility functions
    isSuperadmin,
    getToken,
    refreshUser,

    // Supabase client (for advanced use cases)
    supabase,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================================
// CUSTOM HOOK
// ============================================================================

/**
 * Custom hook to access authentication context.
 * Must be used within an AuthProvider.
 *
 * @returns {AuthContextValue} Authentication context value
 * @throws {Error} If used outside AuthProvider
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { supabase };
export default AuthContext;
