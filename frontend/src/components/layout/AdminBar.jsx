/**
 * ============================================================================
 * ADMIN BAR COMPONENT
 * ============================================================================
 * A fixed top bar that appears for superadmin users.
 * Shows admin status and quick access to admin functions.
 * Only visible to users with superadmin role.
 *
 * Features:
 * - Shows "Admin Mode" indicator
 * - Quick link to Admin Dashboard
 * - User info and logout
 * - View all users' episodes toggle (when on dashboard)
 * ============================================================================
 */

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './AdminBar.module.css';

/**
 * AdminBar component
 * Only renders if user is a superadmin
 */
function AdminBar() {
  const { user, isSuperadmin, signOut } = useAuth();
  const location = useLocation();

  // Only show for superadmins
  if (!isSuperadmin()) {
    return null;
  }

  const isOnAdminPage = location.pathname.startsWith('/admin');

  return (
    <div className={styles.adminBar}>
      <div className={styles.content}>
        {/* Left side - Admin indicator */}
        <div className={styles.left}>
          <span className={styles.badge}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Superadmin
          </span>
        </div>

        {/* Center - Navigation */}
        <div className={styles.center}>
          {!isOnAdminPage && (
            <Link to="/admin" className={styles.adminLink}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              Admin Dashboard
            </Link>
          )}
          {isOnAdminPage && (
            <Link to="/" className={styles.adminLink}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Back to App
            </Link>
          )}
        </div>

        {/* Right side - User info & logout */}
        <div className={styles.right}>
          <span className={styles.userInfo}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {user?.display_name || user?.email?.split('@')[0] || 'Admin'}
          </span>
          <button
            type="button"
            className={styles.logoutButton}
            onClick={signOut}
            title="Sign out"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminBar;
