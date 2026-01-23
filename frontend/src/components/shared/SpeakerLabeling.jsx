/**
 * ============================================================================
 * SPEAKER LABELING COMPONENT
 * ============================================================================
 * Allows users to name/label speakers detected during transcription.
 * Shows detected speakers with editable labels and optional role selection.
 *
 * Features:
 * - Editable speaker names (e.g., "Speaker A" -> "Dr. Smith")
 * - Role selection (host, guest, interviewer)
 * - Preview of each speaker's first utterance
 * - Apply labels to update transcript display
 *
 * Usage:
 *   <SpeakerLabeling
 *     speakers={[{ id: 'A', label: 'Speaker A' }, ...]}
 *     utterances={[{ speaker: 'A', text: '...', start: 0 }, ...]}
 *     onLabelsApplied={(labels) => console.log(labels)}
 *   />
 * ============================================================================
 */

import { useState, useCallback, useMemo } from 'react';
import { User, Mic, Users, Check, Edit2, Play } from 'lucide-react';
import clsx from 'clsx';
import Button from './Button';
import styles from './SpeakerLabeling.module.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const SPEAKER_ROLES = [
  { value: '', label: 'No role' },
  { value: 'host', label: 'Host' },
  { value: 'guest', label: 'Guest' },
  { value: 'interviewer', label: 'Interviewer' },
  { value: 'interviewee', label: 'Interviewee' },
  { value: 'co-host', label: 'Co-host' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'panelist', label: 'Panelist' },
];

// Colors for speaker badges (cycles through for many speakers)
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
 * Formats milliseconds to MM:SS or HH:MM:SS
 */
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Gets color for a speaker based on their index
 */
function getSpeakerColor(index) {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

/**
 * Truncates text to a maximum length with ellipsis
 */
function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Individual speaker card with editable label
 */
function SpeakerCard({
  speaker,
  index,
  firstUtterance,
  label,
  role,
  onLabelChange,
  onRoleChange,
  isEditing,
  onEditToggle,
}) {
  const color = getSpeakerColor(index);

  return (
    <div className={styles.speakerCard}>
      <div className={styles.speakerHeader}>
        <div
          className={styles.speakerBadge}
          style={{ backgroundColor: color }}
        >
          <User size={16} />
          <span>{speaker.id}</span>
        </div>

        {isEditing ? (
          <input
            type="text"
            className={styles.labelInput}
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder={`Name for Speaker ${speaker.id}`}
            autoFocus
            onBlur={() => onEditToggle(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditToggle(false);
            }}
          />
        ) : (
          <div className={styles.labelDisplay} onClick={() => onEditToggle(true)}>
            <span className={styles.labelText}>{label || `Speaker ${speaker.id}`}</span>
            <Edit2 className={styles.editIcon} size={14} />
          </div>
        )}
      </div>

      <div className={styles.roleSelector}>
        <select
          className={styles.roleSelect}
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
        >
          {SPEAKER_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {firstUtterance && (
        <div className={styles.utterancePreview}>
          <div className={styles.utteranceHeader}>
            <Play size={12} />
            <span className={styles.utteranceTime}>
              {formatTime(firstUtterance.start)}
            </span>
          </div>
          <p className={styles.utteranceText}>
            "{truncateText(firstUtterance.text, 120)}"
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * SpeakerLabeling component
 *
 * @param {Object} props
 * @param {Array} props.speakers - Array of speaker objects [{ id, label }]
 * @param {Array} props.utterances - Array of utterance objects [{ speaker, text, start, end }]
 * @param {Function} props.onLabelsApplied - Callback when labels are applied
 * @param {Object} props.initialLabels - Initial speaker labels object
 * @param {string} props.className - Additional CSS class
 */
function SpeakerLabeling({
  speakers = [],
  utterances = [],
  onLabelsApplied,
  initialLabels = {},
  className,
}) {
  // State for speaker labels and roles
  const [labels, setLabels] = useState(() => {
    const initial = {};
    speakers.forEach((s) => {
      initial[s.id] = initialLabels[s.id] || s.label || `Speaker ${s.id}`;
    });
    return initial;
  });

  const [roles, setRoles] = useState(() => {
    const initial = {};
    speakers.forEach((s) => {
      initial[s.id] = '';
    });
    return initial;
  });

  const [editingSpeaker, setEditingSpeaker] = useState(null);
  const [isApplied, setIsApplied] = useState(false);

  // Get first utterance for each speaker (for preview)
  const firstUtterances = useMemo(() => {
    const first = {};
    utterances.forEach((u) => {
      if (!first[u.speaker]) {
        first[u.speaker] = u;
      }
    });
    return first;
  }, [utterances]);

  // Count utterances per speaker
  const utteranceCounts = useMemo(() => {
    const counts = {};
    speakers.forEach((s) => {
      counts[s.id] = 0;
    });
    utterances.forEach((u) => {
      if (counts[u.speaker] !== undefined) {
        counts[u.speaker]++;
      }
    });
    return counts;
  }, [speakers, utterances]);

  // Handle label change for a speaker
  const handleLabelChange = useCallback((speakerId, newLabel) => {
    setLabels((prev) => ({
      ...prev,
      [speakerId]: newLabel,
    }));
    setIsApplied(false);
  }, []);

  // Handle role change for a speaker
  const handleRoleChange = useCallback((speakerId, newRole) => {
    setRoles((prev) => ({
      ...prev,
      [speakerId]: newRole,
    }));
    setIsApplied(false);
  }, []);

  // Apply labels
  const handleApply = useCallback(() => {
    // Build final labels with role suffix if role is set
    const finalLabels = {};
    Object.keys(labels).forEach((speakerId) => {
      const label = labels[speakerId] || `Speaker ${speakerId}`;
      const role = roles[speakerId];
      finalLabels[speakerId] = role ? `${label} (${role})` : label;
    });

    if (onLabelsApplied) {
      onLabelsApplied(finalLabels, { labels, roles });
    }
    setIsApplied(true);
  }, [labels, roles, onLabelsApplied]);

  // Check if any labels have been customized
  const hasCustomLabels = useMemo(() => {
    return speakers.some((s) => {
      const currentLabel = labels[s.id];
      const defaultLabel = `Speaker ${s.id}`;
      return currentLabel && currentLabel !== defaultLabel;
    });
  }, [speakers, labels]);

  if (!speakers || speakers.length === 0) {
    return null;
  }

  return (
    <div className={clsx(styles.container, className)}>
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <Users size={20} />
        </div>
        <div className={styles.headerText}>
          <h3 className={styles.title}>Name Your Speakers</h3>
          <p className={styles.subtitle}>
            We detected {speakers.length} speaker{speakers.length !== 1 ? 's' : ''} in your audio.
            Click to edit names.
          </p>
        </div>
      </div>

      <div className={styles.speakerList}>
        {speakers.map((speaker, index) => (
          <SpeakerCard
            key={speaker.id}
            speaker={speaker}
            index={index}
            firstUtterance={firstUtterances[speaker.id]}
            label={labels[speaker.id]}
            role={roles[speaker.id]}
            onLabelChange={(newLabel) => handleLabelChange(speaker.id, newLabel)}
            onRoleChange={(newRole) => handleRoleChange(speaker.id, newRole)}
            isEditing={editingSpeaker === speaker.id}
            onEditToggle={(editing) => setEditingSpeaker(editing ? speaker.id : null)}
          />
        ))}
      </div>

      <div className={styles.stats}>
        {speakers.map((speaker, index) => (
          <div key={speaker.id} className={styles.statItem}>
            <span
              className={styles.statBadge}
              style={{ backgroundColor: getSpeakerColor(index) }}
            >
              {speaker.id}
            </span>
            <span className={styles.statCount}>
              {utteranceCounts[speaker.id]} utterance{utteranceCounts[speaker.id] !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={handleApply}
          leftIcon={isApplied ? Check : Mic}
          disabled={isApplied && !hasCustomLabels}
        >
          {isApplied ? 'Labels Applied' : 'Apply Speaker Names'}
        </Button>
        {isApplied && (
          <span className={styles.appliedNote}>
            Speaker names will appear in your transcript
          </span>
        )}
      </div>
    </div>
  );
}

export default SpeakerLabeling;
