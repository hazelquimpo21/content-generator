/**
 * ============================================================================
 * GLOBAL UPLOAD INDICATOR
 * ============================================================================
 * Floating indicator that shows upload progress on all pages.
 * Allows users to navigate freely while uploads continue in background.
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { Upload, Loader2, Check, AlertCircle, X, Maximize2, Clock, Zap } from 'lucide-react';
import clsx from 'clsx';
import { useUpload, UPLOAD_STATE } from '../../contexts/UploadContext';
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
  const {
    state,
    file,
    error,
    uploadProgress,
    bytesUploaded,
    uploadSpeed,
    timeRemaining,
    isMinimized,
    cancelUpload,
    expand,
    reset,
  } = useUpload();

  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  // Rotate tips during transcription
  useEffect(() => {
    if (state !== UPLOAD_STATE.TRANSCRIBING) return;

    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % TRANSCRIPTION_TIPS.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [state]);

  // Don't show when idle or when not minimized (component handles its own UI)
  if (state === UPLOAD_STATE.IDLE) return null;
  if (!isMinimized && state !== UPLOAD_STATE.COMPLETE && state !== UPLOAD_STATE.ERROR) return null;

  // Show completion toast
  if (state === UPLOAD_STATE.COMPLETE) {
    return (
      <div className={clsx(styles.indicator, styles.complete)}>
        <div className={styles.content}>
          <Check size={18} className={styles.successIcon} />
          <span className={styles.text}>Transcription complete!</span>
        </div>
        <button
          className={styles.closeButton}
          onClick={reset}
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  // Show error toast
  if (state === UPLOAD_STATE.ERROR) {
    return (
      <div className={clsx(styles.indicator, styles.error)}>
        <div className={styles.content}>
          <AlertCircle size={18} className={styles.errorIcon} />
          <span className={styles.text}>{error || 'Upload failed'}</span>
        </div>
        <button
          className={styles.closeButton}
          onClick={reset}
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  // Minimized uploading state
  if (state === UPLOAD_STATE.UPLOADING && isMinimized) {
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
  if (state === UPLOAD_STATE.TRANSCRIBING && isMinimized) {
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
            <span className={styles.text}>Transcribing...</span>
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
