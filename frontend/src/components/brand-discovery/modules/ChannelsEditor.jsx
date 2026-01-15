/**
 * ============================================================================
 * CHANNELS EDITOR
 * ============================================================================
 * Editor for the Channels module - allows users to rank their content
 * distribution platforms by priority using drag-and-drop.
 *
 * Features:
 *   - Drag-and-drop reordering
 *   - Platform info display (vibe, content types)
 *   - Visual priority indicators
 *   - Toggle platforms on/off
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import {
  Save,
  GripVertical,
  Linkedin,
  Instagram,
  Twitter,
  Facebook,
  Mail,
  Youtube,
  MessageCircle,
  CheckCircle,
  Circle,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@components/shared';
import styles from './ChannelsEditor.module.css';

// Platform icon mapping
const PLATFORM_ICONS = {
  linkedin: Linkedin,
  instagram: Instagram,
  twitter: Twitter,
  facebook: Facebook,
  email: Mail,
  youtube: Youtube,
  tiktok: MessageCircle,
  threads: MessageCircle,
};

/**
 * ChannelsEditor - Rank platform priorities via drag-and-drop
 *
 * @param {Object} props - Component props
 * @param {Object} props.data - Current module data
 * @param {Object} props.referenceData - Reference data with platform list
 * @param {Function} props.onSave - Save callback
 * @param {Function} props.onClose - Close callback
 * @param {boolean} props.saving - Whether save is in progress
 * @returns {JSX.Element}
 */
function ChannelsEditor({ data = {}, referenceData, onSave, onClose, saving }) {
  const platforms = referenceData?.platforms || [];

  // Initialize priorities from data or create from platform list
  const [priorities, setPriorities] = useState(() => {
    if (data.priorities?.length > 0) {
      return data.priorities;
    }
    // Create default priorities with all platforms active
    return platforms.map((p, index) => ({
      platform: p.id,
      rank: index + 1,
      active: index < 5, // Top 5 active by default
    }));
  });

  const [draggedIndex, setDraggedIndex] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  /**
   * Handle drag start
   */
  const handleDragStart = useCallback((e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Add drag data for accessibility
    e.dataTransfer.setData('text/plain', index.toString());
  }, []);

  /**
   * Handle drag over
   */
  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    // Reorder priorities
    setPriorities((prev) => {
      const newPriorities = [...prev];
      const [dragged] = newPriorities.splice(draggedIndex, 1);
      newPriorities.splice(index, 0, dragged);

      // Update ranks
      return newPriorities.map((p, i) => ({ ...p, rank: i + 1 }));
    });

    setDraggedIndex(index);
    setHasChanges(true);
  }, [draggedIndex]);

  /**
   * Handle drag end
   */
  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  /**
   * Toggle platform active state
   */
  const toggleActive = useCallback((platformId) => {
    setPriorities((prev) =>
      prev.map((p) =>
        p.platform === platformId ? { ...p, active: !p.active } : p
      )
    );
    setHasChanges(true);
  }, []);

  /**
   * Move platform up in ranking
   */
  const moveUp = useCallback((index) => {
    if (index === 0) return;
    setPriorities((prev) => {
      const newPriorities = [...prev];
      [newPriorities[index - 1], newPriorities[index]] = [
        newPriorities[index],
        newPriorities[index - 1],
      ];
      return newPriorities.map((p, i) => ({ ...p, rank: i + 1 }));
    });
    setHasChanges(true);
  }, []);

  /**
   * Move platform down in ranking
   */
  const moveDown = useCallback((index) => {
    setPriorities((prev) => {
      if (index === prev.length - 1) return prev;
      const newPriorities = [...prev];
      [newPriorities[index], newPriorities[index + 1]] = [
        newPriorities[index + 1],
        newPriorities[index],
      ];
      return newPriorities.map((p, i) => ({ ...p, rank: i + 1 }));
    });
    setHasChanges(true);
  }, []);

  /**
   * Get platform details from reference data
   */
  const getPlatformDetails = useCallback(
    (platformId) => {
      return platforms.find((p) => p.id === platformId) || {};
    },
    [platforms]
  );

  /**
   * Handle save
   */
  const handleSave = useCallback(async () => {
    const activePriorities = priorities.filter((p) => p.active);
    const newStatus = activePriorities.length > 0 ? 'complete' : 'in_progress';

    console.log('[ChannelsEditor] Saving:', {
      priorityCount: priorities.length,
      activeCount: activePriorities.length,
      status: newStatus,
    });

    try {
      await onSave({ priorities }, newStatus);
      setHasChanges(false);
    } catch (err) {
      console.error('[ChannelsEditor] Save failed:', err);
    }
  }, [priorities, onSave]);

  // Count active platforms
  const activeCount = priorities.filter((p) => p.active).length;

  return (
    <div className={styles.container}>
      {/* Info */}
      <p className={styles.intro}>
        Drag to reorder your content platforms by priority. Toggle platforms on/off
        to focus on the ones you actively use.
      </p>

      {/* Stats */}
      <div className={styles.stats}>
        <span className={styles.statLabel}>Active platforms:</span>
        <span className={styles.statValue}>{activeCount} of {priorities.length}</span>
      </div>

      {/* Platform list */}
      <div className={styles.platformList}>
        {priorities.map((priority, index) => {
          const platform = getPlatformDetails(priority.platform);
          const Icon = PLATFORM_ICONS[priority.platform] || MessageCircle;

          return (
            <div
              key={priority.platform}
              className={clsx(
                styles.platformItem,
                !priority.active && styles.inactive,
                draggedIndex === index && styles.dragging
              )}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              {/* Drag handle */}
              <div className={styles.dragHandle}>
                <GripVertical className={styles.gripIcon} />
              </div>

              {/* Rank indicator */}
              <div
                className={clsx(styles.rankBadge, priority.active && styles.activeRank)}
                style={{ backgroundColor: priority.active ? platform.color : undefined }}
              >
                {priority.rank}
              </div>

              {/* Platform icon */}
              <div
                className={styles.platformIcon}
                style={{ color: priority.active ? platform.color : undefined }}
              >
                <Icon />
              </div>

              {/* Platform info */}
              <div className={styles.platformInfo}>
                <span className={styles.platformName}>{platform.name}</span>
                <span className={styles.platformVibe}>{platform.vibe}</span>
              </div>

              {/* Content types */}
              <div className={styles.contentTypes}>
                {platform.contentTypes?.slice(0, 2).map((type, i) => (
                  <span key={i} className={styles.contentType}>
                    {type}
                  </span>
                ))}
              </div>

              {/* Toggle */}
              <button
                className={styles.toggleButton}
                onClick={() => toggleActive(priority.platform)}
                aria-label={priority.active ? 'Deactivate' : 'Activate'}
              >
                {priority.active ? (
                  <CheckCircle className={styles.toggleIconActive} />
                ) : (
                  <Circle className={styles.toggleIconInactive} />
                )}
              </button>

              {/* Keyboard navigation buttons (visible on focus) */}
              <div className={styles.keyboardNav}>
                <button
                  className={styles.navButton}
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  className={styles.navButton}
                  onClick={() => moveDown(index)}
                  disabled={index === priorities.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hint */}
      <p className={styles.hint}>
        Higher-priority platforms will be optimized first when generating content.
        Platform vibes influence how your Brand DNA is adapted.
      </p>

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.footerStats}>
          {activeCount > 0
            ? `Top platform: ${getPlatformDetails(priorities.find((p) => p.active)?.platform).name}`
            : 'No platforms active'}
        </div>

        <div className={styles.footerActions}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanges}
            leftIcon={Save}
          >
            Save Channels
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ChannelsEditor;
