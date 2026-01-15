/**
 * ============================================================================
 * AUTH CALLBACK PAGE
 * ============================================================================
 * Handles the redirect from Supabase magic link.
 * Processes the URL hash/params and completes authentication.
 * Redirects to the originally requested page or dashboard on success.
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import styles from './AuthCallback.module.css';

/**
 * AuthCallback component
 * Handles magic link callback and redirects user after authentication
 */
function AuthCallback() {
  const [status, setStatus] = useState('processing'); // 'processing' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);

  const { user, loading, supabase } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    /**
     * Process the authentication callback.
     * Supabase handles most of this automatically, but we need to:
     * 1. Wait for session to be established
     * 2. Handle any errors
     * 3. Redirect to the appropriate page
     */
    const handleCallback = async () => {
      try {
        console.log('AuthCallback: Processing authentication callback');

        // Check for error in URL params (Supabase sometimes includes errors here)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);

        const error = hashParams.get('error') || queryParams.get('error');
        const errorDescription = hashParams.get('error_description') || queryParams.get('error_description');

        if (error) {
          console.error('AuthCallback: Error in URL params', { error, errorDescription });
          setErrorMessage(errorDescription || error);
          setStatus('error');
          return;
        }

        // Supabase client should handle the session automatically via detectSessionInUrl
        // Wait a moment for it to process
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if we have a session now
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('AuthCallback: Session error', sessionError);
          setErrorMessage(sessionError.message);
          setStatus('error');
          return;
        }

        if (session) {
          console.log('AuthCallback: Session established, checking onboarding status...');
          setStatus('success');

          // Fetch user profile to check onboarding status
          try {
            const response = await fetch('/api/auth/me', {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              const data = await response.json();
              const needsOnboarding = !data.user?.onboarding_complete;

              // Redirect to onboarding if needed, otherwise to original destination
              const destination = needsOnboarding
                ? '/onboarding'
                : (location.state?.from?.pathname || '/');

              console.log('AuthCallback: Redirecting to', destination, { needsOnboarding });

              setTimeout(() => {
                navigate(destination, { replace: true });
              }, 1000);
            } else {
              // Fallback to default destination if profile check fails
              const from = location.state?.from?.pathname || '/';
              setTimeout(() => {
                navigate(from, { replace: true });
              }, 1000);
            }
          } catch (err) {
            console.error('AuthCallback: Failed to check onboarding status', err);
            const from = location.state?.from?.pathname || '/';
            setTimeout(() => {
              navigate(from, { replace: true });
            }, 1000);
          }
        } else {
          // No session yet - wait for auth state change
          console.log('AuthCallback: Waiting for session...');
        }
      } catch (err) {
        console.error('AuthCallback: Unexpected error', err);
        setErrorMessage(err.message || 'An unexpected error occurred');
        setStatus('error');
      }
    };

    // Only process if not already authenticated
    if (!loading) {
      if (user) {
        // Already authenticated, redirect based on onboarding status
        console.log('AuthCallback: Already authenticated, redirecting');
        const destination = !user.onboarding_complete
          ? '/onboarding'
          : (location.state?.from?.pathname || '/');
        navigate(destination, { replace: true });
      } else {
        handleCallback();
      }
    }
  }, [loading, user, navigate, location, supabase]);

  // Redirect once user is set (by auth state change listener)
  useEffect(() => {
    if (user && status === 'processing') {
      console.log('AuthCallback: User authenticated via state change');
      setStatus('success');

      // Check onboarding status and redirect appropriately
      const destination = !user.onboarding_complete
        ? '/onboarding'
        : (location.state?.from?.pathname || '/');

      setTimeout(() => {
        navigate(destination, { replace: true });
      }, 1000);
    }
  }, [user, status, navigate, location]);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* Processing state */}
        {status === 'processing' && (
          <div className={styles.processing}>
            <div className={styles.spinner} />
            <h2>Signing you in...</h2>
            <p>Please wait while we complete your authentication.</p>
          </div>
        )}

        {/* Success state */}
        {status === 'success' && (
          <div className={styles.success}>
            <div className={styles.successIcon}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2>Welcome back!</h2>
            <p>Redirecting you to the dashboard...</p>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className={styles.error}>
            <div className={styles.errorIcon}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2>Authentication Failed</h2>
            <p>{errorMessage || 'Unable to complete sign in. Please try again.'}</p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => navigate('/login', { replace: true })}
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuthCallback;
