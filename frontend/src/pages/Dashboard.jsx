/**
 * ============================================================================
 * DASHBOARD PAGE
 * ============================================================================
 * Main landing page showing all episodes with filtering and quick actions.
 * Displays episode cards with status indicators and progress.
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
} from 'lucide-react';
import { format } from 'date-fns';
import { Button, Card, Badge, Spinner, Input } from '@components/shared';
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

  // State
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch episodes on mount and filter change
  useEffect(() => {
    fetchEpisodes();
  }, [statusFilter]);

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
      setError(err.message || 'Failed to load episodes');
    } finally {
      setLoading(false);
    }
  }

  // Filter episodes by search query
  const filteredEpisodes = episodes.filter((episode) => {
    if (!searchQuery) return true;
    const title = episode.episode_context?.title || '';
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Get status icon
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
    </div>
  );
}

/**
 * Episode card component
 */
function EpisodeCard({ episode, onClick }) {
  const title = episode.episode_context?.title || 'Untitled Episode';
  const createdAt = episode.created_at
    ? format(new Date(episode.created_at), 'MMM d, yyyy')
    : '';

  const progress = episode.current_stage
    ? Math.round((episode.current_stage / 9) * 100)
    : 0;

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

      <div className={styles.cardAction}>
        <span>
          {episode.status === 'completed' ? 'View Content' : 'View Details'}
        </span>
        <ChevronRight size={16} />
      </div>
    </Card>
  );
}

export default Dashboard;
