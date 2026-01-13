/**
 * ============================================================================
 * APP COMPONENT
 * ============================================================================
 * Root application component with routing configuration.
 * Sets up the main layout structure and page routes.
 * ============================================================================
 */

import { Routes, Route, Navigate } from 'react-router-dom';

// Layout
import Layout from './components/layout/Layout';

// Pages
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import NewEpisode from './pages/NewEpisode';
import ProcessingScreen from './pages/ProcessingScreen';
import ReviewHub from './pages/ReviewHub';
import AdminDashboard from './pages/AdminDashboard';
import NotFound from './pages/NotFound';

/**
 * Main App component
 * Defines the application routes and layout structure
 */
function App() {
  return (
    <Routes>
      {/* Main layout wrapper for all pages */}
      <Route path="/" element={<Layout />}>
        {/* Dashboard - default landing page */}
        <Route index element={<Dashboard />} />

        {/* Settings - configure evergreen content */}
        <Route path="settings" element={<Settings />} />

        {/* New Episode - upload and configure new episode */}
        <Route path="episodes/new" element={<NewEpisode />} />

        {/* Processing - watch episode being processed */}
        <Route path="episodes/:id/processing" element={<ProcessingScreen />} />

        {/* Review Hub - view and edit generated content */}
        <Route path="episodes/:id/review" element={<ReviewHub />} />

        {/* Admin Dashboard - analytics and monitoring */}
        <Route path="admin" element={<AdminDashboard />} />

        {/* 404 Page */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default App;
