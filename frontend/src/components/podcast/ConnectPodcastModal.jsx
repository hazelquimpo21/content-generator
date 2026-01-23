/**
 * ============================================================================
 * CONNECT PODCAST MODAL
 * ============================================================================
 * Modal for searching and connecting podcast RSS feeds.
 * Supports:
 * - Search by podcast name (via PodcastIndex API)
 * - Direct RSS feed URL input
 * - Helpful tips for finding RSS feeds
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import {
  Search,
  Link,
  Rss,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Check,
  HelpCircle,
} from 'lucide-react';
import { Modal, Button, Input, useToast } from '@components/shared';
import api from '@utils/api-client';
import styles from './ConnectPodcastModal.module.css';

/**
 * Tips for finding RSS feeds by hosting platform
 */
const HOSTING_TIPS = [
  { name: 'Buzzsprout', path: 'Settings → Directories → RSS Feed' },
  { name: 'Spotify for Podcasters', path: 'Settings → Availability → RSS Feed' },
  { name: 'Libsyn', path: 'Destinations → Your Website → RSS Feed URL' },
  { name: 'Podbean', path: 'Settings → Basic Settings → RSS Feed URL' },
  { name: 'Transistor', path: 'Settings → RSS Feed → Copy URL' },
  { name: 'Simplecast', path: 'Settings → RSS Feed → Copy URL' },
  { name: 'Captivate', path: 'Settings → Distribution → RSS Feed' },
  { name: 'Spreaker', path: 'Your show → Settings → RSS Feed' },
];

/**
 * ConnectPodcastModal component
 */
function ConnectPodcastModal({ isOpen, onClose, onConnect }) {
  const { showToast } = useToast();

  // Tab state: 'search' or 'url'
  const [activeTab, setActiveTab] = useState('search');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchAvailable, setSearchAvailable] = useState(true);

  // URL input state
  const [feedUrl, setFeedUrl] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState(null);

  // Connection state
  const [connecting, setConnecting] = useState(null); // ID of podcast being connected

  // Help tips expanded state
  const [showTips, setShowTips] = useState(false);

  // Check API availability on mount
  useEffect(() => {
    if (isOpen) {
      checkApiStatus();
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
      setFeedUrl('');
      setLookupResult(null);
      setLookupError(null);
      setConnecting(null);
    }
  }, [isOpen]);

  /**
   * Check if PodcastIndex API is available
   */
  async function checkApiStatus() {
    try {
      const status = await api.podcasts.status();
      setSearchAvailable(status.features?.search || false);
      if (!status.features?.search) {
        // Switch to URL tab if search not available
        setActiveTab('url');
      }
    } catch {
      setSearchAvailable(false);
      setActiveTab('url');
    }
  }

  /**
   * Search for podcasts
   */
  async function handleSearch(e) {
    e?.preventDefault();

    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchError('Enter at least 2 characters to search');
      return;
    }

    try {
      setSearching(true);
      setSearchError(null);
      setSearchResults([]);

      const response = await api.podcasts.search(searchQuery.trim(), 10);
      setSearchResults(response.results || []);

      if (response.results?.length === 0) {
        setSearchError('No podcasts found. Try a different search or paste your RSS feed URL directly.');
      }
    } catch (error) {
      console.error('Podcast search failed:', error);
      setSearchError(error.message || 'Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  }

  /**
   * Look up podcast by URL
   */
  async function handleLookup(e) {
    e?.preventDefault();

    if (!feedUrl.trim()) {
      setLookupError('Please enter a feed URL');
      return;
    }

    try {
      setLookingUp(true);
      setLookupError(null);
      setLookupResult(null);

      const response = await api.podcasts.lookup(feedUrl.trim());
      setLookupResult(response.podcast);
    } catch (error) {
      console.error('Feed lookup failed:', error);
      setLookupError(error.message || 'Could not fetch feed. Please check the URL.');
    } finally {
      setLookingUp(false);
    }
  }

  /**
   * Connect a podcast feed
   */
  async function handleConnect(podcast) {
    try {
      setConnecting(podcast.feedUrl || podcast.id);

      const response = await api.podcasts.connectFeed({
        feedUrl: podcast.feedUrl,
        podcastIndexId: podcast.podcastIndexId,
      });

      showToast({
        message: 'Podcast connected!',
        description: `${podcast.title} has been added with ${response.feed?.totalEpisodes || 0} episodes.`,
        variant: 'success',
      });

      onConnect?.(response.feed);
      onClose();
    } catch (error) {
      console.error('Failed to connect podcast:', error);
      showToast({
        message: 'Connection failed',
        description: error.message || 'Could not connect podcast. Please try again.',
        variant: 'error',
      });
    } finally {
      setConnecting(null);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Connect Your Podcast"
      size="lg"
    >
      <div className={styles.container}>
        {/* Tabs */}
        <div className={styles.tabs}>
          {searchAvailable && (
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'search' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('search')}
            >
              <Search size={16} />
              Search by Name
            </button>
          )}
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'url' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('url')}
          >
            <Link size={16} />
            Paste RSS URL
          </button>
        </div>

        {/* Search Tab */}
        {activeTab === 'search' && searchAvailable && (
          <div className={styles.tabContent}>
            <form onSubmit={handleSearch} className={styles.searchForm}>
              <Input
                placeholder="Search for your podcast..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={Search}
              />
              <Button
                type="submit"
                loading={searching}
                disabled={searchQuery.length < 2}
              >
                Search
              </Button>
            </form>

            {searchError && (
              <div className={styles.error}>
                <AlertCircle size={16} />
                {searchError}
              </div>
            )}

            {searchResults.length > 0 && (
              <div className={styles.results}>
                {searchResults.map((podcast) => (
                  <PodcastResultCard
                    key={podcast.id}
                    podcast={podcast}
                    onConnect={() => handleConnect(podcast)}
                    connecting={connecting === podcast.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* URL Tab */}
        {activeTab === 'url' && (
          <div className={styles.tabContent}>
            <form onSubmit={handleLookup} className={styles.urlForm}>
              <Input
                placeholder="https://feed.example.com/rss.xml"
                value={feedUrl}
                onChange={(e) => {
                  setFeedUrl(e.target.value);
                  setLookupResult(null);
                  setLookupError(null);
                }}
                leftIcon={Rss}
              />
              <Button
                type="submit"
                loading={lookingUp}
                disabled={!feedUrl.trim()}
              >
                Look Up
              </Button>
            </form>

            {lookupError && (
              <div className={styles.error}>
                <AlertCircle size={16} />
                {lookupError}
              </div>
            )}

            {lookupResult && (
              <div className={styles.results}>
                <PodcastResultCard
                  podcast={lookupResult}
                  onConnect={() => handleConnect(lookupResult)}
                  connecting={connecting === lookupResult.feedUrl}
                />
              </div>
            )}

            {/* Help tips */}
            <div className={styles.helpSection}>
              <button
                type="button"
                className={styles.helpToggle}
                onClick={() => setShowTips(!showTips)}
              >
                <HelpCircle size={16} />
                <span>Don't know your RSS feed URL?</span>
                {showTips ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showTips && (
                <div className={styles.helpTips}>
                  <p className={styles.helpIntro}>
                    Find your RSS feed URL in your podcast hosting dashboard:
                  </p>
                  <div className={styles.tipsList}>
                    {HOSTING_TIPS.map((tip) => (
                      <div key={tip.name} className={styles.tip}>
                        <strong>{tip.name}:</strong> {tip.path}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Podcast result card component
 */
function PodcastResultCard({ podcast, onConnect, connecting }) {
  return (
    <div className={styles.resultCard}>
      {podcast.artworkUrl && (
        <img
          src={podcast.artworkUrl}
          alt={podcast.title}
          className={styles.artwork}
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      )}
      <div className={styles.resultInfo}>
        <h4 className={styles.resultTitle}>{podcast.title}</h4>
        <p className={styles.resultAuthor}>{podcast.author}</p>
        <div className={styles.resultMeta}>
          {podcast.episodeCount && (
            <span>{podcast.episodeCount} episodes</span>
          )}
          {podcast.categories?.length > 0 && (
            <span>{podcast.categories.slice(0, 2).join(', ')}</span>
          )}
        </div>
        {podcast.description && (
          <p className={styles.resultDescription}>
            {podcast.description.length > 150
              ? `${podcast.description.substring(0, 150)}...`
              : podcast.description}
          </p>
        )}
      </div>
      <div className={styles.resultActions}>
        <Button
          onClick={onConnect}
          loading={connecting}
          disabled={connecting}
          leftIcon={connecting ? Loader2 : Check}
        >
          {connecting ? 'Connecting...' : 'Connect'}
        </Button>
        {podcast.websiteUrl && (
          <a
            href={podcast.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.websiteLink}
          >
            <ExternalLink size={14} />
            Website
          </a>
        )}
      </div>
    </div>
  );
}

export default ConnectPodcastModal;
