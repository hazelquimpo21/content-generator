/**
 * ============================================================================
 * AUDIO UPLOAD COMPONENT
 * ============================================================================
 * Drag-and-drop audio file upload with transcription support.
 * Uses global UploadContext so uploads persist across navigation.
 *
 * Features:
 * - Drag-and-drop zone
 * - File type and size validation
 * - Upload and transcription progress with speed/ETA
 * - Background upload support (minimize and browse away)
 * - Cost estimation display
 * - Error handling with retry
 * ============================================================================
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Upload, Loader2, AlertCircle, Check, X, RefreshCw, Clock, Zap, Minimize2, Users } from 'lucide-react';
import clsx from 'clsx';
import Button from './Button';
import ProgressBar from './ProgressBar';
import { useUpload, UPLOAD_STATE } from '../../contexts/UploadContext';
import styles from './AudioUpload.module.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPPORTED_FORMATS = ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'flac', 'ogg', 'mpeg', 'mpga'];
const MAX_FILE_SIZE_MB = 100;

// Tips shown during transcription wait
const TRANSCRIPTION_TIPS = [
  'Transcription uses AI to convert speech to text with high accuracy',
  'Longer audio files are automatically split into chunks for processing',
  'The transcript will be used to generate your episode content',
  'You can edit the transcript after upload if needed',
  'Transcription cost is based on audio duration (~$0.006/minute)',
];

// Tips for speaker diarization
const SPEAKER_TIPS = [
  'Speaker diarization identifies who said what in your audio',
  'Each speaker is automatically labeled (Speaker A, Speaker B, etc.)',
  'You can rename speakers after transcription to their real names',
  'Timestamps are included for each utterance in the transcript',
  'Speaker detection works best with clear audio and distinct voices',
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Formats file size for display
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats seconds into human-readable time
 */
function formatTimeRemaining(seconds) {
  if (seconds < 5) return 'almost done';
  if (seconds < 60) return `about ${Math.ceil(seconds / 5) * 5} seconds left`;
  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} minute${minutes > 1 ? 's' : ''} left`;
}

/**
 * Formats upload speed for display
 */
function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * AudioUpload component
 *
 * @param {Object} props
 * @param {Function} props.onTranscriptReady - Callback when transcription is complete
 * @param {Function} props.onError - Callback when an error occurs
 * @param {string} props.className - Additional CSS class
 * @param {boolean} props.showSpeakerOption - Show speaker diarization toggle (default: true)
 * @param {boolean} props.defaultWithSpeakers - Default value for speaker diarization
 */
function AudioUpload({ onTranscriptReady, onError, className, showSpeakerOption = false, defaultWithSpeakers = false }) {
  // Global upload state from context
  const {
    state,
    file,
    error,
    uploadProgress,
    bytesUploaded,
    uploadSpeed,
    timeRemaining,
    transcriptionResult,
    isMinimized,
    useSpeakerDiarization,
    hasSpeakerLabels,
    startUpload,
    cancelUpload,
    reset,
    minimize,
    expand,
  } = useUpload();

  // Local state for drag-drop and options
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [withSpeakers, setWithSpeakers] = useState(defaultWithSpeakers);
  const [speakersExpected, setSpeakersExpected] = useState(2);

  // Refs
  const fileInputRef = useRef(null);

  // Select tips based on speaker diarization mode
  const currentTips = useSpeakerDiarization ? SPEAKER_TIPS : TRANSCRIPTION_TIPS;

  // Rotate tips during transcription
  useEffect(() => {
    if (state !== UPLOAD_STATE.TRANSCRIBING) return;

    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % currentTips.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [state, currentTips.length]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  /**
   * Handles file selection (from input or drop)
   */
  const handleFile = useCallback((selectedFile) => {
    startUpload(selectedFile, {
      onComplete: onTranscriptReady,
      onError: onError,
      withSpeakers: withSpeakers,
      speakersExpected: withSpeakers ? speakersExpected : undefined,
    });
  }, [startUpload, onTranscriptReady, onError, withSpeakers, speakersExpected]);

  /**
   * Handles file input change
   */
  const handleInputChange = useCallback((e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFile(selectedFile);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleFile]);

  /**
   * Handles drag over event
   */
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  /**
   * Handles drag leave event
   */
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  /**
   * Handles drop event
   */
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFile(droppedFile);
    }
  }, [handleFile]);

  /**
   * Opens file picker
   */
  const handleClick = useCallback(() => {
    if (state === UPLOAD_STATE.IDLE || state === UPLOAD_STATE.ERROR || state === UPLOAD_STATE.COMPLETE) {
      fileInputRef.current?.click();
    }
  }, [state]);

  /**
   * Handles cancel
   */
  const handleCancel = useCallback(() => {
    cancelUpload();
  }, [cancelUpload]);

  /**
   * Retries failed upload
   */
  const handleRetry = useCallback(() => {
    if (file) {
      startUpload(file, {
        onComplete: onTranscriptReady,
        onError: onError,
        withSpeakers: withSpeakers,
        speakersExpected: withSpeakers ? speakersExpected : undefined,
      });
    } else {
      reset();
    }
  }, [file, startUpload, reset, onTranscriptReady, onError, withSpeakers, speakersExpected]);

  /**
   * Resets to upload another file
   */
  const handleUploadAnother = useCallback(() => {
    reset();
  }, [reset]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={clsx(styles.container, className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_FORMATS.map(f => `.${f}`).join(',')}
        onChange={handleInputChange}
        className={styles.hiddenInput}
      />

      {/* Idle state - Drop zone */}
      {state === UPLOAD_STATE.IDLE && (
        <>
          <div
            className={clsx(styles.dropZone, isDragOver && styles.dragOver)}
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleClick()}
          >
            <Mic className={styles.icon} />
            <span className={styles.title}>Drop audio file here</span>
            <span className={styles.subtitle}>or click to browse</span>
            <span className={styles.formats}>
              MP3, M4A, WAV, MP4, WEBM, FLAC, OGG (max {MAX_FILE_SIZE_MB} MB)
            </span>
          </div>

          {/* Speaker diarization option */}
          {showSpeakerOption && (
            <div className={styles.speakerOption}>
              <label className={styles.speakerToggle}>
                <input
                  type="checkbox"
                  checked={withSpeakers}
                  onChange={(e) => setWithSpeakers(e.target.checked)}
                  className={styles.speakerCheckbox}
                />
                <Users size={16} className={styles.speakerIcon} />
                <span className={styles.speakerLabel}>Identify speakers</span>
                <span className={styles.speakerBadge}>Beta</span>
              </label>

              {withSpeakers && (
                <div className={styles.speakerSettings}>
                  <span className={styles.speakerSettingsLabel}>Expected speakers:</span>
                  <select
                    value={speakersExpected}
                    onChange={(e) => setSpeakersExpected(parseInt(e.target.value, 10))}
                    className={styles.speakerSelect}
                  >
                    <option value="">Auto-detect</option>
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>{n} speakers</option>
                    ))}
                  </select>
                  <span className={styles.speakerNote}>
                    Names each speaker with timestamps
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Uploading state - only show if not minimized */}
      {state === UPLOAD_STATE.UPLOADING && !isMinimized && (
        <div className={styles.progressContainer}>
          <div className={styles.fileInfo}>
            <Upload className={styles.fileIcon} />
            <div className={styles.fileDetails}>
              <span className={styles.fileName}>{file?.name}</span>
              <span className={styles.fileSize}>
                {formatFileSize(bytesUploaded)} / {formatFileSize(file?.size || 0)}
              </span>
            </div>
            <div className={styles.fileActions}>
              <button
                className={styles.backgroundButton}
                onClick={minimize}
                title="Continue uploading in background while you browse"
              >
                <Minimize2 size={14} />
                <span>Background</span>
              </button>
              <button
                className={styles.cancelButton}
                onClick={handleCancel}
                title="Cancel upload"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <ProgressBar
            value={uploadProgress}
            max={100}
            label={`Uploading... ${uploadProgress}%`}
            animated
          />
          <div className={styles.uploadStats}>
            {uploadSpeed > 0 && (
              <>
                <span className={styles.uploadSpeed}>
                  <Zap size={14} />
                  {formatSpeed(uploadSpeed)}
                </span>
                {timeRemaining !== null && timeRemaining > 0 && (
                  <span className={styles.uploadEta}>
                    <Clock size={14} />
                    {formatTimeRemaining(timeRemaining)}
                  </span>
                )}
              </>
            )}
          </div>
          <span className={styles.backgroundHint}>
            Click the minimize button to continue browsing while this uploads
          </span>
        </div>
      )}

      {/* Minimized placeholder - shows when upload is minimized */}
      {(state === UPLOAD_STATE.UPLOADING || state === UPLOAD_STATE.TRANSCRIBING) && isMinimized && (
        <div
          className={styles.minimizedPlaceholder}
          onClick={expand}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && expand()}
        >
          <span className={styles.minimizedPlaceholderText}>
            {state === UPLOAD_STATE.UPLOADING
              ? `Uploading in background (${uploadProgress}%)...`
              : 'Transcribing in background...'}
          </span>
          <span className={styles.minimizedPlaceholderHint}>
            Click to expand or check the floating indicator
          </span>
        </div>
      )}

      {/* Transcribing state - only show if not minimized */}
      {state === UPLOAD_STATE.TRANSCRIBING && !isMinimized && (
        <div className={styles.progressContainer}>
          <div className={styles.fileInfo}>
            <Mic className={styles.fileIcon} />
            <div className={styles.fileDetails}>
              <span className={styles.fileName}>{file?.name}</span>
              <span className={styles.fileSize}>{formatFileSize(file?.size || 0)}</span>
            </div>
            <div className={styles.fileActions}>
              <button
                className={styles.backgroundButton}
                onClick={minimize}
                title="Continue transcribing in background while you browse"
              >
                <Minimize2 size={14} />
                <span>Background</span>
              </button>
              <button
                className={styles.cancelButton}
                onClick={handleCancel}
                title="Cancel transcription"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className={styles.transcribingStatus}>
            <Loader2 className={styles.spinner} />
            <span>
              Transcribing audio...
              {file?.size > 25 * 1024 * 1024
                ? ' Large files may take several minutes.'
                : ' This may take 1-2 minutes.'}
            </span>
          </div>
          <div className={styles.tipContainer}>
            <span className={styles.tipLabel}>Did you know?</span>
            <span className={styles.tipText}>{currentTips[currentTipIndex]}</span>
          </div>
          <span className={styles.backgroundHint}>
            Click the minimize button to continue browsing while this transcribes
          </span>
        </div>
      )}

      {/* Complete state */}
      {state === UPLOAD_STATE.COMPLETE && transcriptionResult && (
        <div className={styles.completeContainer}>
          <div className={styles.successHeader}>
            <Check className={styles.successIcon} />
            <span className={styles.successTitle}>Transcription complete</span>
          </div>
          <div className={styles.resultStats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Duration</span>
              <span className={styles.statValue}>
                {transcriptionResult.audioDurationMinutes?.toFixed(1)} min
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Cost</span>
              <span className={styles.statValue}>{transcriptionResult.formattedCost}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Words</span>
              <span className={styles.statValue}>
                {transcriptionResult.transcript?.split(/\s+/).length.toLocaleString()}
              </span>
            </div>
            {hasSpeakerLabels && transcriptionResult.speakers && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Speakers</span>
                <span className={styles.statValue}>
                  <Users size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  {transcriptionResult.speakers.length}
                </span>
              </div>
            )}
          </div>
          {hasSpeakerLabels && (
            <div className={styles.speakerInfo}>
              <Users size={14} />
              <span>Speakers detected and labeled with timestamps</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={RefreshCw}
            onClick={handleUploadAnother}
          >
            Upload different file
          </Button>
        </div>
      )}

      {/* Error state */}
      {state === UPLOAD_STATE.ERROR && (
        <div className={styles.errorContainer}>
          <AlertCircle className={styles.errorIcon} />
          <span className={styles.errorMessage}>{error}</span>
          <div className={styles.errorActions}>
            <Button variant="primary" size="sm" onClick={handleRetry}>
              Try again
            </Button>
            <Button variant="ghost" size="sm" onClick={handleUploadAnother}>
              Choose different file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AudioUpload;
