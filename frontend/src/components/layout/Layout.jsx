/**
 * ============================================================================
 * LAYOUT COMPONENT
 * ============================================================================
 * Main application layout with sidebar navigation and content area.
 * Uses React Router's Outlet for rendering page content.
 * Adjusts for AdminBar when user is a superadmin.
 * ============================================================================
 */

import { Outlet } from 'react-router-dom';
import clsx from 'clsx';
import Sidebar from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Layout.module.css';

/**
 * Main layout wrapper
 * Adds top padding when AdminBar is visible (superadmin users)
 */
function Layout() {
  const { isSuperadmin } = useAuth();

  return (
    <div className={clsx(styles.layout, isSuperadmin() && styles.hasAdminBar)}>
      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main content area */}
      <main className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Layout;
