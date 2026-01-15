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
 * - Editable generated title with regeneration capability
 * - Cost and time estimates
 * - Validation before submission
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  FileText,
  Sparkles,
  AlertCircle,
  Loader2,
  Wand2,
  Check,
  RefreshCw,
  Edit3,
} from 'lucide-react';
import { Button, Card, Input } from '@components/shared';
import api from '@utils/api-client';
import { useTranscriptAutoPopulate } from '@hooks/useTranscriptAutoPopulate';
import styles from './NewEpisode.module.css';

// ============================================================================
// CONSTANTS
// ============================================================================

// Spam protection for title regeneration
const REGENERATE_COOLDOWN_SECONDS = 15;
const MAX_REGENERATIONS = 5;

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

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const titleInputRef = useRef(null);

  // Regeneration spam protection
  const [regenerationCount, setRegenerationCount] = useState(0);
  const [regenerateCooldown, setRegenerateCooldown] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);

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
   */
  useEffect(() => {
    if (!metadata) return;

    const newAutoPopulated = new Set();

    setEpisodeContext((prev) => {
      const updates = { ...prev };

      // Auto-populate title if not manually edited by user
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
  // COOLDOWN TIMER
  // ============================================================================

  useEffect(() => {
    if (regenerateCooldown <= 0) return;

    const timer = setInterval(() => {
      setRegenerateCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [regenerateCooldown]);

  // ============================================================================
  // TITLE EDITING HANDLERS
  // ============================================================================

  function handleStartEditTitle() {
    setEditingTitleValue(episodeContext.title);
    setIsEditingTitle(true);
    // Focus input after render
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }

  function handleSaveTitle() {
    if (editingTitleValue.trim()) {
      userEditedFieldsRef.current.add('title');
      setEpisodeContext((prev) => ({ ...prev, title: editingTitleValue.trim() }));
    }
    setIsEditingTitle(false);
  }

  function handleCancelEditTitle() {
    setIsEditingTitle(false);
    setEditingTitleValue('');
  }

  function handleTitleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelEditTitle();
    }
  }

  // ============================================================================
  // REGENERATE TITLE HANDLER
  // ============================================================================

  async function handleRegenerateTitle() {
    // Check spam protection
    if (regenerateCooldown > 0) return;
    if (regenerationCount >= MAX_REGENERATIONS) {
      setError(`Maximum ${MAX_REGENERATIONS} title regenerations reached. Please edit manually.`);
      return;
    }

    try {
      setIsRegenerating(true);

      // Call API to regenerate title
      const response = await api.post('/episodes/analyze-transcript', {
        transcript,
      });

      if (response.metadata?.suggested_title) {
        setEpisodeContext((prev) => ({
          ...prev,
          title: response.metadata.suggested_title,
        }));
        // Mark as not user-edited so future analysis can update it
        userEditedFieldsRef.current.delete('title');
      }

      // Update spam protection counters
      setRegenerationCount((prev) => prev + 1);
      setRegenerateCooldown(REGENERATE_COOLDOWN_SECONDS);
    } catch (err) {
      setError('Failed to regenerate title. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  }

  // ============================================================================
  // FIELD HANDLERS
  // ============================================================================

  function handleFieldChange(fieldName, value) {
    userEditedFieldsRef.current.add(fieldName);
    setEpisodeContext((prev) => ({ ...prev, [fieldName]: value }));
    setAutoPopulatedFields((prev) => {
      const next = new Set(prev);
      next.delete(fieldName);
      return next;
    });
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setTranscript(text);

      // Reset user edits and regeneration counter when new transcript is uploaded
      userEditedFieldsRef.current.clear();
      resetAnalysis();
      setRegenerationCount(0);
      setRegenerateCooldown(0);
    } catch {
      setError('Failed to read file. Please try again or paste the transcript directly.');
    }
  }

  function handleTranscriptChange(e) {
    const newTranscript = e.target.value;
    setTranscript(newTranscript);

    // If transcript is cleared, reset auto-populate state
    if (!newTranscript || newTranscript.length < minTranscriptLength) {
      userEditedFieldsRef.current.clear();
      resetAnalysis();
      setRegenerationCount(0);
      setRegenerateCooldown(0);
    }
  }

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

    if (!episodeContext.title.trim()) {
      setError('Please provide an episode title');
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

  const isSubmitDisabled = loading || analyzing || !episodeContext.title.trim();
  const showAnalyzingStatus = analyzing && transcript.length >= minTranscriptLength;
  const canRegenerate =
    !isRegenerating &&
    !analyzing &&
    regenerateCooldown === 0 &&
    regenerationCount < MAX_REGENERATIONS &&
    transcript.length >= minTranscriptLength;
  const hasTitle = episodeContext.title.trim().length > 0;

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
                  <span>Analysis complete</span>
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
          </div>
        </Card>

        {/* Generated Title Section - Only shows after analysis or when title exists */}
        {(hasTitle || metadata) && (
          <Card
            title="Episode Title"
            subtitle="AI-generated title based on your transcript"
            headerAction={<Wand2 className={styles.sectionIcon} />}
            className={styles.titleCard}
          >
            <div className={styles.generatedTitleSection}>
              {isEditingTitle ? (
                /* Editing mode */
                <div className={styles.titleEditMode}>
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={editingTitleValue}
                    onChange={(e) => setEditingTitleValue(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    className={styles.titleEditInput}
                    placeholder="Enter episode title..."
                  />
                  <div className={styles.titleEditActions}>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleSaveTitle}
                      disabled={!editingTitleValue.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelEditTitle}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div className={styles.titleDisplayMode}>
                  <div className={styles.generatedTitleText}>
                    {episodeContext.title || 'No title generated yet'}
                  </div>
                  <div className={styles.titleActions}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon={Edit3}
                      onClick={handleStartEditTitle}
                      disabled={!hasTitle}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon={isRegenerating ? Loader2 : RefreshCw}
                      onClick={handleRegenerateTitle}
                      disabled={!canRegenerate}
                      title={
                        regenerationCount >= MAX_REGENERATIONS
                          ? 'Maximum regenerations reached'
                          : regenerateCooldown > 0
                            ? `Wait ${regenerateCooldown}s`
                            : 'Generate a new title'
                      }
                    >
                      {isRegenerating
                        ? 'Generating...'
                        : regenerateCooldown > 0
                          ? `Wait ${regenerateCooldown}s`
                          : 'Regenerate'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Regeneration limit info */}
              {regenerationCount > 0 && (
                <p className={styles.regenerationInfo}>
                  {regenerationCount} of {MAX_REGENERATIONS} regenerations used
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Episode Details section (without title) */}
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
              label="Episode Number"
              type="number"
              placeholder="42"
              value={episodeContext.episode_number}
              onChange={(e) => handleFieldChange('episode_number', e.target.value)}
            />

            <Input
              label="Recording Date"
              type="date"
              value={episodeContext.recording_date}
              onChange={(e) => handleFieldChange('recording_date', e.target.value)}
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
              : !hasTitle
                ? 'A title is required to continue'
                : 'This will process your transcript through our AI pipeline'}
          </p>
        </div>
      </form>
    </div>
  );
}

export default NewEpisode;
