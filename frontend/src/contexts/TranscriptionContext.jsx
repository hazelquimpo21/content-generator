/**
 * ============================================================================
 * TRANSCRIPTION CONTEXT
 * ============================================================================
 * Manages the transcription queue for RSS feed episodes.
 * Ensures only one transcription runs at a time to manage costs and resources.
 *
 * Features:
 * - Track active transcription job with progress estimation
 * - Prevent multiple simultaneous transcriptions
 * - Show transcription status across the app
 * - Create "draft" state after transcription completes (like manual upload)
 * ============================================================================
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import api from '@utils/api-client';

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'active_transcription';
const DRAFT_STORAGE_KEY = 'feed_transcription_draft';

// Default estimated duration for episodes (in seconds)
// Used when we don't know the actual duration
const DEFAULT_EPISODE_DURATION_SECONDS = 30 * 60; // 30 minutes

// Transcription states (similar to UPLOAD_STATE)
export const TRANSCRIPTION_STATE = {
  IDLE: 'idle',
  TRANSCRIBING: 'transcribing',
  COMPLETE: 'complete',
  ERROR: 'error',
};

// Transcription steps for more granular progress display
export const TRANSCRIPTION_STEP = {
  DOWNLOADING: 'downloading',
  TRANSCRIBING: 'transcribing',
  CREATING: 'creating',
  READY: 'ready',
};

// Step metadata for UI display
export const STEP_INFO = {
  [TRANSCRIPTION_STEP.DOWNLOADING]: {
    label: 'Downloading audio',
    description: 'Fetching audio file from podcast feed...',
    progress: 15,
  },
  [TRANSCRIPTION_STEP.TRANSCRIBING]: {
    label: 'Transcribing',
    description: 'Converting speech to text...',
    progress: 50,
  },
  [TRANSCRIPTION_STEP.CREATING]: {
    label: 'Creating episode',
    description: 'Setting up your episode...',
    progress: 90,
  },
  [TRANSCRIPTION_STEP.READY]: {
    label: 'Ready',
    description: 'Transcription complete!',
    progress: 100,
  },
};

// ============================================================================
// CONTEXT
// ============================================================================

const TranscriptionContext = createContext(null);

/**
 * Transcription Provider - manages the transcription queue
 */
export function TranscriptionProvider({ children }) {
  // Transcription state
  const [state, setState] = useState(TRANSCRIPTION_STATE.IDLE);
  const [activeTranscription, setActiveTranscription] = useState(null);
  const [error, setError] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentStep, setCurrentStep] = useState(null);

  // Draft state - completed transcription ready for processing
  const [draftEpisode, setDraftEpisode] = useState(null);
  const [draftFeedEpisode, setDraftFeedEpisode] = useState(null);

  // Timer ref for elapsed time tracking
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const stepTimerRef = useRef(null);

  /**
   * Load any active transcription or draft from localStorage on mount
   * (handles page refresh during transcription)
   */
  useEffect(() => {
    // Check for active transcription
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        // Validate the stored data is still relevant
        if (data.feedEpisodeId && data.startedAt) {
          // If it's been more than 30 minutes, clear it
          const elapsed = Date.now() - data.startedAt;
          if (elapsed < 30 * 60 * 1000) {
            setActiveTranscription(data);
            setState(TRANSCRIPTION_STATE.TRANSCRIBING);
            startTimeRef.current = data.startedAt;
            setElapsedSeconds(Math.floor(elapsed / 1000));
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    // Check for draft
    const draftStored = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (draftStored) {
      try {
        const data = JSON.parse(draftStored);
        if (data.episode && data.feedEpisode) {
          // If draft is more than 24 hours old, clear it
          const age = Date.now() - (data.completedAt || 0);
          if (age < 24 * 60 * 60 * 1000) {
            setDraftEpisode(data.episode);
            setDraftFeedEpisode(data.feedEpisode);
            setState(TRANSCRIPTION_STATE.COMPLETE);
          } else {
            localStorage.removeItem(DRAFT_STORAGE_KEY);
          }
        }
      } catch {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    }
  }, []);

  /**
   * Track elapsed time during transcription and update step
   */
  useEffect(() => {
    if (state === TRANSCRIPTION_STATE.TRANSCRIBING && startTimeRef.current) {
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSeconds(elapsed);

        // Update step based on progress
        const durationSeconds = activeTranscription?.durationSeconds || DEFAULT_EPISODE_DURATION_SECONDS;
        const estimatedTotal = Math.ceil((durationSeconds / 60) * 4) + 30;
        updateStepBasedOnProgress(elapsed, estimatedTotal);
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [state, activeTranscription, updateStepBasedOnProgress]);

  /**
   * Estimate total transcription time based on episode duration
   * Returns time in seconds
   */
  const getEstimatedTotalSeconds = useCallback(() => {
    if (!activeTranscription) return 120; // Default 2 min estimate

    // If we know the duration, estimate based on that
    // Rough estimate: 1 minute of audio takes about 4-5 seconds to transcribe
    // Plus download time (~30s buffer)
    const durationSeconds = activeTranscription.durationSeconds || DEFAULT_EPISODE_DURATION_SECONDS;
    const estimatedMinutes = durationSeconds / 60;

    // Base transcription time + download time buffer
    return Math.ceil(estimatedMinutes * 4) + 30; // 4 sec/min + 30s buffer
  }, [activeTranscription]);

  /**
   * Calculate transcription progress as percentage
   */
  const getProgress = useCallback(() => {
    const estimatedTotal = getEstimatedTotalSeconds();
    if (estimatedTotal <= 0) return 0;

    // Cap at 95% until actually complete
    return Math.min(95, Math.round((elapsedSeconds / estimatedTotal) * 100));
  }, [elapsedSeconds, getEstimatedTotalSeconds]);

  /**
   * Get estimated time remaining
   */
  const getTimeRemaining = useCallback(() => {
    const estimatedTotal = getEstimatedTotalSeconds();
    const remaining = Math.max(0, estimatedTotal - elapsedSeconds);

    if (remaining > 60) {
      return `~${Math.ceil(remaining / 60)}m remaining`;
    }
    if (remaining > 0) {
      return `~${remaining}s remaining`;
    }
    return 'Almost done...';
  }, [elapsedSeconds, getEstimatedTotalSeconds]);

  /**
   * Simulate step progression for better UX feedback
   * Steps progress naturally based on elapsed time and estimated duration
   */
  const updateStepBasedOnProgress = useCallback((elapsed, estimatedTotal) => {
    // Step transitions based on % of estimated time
    // 0-15%: Downloading
    // 15-85%: Transcribing
    // 85-100%: Creating episode
    const progressPercent = (elapsed / estimatedTotal) * 100;

    if (progressPercent < 15) {
      setCurrentStep(TRANSCRIPTION_STEP.DOWNLOADING);
    } else if (progressPercent < 85) {
      setCurrentStep(TRANSCRIPTION_STEP.TRANSCRIBING);
    } else {
      setCurrentStep(TRANSCRIPTION_STEP.CREATING);
    }
  }, []);

  /**
   * Start a transcription job
   * Returns false if a transcription is already running
   */
  const startTranscription = useCallback(async (feedEpisode, options = {}) => {
    // Check if already transcribing
    if (state === TRANSCRIPTION_STATE.TRANSCRIBING || activeTranscription) {
      return {
        success: false,
        error: 'A transcription is already in progress. Please wait for it to complete.',
        activeEpisode: activeTranscription,
      };
    }

    // Clear any existing draft
    setDraftEpisode(null);
    setDraftFeedEpisode(null);
    localStorage.removeItem(DRAFT_STORAGE_KEY);

    // Set active state with initial step
    const transcriptionData = {
      feedEpisodeId: feedEpisode.id,
      feedId: feedEpisode.feed_id,
      title: feedEpisode.title,
      description: feedEpisode.description,
      durationSeconds: feedEpisode.duration_seconds,
      publishedAt: feedEpisode.published_at,
      artworkUrl: feedEpisode.artwork_url,
      startedAt: Date.now(),
    };

    setActiveTranscription(transcriptionData);
    setState(TRANSCRIPTION_STATE.TRANSCRIBING);
    setCurrentStep(TRANSCRIPTION_STEP.DOWNLOADING);
    setError(null);
    setElapsedSeconds(0);
    startTimeRef.current = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...transcriptionData,
      step: TRANSCRIPTION_STEP.DOWNLOADING,
    }));

    try {
      // Start the transcription
      const result = await api.podcasts.transcribeEpisode(feedEpisode.id, options);

      // Success - transition to draft state
      setActiveTranscription(null);
      setCurrentStep(TRANSCRIPTION_STEP.READY);
      localStorage.removeItem(STORAGE_KEY);

      // Store as draft
      const draftData = {
        episode: result.episode,
        feedEpisode: {
          ...feedEpisode,
          ...transcriptionData,
        },
        transcription: result.transcription,
        completedAt: Date.now(),
      };

      setDraftEpisode(result.episode);
      setDraftFeedEpisode(feedEpisode);
      setState(TRANSCRIPTION_STATE.COMPLETE);
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));

      return {
        success: true,
        episode: result.episode,
        transcription: result.transcription,
      };
    } catch (err) {
      // Error - clear active state
      setActiveTranscription(null);
      setCurrentStep(null);
      localStorage.removeItem(STORAGE_KEY);
      setState(TRANSCRIPTION_STATE.ERROR);
      setError(err.message || 'Transcription failed');
      startTimeRef.current = null;

      return {
        success: false,
        error: err.message || 'Transcription failed',
      };
    }
  }, [state, activeTranscription]);

  /**
   * Clear the active transcription (for error recovery)
   */
  const clearTranscription = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setActiveTranscription(null);
    setState(TRANSCRIPTION_STATE.IDLE);
    setCurrentStep(null);
    setError(null);
    setElapsedSeconds(0);
    startTimeRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  /**
   * Clear the draft and reset to idle
   */
  const clearDraft = useCallback(() => {
    setDraftEpisode(null);
    setDraftFeedEpisode(null);
    setState(TRANSCRIPTION_STATE.IDLE);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  }, []);

  /**
   * Consume the draft episode (marks it as used)
   * Returns the episode data and clears the draft
   */
  const consumeDraft = useCallback(() => {
    if (!draftEpisode) return null;

    const result = {
      episode: draftEpisode,
      feedEpisode: draftFeedEpisode,
    };

    // Clear draft after consuming
    setDraftEpisode(null);
    setDraftFeedEpisode(null);
    setState(TRANSCRIPTION_STATE.IDLE);
    localStorage.removeItem(DRAFT_STORAGE_KEY);

    return result;
  }, [draftEpisode, draftFeedEpisode]);

  /**
   * Check if a specific episode is currently being transcribed
   */
  const isTranscribing = useCallback((feedEpisodeId) => {
    return activeTranscription?.feedEpisodeId === feedEpisodeId;
  }, [activeTranscription]);

  // Computed values
  const hasActiveTranscription = state === TRANSCRIPTION_STATE.TRANSCRIBING && !!activeTranscription;
  const hasReadyDraft = state === TRANSCRIPTION_STATE.COMPLETE && !!draftEpisode;
  const isProcessing = state === TRANSCRIPTION_STATE.TRANSCRIBING;
  const progress = getProgress();
  const timeRemaining = getTimeRemaining();
  const stepInfo = currentStep ? STEP_INFO[currentStep] : null;

  return (
    <TranscriptionContext.Provider
      value={{
        // State
        state,
        activeTranscription,
        error,
        elapsedSeconds,
        progress,
        timeRemaining,
        currentStep,
        stepInfo,

        // Draft state
        draftEpisode,
        draftFeedEpisode,
        hasReadyDraft,

        // Computed
        hasActiveTranscription,
        isProcessing,

        // Actions
        startTranscription,
        clearTranscription,
        clearDraft,
        consumeDraft,
        isTranscribing,
      }}
    >
      {children}
    </TranscriptionContext.Provider>
  );
}

/**
 * Hook to access transcription context
 */
export function useTranscription() {
  const context = useContext(TranscriptionContext);
  if (!context) {
    throw new Error('useTranscription must be used within a TranscriptionProvider');
  }
  return context;
}

export default TranscriptionProvider;
