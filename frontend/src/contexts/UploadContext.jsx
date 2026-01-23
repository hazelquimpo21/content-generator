/**
 * ============================================================================
 * UPLOAD CONTEXT
 * ============================================================================
 * Global context for managing audio uploads that persist across navigation.
 * Allows users to browse away while uploads continue in the background.
 *
 * Features:
 * - Persistent upload state across route changes
 * - Real-time progress tracking with speed and ETA
 * - Floating indicator for background uploads
 * - Automatic cleanup on completion or cancellation
 * ============================================================================
 */

import { createContext, useContext, useState, useRef, useCallback } from 'react';

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPPORTED_FORMATS = ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'flac', 'ogg', 'mpeg', 'mpga'];
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Upload states
export const UPLOAD_STATE = {
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
 */
function validateFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeMB} MB). Maximum size is ${MAX_FILE_SIZE_MB} MB.`,
    };
  }

  if (file.size < 1024) {
    return { valid: false, error: 'File is too small to be a valid audio file.' };
  }

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
// CONTEXT
// ============================================================================

const UploadContext = createContext(null);

/**
 * Upload Provider component
 * Wraps the app to provide global upload state
 */
export function UploadProvider({ children }) {
  // Upload state
  const [state, setState] = useState(UPLOAD_STATE.IDLE);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [bytesUploaded, setBytesUploaded] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [transcriptionResult, setTranscriptionResult] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [useSpeakerDiarization, setUseSpeakerDiarization] = useState(false);
  // Flag to indicate transcript is ready to be consumed by NewEpisode form
  const [pendingForForm, setPendingForForm] = useState(false);

  // Refs for XHR and timing
  const xhrRef = useRef(null);
  const lastProgressRef = useRef({ time: 0, bytes: 0 });

  // Callbacks to notify when complete
  const onCompleteCallbackRef = useRef(null);
  const onErrorCallbackRef = useRef(null);

  /**
   * Starts an upload
   * @param {File} selectedFile - The audio file to upload
   * @param {Object} options - Upload options
   * @param {Function} options.onComplete - Callback when transcription completes
   * @param {Function} options.onError - Callback on error
   * @param {boolean} options.withSpeakers - Enable speaker diarization (AssemblyAI)
   * @param {boolean} options.useEnhanced - Use enhanced mode (timestamps + speakers without AssemblyAI)
   * @param {boolean} options.estimateSpeakers - Estimate speakers in enhanced mode
   * @param {boolean} options.useLLM - Use LLM for speaker estimation (default: true)
   * @param {number} options.speakersExpected - Expected number of speakers (1-10)
   */
  const startUpload = useCallback((selectedFile, { onComplete, onError, withSpeakers = false, useEnhanced = false, estimateSpeakers = false, useLLM = true, speakersExpected } = {}) => {
    // Validate file
    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      setError(validation.error);
      setState(UPLOAD_STATE.ERROR);
      onError?.(validation.error);
      return false;
    }

    // Store callbacks
    onCompleteCallbackRef.current = onComplete;
    onErrorCallbackRef.current = onError;

    // Reset state
    setFile(selectedFile);
    setError(null);
    setState(UPLOAD_STATE.UPLOADING);
    setUploadProgress(0);
    setBytesUploaded(0);
    setUploadSpeed(0);
    setTimeRemaining(null);
    setTranscriptionResult(null);
    setIsMinimized(false);
    setUseSpeakerDiarization(withSpeakers);
    setPendingForForm(true); // Mark as pending for form consumption
    lastProgressRef.current = { time: Date.now(), bytes: 0 };

    // Get auth token
    const token = getAuthToken();
    if (!token) {
      const authError = 'Authentication required. Please log in again.';
      setError(authError);
      setState(UPLOAD_STATE.ERROR);
      onError?.(authError);
      return false;
    }

    // Create form data
    const formData = new FormData();
    formData.append('audio', selectedFile);

    // Add speaker diarization options if enabled (AssemblyAI mode)
    if (withSpeakers && !useEnhanced && speakersExpected) {
      formData.append('speakers_expected', speakersExpected.toString());
    }

    // Add enhanced transcription options
    if (useEnhanced) {
      formData.append('estimate_speakers', estimateSpeakers.toString());
      formData.append('use_llm', useLLM.toString());
      if (speakersExpected) {
        formData.append('expected_speakers', speakersExpected.toString());
      }
    }

    // Create XHR for progress tracking
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percent);
        setBytesUploaded(e.loaded);

        // Calculate speed and ETA
        const now = Date.now();
        const timeDelta = (now - lastProgressRef.current.time) / 1000;
        const bytesDelta = e.loaded - lastProgressRef.current.bytes;

        if (timeDelta >= 0.5) {
          const speed = bytesDelta / timeDelta;
          setUploadSpeed(speed);

          const bytesRemaining = e.total - e.loaded;
          if (speed > 0) {
            setTimeRemaining(bytesRemaining / speed);
          }

          lastProgressRef.current = { time: now, bytes: e.loaded };
        }

        if (percent === 100) {
          setState(UPLOAD_STATE.TRANSCRIBING);
        }
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          setTranscriptionResult(data);
          setState(UPLOAD_STATE.COMPLETE);
          setIsMinimized(false); // Show completion

          onCompleteCallbackRef.current?.(data.transcript, {
            audioDurationMinutes: data.audioDurationMinutes,
            audioDurationSeconds: data.audioDurationSeconds,
            estimatedCost: data.estimatedCost,
            formattedCost: data.formattedCost,
            chunked: data.chunked,
            totalChunks: data.totalChunks,
            filename: selectedFile.name,
            fileSize: selectedFile.size,
            model: data.model,
            // Speaker diarization data (if applicable)
            hasSpeakerLabels: data.hasSpeakerLabels || false,
            formattedTranscript: data.formattedTranscript,
            speakers: data.speakers,
            utterances: data.utterances,
            provider: data.provider,
            transcriptId: data.transcriptId,
          });
        } catch {
          const parseError = 'Invalid response from server';
          setError(parseError);
          setState(UPLOAD_STATE.ERROR);
          onErrorCallbackRef.current?.(parseError);
        }
      } else {
        let errorMsg = `Upload failed: ${xhr.status}`;
        try {
          const errorData = JSON.parse(xhr.responseText);
          errorMsg = errorData.message || errorMsg;
        } catch {
          // Keep default error message
        }
        setError(errorMsg);
        setState(UPLOAD_STATE.ERROR);
        onErrorCallbackRef.current?.(errorMsg);
      }
    });

    xhr.addEventListener('error', () => {
      const networkError = 'Network error. Please check your connection.';
      setError(networkError);
      setState(UPLOAD_STATE.ERROR);
      onErrorCallbackRef.current?.(networkError);
    });

    xhr.addEventListener('abort', () => {
      // Don't set error state on user cancellation
      setState(UPLOAD_STATE.IDLE);
    });

    xhr.addEventListener('timeout', () => {
      const timeoutError = 'Request timed out. Large audio files may take longer to process.';
      setError(timeoutError);
      setState(UPLOAD_STATE.ERROR);
      onErrorCallbackRef.current?.(timeoutError);
    });

    // Determine endpoint based on transcription mode
    let endpoint = '/api/transcription';
    if (useEnhanced) {
      endpoint = '/api/transcription/enhanced';
    } else if (withSpeakers) {
      endpoint = '/api/transcription/speaker';
    }
    xhr.open('POST', endpoint);
    // Set 15 minute timeout for long transcriptions (large audio files can take 5-10+ minutes)
    xhr.timeout = 900000;
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);

    return true;
  }, []);

  /**
   * Cancels the current upload
   */
  const cancelUpload = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setFile(null);
    setError(null);
    setState(UPLOAD_STATE.IDLE);
    setUploadProgress(0);
    setBytesUploaded(0);
    setUploadSpeed(0);
    setTimeRemaining(null);
    setTranscriptionResult(null);
    setIsMinimized(false);
    setPendingForForm(false);
    onCompleteCallbackRef.current = null;
    onErrorCallbackRef.current = null;
  }, []);

  /**
   * Resets state for a new upload
   */
  const reset = useCallback(() => {
    setFile(null);
    setError(null);
    setState(UPLOAD_STATE.IDLE);
    setUploadProgress(0);
    setBytesUploaded(0);
    setUploadSpeed(0);
    setTimeRemaining(null);
    setTranscriptionResult(null);
    setIsMinimized(false);
    setPendingForForm(false);
  }, []);

  /**
   * Consumes the pending transcript and returns it
   * Used by NewEpisode form to retrieve completed transcription
   */
  const consumeTranscript = useCallback(() => {
    if (state !== UPLOAD_STATE.COMPLETE || !transcriptionResult || !pendingForForm) {
      return null;
    }

    const result = {
      transcript: transcriptionResult.transcript,
      metadata: {
        audioDurationMinutes: transcriptionResult.audioDurationMinutes,
        audioDurationSeconds: transcriptionResult.audioDurationSeconds,
        estimatedCost: transcriptionResult.estimatedCost,
        formattedCost: transcriptionResult.formattedCost,
        chunked: transcriptionResult.chunked,
        totalChunks: transcriptionResult.totalChunks,
        filename: file?.name,
        fileSize: file?.size,
        model: transcriptionResult.model,
        hasSpeakerLabels: transcriptionResult.hasSpeakerLabels || false,
        formattedTranscript: transcriptionResult.formattedTranscript,
        speakers: transcriptionResult.speakers,
        utterances: transcriptionResult.utterances,
        provider: transcriptionResult.provider,
        transcriptId: transcriptionResult.transcriptId,
      },
    };

    // Reset state after consuming
    setPendingForForm(false);
    setTranscriptionResult(null);
    setFile(null);
    setState(UPLOAD_STATE.IDLE);

    return result;
  }, [state, transcriptionResult, pendingForForm, file]);

  /**
   * Minimizes the upload UI
   */
  const minimize = useCallback(() => {
    setIsMinimized(true);
  }, []);

  /**
   * Expands the minimized upload UI
   */
  const expand = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const value = {
    // State
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
    pendingForForm,

    // Actions
    startUpload,
    cancelUpload,
    reset,
    minimize,
    expand,
    consumeTranscript,

    // Helpers
    isUploading: state === UPLOAD_STATE.UPLOADING,
    isTranscribing: state === UPLOAD_STATE.TRANSCRIBING,
    isProcessing: state === UPLOAD_STATE.UPLOADING || state === UPLOAD_STATE.TRANSCRIBING,
    isComplete: state === UPLOAD_STATE.COMPLETE,
    isError: state === UPLOAD_STATE.ERROR,
    isIdle: state === UPLOAD_STATE.IDLE,
    hasSpeakerLabels: transcriptionResult?.hasSpeakerLabels || false,
    hasReadyTranscript: state === UPLOAD_STATE.COMPLETE && pendingForForm && !!transcriptionResult,
  };

  return (
    <UploadContext.Provider value={value}>
      {children}
    </UploadContext.Provider>
  );
}

/**
 * Hook to access upload context
 */
export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
}

export default UploadContext;
