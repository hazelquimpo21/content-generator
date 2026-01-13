/**
 * ============================================================================
 * SETTINGS PAGE
 * ============================================================================
 * Configure evergreen content: therapist profile, podcast info, voice guidelines.
 * This content is used across all episode processing.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { Save, RefreshCw, User, Mic, BookOpen } from 'lucide-react';
import { Button, Card, Input, Spinner } from '@components/shared';
import api from '@utils/api-client';
import styles from './Settings.module.css';

/**
 * Settings page component
 */
function Settings() {
  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form data
  const [therapistProfile, setTherapistProfile] = useState({
    name: '',
    credentials: '',
    bio: '',
    website: '',
  });

  const [podcastInfo, setPodcastInfo] = useState({
    name: '',
    tagline: '',
    target_audience: '',
    content_pillars: '',
  });

  const [voiceGuidelines, setVoiceGuidelines] = useState({
    tone: '',
    style_notes: '',
    avoid: '',
  });

  // Load current settings
  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);

      console.log('[Settings] Loading settings from API...');
      const data = await api.evergreen.get();
      console.log('[Settings] API response:', data);

      const evergreen = data.evergreen || {};
      console.log('[Settings] Evergreen data:', {
        hasTherapistProfile: !!evergreen.therapist_profile,
        hasPodcastInfo: !!evergreen.podcast_info,
        hasVoiceGuidelines: !!evergreen.voice_guidelines,
      });

      // Populate form fields
      if (evergreen.therapist_profile) {
        const profile = {
          name: evergreen.therapist_profile.name || '',
          credentials: evergreen.therapist_profile.credentials || '',
          bio: evergreen.therapist_profile.bio || '',
          website: evergreen.therapist_profile.website || '',
        };
        console.log('[Settings] Setting therapist profile:', profile);
        setTherapistProfile(profile);
      }

      if (evergreen.podcast_info) {
        const podcast = {
          name: evergreen.podcast_info.name || '',
          tagline: evergreen.podcast_info.tagline || '',
          target_audience: evergreen.podcast_info.target_audience || '',
          content_pillars: (evergreen.podcast_info.content_pillars || []).join(', '),
        };
        console.log('[Settings] Setting podcast info:', podcast);
        setPodcastInfo(podcast);
      }

      if (evergreen.voice_guidelines) {
        const voice = {
          tone: (evergreen.voice_guidelines.tone || []).join(', '),
          style_notes: evergreen.voice_guidelines.style_notes || '',
          avoid: (evergreen.voice_guidelines.avoid || []).join(', '),
        };
        console.log('[Settings] Setting voice guidelines:', voice);
        setVoiceGuidelines(voice);
      }

      console.log('[Settings] Settings loaded successfully');
    } catch (err) {
      console.error('[Settings] Failed to load settings:', err);
      console.error('[Settings] Error details:', {
        name: err.name,
        message: err.message,
        status: err.status,
        data: err.data,
      });
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      console.log('[Settings] Starting save operation...');
      console.log('[Settings] Current therapist profile state:', therapistProfile);
      console.log('[Settings] Current podcast info state:', podcastInfo);
      console.log('[Settings] Current voice guidelines state:', voiceGuidelines);

      // Build update payload
      const updates = {
        therapist_profile: {
          ...therapistProfile,
        },
        podcast_info: {
          ...podcastInfo,
          content_pillars: podcastInfo.content_pillars
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
        voice_guidelines: {
          tone: voiceGuidelines.tone
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          style_notes: voiceGuidelines.style_notes,
          avoid: voiceGuidelines.avoid
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
      };

      console.log('[Settings] Update payload being sent:', JSON.stringify(updates, null, 2));

      const response = await api.evergreen.update(updates);
      console.log('[Settings] Update response:', response);
      console.log('[Settings] Updated evergreen data:', response?.evergreen);

      setSuccess(true);
      console.log('[Settings] Save completed successfully');

      // Clear success message after delay
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('[Settings] Failed to save settings:', err);
      console.error('[Settings] Error details:', {
        name: err.name,
        message: err.message,
        status: err.status,
        data: err.data,
        stack: err.stack,
      });
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Spinner centered text="Loading settings..." />;
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.subtitle}>
            Configure your profile and podcast information
          </p>
        </div>

        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            leftIcon={RefreshCw}
            onClick={loadSettings}
            disabled={saving}
          >
            Reset
          </Button>
          <Button
            leftIcon={Save}
            onClick={handleSave}
            loading={saving}
          >
            Save Changes
          </Button>
        </div>
      </header>

      {/* Status messages */}
      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      {success && (
        <div className={styles.successMessage}>
          Settings saved successfully!
        </div>
      )}

      {/* Settings sections */}
      <div className={styles.sections}>
        {/* Therapist Profile */}
        <Card
          title="Therapist Profile"
          subtitle="Your professional information for content personalization"
          headerAction={<User className={styles.sectionIcon} />}
        >
          <div className={styles.form}>
            <Input
              label="Name"
              placeholder="Dr. Emily Carter"
              value={therapistProfile.name}
              onChange={(e) =>
                setTherapistProfile({ ...therapistProfile, name: e.target.value })
              }
            />

            <Input
              label="Credentials"
              placeholder="PhD, LMFT, Certified Gottman Therapist"
              value={therapistProfile.credentials}
              onChange={(e) =>
                setTherapistProfile({ ...therapistProfile, credentials: e.target.value })
              }
            />

            <Input
              label="Bio"
              placeholder="A brief professional bio..."
              multiline
              rows={3}
              value={therapistProfile.bio}
              onChange={(e) =>
                setTherapistProfile({ ...therapistProfile, bio: e.target.value })
              }
            />

            <Input
              label="Website"
              type="url"
              placeholder="https://yourwebsite.com"
              value={therapistProfile.website}
              onChange={(e) =>
                setTherapistProfile({ ...therapistProfile, website: e.target.value })
              }
            />
          </div>
        </Card>

        {/* Podcast Info */}
        <Card
          title="Podcast Information"
          subtitle="Details about your podcast for content generation"
          headerAction={<Mic className={styles.sectionIcon} />}
        >
          <div className={styles.form}>
            <Input
              label="Podcast Name"
              placeholder="The Mindful Therapist"
              value={podcastInfo.name}
              onChange={(e) =>
                setPodcastInfo({ ...podcastInfo, name: e.target.value })
              }
            />

            <Input
              label="Tagline"
              placeholder="Real conversations about therapy and mental health"
              value={podcastInfo.tagline}
              onChange={(e) =>
                setPodcastInfo({ ...podcastInfo, tagline: e.target.value })
              }
            />

            <Input
              label="Target Audience"
              placeholder="Therapists, counselors, and mental health professionals"
              value={podcastInfo.target_audience}
              onChange={(e) =>
                setPodcastInfo({ ...podcastInfo, target_audience: e.target.value })
              }
            />

            <Input
              label="Content Pillars"
              placeholder="Clinical Skills, Self-Care, Practice Building"
              helperText="Comma-separated list of main content themes"
              value={podcastInfo.content_pillars}
              onChange={(e) =>
                setPodcastInfo({ ...podcastInfo, content_pillars: e.target.value })
              }
            />
          </div>
        </Card>

        {/* Voice Guidelines */}
        <Card
          title="Voice & Style Guidelines"
          subtitle="Customize the tone and style of generated content"
          headerAction={<BookOpen className={styles.sectionIcon} />}
        >
          <div className={styles.form}>
            <Input
              label="Tone"
              placeholder="warm, professional, conversational, empathetic"
              helperText="Comma-separated list of tone descriptors"
              value={voiceGuidelines.tone}
              onChange={(e) =>
                setVoiceGuidelines({ ...voiceGuidelines, tone: e.target.value })
              }
            />

            <Input
              label="Style Notes"
              placeholder="Use concrete examples. Avoid jargon when possible..."
              multiline
              rows={3}
              value={voiceGuidelines.style_notes}
              onChange={(e) =>
                setVoiceGuidelines({ ...voiceGuidelines, style_notes: e.target.value })
              }
            />

            <Input
              label="Words/Phrases to Avoid"
              placeholder="leverage, synergy, game-changer"
              helperText="Comma-separated list of terms to avoid"
              value={voiceGuidelines.avoid}
              onChange={(e) =>
                setVoiceGuidelines({ ...voiceGuidelines, avoid: e.target.value })
              }
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

export default Settings;
