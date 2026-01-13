/**
 * ============================================================================
 * NEW EPISODE PAGE
 * ============================================================================
 * Upload a podcast transcript and configure episode context.
 * Starts the 10-stage AI processing pipeline (Stage 0-9).
 * ============================================================================
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Sparkles, AlertCircle } from 'lucide-react';
import { Button, Card, Input } from '@components/shared';
import api from '@utils/api-client';
import styles from './NewEpisode.module.css';

/**
 * NewEpisode page component
 */
function NewEpisode() {
  const navigate = useNavigate();

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form data
  const [transcript, setTranscript] = useState('');
  const [episodeContext, setEpisodeContext] = useState({
    title: '',
    episode_number: '',
    guest_name: '',
    guest_credentials: '',
    recording_date: '',
    notes: '',
  });

  // Handle file upload
  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setTranscript(text);

      // Try to extract title from filename
      const filename = file.name.replace(/\.[^/.]+$/, '');
      if (!episodeContext.title) {
        setEpisodeContext((prev) => ({ ...prev, title: filename }));
      }
    } catch {
      setError('Failed to read file. Please try again or paste the transcript directly.');
    }
  }

  // Handle form submission
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
              onChange={(e) => setTranscript(e.target.value)}
            />

            {/* Word count */}
            {transcript && (
              <p className={styles.wordCount}>
                {transcript.split(/\s+/).filter(Boolean).length.toLocaleString()} words
              </p>
            )}
          </div>
        </Card>

        {/* Episode context section */}
        <Card
          title="Episode Details"
          subtitle="Optional context to personalize the generated content"
        >
          <div className={styles.contextGrid}>
            <Input
              label="Episode Title"
              placeholder="The Art of Active Listening"
              value={episodeContext.title}
              onChange={(e) =>
                setEpisodeContext({ ...episodeContext, title: e.target.value })
              }
            />

            <Input
              label="Episode Number"
              type="number"
              placeholder="42"
              value={episodeContext.episode_number}
              onChange={(e) =>
                setEpisodeContext({ ...episodeContext, episode_number: e.target.value })
              }
            />

            <Input
              label="Guest Name"
              placeholder="Dr. Jane Smith"
              value={episodeContext.guest_name}
              onChange={(e) =>
                setEpisodeContext({ ...episodeContext, guest_name: e.target.value })
              }
            />

            <Input
              label="Guest Credentials"
              placeholder="PhD, Clinical Psychologist"
              value={episodeContext.guest_credentials}
              onChange={(e) =>
                setEpisodeContext({ ...episodeContext, guest_credentials: e.target.value })
              }
            />

            <Input
              label="Recording Date"
              type="date"
              value={episodeContext.recording_date}
              onChange={(e) =>
                setEpisodeContext({ ...episodeContext, recording_date: e.target.value })
              }
            />

            <Input
              label="Notes"
              placeholder="Any additional context for content generation..."
              multiline
              rows={2}
              value={episodeContext.notes}
              onChange={(e) =>
                setEpisodeContext({ ...episodeContext, notes: e.target.value })
              }
              containerClassName={styles.fullWidth}
            />
          </div>
        </Card>

        {/* Submit button */}
        <div className={styles.actions}>
          <Button
            type="submit"
            size="lg"
            loading={loading}
            leftIcon={Sparkles}
          >
            Generate Content
          </Button>

          <p className={styles.actionsHint}>
            This will process your transcript through our AI pipeline
          </p>
        </div>
      </form>
    </div>
  );
}

export default NewEpisode;
