/**
 * ============================================================================
 * LAYOUT COMPONENT
 * ============================================================================
 * Main application layout with sidebar navigation and content area.
 * Uses React Router's Outlet for rendering page content.
 * ============================================================================
 */

import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import styles from './Layout.module.css';

/**
 * Main layout wrapper
 */
function Layout() {
  return (
    <div className={styles.layout}>
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
