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
  X,
  Mic,
  ArrowRight,
  Zap,
  Rss,
  Circle,
  Sparkles,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Button, Card, Badge, Spinner, ConfirmDialog, useToast, ActiveTaskBanner, TASK_TYPE, TASK_STATUS } from '@components/shared';
import { useUpload, UPLOAD_STATE } from '../contexts/UploadContext';
import { useTranscription } from '../contexts/TranscriptionContext';
import api from '@utils/api-client';
import styles from './Dashboard.module.css';

// Transcription progress estimation constants
// Based on observed data: ~4 seconds processing per MB of audio file
const SECONDS_PER_MB = 4;

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
  const upload = useUpload();
  const {
    hasActiveTranscription,
    activeTranscription,
    startTranscription,
    progress: feedTranscriptionProgress,
    timeRemaining: feedTimeRemaining,
    currentStep,
    stepInfo,
    hasReadyDraft,
    draftEpisode,
    draftFeedEpisode,
    clearDraft,
    consumeDraft,
  } = useTranscription();

  // State for episode list
  const [episodes, setEpisodes] = useState([]);
  const [processingEpisodes, setProcessingEpisodes] = useState([]); // Always track processing episodes
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // State for podcast feeds section
  const [podcastFeeds, setPodcastFeeds] = useState([]);
  const [recentFeedEpisodes, setRecentFeedEpisodes] = useState([]);
  const [feedsLoading, setFeedsLoading] = useState(true);

  // State for delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // Polling ref for processing episodes
  const pollIntervalRef = useRef(null);
  const previousStatusRef = useRef({});

  // Track transcription elapsed time for progress estimation
  const [transcriptionElapsed, setTranscriptionElapsed] = useState(0);
  const transcriptionStartRef = useRef(null);

  // Track transcription elapsed time
  useEffect(() => {
    if (upload.state === UPLOAD_STATE.TRANSCRIBING) {
      if (!transcriptionStartRef.current) {
        transcriptionStartRef.current = Date.now();
      }

      const timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - transcriptionStartRef.current) / 1000);
        setTranscriptionElapsed(elapsed);
      }, 1000);

      return () => clearInterval(timer);
    } else if (upload.state !== UPLOAD_STATE.TRANSCRIBING) {
      transcriptionStartRef.current = null;
      setTranscriptionElapsed(0);
    }
  }, [upload.state]);

  // Calculate transcription progress estimate
  const fileSizeMB = upload.file ? upload.file.size / (1024 * 1024) : 0;
  const estimatedTotalSeconds = Math.ceil(fileSizeMB * SECONDS_PER_MB);
  const transcriptionProgress = estimatedTotalSeconds > 0
    ? Math.min(95, Math.round((transcriptionElapsed / estimatedTotalSeconds) * 100))
    : 0;

  // Calculate time remaining estimate
  const getTimeEstimate = () => {
    if (upload.state !== UPLOAD_STATE.TRANSCRIBING) return null;
    const remaining = Math.max(0, estimatedTotalSeconds - transcriptionElapsed);
    if (remaining > 60) return `~${Math.ceil(remaining / 60)}m remaining`;
    if (remaining > 0) return `~${remaining}s remaining`;
    return 'Almost done...';
  };

  // Fetch episodes on mount and filter change
  useEffect(() => {
    fetchEpisodes();
    fetchPodcastFeeds();
  }, [statusFilter]);

  // Fetch podcast feeds for quick import section
  async function fetchPodcastFeeds() {
    try {
      setFeedsLoading(true);
      const feedsResponse = await api.podcasts.listFeeds();
      const feeds = feedsResponse.feeds || [];
      setPodcastFeeds(feeds);

      // Get recent episodes from first feed (all statuses)
      if (feeds.length > 0) {
        const feed = feeds[0];
        const episodesResponse = await api.podcasts.getFeed(feed.id, {
          limit: 5,
          offset: 0,
        });
        setRecentFeedEpisodes(episodesResponse.episodes || []);
      }
    } catch (err) {
      console.error('[Dashboard] Failed to fetch podcast feeds:', err);
      // Silent fail - don't block dashboard for feed errors
    } finally {
      setFeedsLoading(false);
    }
  }

  // Poll for updates when there are processing episodes
  useEffect(() => {
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
        // Always fetch processing episodes to track their progress
        const [filteredData, processingData] = await Promise.all([
          api.episodes.list(statusFilter !== 'all' ? { status: statusFilter } : {}),
          api.episodes.list({ status: 'processing' }),
        ]);

        const newEpisodes = filteredData.episodes || [];
        const newProcessingEpisodes = processingData.episodes || [];

        // Check for newly completed episodes and show toast
        processingEpisodes.forEach((prevEp) => {
          const stillProcessing = newProcessingEpisodes.find(ep => ep.id === prevEp.id);
          if (!stillProcessing) {
            // Episode is no longer processing - check if it completed
            const completedEp = newEpisodes.find(ep => ep.id === prevEp.id && ep.status === 'completed');
            if (completedEp) {
              const title = completedEp.title || completedEp.episode_context?.title || 'Episode';
              showToast({
                message: 'Processing complete!',
                description: `"${title}" is ready to review.`,
                variant: 'success',
                duration: 6000,
                action: () => navigate(`/episodes/${completedEp.id}/review`),
                actionLabel: 'View content',
              });
            }
          }
        });

        setEpisodes(newEpisodes);
        setProcessingEpisodes(newProcessingEpisodes);
      } catch (err) {
        console.error('[Dashboard] Failed to poll episodes:', err);
      }
    }, POLL_INTERVAL_PROCESSING);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [processingEpisodes.length, statusFilter]);

  /**
   * Fetch all episodes from the API
   * Also fetches processing episodes separately so they always show
   */
  async function fetchEpisodes() {
    try {
      setLoading(true);
      setError(null);

      const params = {};
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      // Fetch filtered episodes and processing episodes in parallel
      const [filteredData, processingData] = await Promise.all([
        api.episodes.list(params),
        // Always fetch processing episodes so they show in the card
        statusFilter !== 'processing' ? api.episodes.list({ status: 'processing' }) : null,
      ]);

      setEpisodes(filteredData.episodes || []);

      // Set processing episodes (either from filter or separate fetch)
      if (statusFilter === 'processing') {
        setProcessingEpisodes(filteredData.episodes || []);
      } else {
        setProcessingEpisodes(processingData?.episodes || []);
      }
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

      {/* Audio Upload/Transcription Banner */}
      {(upload.isProcessing || upload.hasReadyTranscript) && (
        <ActiveTaskBanner
          taskType={upload.state === UPLOAD_STATE.UPLOADING ? TASK_TYPE.AUDIO_UPLOAD : TASK_TYPE.AUDIO_TRANSCRIBE}
          status={upload.hasReadyTranscript ? TASK_STATUS.COMPLETE : TASK_STATUS.PROCESSING}
          title={upload.hasReadyTranscript ? 'Transcript Ready' : (upload.state === UPLOAD_STATE.UPLOADING ? 'Uploading Audio' : 'Transcribing Audio')}
          description={upload.hasReadyTranscript
            ? `${upload.file?.name || 'Audio file'} has been transcribed. Fill in the episode details to start generating content.`
            : upload.file?.name
          }
          progress={upload.state === UPLOAD_STATE.UPLOADING ? upload.uploadProgress : transcriptionProgress}
          timeRemaining={getTimeEstimate()}
          speed={upload.state === UPLOAD_STATE.UPLOADING ? upload.uploadSpeed : undefined}
          onAction={() => navigate('/episodes/new')}
          actionLabel={upload.hasReadyTranscript ? 'Continue Setup' : 'View Details'}
          onDismiss={() => {
            upload.reset();
            showToast({
              message: 'Draft dismissed',
              description: 'Upload a new audio file when you\'re ready.',
              variant: 'info',
              duration: 4000,
            });
          }}
          showDismiss={upload.hasReadyTranscript}
        />
      )}

      {/* Feed Transcription Banner */}
      {(hasActiveTranscription || hasReadyDraft) && (
        <ActiveTaskBanner
          taskType={TASK_TYPE.FEED_TRANSCRIBE}
          status={hasReadyDraft ? TASK_STATUS.COMPLETE : TASK_STATUS.PROCESSING}
          title={hasReadyDraft ? 'Episode Ready' : undefined}
          description={hasReadyDraft
            ? `${draftFeedEpisode?.title || draftEpisode?.title} has been transcribed. Add details and generate content.`
            : activeTranscription?.title
          }
          progress={feedTranscriptionProgress}
          timeRemaining={feedTimeRemaining}
          currentStep={currentStep}
          stepInfo={stepInfo}
          onAction={hasReadyDraft ? () => {
            if (draftEpisode) {
              navigate(`/episodes/${draftEpisode.id}/submit`);
            }
          } : undefined}
          actionLabel={hasReadyDraft ? 'Continue' : undefined}
          onDismiss={() => {
            clearDraft();
            showToast({
              message: 'Draft dismissed',
              description: 'You can transcribe another episode when ready.',
              variant: 'info',
              duration: 4000,
            });
          }}
          showDismiss={hasReadyDraft}
        />
      )}

      {/* From Your Podcast - Quick access to import feed episodes */}
      {!feedsLoading && podcastFeeds.length > 0 && recentFeedEpisodes.length > 0 && (
        <PodcastQuickImport
          feed={podcastFeeds[0]}
          episodes={recentFeedEpisodes}
          hasActiveTranscription={hasActiveTranscription}
          activeTranscription={activeTranscription}
          onTranscribe={async (episode) => {
            const result = await startTranscription(episode);
            if (result.success) {
              // Banner will show completion state - just refresh feed list
              fetchPodcastFeeds();
            } else if (result.activeEpisode) {
              showToast({
                message: 'Transcription in progress',
                description: `Please wait for "${result.activeEpisode.title}" to finish.`,
                variant: 'warning',
              });
            } else {
              showToast({
                message: 'Transcription failed',
                description: result.error,
                variant: 'error',
              });
            }
          }}
          onViewAll={() => navigate('/episodes/new', { state: { tab: 'feed' } })}
        />
      )}

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
      ) : filteredEpisodes.length === 0 && !upload.isProcessing && !upload.hasReadyTranscript ? (
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
          {/* Content Processing Cards - prominent cards for episodes generating content */}
          {processingEpisodes.map((processingEpisode) => (
            <ContentProcessingCard
              key={`processing-${processingEpisode.id}`}
              episode={processingEpisode}
              onClick={() => navigate(`/episodes/${processingEpisode.id}/processing`)}
            />
          ))}

          {/* Feed transcription in progress or draft ready - shows at top */}
          {(hasActiveTranscription || hasReadyDraft) && (
            <FeedTranscriptionCard
              isTranscribing={hasActiveTranscription}
              activeTranscription={activeTranscription}
              progress={feedTranscriptionProgress}
              timeRemaining={feedTimeRemaining}
              currentStep={currentStep}
              stepInfo={stepInfo}
              isComplete={hasReadyDraft}
              draftEpisode={draftEpisode}
              draftFeedEpisode={draftFeedEpisode}
              onStartProcessing={() => {
                if (draftEpisode) {
                  // Navigate to submit form to fill out details before processing
                  navigate(`/episodes/${draftEpisode.id}/submit`);
                }
              }}
              onDismiss={() => {
                clearDraft();
                showToast({
                  message: 'Draft dismissed',
                  description: 'You can transcribe another episode when ready.',
                  variant: 'info',
                  duration: 4000,
                });
              }}
            />
          )}
          {/* Upload in progress or draft card - shows at top */}
          {(upload.isProcessing || upload.hasReadyTranscript) && (
            <UploadProgressCard
              state={upload.state}
              file={upload.file}
              progress={upload.uploadProgress}
              isComplete={upload.hasReadyTranscript}
              transcriptionProgress={transcriptionProgress}
              timeEstimate={getTimeEstimate()}
              onClick={() => {
                if (upload.hasReadyTranscript) {
                  // Draft ready - navigate to form to complete setup
                  navigate('/episodes/new');
                } else {
                  // Still transcribing - expand the indicator to show progress
                  upload.expand();
                  navigate('/episodes/new');
                }
              }}
              onDismiss={() => {
                // Allow dismissing the draft card (clears the pending transcript)
                upload.reset();
                showToast({
                  message: 'Draft dismissed',
                  description: 'Upload a new audio file when you\'re ready.',
                  variant: 'info',
                  duration: 4000,
                });
              }}
            />
          )}
          {/* Regular episode cards - exclude processing ones since they have dedicated cards above */}
          {filteredEpisodes
            .filter(episode => episode.status !== 'processing')
            .map((episode) => (
              <EpisodeCard
                key={episode.id}
                episode={episode}
                onDelete={handleDeleteClick}
                onClick={() => {
                  if (episode.status === 'completed') {
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

  // Check if episode came from RSS feed
  const isFromFeed = episode.feed_episode_id || episode.episode_context?.source === 'rss_feed';

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
        <div className={styles.cardBadges}>
          <Badge status={episode.status} dot>
            {episode.status === 'processing' ? 'Processing...' : episode.status}
          </Badge>
          {isFromFeed && (
            <span className={styles.sourceIndicator} title="Imported from RSS feed">
              <Rss size={12} />
            </span>
          )}
        </div>
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

/**
 * Upload progress card component
 * Shows when an audio file is being uploaded/transcribed or ready.
 * Persists on dashboard until form is submitted.
 *
 * @param {string} state - Upload state (uploading/transcribing/complete)
 * @param {File} file - The file being uploaded
 * @param {number} progress - Upload progress percentage
 * @param {boolean} isComplete - Whether transcription is complete
 * @param {number} transcriptionProgress - Estimated transcription progress
 * @param {string} timeEstimate - Estimated time remaining
 * @param {Function} onClick - Handler for card click
 * @param {Function} onDismiss - Handler for dismiss button click
 */
function UploadProgressCard({ state, file, progress, isComplete, transcriptionProgress, timeEstimate, onClick, onDismiss }) {
  const isUploading = state === UPLOAD_STATE.UPLOADING;
  const isTranscribing = state === UPLOAD_STATE.TRANSCRIBING;

  const handleDismiss = (e) => {
    e.stopPropagation();
    onDismiss?.();
  };

  // Use transcription progress during transcribing phase
  const displayProgress = isUploading ? progress : transcriptionProgress;

  return (
    <Card
      className={`${styles.episodeCard} ${styles.uploadCard} ${isComplete ? styles.draftCard : styles.transcribingCard}`}
      hoverable
      onClick={onClick}
      padding="md"
    >
      <div className={styles.cardHeader}>
        <Badge status={isComplete ? 'pending' : 'processing'} dot>
          {isComplete ? 'Draft' : isUploading ? 'Uploading' : 'Transcribing'}
        </Badge>
        {isComplete && (
          <button
            className={styles.dismissButton}
            onClick={handleDismiss}
            title="Dismiss draft"
            aria-label="Dismiss draft"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <h3 className={styles.cardTitle}>
        {file?.name || 'New Audio Episode'}
      </h3>

      <div className={styles.processingStatus}>
        {isComplete ? (
          <>
            <p className={styles.draftMessage}>
              <CheckCircle2 className={styles.statusIconSuccess} size={14} />
              Transcript ready
            </p>
            <p className={styles.draftHint}>
              Fill in episode details to generate content
            </p>
          </>
        ) : (
          <>
            <div className={styles.progressWrapper}>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
              <span className={styles.progressText}>{displayProgress}%</span>
            </div>
            <p className={styles.timeEstimate}>
              <Loader2 className={styles.miniSpinner} size={12} />
              {isUploading
                ? 'Uploading audio file...'
                : timeEstimate || 'Transcribing audio...'}
            </p>
          </>
        )}
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.cardAction}>
          <span>{isComplete ? 'Continue Setup' : 'View Progress'}</span>
          <ChevronRight size={16} />
        </div>
      </div>
    </Card>
  );
}

/**
 * Feed Transcription Card component
 * Shows when transcribing from RSS feed - appears in the episodes grid.
 * Displays step-by-step progress: Downloading → Transcribing → Ready
 *
 * @param {boolean} isTranscribing - Whether transcription is in progress
 * @param {Object} activeTranscription - Active transcription data
 * @param {number} progress - Transcription progress percentage
 * @param {string} timeRemaining - Estimated time remaining
 * @param {string} currentStep - Current transcription step
 * @param {Object} stepInfo - Step metadata (label, description)
 * @param {boolean} isComplete - Whether transcription is complete
 * @param {Object} draftEpisode - The created draft episode
 * @param {Object} draftFeedEpisode - The feed episode being transcribed
 * @param {Function} onStartProcessing - Handler to start processing
 * @param {Function} onDismiss - Handler to dismiss the card
 */
function FeedTranscriptionCard({
  isTranscribing,
  activeTranscription,
  progress,
  timeRemaining,
  currentStep,
  stepInfo,
  isComplete,
  draftEpisode,
  draftFeedEpisode,
  onStartProcessing,
  onDismiss,
}) {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);

  const handleStartProcessing = async (e) => {
    e.stopPropagation();
    setIsStarting(true);
    try {
      await onStartProcessing();
    } finally {
      setIsStarting(false);
    }
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    onDismiss?.();
  };

  const title = isComplete
    ? (draftFeedEpisode?.title || draftEpisode?.title || 'Transcribed Episode')
    : (activeTranscription?.title || 'Transcribing Episode');

  // Render steps indicator
  const steps = [
    { key: 'downloading', label: 'Download' },
    { key: 'transcribing', label: 'Transcribe' },
    { key: 'creating', label: 'Create' },
  ];

  const getStepStatus = (stepKey) => {
    if (isComplete) return 'complete';
    if (!currentStep) return 'pending';

    const stepOrder = ['downloading', 'transcribing', 'creating'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepKey);

    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  if (isComplete && draftEpisode) {
    return (
      <Card
        className={`${styles.episodeCard} ${styles.feedDraftCard}`}
        hoverable
        onClick={() => navigate(`/episodes/${draftEpisode.id}/review`)}
        padding="md"
      >
        <div className={styles.cardHeader}>
          <div className={styles.cardBadges}>
            <Badge status="pending" dot>
              Ready to Process
            </Badge>
            <span className={styles.sourceIndicator} title="From RSS feed">
              <Rss size={12} />
            </span>
          </div>
          <button
            className={styles.dismissButton}
            onClick={handleDismiss}
            title="Dismiss draft"
            aria-label="Dismiss draft"
          >
            <X size={16} />
          </button>
        </div>

        <h3 className={styles.cardTitle}>{title}</h3>

        <div className={styles.processingStatus}>
          <p className={styles.draftMessage}>
            <CheckCircle2 className={styles.statusIconSuccess} size={14} />
            Transcription complete
          </p>
          <p className={styles.draftHint}>
            Add details and generate content
          </p>
        </div>

        <div className={styles.cardFooter}>
          <Button
            variant="primary"
            size="sm"
            rightIcon={isStarting ? Loader2 : ArrowRight}
            onClick={handleStartProcessing}
            disabled={isStarting}
          >
            {isStarting ? 'Loading...' : 'Continue'}
          </Button>
        </div>
      </Card>
    );
  }

  // Transcribing state
  return (
    <Card
      className={`${styles.episodeCard} ${styles.feedTranscribingCard}`}
      padding="md"
    >
      <div className={styles.cardHeader}>
        <div className={styles.cardBadges}>
          <Badge status="processing" dot>
            Transcribing
          </Badge>
          <span className={styles.sourceIndicator} title="From RSS feed">
            <Rss size={12} />
          </span>
        </div>
      </div>

      <h3 className={styles.cardTitle}>{title}</h3>

      {/* Step indicators */}
      <div className={styles.stepsContainer}>
        {steps.map((step, index) => {
          const status = getStepStatus(step.key);
          return (
            <div key={step.key} className={styles.stepItem} data-status={status}>
              <div className={styles.stepIndicator}>
                {status === 'complete' ? (
                  <CheckCircle2 size={16} />
                ) : status === 'active' ? (
                  <Loader2 size={16} className={styles.spinning} />
                ) : (
                  <Circle size={16} />
                )}
              </div>
              <span className={styles.stepLabel}>{step.label}</span>
              {index < steps.length - 1 && (
                <div className={styles.stepConnector} data-status={status === 'complete' ? 'complete' : 'pending'} />
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.processingStatus}>
        <div className={styles.progressWrapper}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={styles.progressText}>{progress}%</span>
        </div>
        <p className={styles.timeEstimate}>
          <Loader2 className={styles.miniSpinner} size={12} />
          {stepInfo?.description || timeRemaining || 'Processing...'}
        </p>
      </div>
    </Card>
  );
}

/**
 * Content Processing Card component
 * Shows a prominent card when content is being generated.
 * Displays detailed progress with phase/stage info and animated visuals.
 *
 * @param {Object} episode - The episode being processed
 * @param {Function} onClick - Handler for card click (navigate to processing screen)
 */
function ContentProcessingCard({ episode, onClick }) {
  const title = episode.title || episode.episode_context?.title || 'Episode';
  const isFromFeed = episode.feed_episode_id || episode.episode_context?.source === 'rss_feed';

  // Calculate phase progress
  const currentPhase = episode.current_stage !== undefined
    ? STAGE_TO_PHASE[episode.current_stage] || 1
    : 1;
  const progress = Math.round((currentPhase / TOTAL_PHASES) * 100);

  // Calculate time estimate
  const startTime = episode.processing_started_at
    ? new Date(episode.processing_started_at)
    : new Date(episode.updated_at);
  const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
  const remaining = Math.max(0, ESTIMATED_DURATION_SECONDS - elapsed);

  const getTimeEstimate = () => {
    if (remaining > 60) return `~${Math.ceil(remaining / 60)}m remaining`;
    if (remaining > 0) return `~${remaining}s remaining`;
    return 'Finishing up...';
  };

  // Phase names for display
  const phaseNames = {
    1: 'Analyzing',
    2: 'Extracting',
    3: 'Planning',
    4: 'Writing',
    5: 'Distributing',
  };

  const currentPhaseName = phaseNames[currentPhase] || 'Processing';

  return (
    <Card
      className={`${styles.episodeCard} ${styles.contentProcessingCard}`}
      hoverable
      onClick={onClick}
      padding="md"
    >
      <div className={styles.cardHeader}>
        <div className={styles.cardBadges}>
          <Badge status="processing" dot>
            Generating Content
          </Badge>
          {isFromFeed && (
            <span className={styles.sourceIndicator} title="From RSS feed">
              <Rss size={12} />
            </span>
          )}
        </div>
        <span className={styles.processingPhase}>
          <Sparkles size={14} />
          Phase {currentPhase}/{TOTAL_PHASES}
        </span>
      </div>

      <h3 className={styles.cardTitle}>{title}</h3>

      {/* Phase indicator pills */}
      <div className={styles.phaseIndicators}>
        {[1, 2, 3, 4, 5].map((phase) => (
          <div
            key={phase}
            className={styles.phaseIndicator}
            data-status={phase < currentPhase ? 'complete' : phase === currentPhase ? 'active' : 'pending'}
            title={phaseNames[phase]}
          >
            {phase < currentPhase ? (
              <CheckCircle2 size={12} />
            ) : phase === currentPhase ? (
              <Loader2 size={12} className={styles.spinning} />
            ) : (
              <Circle size={12} />
            )}
          </div>
        ))}
      </div>

      <div className={styles.processingStatus}>
        <div className={styles.progressWrapper}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={styles.progressText}>{progress}%</span>
        </div>
        <p className={styles.timeEstimate}>
          <Zap size={12} className={styles.processingIcon} />
          <span className={styles.phaseName}>{currentPhaseName}</span>
          <span className={styles.timeSeparator}>·</span>
          {getTimeEstimate()}
        </p>
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.cardAction}>
          <span>View Progress</span>
          <ChevronRight size={16} />
        </div>
      </div>
    </Card>
  );
}

/**
 * PodcastQuickImport component
 * Shows recent episodes from connected podcast feed.
 * Allows quick transcription, content generation, or viewing processed episodes.
 *
 * States:
 * - available: Not transcribed, show "Transcribe" button
 * - transcribing: In progress, show spinner
 * - transcribed: Has transcript but no content, show "Generate Content" button
 * - completed: Full content generated, show "View Content" button
 */
function PodcastQuickImport({
  feed,
  episodes,
  hasActiveTranscription,
  activeTranscription,
  onTranscribe,
  onViewAll,
}) {
  const navigate = useNavigate();
  const [transcribingId, setTranscribingId] = useState(null);

  async function handleTranscribe(episode) {
    setTranscribingId(episode.id);
    await onTranscribe(episode);
    setTranscribingId(null);
  }

  // Format duration
  function formatDuration(seconds) {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  }

  // Get display status for an episode
  function getDisplayStatus(episode, isThisTranscribing) {
    if (isThisTranscribing || episode.status === 'transcribing') {
      return 'transcribing';
    }
    if (episode.status === 'processed') {
      const linkedStatus = episode.linked_episode?.status;
      if (linkedStatus === 'completed') return 'completed';
      if (linkedStatus === 'processing') return 'processing';
      return 'transcribed'; // Has transcript but no content yet
    }
    return 'available';
  }

  // Get status icon based on display status
  function getStatusIcon(displayStatus) {
    switch (displayStatus) {
      case 'transcribing':
      case 'processing':
        return <Loader2 size={14} className={styles.spinning} />;
      case 'transcribed':
        return <Clock size={14} className={styles.statusTranscribed} />;
      case 'completed':
        return <CheckCircle2 size={14} className={styles.statusProcessed} />;
      default:
        return <Circle size={14} />;
    }
  }

  // Get status label
  function getStatusLabel(displayStatus) {
    switch (displayStatus) {
      case 'transcribed':
        return 'Transcribed';
      case 'completed':
        return 'Complete';
      default:
        return null;
    }
  }

  return (
    <div className={styles.podcastSection}>
      <div className={styles.podcastHeader}>
        <div className={styles.podcastHeaderLeft}>
          <Rss size={18} className={styles.podcastIcon} />
          <span className={styles.podcastLabel}>From Your Podcast</span>
          <span className={styles.podcastName}>{feed.title}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onViewAll}>
          View All Episodes
        </Button>
      </div>

      <div className={styles.podcastEpisodes}>
        {episodes.map((episode) => {
          const isThisTranscribing = transcribingId === episode.id;
          const isDisabled = hasActiveTranscription && !isThisTranscribing;
          const episodeId = episode.episode_id || episode.linked_episode?.id;
          const displayStatus = getDisplayStatus(episode, isThisTranscribing);
          const statusLabel = getStatusLabel(displayStatus);

          return (
            <div key={episode.id} className={styles.podcastEpisodeRow}>
              <div className={styles.podcastEpisodeStatus}>
                {getStatusIcon(displayStatus)}
              </div>
              <div className={styles.podcastEpisodeInfo}>
                <span className={styles.podcastEpisodeTitle}>{episode.title}</span>
                <span className={styles.podcastEpisodeMeta}>
                  {episode.published_at && new Date(episode.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {episode.duration_seconds && ` · ${formatDuration(episode.duration_seconds)}`}
                  {statusLabel && ` · ${statusLabel}`}
                </span>
              </div>

              {/* Completed: View Content */}
              {displayStatus === 'completed' && episodeId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/episodes/${episodeId}/review`)}
                  rightIcon={ChevronRight}
                >
                  View
                </Button>
              )}

              {/* Transcribed: Generate Content */}
              {displayStatus === 'transcribed' && episodeId && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/episodes/${episodeId}/submit`)}
                  leftIcon={Zap}
                >
                  Generate
                </Button>
              )}

              {/* Available: Transcribe */}
              {displayStatus === 'available' && (
                <Button
                  variant={isDisabled ? 'ghost' : 'primary'}
                  size="sm"
                  onClick={() => handleTranscribe(episode)}
                  disabled={isDisabled}
                  leftIcon={Play}
                >
                  Transcribe
                </Button>
              )}

              {/* Transcribing */}
              {displayStatus === 'transcribing' && (
                <Button variant="ghost" size="sm" disabled leftIcon={Loader2}>
                  Transcribing...
                </Button>
              )}

              {/* Processing */}
              {displayStatus === 'processing' && (
                <Button variant="ghost" size="sm" disabled leftIcon={Loader2}>
                  Generating...
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Dashboard;
