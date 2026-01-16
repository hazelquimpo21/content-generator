/**
 * ============================================================================
 * VALUES EDITOR
 * ============================================================================
 * Editor for the Values module - allows users to discover their core brand
 * values through an interactive card selection exercise.
 *
 * Flow:
 *   1. Selection Phase: Browse all values, select ones that resonate (max 8)
 *   2. Ranking Phase: Rank selected values by importance (drag or click)
 *   3. Review Phase: See final top 5 values with option to add "why" notes
 *
 * Features:
 *   - Visual value cards with descriptions
 *   - Category filtering
 *   - Drag-and-drop ranking
 *   - AI-generated nuance suggestions (optional)
 * ============================================================================
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Save,
  Heart,
  Check,
  ChevronRight,
  ChevronLeft,
  GripVertical,
  Sparkles,
  Filter,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@components/shared';
import styles from './ValuesEditor.module.css';

// Maximum values user can select
const MAX_SELECTED = 8;
const TOP_VALUES_COUNT = 5;

// Editor phases
const PHASES = {
  SELECT: 'select',
  RANK: 'rank',
  REVIEW: 'review',
};

/**
 * ValuesEditor - Discover and rank core values
 *
 * @param {Object} props - Component props
 * @param {Object} props.data - Current module data
 * @param {Object} props.referenceData - Reference data with values deck
 * @param {Function} props.onSave - Save callback
 * @param {Function} props.onClose - Close callback
 * @param {boolean} props.saving - Whether save is in progress
 * @returns {JSX.Element}
 */
function ValuesEditor({ data = {}, referenceData, onSave, onClose, saving }) {
  const valuesDeck = referenceData?.valuesDeck || [];

  // Get unique categories
  const categories = useMemo(() => {
    const cats = [...new Set(valuesDeck.map((v) => v.category))];
    return ['All', ...cats];
  }, [valuesDeck]);

  // State
  const [phase, setPhase] = useState(() => {
    // Start at review if already complete, otherwise select
    if (data.ranked?.length >= TOP_VALUES_COUNT) return PHASES.REVIEW;
    if (data.selected?.length > 0) return PHASES.RANK;
    return PHASES.SELECT;
  });

  const [selectedValues, setSelectedValues] = useState(data.selected || []);
  const [rankedValues, setRankedValues] = useState(data.ranked || []);
  const [whyNotes, setWhyNotes] = useState(data.why_notes || {});
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  /**
   * Filter values by category
   */
  const filteredValues = useMemo(() => {
    if (categoryFilter === 'All') return valuesDeck;
    return valuesDeck.filter((v) => v.category === categoryFilter);
  }, [valuesDeck, categoryFilter]);

  /**
   * Toggle value selection
   */
  const toggleValue = useCallback((valueId) => {
    setSelectedValues((prev) => {
      if (prev.includes(valueId)) {
        return prev.filter((id) => id !== valueId);
      }
      if (prev.length >= MAX_SELECTED) {
        return prev; // Already at max
      }
      return [...prev, valueId];
    });
    setHasChanges(true);
  }, []);

  /**
   * Move to ranking phase
   */
  const moveToRanking = useCallback(() => {
    // Initialize ranked values from selection
    setRankedValues(selectedValues.slice(0, MAX_SELECTED));
    setPhase(PHASES.RANK);
  }, [selectedValues]);

  /**
   * Move to review phase
   */
  const moveToReview = useCallback(() => {
    setPhase(PHASES.REVIEW);
  }, []);

  /**
   * Go back to previous phase
   */
  const goBack = useCallback(() => {
    if (phase === PHASES.RANK) setPhase(PHASES.SELECT);
    if (phase === PHASES.REVIEW) setPhase(PHASES.RANK);
  }, [phase]);

  /**
   * Handle drag start
   */
  const handleDragStart = useCallback((e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  /**
   * Handle drag over
   */
  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    setRankedValues((prev) => {
      const newRanked = [...prev];
      const [dragged] = newRanked.splice(draggedIndex, 1);
      newRanked.splice(index, 0, dragged);
      return newRanked;
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
   * Update why note for a value
   */
  const updateWhyNote = useCallback((valueId, note) => {
    setWhyNotes((prev) => ({
      ...prev,
      [valueId]: note,
    }));
    setHasChanges(true);
  }, []);

  /**
   * Handle save
   */
  const handleSave = useCallback(async () => {
    const topValues = rankedValues.slice(0, TOP_VALUES_COUNT);
    const hasSelection = topValues.length >= 3;
    const newStatus = hasSelection ? 'complete' : 'in_progress';

    console.log('[ValuesEditor] Saving:', {
      selected: selectedValues.length,
      ranked: rankedValues.length,
      topValues: topValues.length,
      status: newStatus,
    });

    try {
      await onSave(
        {
          selected: selectedValues,
          ranked: rankedValues,
          top_values: topValues,
          why_notes: whyNotes,
        },
        newStatus
      );
      setHasChanges(false);
    } catch (err) {
      console.error('[ValuesEditor] Save failed:', err);
    }
  }, [selectedValues, rankedValues, whyNotes, onSave]);

  /**
   * Get value details by ID
   */
  const getValueById = useCallback(
    (id) => valuesDeck.find((v) => v.id === id) || { id, label: id, description: '' },
    [valuesDeck]
  );

  /**
   * Render selection phase
   */
  const renderSelectPhase = () => (
    <>
      <p className={styles.phaseIntro}>
        Browse the values below and select up to {MAX_SELECTED} that resonate with
        your brand. Click a card to select it.
      </p>

      {/* Category filter */}
      <div className={styles.filterBar}>
        <Filter className={styles.filterIcon} />
        <div className={styles.filters}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={clsx(
                styles.filterButton,
                categoryFilter === cat && styles.activeFilter
              )}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Selection count */}
      <div className={styles.selectionCount}>
        <Heart className={styles.heartIcon} />
        <span>
          {selectedValues.length} of {MAX_SELECTED} selected
        </span>
      </div>

      {/* Values grid */}
      <div className={styles.valuesGrid}>
        {filteredValues.map((value) => {
          const isSelected = selectedValues.includes(value.id);
          const isDisabled = !isSelected && selectedValues.length >= MAX_SELECTED;

          return (
            <button
              key={value.id}
              className={clsx(
                styles.valueCard,
                isSelected && styles.selected,
                isDisabled && styles.disabled
              )}
              onClick={() => !isDisabled && toggleValue(value.id)}
              disabled={isDisabled}
            >
              {isSelected && (
                <div className={styles.selectedBadge}>
                  <Check className={styles.checkIcon} />
                </div>
              )}
              <h4 className={styles.valueName}>{value.label}</h4>
              <p className={styles.valueDescription}>{value.description}</p>
              <span className={styles.valueCategory}>{value.category}</span>
            </button>
          );
        })}
      </div>

      {/* Next button */}
      <div className={styles.phaseActions}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={moveToRanking}
          disabled={selectedValues.length < 3}
          rightIcon={ChevronRight}
        >
          Rank Your Values ({selectedValues.length})
        </Button>
      </div>
    </>
  );

  /**
   * Render ranking phase
   */
  const renderRankPhase = () => (
    <>
      <p className={styles.phaseIntro}>
        Drag to reorder your values by importance. Your top {TOP_VALUES_COUNT} will
        be used to define your brand personality.
      </p>

      {/* Ranking list */}
      <div className={styles.rankingList}>
        {rankedValues.map((valueId, index) => {
          const value = getValueById(valueId);
          const isTop = index < TOP_VALUES_COUNT;

          return (
            <div
              key={valueId}
              className={clsx(
                styles.rankItem,
                isTop && styles.topRank,
                draggedIndex === index && styles.dragging
              )}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              <GripVertical className={styles.gripIcon} />
              <span className={clsx(styles.rankNumber, isTop && styles.topNumber)}>
                {index + 1}
              </span>
              <div className={styles.rankContent}>
                <span className={styles.rankName}>{value.label}</span>
                <span className={styles.rankDescription}>{value.description}</span>
              </div>
              {isTop && <Sparkles className={styles.topIcon} />}
            </div>
          );
        })}
      </div>

      {/* Phase actions */}
      <div className={styles.phaseActions}>
        <Button variant="ghost" onClick={goBack} leftIcon={ChevronLeft}>
          Back
        </Button>
        <div className={styles.actionGroup}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={moveToReview} rightIcon={ChevronRight}>
            Review Top Values
          </Button>
        </div>
      </div>
    </>
  );

  /**
   * Render review phase
   */
  const renderReviewPhase = () => {
    const topValues = rankedValues.slice(0, TOP_VALUES_COUNT);

    return (
      <>
        <p className={styles.phaseIntro}>
          These are your top {TOP_VALUES_COUNT} brand values. Add optional notes
          about why each value matters to you.
        </p>

        {/* Top values with notes */}
        <div className={styles.reviewList}>
          {topValues.map((valueId, index) => {
            const value = getValueById(valueId);

            return (
              <div key={valueId} className={styles.reviewItem}>
                <div className={styles.reviewHeader}>
                  <span className={styles.reviewRank}>#{index + 1}</span>
                  <h4 className={styles.reviewName}>{value.label}</h4>
                </div>
                <p className={styles.reviewDescription}>{value.description}</p>
                <textarea
                  className={styles.whyTextarea}
                  placeholder={`Why is "${value.label}" important to your brand? (optional)`}
                  value={whyNotes[valueId] || ''}
                  onChange={(e) => updateWhyNote(valueId, e.target.value)}
                  rows={2}
                />
              </div>
            );
          })}
        </div>

        {/* Phase actions */}
        <div className={styles.phaseActions}>
          <Button variant="ghost" onClick={goBack} leftIcon={ChevronLeft}>
            Back to Ranking
          </Button>
          <div className={styles.actionGroup}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!hasChanges && rankedValues.length > 0}
              leftIcon={Save}
            >
              Save Values
            </Button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className={styles.container}>
      {/* Progress indicator */}
      <div className={styles.progressBar}>
        <div
          className={clsx(styles.progressStep, phase === PHASES.SELECT && styles.active)}
        >
          <span className={styles.stepNumber}>1</span>
          <span className={styles.stepLabel}>Select</span>
        </div>
        <div className={styles.progressLine} />
        <div
          className={clsx(styles.progressStep, phase === PHASES.RANK && styles.active)}
        >
          <span className={styles.stepNumber}>2</span>
          <span className={styles.stepLabel}>Rank</span>
        </div>
        <div className={styles.progressLine} />
        <div
          className={clsx(styles.progressStep, phase === PHASES.REVIEW && styles.active)}
        >
          <span className={styles.stepNumber}>3</span>
          <span className={styles.stepLabel}>Review</span>
        </div>
      </div>

      {/* Phase content */}
      {phase === PHASES.SELECT && renderSelectPhase()}
      {phase === PHASES.RANK && renderRankPhase()}
      {phase === PHASES.REVIEW && renderReviewPhase()}
    </div>
  );
}

export default ValuesEditor;
