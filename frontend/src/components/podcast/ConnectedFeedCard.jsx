/**
 * ============================================================================
 * CONNECTED FEED CARD
 * ============================================================================
 * Displays a connected podcast feed with sync status and actions.
 * ============================================================================
 */

import { useState } from 'react';
import {
  RefreshCw,
  Trash2,
  ChevronRight,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Rss,
} from 'lucide-react';
import { Button, useToast, ConfirmDialog } from '@components/shared';
import api from '@utils/api-client';
import styles from './ConnectedFeedCard.module.css';

/**
 * Format relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(dateString) {
  if (!dateString) return 'Never synced';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

/**
 * ConnectedFeedCard component
 */
function ConnectedFeedCard({ feed, onSync, onDisconnect, onViewEpisodes }) {
  const { showToast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * Sync feed to fetch new episodes
   */
  async function handleSync() {
    try {
      setSyncing(true);
      const result = await api.podcasts.syncFeed(feed.id);

      showToast({
        message: result.newEpisodes > 0
          ? `Found ${result.newEpisodes} new episode${result.newEpisodes !== 1 ? 's' : ''}!`
          : 'Already up to date',
        variant: result.newEpisodes > 0 ? 'success' : 'info',
      });

      onSync?.(result);
    } catch (error) {
      console.error('Feed sync failed:', error);
      showToast({
        message: 'Sync failed',
        description: error.message || 'Could not sync feed. Please try again.',
        variant: 'error',
      });
    } finally {
      setSyncing(false);
    }
  }

  /**
   * Disconnect feed
   */
  async function handleDisconnect() {
    try {
      setDeleting(true);
      await api.podcasts.disconnectFeed(feed.id);

      showToast({
        message: 'Podcast disconnected',
        description: `${feed.title} has been removed.`,
        variant: 'success',
      });

      onDisconnect?.(feed.id);
    } catch (error) {
      console.error('Failed to disconnect feed:', error);
      showToast({
        message: 'Disconnect failed',
        description: error.message || 'Could not disconnect podcast.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const processedPercent = feed.totalEpisodes > 0
    ? Math.round((feed.processedEpisodes / feed.totalEpisodes) * 100)
    : 0;

  return (
    <>
      <div className={styles.card}>
        {/* Artwork */}
        {feed.artwork_url ? (
          <img
            src={feed.artwork_url}
            alt={feed.title}
            className={styles.artwork}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        ) : (
          <div className={styles.artworkPlaceholder}>
            <Rss size={24} />
          </div>
        )}

        {/* Info */}
        <div className={styles.info}>
          <h3 className={styles.title}>{feed.title}</h3>
          {feed.author && (
            <p className={styles.author}>{feed.author}</p>
          )}

          {/* Stats row */}
          <div className={styles.stats}>
            <span className={styles.stat}>
              <CheckCircle size={14} />
              {feed.processedEpisodes || 0} / {feed.totalEpisodes || 0} processed
            </span>
            <span className={styles.stat}>
              <Clock size={14} />
              {formatRelativeTime(feed.last_synced_at)}
            </span>
          </div>

          {/* Progress bar */}
          {feed.totalEpisodes > 0 && (
            <div className={styles.progressWrapper}>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${processedPercent}%` }}
                />
              </div>
              <span className={styles.progressText}>{processedPercent}%</span>
            </div>
          )}

          {/* Sync error */}
          {feed.sync_error && (
            <div className={styles.syncError}>
              <AlertCircle size={14} />
              <span>Last sync failed: {feed.sync_error}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={syncing ? Loader2 : RefreshCw}
            onClick={handleSync}
            disabled={syncing}
            title="Sync feed"
          >
            {syncing ? 'Syncing...' : 'Sync'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            rightIcon={ChevronRight}
            onClick={() => onViewEpisodes?.(feed)}
          >
            Episodes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Trash2}
            onClick={() => setShowDeleteConfirm(true)}
            className={styles.deleteButton}
            title="Disconnect feed"
          />
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDisconnect}
        title="Disconnect Podcast?"
        message={`This will remove "${feed.title}" from your connected feeds. Episodes you've already processed will not be affected.`}
        confirmLabel="Disconnect"
        loading={deleting}
        variant="danger"
      />
    </>
  );
}

export default ConnectedFeedCard;
