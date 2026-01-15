/**
 * ============================================================================
 * NEW EPISODE PAGE
 * ============================================================================
 * Upload a podcast transcript and configure episode context.
 * Starts the 10-stage AI processing pipeline (Stage 0-9).
 *
 * Features:
 * - Transcript upload (paste or file)
 * - Auto-population of fields using Claude Haiku analysis
 * - Cost and time estimates
 * - Validation before submission
 *
 * Auto-Population:
 * When a transcript is entered (min 200 chars), the system automatically
 * analyzes it using Claude 3.5 Haiku (~$0.001-0.003, ~2-3 seconds) to
 * extract suggested metadata like title, guest info, and topics.
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Sparkles, AlertCircle, Loader2, Wand2, Check } from 'lucide-react';
import { Button, Card, Input } from '@components/shared';
import api from '@utils/api-client';
import { useTranscriptAutoPopulate } from '@hooks/useTranscriptAutoPopulate';
import styles from './NewEpisode.module.css';

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * NewEpisode page component
 */
function NewEpisode() {
  const navigate = useNavigate();

  // Form state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [episodeContext, setEpisodeContext] = useState({
    title: '',
    episode_number: '',
    guest_name: '',
    guest_credentials: '',
    recording_date: '',
    notes: '',
  });

  // Track which fields were auto-populated (for visual feedback)
  const [autoPopulatedFields, setAutoPopulatedFields] = useState(new Set());

  // Auto-populate hook
  const {
    analyzing,
    metadata,
    usage,
    error: analyzeError,
    analyze,
    reset: resetAnalysis,
    minTranscriptLength,
  } = useTranscriptAutoPopulate();

  // Track if user has manually edited fields (don't overwrite user edits)
  const userEditedFieldsRef = useRef(new Set());

  // ============================================================================
  // AUTO-POPULATE EFFECT
  // ============================================================================

  /**
   * Trigger analysis when transcript changes
   */
  useEffect(() => {
    if (transcript.length >= minTranscriptLength) {
      analyze(transcript);
    }
  }, [transcript, analyze, minTranscriptLength]);

  /**
   * Auto-populate fields when metadata is available
   * Only populates fields that:
   * - Have metadata available
   * - Are currently empty OR haven't been manually edited by user
   */
  useEffect(() => {
    if (!metadata) return;

    const newAutoPopulated = new Set();

    setEpisodeContext((prev) => {
      const updates = { ...prev };

      // Auto-populate title if not manually edited by user
      // Always use AI-suggested title over filename-based defaults
      if (metadata.suggested_title && !userEditedFieldsRef.current.has('title')) {
        updates.title = metadata.suggested_title;
        newAutoPopulated.add('title');
      }

      // Auto-populate guest name if empty or not manually edited
      if (metadata.guest_name && !userEditedFieldsRef.current.has('guest_name')) {
        if (!prev.guest_name || prev.guest_name === '') {
          updates.guest_name = metadata.guest_name;
          newAutoPopulated.add('guest_name');
        }
      }

      // Auto-populate guest credentials if empty or not manually edited
      if (metadata.guest_credentials && !userEditedFieldsRef.current.has('guest_credentials')) {
        if (!prev.guest_credentials || prev.guest_credentials === '') {
          updates.guest_credentials = metadata.guest_credentials;
          newAutoPopulated.add('guest_credentials');
        }
      }

      // Auto-populate notes with topics and summary if empty
      if (!userEditedFieldsRef.current.has('notes')) {
        if (!prev.notes || prev.notes === '') {
          const topicsText = metadata.main_topics?.length
            ? `Topics: ${metadata.main_topics.join(', ')}`
            : '';
          const summaryText = metadata.brief_summary || '';
          const notesContent = [topicsText, summaryText].filter(Boolean).join('\n\n');
          if (notesContent) {
            updates.notes = notesContent;
            newAutoPopulated.add('notes');
          }
        }
      }

      return updates;
    });

    // Show visual feedback for auto-populated fields
    setAutoPopulatedFields(newAutoPopulated);

    // Clear visual feedback after animation
    if (newAutoPopulated.size > 0) {
      setTimeout(() => {
        setAutoPopulatedFields(new Set());
      }, 2000);
    }
  }, [metadata]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  /**
   * Handle field change - track user edits
   */
  function handleFieldChange(fieldName, value) {
    userEditedFieldsRef.current.add(fieldName);
    setEpisodeContext((prev) => ({ ...prev, [fieldName]: value }));
    setAutoPopulatedFields((prev) => {
      const next = new Set(prev);
      next.delete(fieldName);
      return next;
    });
  }

  /**
   * Handle file upload
   */
  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setTranscript(text);

      // Reset user edits when new transcript is uploaded
      userEditedFieldsRef.current.clear();
      resetAnalysis();

      // Try to extract title from filename if no title yet
      const filename = file.name.replace(/\.[^/.]+$/, '');
      if (!episodeContext.title) {
        setEpisodeContext((prev) => ({ ...prev, title: filename }));
      }
    } catch {
      setError('Failed to read file. Please try again or paste the transcript directly.');
    }
  }

  /**
   * Handle transcript change
   */
  function handleTranscriptChange(e) {
    const newTranscript = e.target.value;
    setTranscript(newTranscript);

    // If transcript is cleared, reset auto-populate state
    if (!newTranscript || newTranscript.length < minTranscriptLength) {
      userEditedFieldsRef.current.clear();
      resetAnalysis();
    }
  }

  /**
   * Handle form submission
   */
  async function handleSubmit(event) {
    event.preventDefault();

    // Validation
    if (!transcript.trim()) {
      setError('Please provide a transcript');
      return;
    }

    if (transcript.length < 500) {
      setError('Transcript seems too short. Please provide the full episode transcript.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Create episode
      const response = await api.episodes.create({
        transcript: transcript.trim(),
        episode_context: {
          ...episodeContext,
          episode_number: episodeContext.episode_number
            ? parseInt(episodeContext.episode_number, 10)
            : undefined,
        },
      });

      const episode = response.episode;

      // Start processing
      await api.episodes.process(episode.id);

      // Navigate to processing screen
      navigate(`/episodes/${episode.id}/processing`);
    } catch (err) {
      setError(err.message || 'Failed to create episode');
      setLoading(false);
    }
  }

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  // Disable submit while analyzing (user should wait for auto-populate)
  const isSubmitDisabled = loading || analyzing;

  // Show analysis status
  const showAnalyzingStatus = analyzing && transcript.length >= minTranscriptLength;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>New Episode</h1>
        <p className={styles.subtitle}>
          Upload your podcast transcript to generate content
        </p>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* Error message */}
        {error && (
          <div className={styles.errorMessage}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Transcript section */}
        <Card
          title="Transcript"
          subtitle="Paste your transcript or upload a text file"
          headerAction={<FileText className={styles.sectionIcon} />}
        >
          <div className={styles.transcriptSection}>
            {/* File upload */}
            <div className={styles.uploadArea}>
              <input
                type="file"
                accept=".txt,.md,.doc,.docx"
                onChange={handleFileUpload}
                className={styles.fileInput}
                id="transcript-file"
              />
              <label htmlFor="transcript-file" className={styles.uploadLabel}>
                <Upload className={styles.uploadIcon} />
                <span className={styles.uploadText}>
                  Drop file here or click to upload
                </span>
                <span className={styles.uploadHint}>
                  Supports .txt, .md, .doc, .docx
                </span>
              </label>
            </div>

            {/* Or divider */}
            <div className={styles.divider}>
              <span>or paste directly</span>
            </div>

            {/* Transcript textarea */}
            <Input
              multiline
              rows={12}
              placeholder="Paste your full podcast transcript here..."
              value={transcript}
              onChange={handleTranscriptChange}
            />

            {/* Word count and analysis status */}
            <div className={styles.transcriptFooter}>
              {transcript && (
                <p className={styles.wordCount}>
                  {transcript.split(/\s+/).filter(Boolean).length.toLocaleString()} words
                </p>
              )}
              {showAnalyzingStatus && (
                <div className={styles.analyzingStatus}>
                  <Loader2 className={styles.analyzingSpinner} size={14} />
                  <span>Analyzing transcript...</span>
                </div>
              )}
              {metadata && !analyzing && (
                <div className={styles.analysisComplete}>
                  <Check size={14} />
                  <span>Fields auto-populated</span>
                  {usage && (
                    <span className={styles.analysisCost}>
                      (${usage.cost.toFixed(4)}, {(usage.durationMs / 1000).toFixed(1)}s)
                    </span>
                  )}
                </div>
              )}
              {analyzeError && (
                <div className={styles.analyzeError}>
                  <AlertCircle size={14} />
                  <span>Auto-populate unavailable</span>
                </div>
              )}
            </div>

            {/* Show detected title prominently after analysis */}
            {metadata?.suggested_title && !analyzing && (
              <div className={styles.suggestedTitle}>
                <Wand2 size={16} />
                <span className={styles.suggestedTitleLabel}>Suggested Title:</span>
                <span className={styles.suggestedTitleText}>{metadata.suggested_title}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Episode context section */}
        <Card
          title="Episode Details"
          subtitle={
            analyzing
              ? 'Analyzing transcript to auto-populate fields...'
              : metadata
                ? 'Fields auto-populated from transcript'
                : 'Optional context to personalize the generated content'
          }
          headerAction={
            analyzing ? (
              <Loader2 className={`${styles.sectionIcon} ${styles.spinning}`} />
            ) : metadata ? (
              <Wand2 className={styles.sectionIcon} />
            ) : null
          }
        >
          <div className={styles.contextGrid}>
            <Input
              label="Episode Title"
              placeholder="The Art of Active Listening"
              value={episodeContext.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              containerClassName={autoPopulatedFields.has('title') ? styles.autoPopulated : ''}
            />

            <Input
              label="Episode Number"
              type="number"
              placeholder="42"
              value={episodeContext.episode_number}
              onChange={(e) => handleFieldChange('episode_number', e.target.value)}
            />

            <Input
              label="Guest Name"
              placeholder="Dr. Jane Smith"
              value={episodeContext.guest_name}
              onChange={(e) => handleFieldChange('guest_name', e.target.value)}
              containerClassName={autoPopulatedFields.has('guest_name') ? styles.autoPopulated : ''}
            />

            <Input
              label="Guest Credentials"
              placeholder="PhD, Clinical Psychologist"
              value={episodeContext.guest_credentials}
              onChange={(e) => handleFieldChange('guest_credentials', e.target.value)}
              containerClassName={autoPopulatedFields.has('guest_credentials') ? styles.autoPopulated : ''}
            />

            <Input
              label="Recording Date"
              type="date"
              value={episodeContext.recording_date}
              onChange={(e) => handleFieldChange('recording_date', e.target.value)}
            />

            <Input
              label="Notes"
              placeholder="Any additional context for content generation..."
              multiline
              rows={2}
              value={episodeContext.notes}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              containerClassName={`${styles.fullWidth} ${autoPopulatedFields.has('notes') ? styles.autoPopulated : ''}`}
            />
          </div>
        </Card>

        {/* Submit button */}
        <div className={styles.actions}>
          <Button
            type="submit"
            size="lg"
            loading={loading}
            disabled={isSubmitDisabled}
            leftIcon={analyzing ? Loader2 : Sparkles}
          >
            {analyzing ? 'Analyzing...' : 'Generate Content'}
          </Button>

          <p className={styles.actionsHint}>
            {analyzing
              ? 'Please wait while we analyze your transcript'
              : 'This will process your transcript through our AI pipeline'}
          </p>
        </div>
      </form>
    </div>
  );
}

export default NewEpisode;
