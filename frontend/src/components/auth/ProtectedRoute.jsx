/**
 * ============================================================================
 * PROTECTED ROUTE COMPONENT
 * ============================================================================
 * Route wrapper that requires authentication to access.
 * Redirects unauthenticated users to login page.
 * Optionally requires superadmin role for admin-only routes.
 *
 * Usage:
 *   // Protected route (any authenticated user)
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<Dashboard />} />
 *   </Route>
 *
 *   // Admin-only route (requires superadmin role)
 *   <Route element={<ProtectedRoute requireSuperadmin />}>
 *     <Route path="/admin" element={<AdminDashboard />} />
 *   </Route>
 * ============================================================================
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Spinner } from '../shared';

/**
 * ProtectedRoute component
 *
 * @param {Object} props - Component props
 * @param {boolean} [props.requireSuperadmin=false] - Require superadmin role
 * @param {React.ReactNode} [props.children] - Child components (alternative to Outlet)
 */
function ProtectedRoute({ requireSuperadmin = false, children }) {
  const { user, loading, isSuperadmin } = useAuth();
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
          Checking authentication...
        </p>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    console.log('ProtectedRoute: User not authenticated, redirecting to login');
    // Save the attempted URL to redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check superadmin requirement for admin routes
  if (requireSuperadmin && !isSuperadmin()) {
    console.log('ProtectedRoute: User is not superadmin, access denied');
    // Show access denied or redirect to dashboard
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <h1 style={{ color: 'var(--danger, #e74c3c)', margin: 0 }}>
          Access Denied
        </h1>
        <p style={{ color: 'var(--text-secondary, #666)', maxWidth: '400px' }}>
          You don't have permission to access this page.
          This area is restricted to administrators only.
        </p>
        <a
          href="/"
          style={{
            color: 'var(--primary, #3498db)',
            textDecoration: 'none',
            marginTop: '1rem',
          }}
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  // User is authenticated (and superadmin if required)
  // Render children or Outlet for nested routes
  return children || <Outlet />;
}

export default ProtectedRoute;
