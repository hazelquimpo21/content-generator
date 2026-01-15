/**
 * ============================================================================
 * PROCESSING CONTEXT
 * ============================================================================
 * Tracks active episode processing jobs globally across the app.
 * Allows any component to see what's currently processing and its progress.
 *
 * Features:
 * - Track multiple processing jobs
 * - Poll for updates on active jobs
 * - Notify when processing completes
 * ============================================================================
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import api from '@utils/api-client';

// ============================================================================
// CONSTANTS
// ============================================================================

const POLL_INTERVAL = 3000; // 3 seconds - less aggressive than the dedicated screen
const ESTIMATED_DURATION_SECONDS = 70; // Average processing time

// ============================================================================
// CONTEXT
// ============================================================================

const ProcessingContext = createContext(null);

/**
 * Processing Provider - tracks all active processing jobs
 */
export function ProcessingProvider({ children }) {
  // Map of episodeId -> processing status
  const [processingJobs, setProcessingJobs] = useState({});
  const pollIntervalRef = useRef(null);

  /**
   * Start tracking a processing job
   */
  const trackProcessing = useCallback((episodeId, episodeTitle) => {
    setProcessingJobs((prev) => ({
      ...prev,
      [episodeId]: {
        id: episodeId,
        title: episodeTitle,
        status: 'processing',
        currentStage: 0,
        totalStages: 10,
        startedAt: Date.now(),
        estimatedDuration: ESTIMATED_DURATION_SECONDS,
      },
    }));
  }, []);

  /**
   * Stop tracking a processing job
   */
  const stopTracking = useCallback((episodeId) => {
    setProcessingJobs((prev) => {
      const next = { ...prev };
      delete next[episodeId];
      return next;
    });
  }, []);

  /**
   * Get processing status for an episode
   */
  const getProcessingStatus = useCallback((episodeId) => {
    return processingJobs[episodeId] || null;
  }, [processingJobs]);

  /**
   * Check if any episodes are currently processing
   */
  const hasActiveProcessing = Object.keys(processingJobs).length > 0;

  /**
   * Get list of all active processing jobs
   */
  const activeJobs = Object.values(processingJobs);

  /**
   * Poll for updates on all active jobs
   */
  useEffect(() => {
    if (!hasActiveProcessing) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    async function pollJobs() {
      const jobIds = Object.keys(processingJobs);

      for (const episodeId of jobIds) {
        try {
          const data = await api.episodes.getWithStages(episodeId);
          const episode = data.episode;

          if (episode.status === 'completed' || episode.status === 'error') {
            // Job finished - remove from tracking
            setProcessingJobs((prev) => {
              const next = { ...prev };
              delete next[episodeId];
              return next;
            });
          } else {
            // Update progress
            setProcessingJobs((prev) => ({
              ...prev,
              [episodeId]: {
                ...prev[episodeId],
                currentStage: episode.current_stage || 0,
                status: episode.status,
              },
            }));
          }
        } catch (err) {
          console.error('[ProcessingContext] Failed to poll job:', episodeId, err);
        }
      }
    }

    // Initial poll
    pollJobs();

    // Set up interval
    pollIntervalRef.current = setInterval(pollJobs, POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [hasActiveProcessing, Object.keys(processingJobs).join(',')]);

  return (
    <ProcessingContext.Provider
      value={{
        trackProcessing,
        stopTracking,
        getProcessingStatus,
        hasActiveProcessing,
        activeJobs,
        estimatedDuration: ESTIMATED_DURATION_SECONDS,
      }}
    >
      {children}
    </ProcessingContext.Provider>
  );
}

/**
 * Hook to access processing context
 */
export function useProcessing() {
  const context = useContext(ProcessingContext);
  if (!context) {
    throw new Error('useProcessing must be used within a ProcessingProvider');
  }
  return context;
}

export default ProcessingProvider;
