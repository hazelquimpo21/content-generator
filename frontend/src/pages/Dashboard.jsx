/**
 * ============================================================================
 * DASHBOARD PAGE
 * ============================================================================
 * Main landing page showing all episodes with filtering and quick actions.
 * Displays episode cards with status indicators and progress.
 *
 * Features:
 * - View all episodes with status filtering
 * - Search episodes by title
 * - Navigate to episode details/review
 * - Delete episodes with confirmation
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Filter,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Trash2,
  Play,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button, Card, Badge, Spinner, ConfirmDialog } from '@components/shared';
import api from '@utils/api-client';
import styles from './Dashboard.module.css';

// Status filter options
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Episodes' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'error', label: 'Failed' },
];

/**
 * Dashboard page component
 */
function Dashboard() {
  const navigate = useNavigate();

  // State for episode list
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // State for delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // Fetch episodes on mount and filter change
  useEffect(() => {
    fetchEpisodes();
  }, [statusFilter]);

  /**
   * Fetch all episodes from the API
   */
  async function fetchEpisodes() {
    try {
      setLoading(true);
      setError(null);

      const params = {};
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const data = await api.episodes.list(params);
      setEpisodes(data.episodes || []);
    } catch (err) {
      console.error('[Dashboard] Failed to fetch episodes:', err);
      setError(err.message || 'Failed to load episodes');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handle delete button click - opens confirmation dialog
   * @param {Event} e - Click event (to stop propagation)
   * @param {Object} episode - Episode to delete
   */
  function handleDeleteClick(e, episode) {
    e.stopPropagation(); // Prevent card click navigation
    setDeleteError(null);
    setDeleteTarget(episode);
  }

  /**
   * Confirm and execute episode deletion
   */
  async function handleDeleteConfirm() {
    if (!deleteTarget) return;

    try {
      console.log('[Dashboard] Deleting episode:', deleteTarget.id);
      await api.episodes.delete(deleteTarget.id);

      console.log('[Dashboard] Episode deleted successfully');

      // Remove from local state to update UI immediately
      setEpisodes((prev) => prev.filter((ep) => ep.id !== deleteTarget.id));

      // Close the dialog
      setDeleteTarget(null);
      setDeleteError(null);
    } catch (err) {
      console.error('[Dashboard] Failed to delete episode:', err);
      // Show error in dialog instead of closing it
      setDeleteError(err.message || 'Failed to delete episode. Please try again.');
      throw err; // Re-throw to keep dialog open with loading state reset
    }
  }

  /**
   * Close delete confirmation dialog
   */
  function handleDeleteCancel() {
    setDeleteTarget(null);
    setDeleteError(null);
  }

  // Filter episodes by search query
  const filteredEpisodes = episodes.filter((episode) => {
    if (!searchQuery) return true;
    const title = episode.episode_context?.title || '';
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Get status icon (kept for potential future use)
  function getStatusIcon(status) {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className={styles.statusIconSuccess} />;
      case 'processing':
        return <Loader2 className={styles.statusIconProcessing} />;
      case 'error':
        return <AlertCircle className={styles.statusIconError} />;
      default:
        return <Clock className={styles.statusIconPending} />;
    }
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Episodes</h1>
          <p className={styles.subtitle}>
            Manage your podcast episodes and generated content
          </p>
        </div>

        <Button
          leftIcon={Plus}
          onClick={() => navigate('/episodes/new')}
        >
          New Episode
        </Button>
      </header>

      {/* Filters */}
      <div className={styles.filters}>
        {/* Search */}
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search episodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {/* Status filter */}
        <div className={styles.statusFilter}>
          <Filter className={styles.filterIcon} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.filterSelect}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner centered text="Loading episodes..." />
      ) : error ? (
        <Card className={styles.errorCard}>
          <AlertCircle className={styles.errorIcon} />
          <p className={styles.errorText}>{error}</p>
          <Button variant="secondary" onClick={fetchEpisodes}>
            Try Again
          </Button>
        </Card>
      ) : filteredEpisodes.length === 0 ? (
        <Card className={styles.emptyCard}>
          <div className={styles.emptyContent}>
            <h3>No episodes found</h3>
            <p>
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Get started by creating your first episode'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button
                leftIcon={Plus}
                onClick={() => navigate('/episodes/new')}
              >
                Create Episode
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className={styles.grid}>
          {filteredEpisodes.map((episode) => (
            <EpisodeCard
              key={episode.id}
              episode={episode}
              onDelete={handleDeleteClick}
              onClick={() => {
                if (episode.status === 'processing') {
                  navigate(`/episodes/${episode.id}/processing`);
                } else if (episode.status === 'completed') {
                  navigate(`/episodes/${episode.id}/review`);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Episode"
        message={`Are you sure you want to delete "${deleteTarget?.episode_context?.title || 'this episode'}"?`}
        description={
          deleteError ||
          'This action cannot be undone. All generated content for this episode will be permanently deleted.'
        }
        confirmLabel="Delete Episode"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}

/**
 * Episode card component
 * Displays episode info with status, progress, and action buttons.
 *
 * @param {Object} episode - Episode data object
 * @param {Function} onClick - Handler for card click (navigation)
 * @param {Function} onDelete - Handler for delete button click
 */
function EpisodeCard({ episode, onClick, onDelete }) {
  const title = episode.episode_context?.title || 'Untitled Episode';
  const createdAt = episode.created_at
    ? format(new Date(episode.created_at), 'MMM d, yyyy')
    : '';

  const progress = episode.current_stage
    ? Math.round((episode.current_stage / 9) * 100)
    : 0;

  // Allow deletion of episodes in any status
  const canDelete = true;

  return (
    <Card
      className={styles.episodeCard}
      hoverable
      onClick={onClick}
      padding="md"
    >
      <div className={styles.cardHeader}>
        <Badge status={episode.status} dot>
          {episode.status}
        </Badge>
        <span className={styles.cardDate}>{createdAt}</span>
      </div>

      <h3 className={styles.cardTitle}>{title}</h3>

      {episode.status === 'processing' && (
        <div className={styles.progressWrapper}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={styles.progressText}>
            Stage {episode.current_stage}/9
          </span>
        </div>
      )}

      {episode.status === 'completed' && episode.total_cost_usd && (
        <p className={styles.cardMeta}>
          Cost: ${episode.total_cost_usd.toFixed(4)}
        </p>
      )}

      {episode.status === 'error' && episode.error_message && (
        <p className={styles.cardError}>{episode.error_message}</p>
      )}

      {/* Card footer with actions */}
      <div className={styles.cardFooter}>
        <div className={styles.cardAction}>
          <span>
            {episode.status === 'completed' ? 'View Content' : 'View Details'}
          </span>
          <ChevronRight size={16} />
        </div>

        {/* Delete button - disabled for processing episodes */}
        {canDelete && (
          <button
            className={styles.deleteButton}
            onClick={(e) => onDelete(e, episode)}
            title="Delete episode"
            aria-label="Delete episode"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </Card>
  );
}

export default Dashboard;
