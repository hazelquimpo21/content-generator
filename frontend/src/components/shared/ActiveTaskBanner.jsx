/**
 * ============================================================================
 * ACTIVE TASK BANNER
 * ============================================================================
 * A unified banner component for displaying progress of async tasks.
 * Supports multiple task types:
 * - Audio upload and transcription
 * - RSS feed transcription
 * - Content processing
 *
 * This replaces the separate TranscriptionBanner and FeedTranscriptionBanner
 * components for a more consistent UX.
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Rss,
  Sparkles,
  Loader2,
  CheckCircle2,
  X,
  ArrowRight,
  Zap,
  Clock,
  AlertCircle,
} from 'lucide-react';
import Button from './Button';
import styles from './ActiveTaskBanner.module.css';

// Task types
export const TASK_TYPE = {
  AUDIO_UPLOAD: 'audio_upload',
  AUDIO_TRANSCRIBE: 'audio_transcribe',
  FEED_TRANSCRIBE: 'feed_transcribe',
  CONTENT_PROCESS: 'content_process',
};

// Task status
export const TASK_STATUS = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  COMPLETE: 'complete',
  ERROR: 'error',
};

/**
 * Get icon component for task type
 */
function getTaskIcon(taskType, status) {
  if (status === TASK_STATUS.COMPLETE) {
    return CheckCircle2;
  }
  if (status === TASK_STATUS.ERROR) {
    return AlertCircle;
  }

  switch (taskType) {
    case TASK_TYPE.AUDIO_UPLOAD:
    case TASK_TYPE.AUDIO_TRANSCRIBE:
      return status === TASK_STATUS.UPLOADING ? Mic : Loader2;
    case TASK_TYPE.FEED_TRANSCRIBE:
      return Rss;
    case TASK_TYPE.CONTENT_PROCESS:
      return Sparkles;
    default:
      return Loader2;
  }
}

/**
 * Get default title for task type
 */
function getDefaultTitle(taskType, status) {
  if (status === TASK_STATUS.COMPLETE) {
    switch (taskType) {
      case TASK_TYPE.AUDIO_UPLOAD:
      case TASK_TYPE.AUDIO_TRANSCRIBE:
        return 'Transcript Ready';
      case TASK_TYPE.FEED_TRANSCRIBE:
        return 'Episode Ready';
      case TASK_TYPE.CONTENT_PROCESS:
        return 'Content Ready';
      default:
        return 'Complete';
    }
  }

  switch (taskType) {
    case TASK_TYPE.AUDIO_UPLOAD:
      return 'Uploading Audio';
    case TASK_TYPE.AUDIO_TRANSCRIBE:
      return 'Transcribing Audio';
    case TASK_TYPE.FEED_TRANSCRIBE:
      return 'Transcribing Episode';
    case TASK_TYPE.CONTENT_PROCESS:
      return 'Generating Content';
    default:
      return 'Processing';
  }
}

/**
 * ActiveTaskBanner component
 *
 * @param {Object} props
 * @param {string} props.taskType - Type of task (see TASK_TYPE)
 * @param {string} props.status - Current status (see TASK_STATUS)
 * @param {string} [props.title] - Custom title (overrides default)
 * @param {string} [props.description] - Description text (e.g., filename)
 * @param {number} [props.progress] - Progress percentage (0-100)
 * @param {string} [props.timeRemaining] - Estimated time remaining string
 * @param {number} [props.speed] - Upload speed in bytes/sec (for uploads)
 * @param {string} [props.currentStep] - Current step name (for multi-step tasks)
 * @param {Object} [props.stepInfo] - Step info object { label, description }
 * @param {Function} [props.onAction] - Handler for primary action button
 * @param {string} [props.actionLabel] - Label for primary action button
 * @param {Function} [props.onDismiss] - Handler for dismiss/close button
 * @param {boolean} [props.showDismiss] - Whether to show dismiss button
 * @param {string} [props.errorMessage] - Error message to display
 */
function ActiveTaskBanner({
  taskType,
  status,
  title,
  description,
  progress = 0,
  timeRemaining,
  speed,
  currentStep,
  stepInfo,
  onAction,
  actionLabel,
  onDismiss,
  showDismiss = true,
  errorMessage,
}) {
  // Don't render if idle
  if (status === TASK_STATUS.IDLE) {
    return null;
  }

  const isComplete = status === TASK_STATUS.COMPLETE;
  const isError = status === TASK_STATUS.ERROR;
  const isProcessing = status === TASK_STATUS.PROCESSING || status === TASK_STATUS.UPLOADING;

  // Determine display values
  const Icon = getTaskIcon(taskType, status);
  const displayTitle = title || getDefaultTitle(taskType, status);
  const displayDescription = stepInfo?.description || description;

  // Format speed for display
  const formattedSpeed = speed && speed > 0 ? `${(speed / 1024).toFixed(1)} KB/s` : null;

  // Handle dismiss click
  const handleDismiss = (e) => {
    e.stopPropagation();
    onDismiss?.();
  };

  // Determine banner status for styling
  const bannerStatus = isError ? 'error' : isComplete ? 'ready' : 'processing';

  return (
    <div className={styles.banner} data-status={bannerStatus}>
      <div className={styles.content}>
        {/* Icon */}
        <div className={styles.icon}>
          <Icon
            size={24}
            className={isProcessing && !isComplete ? styles.spinning : ''}
          />
        </div>

        {/* Info section */}
        <div className={styles.info}>
          <h3 className={styles.title}>
            {stepInfo?.label || displayTitle}
          </h3>

          {displayDescription && (
            <p className={styles.description}>
              {displayDescription}
              {formattedSpeed && (
                <span className={styles.speed}>
                  <Zap size={12} />
                  {formattedSpeed}
                </span>
              )}
            </p>
          )}

          {/* Error message */}
          {isError && errorMessage && (
            <p className={styles.error}>{errorMessage}</p>
          )}

          {/* Progress bar (only when processing) */}
          {isProcessing && progress > 0 && (
            <div className={styles.progress}>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <span className={styles.progressText}>
                {progress}%
                {timeRemaining && ` · ${timeRemaining}`}
              </span>
            </div>
          )}

          {/* Time estimate without progress bar */}
          {isProcessing && progress === 0 && timeRemaining && (
            <p className={styles.timeEstimate}>
              <Clock size={12} />
              {timeRemaining}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          {onAction && (
            <Button
              variant={isComplete ? 'primary' : 'ghost'}
              size="sm"
              rightIcon={isComplete ? ArrowRight : undefined}
              onClick={onAction}
            >
              {actionLabel || (isComplete ? 'Continue' : 'View Details')}
            </Button>
          )}

          {showDismiss && isComplete && onDismiss && (
            <button
              className={styles.dismiss}
              onClick={handleDismiss}
              title="Dismiss"
              aria-label="Dismiss"
            >
              <X size={18} />
            </button>
          )}

          {/* Spinner for processing without action */}
          {isProcessing && !onAction && (
            <Loader2 size={20} className={styles.spinning} />
          )}
        </div>
      </div>
    </div>
  );
}

export default ActiveTaskBanner;
