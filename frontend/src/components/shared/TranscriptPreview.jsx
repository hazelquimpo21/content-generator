/**
 * ============================================================================
 * TRANSCRIPT PREVIEW COMPONENT
 * ============================================================================
 * Displays a full transcript with timestamps and speaker identification.
 * Supports searching, jumping to timestamps, and speaker filtering.
 *
 * Features:
 * - Full transcript display with timestamps
 * - Color-coded speaker labels
 * - Search/filter functionality
 * - Click timestamp to copy
 * - Collapsible/expandable view
 * - Speaker filtering
 *
 * Usage:
 *   <TranscriptPreview
 *     utterances={[{ start: 0, text: '...', speaker: 'A', speakerLabel: 'Host' }]}
 *     speakers={[{ id: 'A', label: 'Host' }]}
 *     onEditSpeakers={() => {}}
 *   />
 * ============================================================================
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Clock,
  User,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Filter,
  Users,
  FileText,
  Maximize2,
  Minimize2,
  Edit2,
} from 'lucide-react';
import clsx from 'clsx';
import Button from './Button';
import styles from './TranscriptPreview.module.css';

// ============================================================================
// CONSTANTS
// ============================================================================

// Colors for speaker badges (matches SpeakerLabeling)
const SPEAKER_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Formats seconds to [HH:MM:SS] or [MM:SS] timestamp
 */
function formatTimestamp(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return '00:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Gets color for a speaker based on their ID
 */
function getSpeakerColor(speakerId, speakerIds) {
  const index = speakerIds.indexOf(speakerId);
  return SPEAKER_COLORS[index >= 0 ? index % SPEAKER_COLORS.length : 0];
}

/**
 * Highlights search matches in text
 */
function highlightMatches(text, searchTerm) {
  if (!searchTerm || !text) return text;

  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className={styles.highlight}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Individual utterance row
 */
function UtteranceRow({
  utterance,
  speakerColor,
  searchTerm,
  showTimestamps,
  showSpeakers,
  onTimestampClick,
  isCompact,
}) {
  const [copied, setCopied] = useState(false);

  const handleTimestampClick = useCallback(() => {
    const timestamp = formatTimestamp(utterance.start);
    navigator.clipboard.writeText(timestamp);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onTimestampClick?.(utterance.start);
  }, [utterance.start, onTimestampClick]);

  return (
    <div className={clsx(styles.utterance, isCompact && styles.compact)}>
      {showTimestamps && (
        <button
          className={styles.timestamp}
          onClick={handleTimestampClick}
          title="Click to copy timestamp"
        >
          {copied ? (
            <Check size={12} className={styles.copiedIcon} />
          ) : (
            <Clock size={12} />
          )}
          <span>{formatTimestamp(utterance.start)}</span>
        </button>
      )}

      {showSpeakers && utterance.speakerLabel && (
        <span
          className={styles.speakerBadge}
          style={{ backgroundColor: speakerColor }}
        >
          <User size={12} />
          <span className={styles.speakerName}>
            {utterance.speakerLabel.replace(/^Speaker /, '')}
          </span>
        </span>
      )}

      <p className={styles.utteranceText}>
        {highlightMatches(utterance.text, searchTerm)}
      </p>
    </div>
  );
}

/**
 * Speaker filter dropdown
 */
function SpeakerFilter({ speakers, selectedSpeakers, onToggleSpeaker, onSelectAll, onClearAll }) {
  const [isOpen, setIsOpen] = useState(false);
  const speakerIds = speakers.map(s => s.id);

  const allSelected = selectedSpeakers.length === speakers.length;
  const noneSelected = selectedSpeakers.length === 0;

  return (
    <div className={styles.filterDropdown}>
      <button
        className={clsx(styles.filterButton, isOpen && styles.active)}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Filter size={14} />
        <span>
          {allSelected
            ? 'All speakers'
            : noneSelected
            ? 'No speakers'
            : `${selectedSpeakers.length} speaker${selectedSpeakers.length !== 1 ? 's' : ''}`}
        </span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isOpen && (
        <div className={styles.filterMenu}>
          <div className={styles.filterActions}>
            <button onClick={onSelectAll} disabled={allSelected}>
              Select all
            </button>
            <button onClick={onClearAll} disabled={noneSelected}>
              Clear all
            </button>
          </div>
          <div className={styles.filterList}>
            {speakers.map((speaker, index) => (
              <label key={speaker.id} className={styles.filterItem}>
                <input
                  type="checkbox"
                  checked={selectedSpeakers.includes(speaker.id)}
                  onChange={() => onToggleSpeaker(speaker.id)}
                />
                <span
                  className={styles.filterBadge}
                  style={{ backgroundColor: getSpeakerColor(speaker.id, speakerIds) }}
                >
                  {speaker.id}
                </span>
                <span className={styles.filterLabel}>{speaker.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * TranscriptPreview component
 *
 * @param {Object} props
 * @param {Array} props.utterances - Array of utterance objects
 * @param {Array} props.speakers - Array of speaker objects
 * @param {Function} props.onEditSpeakers - Callback to open speaker labeling
 * @param {string} props.className - Additional CSS class
 * @param {boolean} props.defaultExpanded - Start expanded (default: true)
 * @param {number} props.maxHeight - Maximum height in pixels (default: 500)
 * @param {boolean} props.showTimestamps - Show timestamps (default: true)
 * @param {boolean} props.showSpeakers - Show speaker labels (default: true)
 */
function TranscriptPreview({
  utterances = [],
  speakers = [],
  onEditSpeakers,
  className,
  defaultExpanded = true,
  maxHeight = 500,
  showTimestamps: defaultShowTimestamps = true,
  showSpeakers: defaultShowSpeakers = true,
}) {
  // State
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTimestamps, setShowTimestamps] = useState(defaultShowTimestamps);
  const [showSpeakers, setShowSpeakers] = useState(defaultShowSpeakers && speakers.length > 0);
  const [selectedSpeakers, setSelectedSpeakers] = useState(speakers.map(s => s.id));
  const [isCompact, setIsCompact] = useState(false);

  const contentRef = useRef(null);
  const speakerIds = speakers.map(s => s.id);

  // Update selected speakers when speakers prop changes
  useEffect(() => {
    setSelectedSpeakers(speakers.map(s => s.id));
  }, [speakers]);

  // Filter utterances based on search and speaker selection
  const filteredUtterances = useMemo(() => {
    return utterances.filter(u => {
      // Filter by speaker
      if (speakers.length > 0 && !selectedSpeakers.includes(u.speaker)) {
        return false;
      }

      // Filter by search term
      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        const matchesText = u.text?.toLowerCase().includes(lowerSearch);
        const matchesSpeaker = u.speakerLabel?.toLowerCase().includes(lowerSearch);
        return matchesText || matchesSpeaker;
      }

      return true;
    });
  }, [utterances, selectedSpeakers, searchTerm, speakers.length]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalWords = utterances.reduce((sum, u) => sum + (u.text?.split(/\s+/).length || 0), 0);
    const duration = utterances.length > 0 ? utterances[utterances.length - 1].end || utterances[utterances.length - 1].start : 0;

    return {
      utterances: utterances.length,
      words: totalWords,
      duration: formatTimestamp(duration),
      speakers: speakers.length,
    };
  }, [utterances, speakers]);

  // Handlers
  const handleToggleSpeaker = useCallback((speakerId) => {
    setSelectedSpeakers(prev =>
      prev.includes(speakerId)
        ? prev.filter(id => id !== speakerId)
        : [...prev, speakerId]
    );
  }, []);

  const handleSelectAllSpeakers = useCallback(() => {
    setSelectedSpeakers(speakers.map(s => s.id));
  }, [speakers]);

  const handleClearAllSpeakers = useCallback(() => {
    setSelectedSpeakers([]);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  const handleCopyAll = useCallback(() => {
    const text = filteredUtterances
      .map(u => {
        let line = '';
        if (showTimestamps) line += `[${formatTimestamp(u.start)}] `;
        if (showSpeakers && u.speakerLabel) line += `${u.speakerLabel}: `;
        line += u.text;
        return line;
      })
      .join('\n\n');

    navigator.clipboard.writeText(text);
  }, [filteredUtterances, showTimestamps, showSpeakers]);

  const handleTimestampClick = useCallback((seconds) => {
    // Could be used to jump to audio position if audio player is available
    console.log('Timestamp clicked:', seconds);
  }, []);

  // Empty state
  if (!utterances || utterances.length === 0) {
    return (
      <div className={clsx(styles.container, styles.empty, className)}>
        <FileText size={32} className={styles.emptyIcon} />
        <p>No transcript available</p>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        styles.container,
        isFullscreen && styles.fullscreen,
        !isExpanded && styles.collapsed,
        className
      )}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            className={styles.expandButton}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <h3 className={styles.title}>
            <FileText size={16} />
            Transcript Preview
          </h3>
          <span className={styles.stats}>
            {stats.utterances} segments &middot; {stats.words.toLocaleString()} words &middot; {stats.duration}
            {stats.speakers > 0 && ` &middot; ${stats.speakers} speaker${stats.speakers !== 1 ? 's' : ''}`}
          </span>
        </div>

        <div className={styles.headerRight}>
          {onEditSpeakers && speakers.length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              leftIcon={Edit2}
              onClick={onEditSpeakers}
            >
              Edit speakers
            </Button>
          )}
          <button
            className={styles.iconButton}
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Toolbar (only visible when expanded) */}
      {isExpanded && (
        <div className={styles.toolbar}>
          <div className={styles.searchContainer}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search transcript..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className={styles.clearSearch} onClick={handleClearSearch}>
                <X size={14} />
              </button>
            )}
          </div>

          {speakers.length > 1 && (
            <SpeakerFilter
              speakers={speakers}
              selectedSpeakers={selectedSpeakers}
              onToggleSpeaker={handleToggleSpeaker}
              onSelectAll={handleSelectAllSpeakers}
              onClearAll={handleClearAllSpeakers}
            />
          )}

          <div className={styles.toggles}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={showTimestamps}
                onChange={(e) => setShowTimestamps(e.target.checked)}
              />
              <Clock size={14} />
              <span>Timestamps</span>
            </label>

            {speakers.length > 0 && (
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={showSpeakers}
                  onChange={(e) => setShowSpeakers(e.target.checked)}
                />
                <Users size={14} />
                <span>Speakers</span>
              </label>
            )}

            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={isCompact}
                onChange={(e) => setIsCompact(e.target.checked)}
              />
              <span>Compact</span>
            </label>
          </div>

          <button className={styles.copyButton} onClick={handleCopyAll} title="Copy transcript">
            <Copy size={14} />
            <span>Copy</span>
          </button>
        </div>
      )}

      {/* Content */}
      {isExpanded && (
        <div
          ref={contentRef}
          className={styles.content}
          style={{ maxHeight: isFullscreen ? 'none' : maxHeight }}
        >
          {filteredUtterances.length === 0 ? (
            <div className={styles.noResults}>
              <Search size={24} />
              <p>No matches found for "{searchTerm}"</p>
              <button onClick={handleClearSearch}>Clear search</button>
            </div>
          ) : (
            filteredUtterances.map((utterance, index) => (
              <UtteranceRow
                key={index}
                utterance={utterance}
                speakerColor={getSpeakerColor(utterance.speaker, speakerIds)}
                searchTerm={searchTerm}
                showTimestamps={showTimestamps}
                showSpeakers={showSpeakers}
                onTimestampClick={handleTimestampClick}
                isCompact={isCompact}
              />
            ))
          )}
        </div>
      )}

      {/* Collapsed preview */}
      {!isExpanded && (
        <div className={styles.collapsedPreview}>
          <p>
            {utterances[0]?.text?.substring(0, 150)}
            {utterances[0]?.text?.length > 150 ? '...' : ''}
          </p>
          <button onClick={() => setIsExpanded(true)}>
            Show full transcript
          </button>
        </div>
      )}
    </div>
  );
}

export default TranscriptPreview;
