/**
 * ============================================================================
 * ONBOARDING ROUTE COMPONENT
 * ============================================================================
 * Route wrapper that redirects users who haven't completed onboarding.
 *
 * Behavior:
 * - If user hasn't completed onboarding, redirect to /onboarding
 * - If user has completed onboarding, render children/Outlet
 *
 * Usage:
 *   <Route element={<OnboardingRoute />}>
 *     <Route path="/" element={<Dashboard />} />
 *   </Route>
 * ============================================================================
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Spinner } from '../shared';

/**
 * OnboardingRoute component
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} [props.children] - Child components (alternative to Outlet)
 */
function OnboardingRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '1rem',
      }}>
        <Spinner size="large" />
        <p style={{ color: 'var(--text-secondary, #666)' }}>
          Loading...
        </p>
      </div>
    );
  }

  // If no user, ProtectedRoute will handle the redirect to login
  if (!user) {
    return children || <Outlet />;
  }

  // Check if user has completed onboarding
  const hasCompletedOnboarding = user.onboarding_complete;

  // If not completed and not already on onboarding page, redirect to onboarding
  if (!hasCompletedOnboarding && location.pathname !== '/onboarding') {
    console.log('OnboardingRoute: User needs onboarding, redirecting');
    return <Navigate to="/onboarding" state={{ from: location }} replace />;
  }

  // User has completed onboarding, render children
  return children || <Outlet />;
}

export default OnboardingRoute;
