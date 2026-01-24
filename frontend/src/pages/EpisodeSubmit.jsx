/**
 * ============================================================================
 * EPISODE SUBMIT PAGE
 * ============================================================================
 * Form for setting up episode context before processing.
 * Used when an episode has been transcribed from RSS but not yet processed.
 *
 * Features:
 * - Edit episode metadata (title, guest info, notes)
 * - Add promotion/CTA information
 * - Submit to start processing
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  Sparkles,
  User,
  FileText,
  Gift,
  Megaphone,
} from 'lucide-react';
import { Button, Card, Input, useToast } from '@components/shared';
import { useProcessing } from '@contexts/ProcessingContext';
import { useTranscription } from '@contexts/TranscriptionContext';
import api from '@utils/api-client';
import styles from './EpisodeSubmit.module.css';

/**
 * EpisodeSubmit page component
 */
function EpisodeSubmit() {
  const { id: episodeId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { trackProcessing, estimatedDuration } = useProcessing();
  const { clearDraft } = useTranscription();

  // Loading states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Episode data
  const [episode, setEpisode] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    guest_name: '',
    guest_credentials: '',
    notes: '',
    has_promotion: false,
    promotion_details: '',
  });

  // Load episode data
  useEffect(() => {
    async function loadEpisode() {
      try {
        setLoading(true);
        setError(null);
        const data = await api.episodes.get(episodeId);
        setEpisode(data.episode);

        // Pre-fill form with existing episode context
        const context = data.episode.episode_context || {};
        setFormData({
          title: context.title || data.episode.title || '',
          guest_name: context.guest_name || '',
          guest_credentials: context.guest_credentials || '',
          notes: context.notes || '',
          has_promotion: context.has_promotion || false,
          promotion_details: context.promotion_details || '',
        });
      } catch (err) {
        setError(err.message || 'Failed to load episode');
      } finally {
        setLoading(false);
      }
    }

    if (episodeId) {
      loadEpisode();
    }
  }, [episodeId]);

  // Handle form field changes
  function handleFieldChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  // Handle promotion toggle
  function handlePromotionToggle() {
    setFormData((prev) => ({
      ...prev,
      has_promotion: !prev.has_promotion,
      // Clear promotion details when turning off
      promotion_details: !prev.has_promotion ? prev.promotion_details : '',
    }));
  }

  // Handle form submission
  async function handleSubmit(event) {
    event.preventDefault();

    if (!formData.title.trim()) {
      setError('Please provide an episode title');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Build updated episode context
      const updatedContext = {
        ...episode.episode_context,
        title: formData.title.trim(),
        guest_name: formData.guest_name.trim() || undefined,
        guest_credentials: formData.guest_credentials.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        has_promotion: formData.has_promotion,
        promotion_details: formData.has_promotion ? formData.promotion_details.trim() : undefined,
      };

      // Update episode with new context
      await api.episodes.update(episodeId, {
        title: formData.title.trim(),
        episode_context: updatedContext,
      });

      // Start processing
      await api.episodes.process(episodeId);

      // Clear the transcription draft since we're now processing
      clearDraft();

      // Track processing globally
      trackProcessing(episodeId, formData.title);

      // Show success toast
      showToast({
        message: 'Processing started',
        description: `"${formData.title}" is being processed. This takes about ${Math.round(estimatedDuration / 60)} minutes.`,
        variant: 'processing',
        duration: 8000,
        action: () => navigate(`/episodes/${episodeId}/processing`),
        actionLabel: 'View progress',
      });

      // Navigate to dashboard
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to start processing');
      setSubmitting(false);
    }
  }

  // Handle back navigation
  function handleBack() {
    navigate('/');
  }

  // Loading state
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <Loader2 className={styles.spinner} size={32} />
          <p>Loading episode...</p>
        </div>
      </div>
    );
  }

  // Error state (episode not found)
  if (error && !episode) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <AlertCircle size={48} />
          <h2>Episode not found</h2>
          <p>{error}</p>
          <Button onClick={handleBack}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backButton} onClick={handleBack}>
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Set Up Episode</h1>
          <p className={styles.subtitle}>
            Add details before generating content
          </p>
        </div>
      </header>

      {/* Episode info banner */}
      <div className={styles.episodeBanner}>
        <div className={styles.episodeBannerIcon}>
          <FileText size={20} />
        </div>
        <div className={styles.episodeBannerInfo}>
          <h3>Transcript Ready</h3>
          <p>
            {episode?.transcript
              ? `${episode.transcript.split(/\s+/).filter(Boolean).length.toLocaleString()} words`
              : 'Transcript loaded'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* Error message */}
        {error && (
          <div className={styles.errorMessage}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Episode Details */}
        <Card
          title="Episode Details"
          subtitle="Basic information about this episode"
          headerAction={<User className={styles.sectionIcon} />}
        >
          <div className={styles.formGrid}>
            <Input
              label="Episode Title"
              placeholder="Enter episode title"
              value={formData.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              required
              containerClassName={styles.fullWidth}
            />

            <Input
              label="Guest Name"
              placeholder="Dr. Jane Smith"
              value={formData.guest_name}
              onChange={(e) => handleFieldChange('guest_name', e.target.value)}
            />

            <Input
              label="Guest Credentials"
              placeholder="PhD, Clinical Psychologist"
              value={formData.guest_credentials}
              onChange={(e) => handleFieldChange('guest_credentials', e.target.value)}
            />

            <Input
              label="Notes"
              placeholder="Any additional context for content generation..."
              multiline
              rows={3}
              value={formData.notes}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              containerClassName={styles.fullWidth}
            />
          </div>
        </Card>

        {/* Promotion Section */}
        <Card
          title="Promotion & CTA"
          subtitle="Include a call-to-action in generated content"
          headerAction={<Megaphone className={styles.sectionIcon} />}
        >
          <div className={styles.promotionSection}>
            <button
              type="button"
              className={`${styles.promotionToggle} ${formData.has_promotion ? styles.active : ''}`}
              onClick={handlePromotionToggle}
            >
              <div className={styles.promotionToggleIcon}>
                <Gift size={20} />
              </div>
              <div className={styles.promotionToggleContent}>
                <span className={styles.promotionToggleLabel}>
                  Include a promotion or CTA
                </span>
                <span className={styles.promotionToggleHint}>
                  Add a lead magnet, offer, or booking link to promote
                </span>
              </div>
              <div className={`${styles.toggleSwitch} ${formData.has_promotion ? styles.on : ''}`}>
                <div className={styles.toggleKnob} />
              </div>
            </button>

            {formData.has_promotion && (
              <div className={styles.promotionDetails}>
                <Input
                  label="What would you like to promote?"
                  placeholder="e.g., Free guide download at example.com/guide, Book a call at calendly.com/yourname, Use code PODCAST for 20% off..."
                  multiline
                  rows={3}
                  value={formData.promotion_details}
                  onChange={(e) => handleFieldChange('promotion_details', e.target.value)}
                  containerClassName={styles.fullWidth}
                />
                <p className={styles.promotionHint}>
                  This will be naturally incorporated into your blog post and social content.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Submit Section */}
        <div className={styles.submitSection}>
          <div className={styles.submitInfo}>
            <Sparkles size={20} />
            <p>
              We'll generate a blog post, social media content, and email newsletter from your episode.
            </p>
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={submitting || !formData.title.trim()}
            leftIcon={submitting ? Loader2 : Sparkles}
          >
            {submitting ? 'Starting...' : 'Generate Content'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default EpisodeSubmit;
