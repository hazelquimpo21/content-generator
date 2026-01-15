/**
 * ============================================================================
 * AUDIENCE EDITOR
 * ============================================================================
 * Editor for the Audience module - allows users to select their target
 * audience archetype and customize audience details.
 *
 * Features:
 *   - Visual archetype cards with descriptions
 *   - Primary + secondary archetype selection
 *   - Custom pain points and desires input
 *   - Demographic notes
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import { Save, Check, Users, Target, Heart, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { Button, Input } from '@components/shared';
import styles from './AudienceEditor.module.css';

/**
 * AudienceEditor - Define target audience
 *
 * @param {Object} props - Component props
 * @param {Object} props.data - Current module data
 * @param {Object} props.referenceData - Reference data with audience archetypes
 * @param {Function} props.onSave - Save callback
 * @param {Function} props.onClose - Close callback
 * @param {boolean} props.saving - Whether save is in progress
 * @returns {JSX.Element}
 */
function AudienceEditor({ data = {}, referenceData, onSave, onClose, saving }) {
  const archetypes = referenceData?.audienceArchetypes || [];

  // State
  const [primaryArchetype, setPrimaryArchetype] = useState(
    data.primary_archetype || null
  );
  const [secondaryArchetype, setSecondaryArchetype] = useState(
    data.secondary_archetype || null
  );
  const [painPoints, setPainPoints] = useState(data.pain_points || '');
  const [desires, setDesires] = useState(data.desires || '');
  const [demographics, setDemographics] = useState(data.demographics || '');

  const [hasChanges, setHasChanges] = useState(false);

  /**
   * Handle archetype selection
   */
  const handleSelectArchetype = useCallback((archetypeId) => {
    if (primaryArchetype === archetypeId) {
      // Clicking selected primary clears it
      setPrimaryArchetype(null);
    } else if (secondaryArchetype === archetypeId) {
      // Clicking selected secondary clears it
      setSecondaryArchetype(null);
    } else if (!primaryArchetype) {
      // No primary selected, set as primary
      setPrimaryArchetype(archetypeId);
    } else if (!secondaryArchetype) {
      // Primary selected, no secondary, set as secondary
      setSecondaryArchetype(archetypeId);
    } else {
      // Both selected, replace primary and move old primary to secondary
      setSecondaryArchetype(primaryArchetype);
      setPrimaryArchetype(archetypeId);
    }
    setHasChanges(true);
  }, [primaryArchetype, secondaryArchetype]);

  /**
   * Handle input changes
   */
  const handleInputChange = useCallback((setter) => (e) => {
    setter(e.target.value);
    setHasChanges(true);
  }, []);

  /**
   * Handle save
   */
  const handleSave = useCallback(async () => {
    const hasSelection = !!primaryArchetype;
    const newStatus = hasSelection ? 'complete' : 'in_progress';

    console.log('[AudienceEditor] Saving:', {
      primary: primaryArchetype,
      secondary: secondaryArchetype,
      status: newStatus,
    });

    try {
      await onSave(
        {
          primary_archetype: primaryArchetype,
          secondary_archetype: secondaryArchetype,
          pain_points: painPoints.trim(),
          desires: desires.trim(),
          demographics: demographics.trim(),
        },
        newStatus
      );
      setHasChanges(false);
    } catch (err) {
      console.error('[AudienceEditor] Save failed:', err);
    }
  }, [primaryArchetype, secondaryArchetype, painPoints, desires, demographics, onSave]);

  /**
   * Get selection state for an archetype
   */
  const getSelectionState = useCallback(
    (archetypeId) => {
      if (primaryArchetype === archetypeId) return 'primary';
      if (secondaryArchetype === archetypeId) return 'secondary';
      return null;
    },
    [primaryArchetype, secondaryArchetype]
  );

  return (
    <div className={styles.container}>
      {/* Info */}
      <p className={styles.intro}>
        Select who your content is for. Choose a primary audience archetype and
        optionally a secondary one. This helps tailor content to resonate with your
        ideal clients.
      </p>

      {/* Selection indicator */}
      <div className={styles.selectionIndicator}>
        <div className={styles.selectedSlot}>
          <span className={styles.slotLabel}>Primary</span>
          <span className={styles.slotValue}>
            {primaryArchetype
              ? archetypes.find((a) => a.id === primaryArchetype)?.name
              : 'Click to select'}
          </span>
        </div>
        <div className={styles.selectedSlot}>
          <span className={styles.slotLabel}>Secondary (optional)</span>
          <span className={styles.slotValue}>
            {secondaryArchetype
              ? archetypes.find((a) => a.id === secondaryArchetype)?.name
              : 'Click to select'}
          </span>
        </div>
      </div>

      {/* Archetype grid */}
      <div className={styles.archetypeGrid}>
        {archetypes.map((archetype) => {
          const selection = getSelectionState(archetype.id);

          return (
            <button
              key={archetype.id}
              className={clsx(
                styles.archetypeCard,
                selection === 'primary' && styles.primarySelected,
                selection === 'secondary' && styles.secondarySelected
              )}
              onClick={() => handleSelectArchetype(archetype.id)}
            >
              {/* Selection badge */}
              {selection && (
                <div
                  className={clsx(
                    styles.selectionBadge,
                    selection === 'primary' && styles.primaryBadge,
                    selection === 'secondary' && styles.secondaryBadge
                  )}
                >
                  <Check className={styles.checkIcon} />
                  <span>{selection === 'primary' ? '1st' : '2nd'}</span>
                </div>
              )}

              {/* Card content */}
              <Users className={styles.archetypeIcon} />
              <h4 className={styles.archetypeName}>{archetype.name}</h4>
              <p className={styles.archetypeDescription}>{archetype.description}</p>

              {/* Key characteristics */}
              {archetype.characteristics && (
                <div className={styles.characteristics}>
                  {archetype.characteristics.slice(0, 3).map((char, i) => (
                    <span key={i} className={styles.characteristic}>
                      {char}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Custom details */}
      <div className={styles.customDetails}>
        <h4 className={styles.sectionTitle}>
          <Target className={styles.sectionIcon} />
          Customize Your Audience Profile
        </h4>

        <div className={styles.detailsGrid}>
          <div className={styles.detailField}>
            <label className={styles.fieldLabel}>
              <AlertTriangle className={styles.fieldIcon} />
              Pain Points
            </label>
            <textarea
              className={styles.textarea}
              placeholder="What struggles does your audience face? (e.g., anxiety about relationships, work-life balance, imposter syndrome)"
              value={painPoints}
              onChange={handleInputChange(setPainPoints)}
              rows={3}
            />
          </div>

          <div className={styles.detailField}>
            <label className={styles.fieldLabel}>
              <Heart className={styles.fieldIcon} />
              Desires & Goals
            </label>
            <textarea
              className={styles.textarea}
              placeholder="What does your audience want to achieve? (e.g., better communication, self-acceptance, work-life harmony)"
              value={desires}
              onChange={handleInputChange(setDesires)}
              rows={3}
            />
          </div>
        </div>

        <Input
          label="Demographics (optional)"
          placeholder="Age range, profession, life stage, etc."
          value={demographics}
          onChange={handleInputChange(setDemographics)}
        />
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.footerStats}>
          {primaryArchetype
            ? `Primary: ${archetypes.find((a) => a.id === primaryArchetype)?.name}`
            : 'No audience selected'}
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
            Save Audience
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AudienceEditor;
