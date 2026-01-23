/**
 * ============================================================================
 * GLOBAL UPLOAD INDICATOR
 * ============================================================================
 * Floating indicator that shows upload progress on all pages.
 * Allows users to navigate freely while uploads continue in background.
 *
 * Shows:
 * - Progress indicator during upload/transcription (bottom-left)
 * - Toast notification on completion/error (via toast system)
 * ============================================================================
 */

import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Upload, Loader2, X, Maximize2, Clock, Zap } from 'lucide-react';
import clsx from 'clsx';
import { useUpload, UPLOAD_STATE } from '../../contexts/UploadContext';
import { useToast } from './Toast';
import styles from './GlobalUploadIndicator.module.css';

// Tips shown during transcription
const TRANSCRIPTION_TIPS = [
  'Transcription uses AI to convert speech to text',
  'Large files are automatically split for processing',
  'You can continue browsing while this completes',
  'The transcript will be ready when you return',
];

/**
 * Formats file size for display
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats time remaining
 */
function formatTimeRemaining(seconds) {
  if (seconds < 5) return 'almost done';
  if (seconds < 60) return `~${Math.ceil(seconds / 5) * 5}s left`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes}m left`;
}

/**
 * Formats upload speed
 */
function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * Global Upload Indicator component
 */
function GlobalUploadIndicator() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const {
    state,
    file,
    error,
    uploadProgress,
    uploadSpeed,
    timeRemaining,
    isMinimized,
    cancelUpload,
    expand,
    reset,
  } = useUpload();

  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const prevStateRef = useRef(null); // Start as null to detect initial mount

  // Rotate tips during transcription
  useEffect(() => {
    if (state !== UPLOAD_STATE.TRANSCRIBING) return;

    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % TRANSCRIPTION_TIPS.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [state]);

  // Show toast on state changes (completion/error)
  useEffect(() => {
    const prevState = prevStateRef.current;
    prevStateRef.current = state;

    // Skip on initial mount (prevState is null)
    if (prevState === null) return;

    // Only react to state transitions
    if (prevState === state) return;

    // On completion - show toast with action to go to new episode page
    // Trigger when transitioning TO complete from uploading or transcribing
    if (state === UPLOAD_STATE.COMPLETE &&
        (prevState === UPLOAD_STATE.TRANSCRIBING || prevState === UPLOAD_STATE.UPLOADING)) {
      const isOnNewEpisodePage = location.pathname === '/episodes/new';

      console.log('[GlobalUploadIndicator] Showing completion toast', { prevState, state, isOnNewEpisodePage });

      showToast({
        message: 'Transcript ready!',
        description: isOnNewEpisodePage
          ? 'Your transcript is ready. Fill in the details to generate content.'
          : 'Your audio has been transcribed. Continue to generate content.',
        variant: 'success',
        duration: 10000,
        action: isOnNewEpisodePage ? undefined : () => navigate('/episodes/new'),
        actionLabel: isOnNewEpisodePage ? undefined : 'Continue',
      });

      // Don't auto-reset - let the form consume the transcript
      // The state will be reset when the user navigates to the form and consumes it
    }

    // On error - show error toast
    if (state === UPLOAD_STATE.ERROR &&
        prevState !== UPLOAD_STATE.IDLE && prevState !== null) {
      console.log('[GlobalUploadIndicator] Showing error toast', { prevState, state, error });

      showToast({
        message: 'Upload failed',
        description: error || 'Something went wrong. Please try again.',
        variant: 'error',
        duration: 8000,
        action: () => navigate('/episodes/new'),
        actionLabel: 'Try Again',
      });

      // Reset after a delay
      setTimeout(() => reset(), 5000);
    }
  }, [state, error, location.pathname, navigate, showToast, reset]);

  // Only show indicator during active upload/transcription when minimized
  const showIndicator =
    isMinimized &&
    (state === UPLOAD_STATE.UPLOADING || state === UPLOAD_STATE.TRANSCRIBING);

  if (!showIndicator) return null;

  // Minimized uploading state
  if (state === UPLOAD_STATE.UPLOADING) {
    return (
      <div
        className={clsx(styles.indicator, styles.uploading)}
        onClick={expand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && expand()}
      >
        <div className={styles.content}>
          <Upload size={16} className={styles.icon} />
          <div className={styles.progressInfo}>
            <span className={styles.text}>
              Uploading {uploadProgress}%
            </span>
            <div className={styles.statsRow}>
              {uploadSpeed > 0 && (
                <span className={styles.stat}>
                  <Zap size={12} />
                  {formatSpeed(uploadSpeed)}
                </span>
              )}
              {timeRemaining !== null && timeRemaining > 0 && (
                <span className={styles.stat}>
                  <Clock size={12} />
                  {formatTimeRemaining(timeRemaining)}
                </span>
              )}
            </div>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.expandButton}
            onClick={(e) => {
              e.stopPropagation();
              expand();
            }}
            title="Expand"
          >
            <Maximize2 size={14} />
          </button>
          <button
            className={styles.cancelButton}
            onClick={(e) => {
              e.stopPropagation();
              cancelUpload();
            }}
            title="Cancel"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Minimized transcribing state
  if (state === UPLOAD_STATE.TRANSCRIBING) {
    return (
      <div
        className={clsx(styles.indicator, styles.transcribing)}
        onClick={expand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && expand()}
      >
        <div className={styles.content}>
          <Loader2 size={16} className={clsx(styles.icon, styles.spinner)} />
          <div className={styles.progressInfo}>
            <span className={styles.text}>Transcribing audio...</span>
            <span className={styles.tip}>{TRANSCRIPTION_TIPS[currentTipIndex]}</span>
          </div>
        </div>
        <button
          className={styles.expandButton}
          onClick={(e) => {
            e.stopPropagation();
            expand();
          }}
          title="Expand"
        >
          <Maximize2 size={14} />
        </button>
      </div>
    );
  }

  return null;
}

export default GlobalUploadIndicator;
