/**
 * ============================================================================
 * SETTINGS PAGE
 * ============================================================================
 * Configure evergreen content: therapist profile, podcast info, voice guidelines,
 * topics, and content pillars.
 * Also includes Brand Discovery for defining brand identity and voice.
 * This content is used across all episode processing.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { Save, RefreshCw, User, Mic, BookOpen, Tag, Layers, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { Button, Card, Input, Spinner, TagManager, useToast } from '@components/shared';
import { BrandDiscoveryStudio } from '@components/brand-discovery';
import api from '@utils/api-client';
import styles from './Settings.module.css';

// Tab configuration
const TABS = [
  { id: 'brand', label: 'Brand Identity', icon: Sparkles },
  { id: 'content', label: 'Content', icon: Layers },
  { id: 'profile', label: 'Profile', icon: User },
];

/**
 * Settings page component
 */
function Settings() {
  const { showToast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState('brand');

  // Form data for evergreen content
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
  });

  const [voiceGuidelines, setVoiceGuidelines] = useState({
    tone: '',
    style_notes: '',
    avoid: '',
  });

  // Topics and Pillars state
  const [topics, setTopics] = useState([]);
  const [pillars, setPillars] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [pillarsLoading, setPillarsLoading] = useState(false);

  // Load all settings on mount
  useEffect(() => {
    loadAllSettings();
  }, []);

  /**
   * Load all settings: evergreen, topics, and pillars
   */
  async function loadAllSettings() {
    try {
      setLoading(true);
      setError(null);

      // Load evergreen settings, topics, and pillars in parallel
      const [evergreenData, topicsData, pillarsData] = await Promise.all([
        api.evergreen.get(),
        api.topics.list().catch(() => ({ topics: [] })),
        api.pillars.list().catch(() => ({ pillars: [] })),
      ]);

      // Populate evergreen form fields
      const evergreen = evergreenData.evergreen || {};

      if (evergreen.therapist_profile) {
        setTherapistProfile({
          name: evergreen.therapist_profile.name || '',
          credentials: evergreen.therapist_profile.credentials || '',
          bio: evergreen.therapist_profile.bio || '',
          website: evergreen.therapist_profile.website || '',
        });
      }

      if (evergreen.podcast_info) {
        setPodcastInfo({
          name: evergreen.podcast_info.name || '',
          tagline: evergreen.podcast_info.tagline || '',
          target_audience: evergreen.podcast_info.target_audience || '',
        });
      }

      if (evergreen.voice_guidelines) {
        setVoiceGuidelines({
          tone: (evergreen.voice_guidelines.tone || []).join(', '),
          style_notes: evergreen.voice_guidelines.style_notes || '',
          avoid: (evergreen.voice_guidelines.avoid || []).join(', '),
        });
      }

      // Set topics and pillars
      setTopics(topicsData.topics || []);
      setPillars(pillarsData.pillars || []);

      console.log('[Settings] All settings loaded successfully');
    } catch (err) {
      console.error('[Settings] Failed to load settings:', err);
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Save evergreen content
   */
  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const updates = {
        therapist_profile: {
          ...therapistProfile,
        },
        podcast_info: {
          ...podcastInfo,
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

      await api.evergreen.update(updates);
      setSuccess(true);
      showToast({ message: 'Settings saved successfully', variant: 'success' });

      // Clear success message after delay
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('[Settings] Failed to save settings:', err);
      setError(err.message || 'Failed to save settings');
      showToast({ message: 'Failed to save settings', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  // ============================================================================
  // PILLAR HANDLERS
  // ============================================================================

  async function handleAddPillar(data) {
    try {
      setPillarsLoading(true);
      const result = await api.pillars.create(data);
      setPillars((prev) => [...prev, result.pillar]);
      showToast({ message: `Pillar "${data.name}" created`, variant: 'success' });
    } catch (err) {
      console.error('[Settings] Failed to add pillar:', err);
      showToast({ message: err.message || 'Failed to add pillar', variant: 'error' });
      throw err;
    } finally {
      setPillarsLoading(false);
    }
  }

  async function handleUpdatePillar(id, data) {
    try {
      const result = await api.pillars.update(id, data);
      setPillars((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...result.pillar } : p))
      );
      showToast({ message: 'Pillar updated', variant: 'success' });
    } catch (err) {
      console.error('[Settings] Failed to update pillar:', err);
      showToast({ message: err.message || 'Failed to update pillar', variant: 'error' });
      throw err;
    }
  }

  async function handleDeletePillar(id) {
    try {
      await api.pillars.delete(id);
      setPillars((prev) => prev.filter((p) => p.id !== id));
      showToast({ message: 'Pillar deleted', variant: 'success' });
    } catch (err) {
      console.error('[Settings] Failed to delete pillar:', err);
      showToast({ message: err.message || 'Failed to delete pillar', variant: 'error' });
      throw err;
    }
  }

  // ============================================================================
  // TOPIC HANDLERS
  // ============================================================================

  async function handleAddTopic(data) {
    try {
      setTopicsLoading(true);
      const result = await api.topics.create(data);
      setTopics((prev) => [...prev, result.topic]);
      showToast({ message: `Topic "${data.name}" created`, variant: 'success' });
    } catch (err) {
      console.error('[Settings] Failed to add topic:', err);
      showToast({ message: err.message || 'Failed to add topic', variant: 'error' });
      throw err;
    } finally {
      setTopicsLoading(false);
    }
  }

  async function handleUpdateTopic(id, data) {
    try {
      const result = await api.topics.update(id, data);
      setTopics((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...result.topic } : t))
      );
      showToast({ message: 'Topic updated', variant: 'success' });
    } catch (err) {
      console.error('[Settings] Failed to update topic:', err);
      showToast({ message: err.message || 'Failed to update topic', variant: 'error' });
      throw err;
    }
  }

  async function handleDeleteTopic(id) {
    try {
      await api.topics.delete(id);
      setTopics((prev) => prev.filter((t) => t.id !== id));
      showToast({ message: 'Topic deleted', variant: 'success' });
    } catch (err) {
      console.error('[Settings] Failed to delete topic:', err);
      showToast({ message: err.message || 'Failed to delete topic', variant: 'error' });
      throw err;
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
            Define your brand identity and configure content generation preferences
          </p>
        </div>

        <div className={styles.headerActions}>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={RefreshCw}
            onClick={loadAllSettings}
            disabled={saving}
          >
            Reload
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

      {/* Tab Navigation */}
      <nav className={styles.tabNav} role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={clsx(styles.tab, activeTab === tab.id && styles.activeTab)}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon className={styles.tabIcon} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {/* Brand Identity Tab */}
        {activeTab === 'brand' && (
          <div className={styles.tabPanel}>
            <BrandDiscoveryStudio
              defaultExpanded={true}
              onBrandDnaChange={(brandDna) => {
                console.log('[Settings] Brand DNA updated:', brandDna);
              }}
            />
          </div>
        )}

        {/* Content Tab */}
        {activeTab === 'content' && (
          <div className={styles.tabPanel}>
            <div className={styles.sectionGrid}>
              {/* Content Pillars */}
              <Card
                title="Content Pillars"
                subtitle="High-level brand themes that organize your content strategy"
                headerAction={<Layers className={styles.sectionIcon} />}
              >
                <div className={styles.form}>
                  <TagManager
                    items={pillars}
                    onAdd={handleAddPillar}
                    onUpdate={handleUpdatePillar}
                    onDelete={handleDeletePillar}
                    placeholder="Add new pillar"
                    showColors={true}
                    showCount={true}
                    emptyMessage="No content pillars yet. Add your first one!"
                    loading={pillarsLoading}
                  />
                  <p className={styles.helperText}>
                    Core themes of your podcast (e.g., "Anxiety", "Relationships", "Self-Care")
                  </p>
                </div>
              </Card>

              {/* Topics */}
              <Card
                title="Topics"
                subtitle="Granular tags for categorizing and filtering content"
                headerAction={<Tag className={styles.sectionIcon} />}
              >
                <div className={styles.form}>
                  <TagManager
                    items={topics}
                    onAdd={handleAddTopic}
                    onUpdate={handleUpdateTopic}
                    onDelete={handleDeleteTopic}
                    placeholder="Add new topic"
                    showCount={true}
                    emptyMessage="No topics yet. Add your first one!"
                    loading={topicsLoading}
                  />
                  <p className={styles.helperText}>
                    Specific tags for filtering content (e.g., "Work Anxiety", "CBT Techniques")
                  </p>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className={styles.tabPanel}>
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
        )}
      </div>
    </div>
  );
}

export default Settings;
