/**
 * ============================================================================
 * FEED EPISODES LIST
 * ============================================================================
 * Displays episodes from a podcast feed with transcription/processing actions.
 * Shows which episodes have been processed and allows transcribing new ones.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  CheckCircle,
  Circle,
  Loader2,
  AlertCircle,
  Clock,
  Calendar,
  ArrowLeft,
  Filter,
  Search,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Button, Input, Spinner, useToast } from '@components/shared';
import api from '@utils/api-client';
import styles from './FeedEpisodesList.module.css';

/**
 * Status filter options
 */
const STATUS_FILTERS = [
  { value: '', label: 'All Episodes' },
  { value: 'available', label: 'Not Processed' },
  { value: 'processed', label: 'Processed' },
  { value: 'transcribing', label: 'In Progress' },
  { value: 'error', label: 'Errors' },
];

/**
 * Format duration from seconds
 */
function formatDuration(seconds) {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

/**
 * Format date
 */
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * FeedEpisodesList component
 */
function FeedEpisodesList({ feed, onBack, onEpisodeProcessed }) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [episodes, setEpisodes] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [offset, setOffset] = useState(0);
  const limit = 20;

  // Transcription state
  const [transcribing, setTranscribing] = useState({}); // episodeId -> true/false

  // Load episodes
  useEffect(() => {
    loadEpisodes();
  }, [feed.id, statusFilter, offset]);

  async function loadEpisodes() {
    try {
      setLoading(true);
      setError(null);

      const response = await api.podcasts.getFeed(feed.id, {
        status: statusFilter || undefined,
        limit,
        offset,
      });

      setEpisodes(response.episodes || []);
      setCounts(response.counts || {});
      setTotal(response.total || 0);
    } catch (err) {
      console.error('Failed to load episodes:', err);
      setError(err.message || 'Failed to load episodes');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Filter episodes by search query (client-side)
   */
  const filteredEpisodes = searchQuery
    ? episodes.filter(ep =>
        ep.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : episodes;

  /**
   * Transcribe an episode
   */
  async function handleTranscribe(episode, startProcessing = false) {
    try {
      setTranscribing(prev => ({ ...prev, [episode.id]: true }));

      showToast({
        message: 'Transcription started',
        description: `Transcribing "${episode.title}". This may take a few minutes.`,
        variant: 'processing',
      });

      const result = await api.podcasts.transcribeEpisode(episode.id, {
        startProcessing,
      });

      // Update episode status in list
      setEpisodes(prev =>
        prev.map(ep =>
          ep.id === episode.id
            ? { ...ep, status: 'processed', episode_id: result.episode.id }
            : ep
        )
      );

      showToast({
        message: startProcessing ? 'Processing started!' : 'Transcription complete!',
        description: startProcessing
          ? 'Your episode is being processed. You\'ll be notified when ready.'
          : 'The transcript is ready. You can now generate content from it.',
        variant: 'success',
        action: () => navigate(`/episodes/${result.episode.id}`),
        actionLabel: 'View Episode',
      });

      onEpisodeProcessed?.(result.episode);

      // Reload to update counts
      loadEpisodes();
    } catch (err) {
      console.error('Transcription failed:', err);
      showToast({
        message: 'Transcription failed',
        description: err.message || 'Could not transcribe episode. Please try again.',
        variant: 'error',
      });

      // Update episode status to error
      setEpisodes(prev =>
        prev.map(ep =>
          ep.id === episode.id
            ? { ...ep, status: 'error', error_message: err.message }
            : ep
        )
      );
    } finally {
      setTranscribing(prev => ({ ...prev, [episode.id]: false }));
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBack}
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>

        <div className={styles.headerInfo}>
          {feed.artwork_url && (
            <img
              src={feed.artwork_url}
              alt={feed.title}
              className={styles.headerArtwork}
            />
          )}
          <div>
            <h2 className={styles.headerTitle}>{feed.title}</h2>
            <p className={styles.headerMeta}>
              {total} episode{total !== 1 ? 's' : ''} ·{' '}
              {counts.processed || 0} processed
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <Input
            placeholder="Search episodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={Search}
          />
        </div>

        <div className={styles.statusFilter}>
          <Filter size={16} />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setOffset(0);
            }}
            className={styles.filterSelect}
          >
            {STATUS_FILTERS.map(filter => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
                {filter.value && counts[filter.value] !== undefined
                  ? ` (${counts[filter.value]})`
                  : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.error}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && episodes.length === 0 && (
        <Spinner centered text="Loading episodes..." />
      )}

      {/* Episodes list */}
      {!loading && filteredEpisodes.length === 0 && (
        <div className={styles.empty}>
          <p>No episodes found</p>
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery('')}
            >
              Clear search
            </Button>
          )}
        </div>
      )}

      {filteredEpisodes.length > 0 && (
        <div className={styles.episodesList}>
          {filteredEpisodes.map(episode => (
            <EpisodeRow
              key={episode.id}
              episode={episode}
              transcribing={transcribing[episode.id]}
              onTranscribe={() => handleTranscribe(episode, false)}
              onTranscribeAndProcess={() => handleTranscribe(episode, true)}
              onViewEpisode={() => {
                if (episode.episode_id) {
                  navigate(`/episodes/${episode.episode_id}`);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className={styles.pagination}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0 || loading}
          >
            Previous
          </Button>
          <span className={styles.pageInfo}>
            {offset + 1} - {Math.min(offset + limit, total)} of {total}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total || loading}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Episode row component
 */
function EpisodeRow({
  episode,
  transcribing,
  onTranscribe,
  onTranscribeAndProcess,
  onViewEpisode,
}) {
  const StatusIcon = {
    available: Circle,
    transcribing: Loader2,
    processed: CheckCircle,
    error: AlertCircle,
  }[episode.status] || Circle;

  const statusColor = {
    available: styles.statusAvailable,
    transcribing: styles.statusTranscribing,
    processed: styles.statusProcessed,
    error: styles.statusError,
  }[episode.status];

  return (
    <div className={styles.episodeRow}>
      {/* Status indicator */}
      <div className={`${styles.statusIcon} ${statusColor}`}>
        <StatusIcon
          size={18}
          className={episode.status === 'transcribing' ? styles.spinning : ''}
        />
      </div>

      {/* Episode info */}
      <div className={styles.episodeInfo}>
        <h4 className={styles.episodeTitle}>{episode.title}</h4>
        <div className={styles.episodeMeta}>
          {episode.published_at && (
            <span>
              <Calendar size={12} />
              {formatDate(episode.published_at)}
            </span>
          )}
          {episode.duration_seconds && (
            <span>
              <Clock size={12} />
              {formatDuration(episode.duration_seconds)}
            </span>
          )}
          {episode.episode_number && (
            <span>Ep. {episode.episode_number}</span>
          )}
        </div>
        {episode.error_message && (
          <p className={styles.errorMessage}>{episode.error_message}</p>
        )}
      </div>

      {/* Actions */}
      <div className={styles.episodeActions}>
        {episode.status === 'processed' && episode.episode_id && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewEpisode}
            rightIcon={ExternalLink}
          >
            View
          </Button>
        )}

        {(episode.status === 'available' || episode.status === 'error') && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onTranscribe}
              disabled={transcribing}
              leftIcon={transcribing ? Loader2 : Play}
            >
              {transcribing ? 'Transcribing...' : 'Transcribe'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onTranscribeAndProcess}
              disabled={transcribing}
              leftIcon={transcribing ? Loader2 : Sparkles}
            >
              {transcribing ? 'Processing...' : 'Transcribe & Generate'}
            </Button>
          </>
        )}

        {episode.status === 'transcribing' && (
          <span className={styles.inProgressLabel}>
            <Loader2 size={14} className={styles.spinning} />
            In Progress
          </span>
        )}
      </div>
    </div>
  );
}

export default FeedEpisodesList;
