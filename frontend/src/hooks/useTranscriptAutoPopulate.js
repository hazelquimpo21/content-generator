/**
 * ============================================================================
 * USE TRANSCRIPT AUTO-POPULATE HOOK
 * ============================================================================
 * Custom React hook that automatically analyzes podcast transcripts and
 * extracts metadata for auto-populating form fields.
 *
 * Features:
 * - Debounced analysis (waits for user to stop typing)
 * - Loading/error states for UI feedback
 * - Automatic field population with user control
 * - Abort handling for rapid transcript changes
 *
 * How it works:
 * 1. User pastes/types transcript
 * 2. Hook debounces input (waits 1.5s after last change)
 * 3. Calls Claude Haiku via backend API for quick analysis
 * 4. Returns extracted metadata for form fields
 * 5. Component decides whether to auto-fill fields
 *
 * Cost: ~$0.001-0.003 per analysis (very affordable)
 *
 * Usage:
 *   const { analyzing, metadata, error, analyze, reset } = useTranscriptAutoPopulate();
 *
 *   useEffect(() => {
 *     if (transcript.length >= 200) {
 *       analyze(transcript);
 *     }
 *   }, [transcript, analyze]);
 *
 * ============================================================================
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import api from '@utils/api-client';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Debounce delay in milliseconds (wait for user to stop typing)
const DEBOUNCE_DELAY = 1500;

// Minimum transcript length to trigger analysis
const MIN_TRANSCRIPT_LENGTH = 200;

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for auto-populating episode fields from transcript analysis.
 *
 * @returns {Object} Hook state and methods
 * @property {boolean} analyzing - Whether analysis is in progress
 * @property {Object|null} metadata - Extracted metadata or null
 * @property {Object|null} usage - API usage stats (tokens, cost, duration)
 * @property {string|null} error - Error message if analysis failed
 * @property {Function} analyze - Trigger analysis for a transcript
 * @property {Function} reset - Reset state (clear metadata/error)
 * @property {boolean} canAnalyze - Whether transcript is long enough
 */
export function useTranscriptAutoPopulate() {
  // State
  const [analyzing, setAnalyzing] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(null);

  // Refs for debouncing and abort handling
  const debounceTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const lastAnalyzedTranscriptRef = useRef('');

  /**
   * Cleanup on unmount - cancel pending requests and timeouts
   */
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Reset hook state - useful when user starts a new episode
   */
  const reset = useCallback(() => {
    setAnalyzing(false);
    setMetadata(null);
    setUsage(null);
    setError(null);
    lastAnalyzedTranscriptRef.current = '';

    // Cancel any pending operations
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * Perform the actual API call for transcript analysis
   */
  const performAnalysis = useCallback(async (transcript) => {
    // Skip if transcript hasn't changed significantly
    // (prevents re-analysis on minor edits)
    const transcriptHash = transcript.substring(0, 500) + transcript.length;
    if (transcriptHash === lastAnalyzedTranscriptRef.current) {
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    setAnalyzing(true);
    setError(null);

    try {
      console.log('[AutoPopulate] Starting transcript analysis...');

      const response = await api.post('/episodes/analyze-transcript', {
        transcript,
      });

      // Check if request was aborted (new transcript came in)
      if (abortControllerRef.current?.signal.aborted) {
        console.log('[AutoPopulate] Analysis aborted (newer request in progress)');
        return;
      }

      console.log('[AutoPopulate] Analysis complete:', {
        title: response.metadata.suggested_title,
        guest: response.metadata.guest_name,
        confidence: response.metadata.confidence,
        durationMs: response.usage.durationMs,
        cost: `$${response.usage.cost.toFixed(4)}`,
      });

      // Store the analyzed transcript hash to prevent re-analysis
      lastAnalyzedTranscriptRef.current = transcriptHash;

      setMetadata(response.metadata);
      setUsage(response.usage);
    } catch (err) {
      // Ignore abort errors (expected when user keeps typing)
      if (err.name === 'AbortError') {
        console.log('[AutoPopulate] Request aborted');
        return;
      }

      console.error('[AutoPopulate] Analysis failed:', err.message);
      setError(err.message || 'Failed to analyze transcript');
      setMetadata(null);
      setUsage(null);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  /**
   * Trigger debounced analysis of transcript
   * Call this whenever the transcript changes
   */
  const analyze = useCallback((transcript) => {
    // Clear any existing debounce timer
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Validate transcript length
    if (!transcript || transcript.length < MIN_TRANSCRIPT_LENGTH) {
      // Reset state if transcript becomes too short
      if (metadata || error) {
        setMetadata(null);
        setUsage(null);
        setError(null);
      }
      return;
    }

    // Show analyzing state immediately for UX feedback
    // (actual analysis starts after debounce)
    setAnalyzing(true);

    // Debounce the actual API call
    debounceTimeoutRef.current = setTimeout(() => {
      performAnalysis(transcript);
    }, DEBOUNCE_DELAY);
  }, [performAnalysis, metadata, error]);

  /**
   * Check if current transcript length is sufficient for analysis
   */
  const canAnalyze = useCallback((transcriptLength) => {
    return transcriptLength >= MIN_TRANSCRIPT_LENGTH;
  }, []);

  return {
    // State
    analyzing,
    metadata,
    usage,
    error,

    // Methods
    analyze,
    reset,
    canAnalyze,

    // Constants (exposed for UI logic)
    minTranscriptLength: MIN_TRANSCRIPT_LENGTH,
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export default useTranscriptAutoPopulate;
