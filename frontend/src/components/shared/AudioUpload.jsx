/**
 * ============================================================================
 * AUDIO UPLOAD COMPONENT
 * ============================================================================
 * Drag-and-drop audio file upload with transcription support.
 * Handles file validation, upload progress, and transcription status.
 *
 * Features:
 * - Drag-and-drop zone
 * - File type and size validation
 * - Upload and transcription progress
 * - Cost estimation display
 * - Error handling with retry
 * ============================================================================
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Upload, Loader2, AlertCircle, Check, X, RefreshCw, Clock, Zap, Minimize2, Maximize2 } from 'lucide-react';
import clsx from 'clsx';
import Button from './Button';
import ProgressBar from './ProgressBar';
import styles from './AudioUpload.module.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPPORTED_FORMATS = ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'flac', 'ogg', 'mpeg', 'mpga'];
const MAX_FILE_SIZE_MB = 100; // Large files are automatically chunked on the server
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Upload states
const STATE = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  TRANSCRIBING: 'transcribing',
  COMPLETE: 'complete',
  ERROR: 'error',
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Validates an audio file
 * @param {File} file - File to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeMB} MB). Maximum size is ${MAX_FILE_SIZE_MB} MB.`,
    };
  }

  // Check minimum size (1 KB)
  if (file.size < 1024) {
    return { valid: false, error: 'File is too small to be a valid audio file.' };
  }

  // Check file extension
  const extension = file.name.toLowerCase().split('.').pop();
  if (!SUPPORTED_FORMATS.includes(extension)) {
    return {
      valid: false,
      error: `Unsupported format (.${extension}). Use: ${SUPPORTED_FORMATS.slice(0, 5).join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Formats file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats seconds into human-readable time
 * @param {number} seconds - Time in seconds
 * @returns {string}
 */
function formatTimeRemaining(seconds) {
  if (seconds < 5) return 'almost done';
  if (seconds < 60) return `about ${Math.ceil(seconds / 5) * 5} seconds left`;
  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} minute${minutes > 1 ? 's' : ''} left`;
}

/**
 * Formats upload speed for display
 * @param {number} bytesPerSecond - Speed in bytes per second
 * @returns {string}
 */
function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

// Tips shown during transcription wait
const TRANSCRIPTION_TIPS = [
  'Transcription uses AI to convert speech to text with high accuracy',
  'Longer audio files are automatically split into chunks for processing',
  'The transcript will be used to generate your episode content',
  'You can edit the transcript after upload if needed',
  'Transcription cost is based on audio duration (~$0.006/minute)',
];

/**
 * Gets auth token from Supabase session
 */
function getAuthToken() {
  try {
    const keys = Object.keys(localStorage);
    const authKey = keys.find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
    if (!authKey) return null;
    const session = JSON.parse(localStorage.getItem(authKey) || '{}');
    return session?.access_token || null;
  } catch {
    return null;
  }
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
 */
function AudioUpload({ onTranscriptReady, onError, className }) {
  // State
  const [state, setState] = useState(STATE.IDLE);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcriptionResult, setTranscriptionResult] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Upload progress details
  const [bytesUploaded, setBytesUploaded] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);

  // Refs
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const uploadStartTimeRef = useRef(null);
  const lastProgressRef = useRef({ time: 0, bytes: 0 });

  // Rotate tips during transcription
  useEffect(() => {
    if (state !== STATE.TRANSCRIBING) return;

    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % TRANSCRIPTION_TIPS.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [state]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  /**
   * Handles file selection (from input or drop)
   */
  const handleFile = useCallback(async (selectedFile) => {
    // Validate file
    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      setError(validation.error);
      setState(STATE.ERROR);
      onError?.(validation.error);
      return;
    }

    // Set file and start upload
    setFile(selectedFile);
    setError(null);
    setState(STATE.UPLOADING);
    setUploadProgress(0);
    setBytesUploaded(0);
    setUploadSpeed(0);
    setTimeRemaining(null);
    uploadStartTimeRef.current = Date.now();
    lastProgressRef.current = { time: Date.now(), bytes: 0 };

    try {
      // Create form data
      const formData = new FormData();
      formData.append('audio', selectedFile);

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      // Get auth token
      const token = getAuthToken();
      if (!token) {
        throw new Error('Authentication required. Please log in again.');
      }

      // Upload with XHR for progress tracking
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
            setBytesUploaded(e.loaded);

            // Calculate upload speed and ETA
            const now = Date.now();
            const timeDelta = (now - lastProgressRef.current.time) / 1000; // seconds
            const bytesDelta = e.loaded - lastProgressRef.current.bytes;

            if (timeDelta >= 0.5) { // Update speed every 500ms for smoother display
              const speed = bytesDelta / timeDelta;
              setUploadSpeed(speed);

              const bytesRemaining = e.total - e.loaded;
              if (speed > 0) {
                setTimeRemaining(bytesRemaining / speed);
              }

              lastProgressRef.current = { time: now, bytes: e.loaded };
            }

            if (percent === 100) {
              setState(STATE.TRANSCRIBING);
              setCurrentTipIndex(0);
            }
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch {
              reject(new Error('Invalid response from server'));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.message || `Upload failed: ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error. Please check your connection.'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload cancelled'));
        });

        xhr.open('POST', '/api/transcription');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);

        // Store XHR for cancellation
        abortControllerRef.current.xhr = xhr;
      });

      // Success
      setTranscriptionResult(result);
      setState(STATE.COMPLETE);
      onTranscriptReady?.(result.transcript, {
        audioDurationMinutes: result.audioDurationMinutes,
        audioDurationSeconds: result.audioDurationSeconds,
        estimatedCost: result.estimatedCost,
        formattedCost: result.formattedCost,
        chunked: result.chunked,
        totalChunks: result.totalChunks,
        filename: selectedFile.name,
        fileSize: selectedFile.size,
        model: result.model,
      });
    } catch (err) {
      if (err.message !== 'Upload cancelled') {
        setError(err.message);
        setState(STATE.ERROR);
        onError?.(err.message);
      }
    }
  }, [onTranscriptReady, onError]);

  /**
   * Handles file input change
   */
  const handleInputChange = useCallback((e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFile(selectedFile);
    }
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
    if (state === STATE.IDLE || state === STATE.ERROR || state === STATE.COMPLETE) {
      fileInputRef.current?.click();
    }
  }, [state]);

  /**
   * Cancels upload
   */
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current?.xhr) {
      abortControllerRef.current.xhr.abort();
    }
    setFile(null);
    setError(null);
    setState(STATE.IDLE);
    setUploadProgress(0);
    setTranscriptionResult(null);
    setIsMinimized(false);
  }, []);

  /**
   * Minimizes the upload UI
   */
  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
  }, []);

  /**
   * Expands the minimized upload UI
   */
  const handleExpand = useCallback(() => {
    setIsMinimized(false);
  }, []);

  /**
   * Retries failed upload
   */
  const handleRetry = useCallback(() => {
    if (file) {
      handleFile(file);
    } else {
      setState(STATE.IDLE);
      setError(null);
    }
  }, [file, handleFile]);

  /**
   * Resets to upload another file
   */
  const handleUploadAnother = useCallback(() => {
    setFile(null);
    setError(null);
    setState(STATE.IDLE);
    setUploadProgress(0);
    setTranscriptionResult(null);
  }, []);

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

      {/* Minimized state - Compact floating bar */}
      {isMinimized && (state === STATE.UPLOADING || state === STATE.TRANSCRIBING) && (
        <div
          className={styles.minimizedBar}
          onClick={handleExpand}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleExpand()}
        >
          <div className={styles.minimizedContent}>
            {state === STATE.UPLOADING ? (
              <>
                <Upload size={16} className={styles.minimizedIcon} />
                <span className={styles.minimizedText}>
                  Uploading {uploadProgress}%
                </span>
                <div className={styles.minimizedProgress}>
                  <div
                    className={styles.minimizedProgressFill}
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <Loader2 size={16} className={clsx(styles.minimizedIcon, styles.spinner)} />
                <span className={styles.minimizedText}>Transcribing...</span>
              </>
            )}
          </div>
          <button
            className={styles.expandButton}
            onClick={(e) => {
              e.stopPropagation();
              handleExpand();
            }}
            title="Expand"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      )}

      {/* Idle state - Drop zone */}
      {state === STATE.IDLE && !isMinimized && (
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
      )}

      {/* Uploading state */}
      {state === STATE.UPLOADING && !isMinimized && (
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
                className={styles.minimizeButton}
                onClick={handleMinimize}
                title="Minimize - upload continues in background"
              >
                <Minimize2 size={16} />
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
            You can minimize this and continue browsing
          </span>
        </div>
      )}

      {/* Transcribing state */}
      {state === STATE.TRANSCRIBING && !isMinimized && (
        <div className={styles.progressContainer}>
          <div className={styles.fileInfo}>
            <Mic className={styles.fileIcon} />
            <div className={styles.fileDetails}>
              <span className={styles.fileName}>{file?.name}</span>
              <span className={styles.fileSize}>{formatFileSize(file?.size || 0)}</span>
            </div>
            <button
              className={styles.minimizeButton}
              onClick={handleMinimize}
              title="Minimize - transcription continues in background"
            >
              <Minimize2 size={16} />
            </button>
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
            <span className={styles.tipText}>{TRANSCRIPTION_TIPS[currentTipIndex]}</span>
          </div>
          <span className={styles.backgroundHint}>
            You can minimize this and continue browsing
          </span>
        </div>
      )}

      {/* Complete state */}
      {state === STATE.COMPLETE && transcriptionResult && (
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
          </div>
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
      {state === STATE.ERROR && (
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
