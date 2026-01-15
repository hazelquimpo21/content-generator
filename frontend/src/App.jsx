/**
 * ============================================================================
 * APP COMPONENT
 * ============================================================================
 * Root application component with routing configuration.
 * Sets up authentication, main layout structure, and page routes.
 *
 * Route Types:
 * - Public routes: /login, /auth/callback (no auth required)
 * - Protected routes: /, /settings, /episodes/* (auth required)
 * - Admin routes: /admin (auth + superadmin role required)
 * ============================================================================
 */

import { Routes, Route } from 'react-router-dom';

// Authentication
import { AuthProvider } from './contexts/AuthContext';
import { ProcessingProvider } from './contexts/ProcessingContext';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Global UI
import { ToastProvider } from './components/shared';

// Layout
import Layout from './components/layout/Layout';
import AdminBar from './components/layout/AdminBar';

// Public Pages
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';

// Protected Pages
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import NewEpisode from './pages/NewEpisode';
import ProcessingScreen from './pages/ProcessingScreen';
import ReviewHub from './pages/ReviewHub';
import ContentLibrary from './pages/ContentLibrary';
import ContentCalendar from './pages/ContentCalendar';

// Admin Pages (superadmin only)
import AdminDashboard from './pages/AdminDashboard';

// Error Pages
import NotFound from './pages/NotFound';

/**
 * Main App component
 * Wraps application in AuthProvider and defines routes
 */
function App() {
  return (
    <AuthProvider>
      <ProcessingProvider>
        <ToastProvider>
          {/* Admin bar - only visible to superadmins */}
          <AdminBar />

          <Routes>
        {/* ================================================================== */}
        {/* PUBLIC ROUTES - No authentication required */}
        {/* ================================================================== */}

        {/* Login page */}
        <Route path="/login" element={<Login />} />

        {/* Magic link callback handler */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* ================================================================== */}
        {/* PROTECTED ROUTES - Authentication required */}
        {/* ================================================================== */}

        <Route element={<ProtectedRoute />}>
          {/* Main layout wrapper for authenticated pages */}
          <Route path="/" element={<Layout />}>
            {/* Dashboard - default landing page */}
            <Route index element={<Dashboard />} />

            {/* Settings - configure user settings and preferences */}
            <Route path="settings" element={<Settings />} />

            {/* New Episode - upload and configure new episode */}
            <Route path="episodes/new" element={<NewEpisode />} />

            {/* Processing - watch episode being processed */}
            <Route path="episodes/:id/processing" element={<ProcessingScreen />} />

            {/* Review Hub - view and edit generated content */}
            <Route path="episodes/:id/review" element={<ReviewHub />} />

            {/* Content Library - saved content pieces */}
            <Route path="library" element={<ContentLibrary />} />

            {/* Content Calendar - scheduled content */}
            <Route path="calendar" element={<ContentCalendar />} />
          </Route>
        </Route>

        {/* ================================================================== */}
        {/* ADMIN ROUTES - Superadmin role required */}
        {/* ================================================================== */}

        <Route element={<ProtectedRoute requireSuperadmin />}>
          <Route path="/" element={<Layout />}>
            {/* Admin Dashboard - analytics and monitoring */}
            <Route path="admin" element={<AdminDashboard />} />
          </Route>
        </Route>

        {/* ================================================================== */}
        {/* CATCH-ALL - 404 Page */}
        {/* ================================================================== */}

        <Route path="*" element={<NotFound />} />
          </Routes>
        </ToastProvider>
      </ProcessingProvider>
    </AuthProvider>
  );
}

export default App;
