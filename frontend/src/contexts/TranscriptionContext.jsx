/**
 * ============================================================================
 * TRANSCRIPTION CONTEXT
 * ============================================================================
 * Manages the transcription queue for RSS feed episodes.
 * Ensures only one transcription runs at a time to manage costs and resources.
 *
 * Features:
 * - Track active transcription job
 * - Prevent multiple simultaneous transcriptions
 * - Show transcription status across the app
 * ============================================================================
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import api from '@utils/api-client';

// ============================================================================
// CONSTANTS
// ============================================================================

const POLL_INTERVAL = 5000; // 5 seconds
const STORAGE_KEY = 'active_transcription';

// ============================================================================
// CONTEXT
// ============================================================================

const TranscriptionContext = createContext(null);

/**
 * Transcription Provider - manages the transcription queue
 */
export function TranscriptionProvider({ children }) {
  // Active transcription state
  const [activeTranscription, setActiveTranscription] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollIntervalRef = useRef(null);

  /**
   * Load any active transcription from localStorage on mount
   * (handles page refresh during transcription)
   */
  useEffect(() => {
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
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  /**
   * Start a transcription job
   * Returns false if a transcription is already running
   */
  const startTranscription = useCallback(async (feedEpisode, options = {}) => {
    // Check if already transcribing
    if (activeTranscription) {
      return {
        success: false,
        error: 'A transcription is already in progress. Please wait for it to complete.',
        activeEpisode: activeTranscription,
      };
    }

    // Set active state
    const transcriptionData = {
      feedEpisodeId: feedEpisode.id,
      feedId: feedEpisode.feed_id,
      title: feedEpisode.title,
      startedAt: Date.now(),
      status: 'transcribing',
    };

    setActiveTranscription(transcriptionData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transcriptionData));

    try {
      // Start the transcription
      const result = await api.podcasts.transcribeEpisode(feedEpisode.id, options);

      // Success - clear active state
      setActiveTranscription(null);
      localStorage.removeItem(STORAGE_KEY);

      return {
        success: true,
        episode: result.episode,
        transcription: result.transcription,
      };
    } catch (error) {
      // Error - clear active state
      setActiveTranscription(null);
      localStorage.removeItem(STORAGE_KEY);

      return {
        success: false,
        error: error.message || 'Transcription failed',
      };
    }
  }, [activeTranscription]);

  /**
   * Clear the active transcription (for error recovery)
   */
  const clearTranscription = useCallback(() => {
    setActiveTranscription(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  /**
   * Check if a specific episode is currently being transcribed
   */
  const isTranscribing = useCallback((feedEpisodeId) => {
    return activeTranscription?.feedEpisodeId === feedEpisodeId;
  }, [activeTranscription]);

  /**
   * Check if any transcription is active
   */
  const hasActiveTranscription = !!activeTranscription;

  return (
    <TranscriptionContext.Provider
      value={{
        activeTranscription,
        hasActiveTranscription,
        isTranscribing,
        startTranscription,
        clearTranscription,
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
