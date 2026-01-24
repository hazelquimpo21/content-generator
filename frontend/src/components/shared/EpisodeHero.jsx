/**
 * ============================================================================
 * EPISODE HERO COMPONENT
 * ============================================================================
 * Displays episode metadata in a visually appealing hero section.
 * Shows: episode name, subtitle, host/guest info, tags, themes preview,
 * date, and promotion details.
 *
 * Data Sources:
 * - Stage 0 (Content Brief): episode_name, episode_subtitle, host_name,
 *   guest_name, guest_bio, tags, themes, has_promotion, promotion_details, date_released
 * - Episode context: user-provided metadata
 * ============================================================================
 */

import { useState } from 'react';
import {
  Calendar,
  User,
  Mic,
  Tag,
  Gift,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
} from 'lucide-react';
import Badge from './Badge';
import styles from './EpisodeHero.module.css';

/**
 * EpisodeHero component
 * @param {Object} props
 * @param {Object} props.episode - Episode data from database
 * @param {Object} props.contentBrief - Stage 0 output_data (content brief)
 * @param {Object} props.episodeSummary - Stage 1 output_data (summary, episode_crux)
 */
function EpisodeHero({ episode, contentBrief, episodeSummary }) {
  const [showAllThemes, setShowAllThemes] = useState(false);

  // Extract data from content brief (Stage 0)
  const {
    episode_name,
    episode_subtitle,
    host_name,
    guest_name,
    guest_bio,
    tags = [],
    themes = [],
    has_promotion,
    promotion_details,
    date_released,
    seo_overview,
  } = contentBrief || {};

  // Extract from episode summary (Stage 1)
  const { episode_crux } = episodeSummary || {};

  // Episode context from user input
  const episodeContext = episode?.episode_context || {};
  const {
    episode_number,
    recording_date,
    notes,
  } = episodeContext;

  // Use AI-generated name or fall back to user-provided/default
  const displayName = episode_name || episode?.title || 'Untitled Episode';
  const displaySubtitle = episode_subtitle || 'Episode content generated';

  // Audio metadata if available
  const audioMetadata = episode?.audio_metadata;
  const sourceType = episode?.source_type;

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Show limited themes initially
  const visibleThemes = showAllThemes ? themes : themes.slice(0, 2);
  const hasMoreThemes = themes.length > 2;

  // Don't render if no content brief data
  if (!contentBrief) {
    return null;
  }

  return (
    <div className={styles.hero}>
      {/* Top metadata bar */}
      <div className={styles.metaBar}>
        {date_released && (
          <span className={styles.metaItem}>
            <Calendar size={14} />
            {formatDate(date_released)}
          </span>
        )}
        {episode_number && (
          <span className={styles.metaItem}>
            <FileText size={14} />
            Episode {episode_number}
          </span>
        )}
        {audioMetadata?.duration_seconds && (
          <span className={styles.metaItem}>
            <Clock size={14} />
            {formatDuration(audioMetadata.duration_seconds)}
          </span>
        )}
        {sourceType === 'audio' && (
          <Badge variant="secondary" size="sm">Audio Upload</Badge>
        )}
      </div>

      {/* Main title section */}
      <div className={styles.titleSection}>
        <h2 className={styles.episodeName}>{displayName}</h2>
        <p className={styles.subtitle}>{displaySubtitle}</p>
      </div>

      {/* Host and Guest info */}
      <div className={styles.peopleSection}>
        {host_name && (
          <div className={styles.person}>
            <div className={styles.personIcon}>
              <Mic size={16} />
            </div>
            <div className={styles.personInfo}>
              <span className={styles.personRole}>Host</span>
              <span className={styles.personName}>{host_name}</span>
            </div>
          </div>
        )}

        {guest_name && (
          <>
            <div className={styles.personDivider} />
            <div className={styles.person}>
              <div className={styles.personIcon}>
                <User size={16} />
              </div>
              <div className={styles.personInfo}>
                <span className={styles.personRole}>Guest</span>
                <span className={styles.personName}>{guest_name}</span>
                {guest_bio && (
                  <span className={styles.personBio}>{guest_bio}</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Episode Crux - highlighted callout */}
      {episode_crux && (
        <div className={styles.cruxBox}>
          <div className={styles.cruxLabel}>Core Insight</div>
          <p className={styles.cruxText}>{episode_crux}</p>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className={styles.tagsSection}>
          <Tag size={14} className={styles.tagIcon} />
          <div className={styles.tagsList}>
            {tags.map((tag, i) => (
              <Badge key={i} variant="default" className={styles.tag}>
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Themes preview */}
      {themes.length > 0 && (
        <div className={styles.themesSection}>
          <div className={styles.themesHeader}>
            <span className={styles.themesLabel}>Key Themes</span>
            {hasMoreThemes && (
              <button
                className={styles.toggleButton}
                onClick={() => setShowAllThemes(!showAllThemes)}
              >
                {showAllThemes ? (
                  <>Show less <ChevronUp size={14} /></>
                ) : (
                  <>Show all {themes.length} <ChevronDown size={14} /></>
                )}
              </button>
            )}
          </div>
          <div className={styles.themesList}>
            {visibleThemes.map((theme, i) => (
              <div key={i} className={styles.themeChip}>
                <span className={styles.themeName}>{theme.name}</span>
                {theme.practical_value && (
                  <span className={styles.themePractical}>
                    {theme.practical_value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promotion banner */}
      {has_promotion && promotion_details && (
        <div className={styles.promotionBanner}>
          <Gift size={16} />
          <span className={styles.promotionText}>{promotion_details}</span>
        </div>
      )}
    </div>
  );
}

export default EpisodeHero;
