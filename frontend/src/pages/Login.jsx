/**
 * ============================================================================
 * LOGIN PAGE
 * ============================================================================
 * Magic link authentication page.
 * Users enter their email to receive a login link.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import styles from './Login.module.css';

/**
 * Login page component
 */
function Login() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState(null);

  const { user, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get the page user tried to visit before being redirected to login
  const from = location.state?.from?.pathname || '/';

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      console.log('Login: User already authenticated, redirecting to', from);
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, from]);

  /**
   * Handle form submission - send magic link
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Validate email
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      console.log('Login: Sending magic link to', email);
      const result = await signIn(email);

      if (result.success) {
        setEmailSent(true);
        console.log('Login: Magic link sent successfully');
      } else {
        throw new Error(result.error || 'Failed to send magic link');
      }
    } catch (err) {
      console.error('Login: Error sending magic link', err);
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show success message after sending magic link
  if (emailSent) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
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
            <h2>Check your email</h2>
            <p>
              We've sent a magic link to <strong>{email}</strong>.
              Click the link in the email to sign in.
            </p>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setEmailSent(false);
                setEmail('');
              }}
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main login form
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <h1>Content Pipeline</h1>
          <p>Sign in to your account</p>
        </div>

        {/* Error message */}
        {error && (
          <div className={styles.error}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={isSubmitting}
              autoComplete="email"
              autoFocus
            />
          </div>

          <button
            type="submit"
            className={styles.submitButton}
            disabled={isSubmitting || !email}
          >
            {isSubmitting ? (
              <>
                <div className={styles.buttonSpinner} />
                Sending...
              </>
            ) : (
              'Send magic link'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className={styles.footer}>
          <p>
            We'll email you a magic link for a password-free sign in.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
