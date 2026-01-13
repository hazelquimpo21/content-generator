/**
 * ============================================================================
 * SIDEBAR COMPONENT
 * ============================================================================
 * Navigation sidebar with links to main application pages.
 * Highlights active route and provides quick access to key functions.
 * ============================================================================
 */

import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Settings,
  PlusCircle,
  BarChart3,
  Mic,
} from 'lucide-react';
import clsx from 'clsx';
import styles from './Sidebar.module.css';

// Navigation items
const NAV_ITEMS = [
  {
    path: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    path: '/episodes/new',
    label: 'New Episode',
    icon: PlusCircle,
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
  },
  {
    path: '/admin',
    label: 'Analytics',
    icon: BarChart3,
  },
];

/**
 * Sidebar navigation component
 */
function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      {/* Logo/Brand */}
      <div className={styles.brand}>
        <div className={styles.logo}>
          <Mic className={styles.logoIcon} />
        </div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>Content Pipeline</span>
          <span className={styles.brandTagline}>Podcast to Content</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        <ul className={styles.navList}>
          {NAV_ITEMS.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  clsx(styles.navLink, isActive && styles.navLinkActive)
                }
              >
                <item.icon className={styles.navIcon} />
                <span className={styles.navLabel}>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className={styles.footer}>
        <p className={styles.footerText}>
          Transform podcasts into
          <br />
          polished content
        </p>
      </div>
    </aside>
  );
}

export default Sidebar;
