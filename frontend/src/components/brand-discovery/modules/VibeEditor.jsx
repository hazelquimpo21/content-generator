/**
 * ============================================================================
 * VIBE EDITOR
 * ============================================================================
 * Editor for the Vibe module - allows users to set their brand tone using
 * interactive sliders on 4 spectrums:
 *   - Warmth: Warm <-> Professional
 *   - Formality: Casual <-> Authoritative
 *   - Energy: Calm <-> Energetic
 *   - Approach: Direct <-> Nurturing
 *
 * Values range from 0-100, with 50 being neutral.
 * These vibe settings influence Brand DNA archetype correlation.
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import { Save, RotateCcw, Info } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@components/shared';
import styles from './VibeEditor.module.css';

// Vibe dimensions with their spectrum endpoints
const VIBE_DIMENSIONS = [
  {
    id: 'warmth',
    label: 'Warmth',
    leftEnd: 'Warm & Personal',
    rightEnd: 'Professional & Polished',
    leftDescription: 'Like a friend sharing wisdom',
    rightDescription: 'Expert delivering insights',
    defaultValue: 50,
  },
  {
    id: 'formality',
    label: 'Formality',
    leftEnd: 'Casual & Conversational',
    rightEnd: 'Authoritative & Scholarly',
    leftDescription: 'Relaxed, everyday language',
    rightDescription: 'Precise, academic tone',
    defaultValue: 50,
  },
  {
    id: 'energy',
    label: 'Energy',
    leftEnd: 'Calm & Grounding',
    rightEnd: 'Energetic & Motivating',
    leftDescription: 'Peaceful, steady presence',
    rightDescription: 'Dynamic, inspiring momentum',
    defaultValue: 50,
  },
  {
    id: 'approach',
    label: 'Approach',
    leftEnd: 'Direct & Actionable',
    rightEnd: 'Nurturing & Supportive',
    leftDescription: 'Clear steps and guidance',
    rightDescription: 'Gentle encouragement',
    defaultValue: 50,
  },
];

/**
 * Get vibe interpretation based on value
 */
function getVibeInterpretation(id, value) {
  const dimension = VIBE_DIMENSIONS.find((d) => d.id === id);
  if (!dimension) return '';

  if (value < 30) return dimension.leftDescription;
  if (value > 70) return dimension.rightDescription;
  return 'A balanced blend of both approaches';
}

/**
 * VibeEditor - Edit brand vibe/tone using sliders
 *
 * @param {Object} props - Component props
 * @param {Object} props.data - Current module data
 * @param {Function} props.onSave - Save callback
 * @param {Function} props.onClose - Close callback
 * @param {boolean} props.saving - Whether save is in progress
 * @returns {JSX.Element}
 */
function VibeEditor({ data = {}, onSave, onClose, saving }) {
  // Initialize vibe values from data or defaults
  const [vibeValues, setVibeValues] = useState(() => {
    const initial = {};
    VIBE_DIMENSIONS.forEach((dim) => {
      initial[dim.id] = data[dim.id] ?? dim.defaultValue;
    });
    return initial;
  });

  const [hasChanges, setHasChanges] = useState(false);

  /**
   * Update a vibe value
   */
  const handleVibeChange = useCallback((id, value) => {
    setVibeValues((prev) => ({
      ...prev,
      [id]: parseInt(value, 10),
    }));
    setHasChanges(true);
  }, []);

  /**
   * Reset all values to defaults
   */
  const handleReset = useCallback(() => {
    const defaults = {};
    VIBE_DIMENSIONS.forEach((dim) => {
      defaults[dim.id] = dim.defaultValue;
    });
    setVibeValues(defaults);
    setHasChanges(true);
  }, []);

  /**
   * Handle save
   */
  const handleSave = useCallback(async () => {
    // Check if any value differs from default (indicates user made a choice)
    const hasCustomization = VIBE_DIMENSIONS.some(
      (dim) => vibeValues[dim.id] !== dim.defaultValue
    );

    const newStatus = hasCustomization ? 'complete' : 'in_progress';

    console.log('[VibeEditor] Saving:', { vibeValues, status: newStatus });

    try {
      await onSave(vibeValues, newStatus);
      setHasChanges(false);
    } catch (err) {
      console.error('[VibeEditor] Save failed:', err);
    }
  }, [vibeValues, onSave]);

  /**
   * Calculate vibe summary for preview
   */
  const getVibeSummary = useCallback(() => {
    const traits = [];

    if (vibeValues.warmth < 35) traits.push('warm');
    else if (vibeValues.warmth > 65) traits.push('professional');

    if (vibeValues.formality < 35) traits.push('casual');
    else if (vibeValues.formality > 65) traits.push('authoritative');

    if (vibeValues.energy < 35) traits.push('calm');
    else if (vibeValues.energy > 65) traits.push('energetic');

    if (vibeValues.approach < 35) traits.push('direct');
    else if (vibeValues.approach > 65) traits.push('nurturing');

    if (traits.length === 0) return 'Balanced & versatile';
    return traits.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' + ');
  }, [vibeValues]);

  return (
    <div className={styles.container}>
      {/* Info banner */}
      <div className={styles.infoBanner}>
        <Info className={styles.infoIcon} />
        <p>
          Move each slider to define your brand's voice. There are no wrong answers -
          this helps us match content to your authentic style.
        </p>
      </div>

      {/* Vibe summary */}
      <div className={styles.vibeSummary}>
        <span className={styles.summaryLabel}>Your Vibe:</span>
        <span className={styles.summaryValue}>{getVibeSummary()}</span>
      </div>

      {/* Sliders */}
      <div className={styles.sliders}>
        {VIBE_DIMENSIONS.map((dimension) => (
          <div key={dimension.id} className={styles.sliderGroup}>
            {/* Slider header */}
            <div className={styles.sliderHeader}>
              <span className={styles.sliderLabel}>{dimension.label}</span>
              <span className={styles.sliderValue}>
                {getVibeInterpretation(dimension.id, vibeValues[dimension.id])}
              </span>
            </div>

            {/* Slider with endpoints */}
            <div className={styles.sliderRow}>
              <span className={styles.endpoint}>{dimension.leftEnd}</span>

              <div className={styles.sliderWrapper}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={vibeValues[dimension.id]}
                  onChange={(e) => handleVibeChange(dimension.id, e.target.value)}
                  className={styles.slider}
                  aria-label={dimension.label}
                />
                {/* Visual indicator for center */}
                <div className={styles.sliderCenter} />
              </div>

              <span className={styles.endpoint}>{dimension.rightEnd}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Archetype hint */}
      <div className={styles.archetypeHint}>
        <p>
          These settings will influence your brand archetype and how content is
          adapted for different platforms.
        </p>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <Button variant="ghost" onClick={handleReset} leftIcon={RotateCcw}>
          Reset to Defaults
        </Button>

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
            Save Vibe
          </Button>
        </div>
      </div>
    </div>
  );
}

export default VibeEditor;
