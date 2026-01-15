/**
 * ============================================================================
 * SIDEBAR COMPONENT
 * ============================================================================
 * Navigation sidebar with links to main application pages.
 * Shows different navigation items based on user role.
 * Includes user profile info and logout functionality.
 * ============================================================================
 */

import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Settings,
  PlusCircle,
  BarChart3,
  Mic,
  LogOut,
  User,
  Bookmark,
  Calendar,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Sidebar.module.css';

// Navigation items (non-admin)
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
    path: '/library',
    label: 'Library',
    icon: Bookmark,
  },
  {
    path: '/calendar',
    label: 'Calendar',
    icon: Calendar,
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
  },
];

// Admin-only navigation item
const ADMIN_NAV_ITEM = {
  path: '/admin',
  label: 'Analytics',
  icon: BarChart3,
};

/**
 * Sidebar navigation component
 * Shows different navigation items based on user role.
 */
function Sidebar() {
  const { user, isSuperadmin, signOut } = useAuth();

  // Build navigation items based on role
  const navItems = isSuperadmin()
    ? [...NAV_ITEMS, ADMIN_NAV_ITEM]
    : NAV_ITEMS;

  // Get display name
  const displayName = user?.display_name || user?.email?.split('@')[0] || 'User';
  const userEmail = user?.email || '';

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
          {navItems.map((item) => (
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

      {/* User Profile Section */}
      <div className={styles.userSection}>
        <div className={styles.userInfo}>
          <div className={styles.userAvatar}>
            <User size={18} />
          </div>
          <div className={styles.userDetails}>
            <span className={styles.userName}>{displayName}</span>
            <span className={styles.userEmail}>{userEmail}</span>
          </div>
        </div>
        <button
          type="button"
          className={styles.logoutButton}
          onClick={signOut}
          title="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>

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
