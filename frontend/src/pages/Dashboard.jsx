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

import { useState, useEffect, useRef } from 'react';
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
import { format, formatDistanceToNow } from 'date-fns';
import { Button, Card, Badge, Spinner, ConfirmDialog, useToast } from '@components/shared';
import api from '@utils/api-client';
import styles from './Dashboard.module.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const POLL_INTERVAL_PROCESSING = 3000; // Poll every 3 seconds when processing
const ESTIMATED_DURATION_SECONDS = 210; // Average processing time (~3.5 minutes)
const TOTAL_PHASES = 5; // 5-phase architecture

// Stage to phase mapping for progress calculation
const STAGE_TO_PHASE = {
  0: 1, // pregate
  1: 2, 2: 2, // extract
  3: 3, 4: 3, 5: 3, // plan
  6: 4, 7: 4, // write
  8: 5, 9: 5, // distribute
};

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
  const { showToast } = useToast();

  // State for episode list
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // State for delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // Polling ref for processing episodes
  const pollIntervalRef = useRef(null);
  const previousStatusRef = useRef({});

  // Fetch episodes on mount and filter change
  useEffect(() => {
    fetchEpisodes();
  }, [statusFilter]);

  // Poll for updates when there are processing episodes
  useEffect(() => {
    const processingEpisodes = episodes.filter((ep) => ep.status === 'processing');

    if (processingEpisodes.length === 0) {
      // No processing episodes, stop polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Start polling
    pollIntervalRef.current = setInterval(async () => {
      try {
        const params = {};
        if (statusFilter !== 'all') {
          params.status = statusFilter;
        }
        const data = await api.episodes.list(params);
        const newEpisodes = data.episodes || [];

        // Check for newly completed episodes and show toast
        newEpisodes.forEach((newEp) => {
          const prevStatus = previousStatusRef.current[newEp.id];
          if (prevStatus === 'processing' && newEp.status === 'completed') {
            const title = newEp.title || newEp.episode_context?.title || 'Episode';
            showToast({
              message: 'Processing complete!',
              description: `"${title}" is ready to review.`,
              variant: 'success',
              duration: 6000,
              action: () => navigate(`/episodes/${newEp.id}/review`),
              actionLabel: 'View content',
            });
          }
        });

        // Update previous status ref
        newEpisodes.forEach((ep) => {
          previousStatusRef.current[ep.id] = ep.status;
        });

        setEpisodes(newEpisodes);
      } catch (err) {
        console.error('[Dashboard] Failed to poll episodes:', err);
      }
    }, POLL_INTERVAL_PROCESSING);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [episodes.filter((ep) => ep.status === 'processing').length, statusFilter]);

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
    const title = episode.title || episode.episode_context?.title || '';
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
        message={`Are you sure you want to delete "${deleteTarget?.title || deleteTarget?.episode_context?.title || 'this episode'}"?`}
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
  // Check title from multiple sources: AI-generated (episode.title), user-provided (episode_context.title)
  const title = episode.title || episode.episode_context?.title || 'Untitled Episode';
  const createdAt = episode.created_at
    ? format(new Date(episode.created_at), 'MMM d, yyyy')
    : '';

  // Calculate phase progress based on current stage
  const currentPhase = episode.current_stage !== undefined
    ? STAGE_TO_PHASE[episode.current_stage] || 1
    : 0;
  const progress = Math.round((currentPhase / TOTAL_PHASES) * 100);

  // Calculate time estimate for processing episodes
  const getProcessingTimeInfo = () => {
    if (episode.status !== 'processing') return null;

    const startTime = episode.processing_started_at
      ? new Date(episode.processing_started_at)
      : new Date(episode.updated_at);
    const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
    const remaining = Math.max(0, ESTIMATED_DURATION_SECONDS - elapsed);

    if (remaining > 60) {
      return `~${Math.ceil(remaining / 60)}m remaining`;
    }
    if (remaining > 0) {
      return `~${remaining}s remaining`;
    }
    return 'Finishing up...';
  };

  // Allow deletion of episodes in any status
  const canDelete = true;

  return (
    <Card
      className={`${styles.episodeCard} ${episode.status === 'processing' ? styles.processingCard : ''}`}
      hoverable
      onClick={onClick}
      padding="md"
    >
      <div className={styles.cardHeader}>
        <Badge status={episode.status} dot>
          {episode.status === 'processing' ? 'Processing...' : episode.status}
        </Badge>
        <span className={styles.cardDate}>{createdAt}</span>
      </div>

      <h3 className={styles.cardTitle}>{title}</h3>

      {episode.status === 'processing' && (
        <div className={styles.processingStatus}>
          <div className={styles.progressWrapper}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className={styles.progressText}>
              Phase {currentPhase}/{TOTAL_PHASES}
            </span>
          </div>
          <p className={styles.timeEstimate}>
            <Loader2 className={styles.miniSpinner} size={12} />
            {getProcessingTimeInfo()}
          </p>
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
            {episode.status === 'completed'
              ? 'View Content'
              : episode.status === 'processing'
                ? 'View Progress'
                : 'View Details'}
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
