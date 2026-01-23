/**
 * ============================================================================
 * SETTINGS PAGE
 * ============================================================================
 * Configure your brand identity, content preferences, and podcast settings.
 *
 * Tabs:
 * - Brand Identity: Your profile + Brand Discovery (vibe, values, etc.)
 * - Content: Pillars, topics, and content organization
 * - Podcast & Profile: RSS feeds, voice guidelines, basic info
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, User, Mic, BookOpen, Tag, Layers, Sparkles, Rss, Plus, HelpCircle } from 'lucide-react';
import clsx from 'clsx';
import { Button, Card, Input, Spinner, TagManager, useToast } from '@components/shared';
import { BrandDiscoveryStudio, BrandMagicExplainer } from '@components/brand-discovery';
import { ProfileEditor } from '@components/profile-enrichment';
import { ConnectPodcastModal, ConnectedFeedCard, FeedEpisodesList } from '@components/podcast';
import api from '@utils/api-client';
import styles from './Settings.module.css';

// Tab configuration with descriptions
const TABS = [
  {
    id: 'brand',
    label: 'Brand Identity',
    icon: Sparkles,
    description: 'Define who you are and how you want to sound'
  },
  {
    id: 'content',
    label: 'Content',
    icon: Layers,
    description: 'Organize your topics and content pillars'
  },
  {
    id: 'profile',
    label: 'Podcast & Settings',
    icon: Rss,
    description: 'Connect podcasts and configure voice'
  },
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

  // Podcast feeds state
  const [podcastFeeds, setPodcastFeeds] = useState([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState(null); // For viewing episodes

  // Brand discovery state (for profile editor)
  const [brandDiscovery, setBrandDiscovery] = useState(null);
  const [referenceData, setReferenceData] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);

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

      // Load evergreen settings, topics, pillars, podcast feeds, and brand discovery in parallel
      const [evergreenData, topicsData, pillarsData, feedsData, discoveryData, refData] = await Promise.all([
        api.evergreen.get(),
        api.topics.list().catch(() => ({ topics: [] })),
        api.pillars.list().catch(() => ({ pillars: [] })),
        api.podcasts.listFeeds().catch(() => ({ feeds: [] })),
        api.brandDiscovery.get().catch(() => ({ brandDiscovery: null })),
        api.brandDiscovery.getReferenceData().catch(() => ({})),
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

      // Set podcast feeds
      setPodcastFeeds(feedsData.feeds || []);

      // Set brand discovery data (for profile editor)
      setBrandDiscovery(discoveryData.brandDiscovery);
      setReferenceData(refData);

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

  /**
   * Save profile module data
   */
  const handleProfileSave = useCallback(async (data, status) => {
    try {
      setProfileSaving(true);
      const response = await api.brandDiscovery.updateModule('profile', data, status);
      setBrandDiscovery(response.brandDiscovery);
      showToast({ message: 'Profile saved successfully', variant: 'success' });
    } catch (err) {
      console.error('[Settings] Failed to save profile:', err);
      showToast({ message: `Failed to save profile: ${err.message}`, variant: 'error' });
    } finally {
      setProfileSaving(false);
    }
  }, [showToast]);

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

  // ============================================================================
  // PODCAST FEED HANDLERS
  // ============================================================================

  function handleFeedConnect(feed) {
    setPodcastFeeds((prev) => [feed, ...prev]);
  }

  function handleFeedSync(result) {
    // Refresh feeds list to get updated data
    loadAllSettings();
  }

  function handleFeedDisconnect(feedId) {
    setPodcastFeeds((prev) => prev.filter((f) => f.id !== feedId));
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
            {/* How Brand Magic Works - Expandable explainer */}
            <BrandMagicExplainer variant="compact" />

            {/* Profile Section */}
            <Card
              title="Your Profile"
              subtitle="Tell us about yourself and your practice. This information helps us create content that sounds like you."
              headerAction={
                <button
                  type="button"
                  className={styles.helpButton}
                  title="Your profile is the foundation of your brand identity. The more specific you are, the better your content will be."
                >
                  <HelpCircle className={styles.helpIcon} />
                </button>
              }
              className={styles.profileCard}
            >
              <ProfileEditor
                data={brandDiscovery?.modules?.profile?.data || {}}
                referenceData={referenceData}
                onSave={handleProfileSave}
                saving={profileSaving}
              />
            </Card>

            {/* Brand Discovery Studio */}
            <Card
              title="Advanced Brand Settings"
              subtitle="Fine-tune your voice with vibe sliders, values, audience targeting, and more."
              collapsible
              defaultCollapsed
            >
              <BrandDiscoveryStudio
                defaultExpanded={false}
                onBrandDnaChange={(brandDna) => {
                  console.log('[Settings] Brand DNA updated:', brandDna);
                }}
              />
            </Card>
          </div>
        )}

        {/* Content Tab */}
        {activeTab === 'content' && (
          <div className={styles.tabPanel}>
            {/* Introduction */}
            <div className={styles.tabIntro}>
              <Layers className={styles.tabIntroIcon} />
              <div>
                <h3>Organize Your Content</h3>
                <p>
                  Content pillars are broad themes that define your brand. Topics are specific tags
                  that help categorize individual pieces of content. Together, they help us generate
                  organized, on-brand content.
                </p>
              </div>
            </div>

            <div className={styles.sectionGrid}>
              {/* Content Pillars */}
              <Card
                title="Content Pillars"
                subtitle="The 3-5 major themes that your content revolves around"
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
                    Think big-picture themes that define your expertise. Examples: "Anxiety & Stress",
                    "Relationship Health", "Personal Growth", "Trauma Recovery"
                  </p>
                </div>
              </Card>

              {/* Topics */}
              <Card
                title="Topics"
                subtitle="Specific tags for filtering and organizing content"
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
                    More granular than pillars. Examples: "Work-Life Balance", "CBT Techniques",
                    "Couples Communication", "Mindfulness Exercises"
                  </p>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Podcast & Settings Tab */}
        {activeTab === 'profile' && (
          <div className={styles.tabPanel}>
            {/* Show episodes list if a feed is selected */}
            {selectedFeed ? (
              <FeedEpisodesList
                feed={selectedFeed}
                onBack={() => setSelectedFeed(null)}
                onEpisodeProcessed={() => loadAllSettings()}
              />
            ) : (
              <div className={styles.sections}>
                {/* Tab Introduction */}
                <div className={styles.tabIntro}>
                  <Rss className={styles.tabIntroIcon} />
                  <div>
                    <h3>Podcast & Voice Settings</h3>
                    <p>
                      Connect your podcast feed to easily import episodes, and configure
                      voice guidelines to fine-tune how your content sounds.
                    </p>
                  </div>
                </div>

                {/* Connected Podcast Feeds */}
                <Card
                  title="Connected Podcast Feeds"
                  subtitle="Import episode history and transcribe directly from your RSS feed"
                  headerAction={<Rss className={styles.sectionIcon} />}
                >
                  <div className={styles.form}>
                    {podcastFeeds.length > 0 ? (
                      <div className={styles.feedsList}>
                        {podcastFeeds.map((feed) => (
                          <ConnectedFeedCard
                            key={feed.id}
                            feed={feed}
                            onSync={handleFeedSync}
                            onDisconnect={handleFeedDisconnect}
                            onViewEpisodes={(f) => setSelectedFeed(f)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyFeeds}>
                        <Rss className={styles.emptyIcon} />
                        <p>No podcast feeds connected yet.</p>
                        <p className={styles.emptyHint}>
                          Connect your podcast's RSS feed to import episode history and easily transcribe past episodes.
                        </p>
                      </div>
                    )}
                    <Button
                      variant={podcastFeeds.length > 0 ? 'ghost' : 'primary'}
                      leftIcon={Plus}
                      onClick={() => setShowConnectModal(true)}
                      className={styles.connectButton}
                    >
                      {podcastFeeds.length > 0 ? 'Connect Another Podcast' : 'Connect Your Podcast'}
                    </Button>
                  </div>
                </Card>

                {/* Podcast Info */}
                <Card
                  title="Podcast Information"
                  subtitle="Basic details about your podcast that appear in generated content"
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
                      helperText="A short, memorable description of your show"
                      value={podcastInfo.tagline}
                      onChange={(e) =>
                        setPodcastInfo({ ...podcastInfo, tagline: e.target.value })
                      }
                    />

                    <Input
                      label="Target Audience"
                      placeholder="Therapists, counselors, and mental health professionals"
                      helperText="Who is your podcast primarily for?"
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
                  subtitle="Fine-tune the tone and style of your generated content"
                  headerAction={<BookOpen className={styles.sectionIcon} />}
                >
                  <p className={styles.cardExplainer}>
                    These guidelines work alongside your Brand Identity settings to ensure
                    all generated content matches your unique voice.
                  </p>
                  <div className={styles.form}>
                    <Input
                      label="Tone Descriptors"
                      placeholder="warm, professional, conversational, empathetic"
                      helperText="Comma-separated words that describe how you want to sound"
                      value={voiceGuidelines.tone}
                      onChange={(e) =>
                        setVoiceGuidelines({ ...voiceGuidelines, tone: e.target.value })
                      }
                    />

                    <Input
                      label="Style Notes"
                      placeholder="Use concrete examples. Avoid jargon when possible. Start paragraphs with action verbs..."
                      multiline
                      rows={3}
                      helperText="Specific writing instructions or preferences"
                      value={voiceGuidelines.style_notes}
                      onChange={(e) =>
                        setVoiceGuidelines({ ...voiceGuidelines, style_notes: e.target.value })
                      }
                    />

                    <Input
                      label="Words/Phrases to Avoid"
                      placeholder="leverage, synergy, game-changer, utilize"
                      helperText="We'll never use these words in your content"
                      value={voiceGuidelines.avoid}
                      onChange={(e) =>
                        setVoiceGuidelines({ ...voiceGuidelines, avoid: e.target.value })
                      }
                    />
                  </div>
                </Card>

                {/* Legacy Therapist Profile - collapsed by default */}
                <Card
                  title="Additional Profile Info"
                  subtitle="Extra professional details (legacy)"
                  headerAction={<User className={styles.sectionIcon} />}
                  collapsible
                  defaultCollapsed
                >
                  <p className={styles.cardExplainer}>
                    These fields are from an older version. Your main profile is now in
                    the Brand Identity tab.
                  </p>
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connect Podcast Modal */}
      <ConnectPodcastModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onConnect={handleFeedConnect}
      />
    </div>
  );
}

export default Settings;
