/**
 * ============================================================================
 * VOICE STYLE EDITOR
 * ============================================================================
 * Editor for the Voice Style module - allows users to define their content
 * voice through "This, Not That" statement selection.
 *
 * Flow:
 *   1. Browse voice style cards showing "This, not That" statements
 *   2. Select 5 statements that resonate with your voice
 *   3. Review and save your voice style guidelines
 *
 * These selections directly influence AI content generation prompts.
 * ============================================================================
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Save,
  Check,
  MessageSquare,
  Sparkles,
  Info,
  RotateCcw,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@components/shared';
import styles from './VoiceStyleEditor.module.css';

// Required number of selections
const REQUIRED_SELECTIONS = 5;

// Voice style "This, Not That" statements
// These show nuance - different expressions of similar qualities, not opposites
const VOICE_STYLE_STATEMENTS = [
  {
    id: 'smart_not_know_it_all',
    thisLabel: 'Smart & helpful',
    notThatLabel: 'know-it-all',
    description: 'Share expertise generously while staying humble and open',
    example: '"Here\'s what I\'ve found works..." vs "Actually, the right way is..."',
    category: 'Expertise',
  },
  {
    id: 'confident_not_arrogant',
    thisLabel: 'Confident',
    notThatLabel: 'arrogant',
    description: 'Own your knowledge without dismissing other perspectives',
    example: '"In my experience..." vs "Anyone who disagrees is wrong"',
    category: 'Presence',
  },
  {
    id: 'warm_not_unprofessional',
    thisLabel: 'Warm & friendly',
    notThatLabel: 'unprofessional',
    description: 'Create genuine connection while maintaining appropriate boundaries',
    example: '"I hear you, that\'s really hard" vs "OMG same, my ex was the worst too"',
    category: 'Connection',
  },
  {
    id: 'honest_not_brutal',
    thisLabel: 'Honest',
    notThatLabel: 'brutal',
    description: 'Tell the truth with care, not as a weapon',
    example: '"This might be uncomfortable to hear..." vs "Here\'s your wake-up call"',
    category: 'Truth',
  },
  {
    id: 'direct_not_abrasive',
    thisLabel: 'Direct & clear',
    notThatLabel: 'abrasive',
    description: 'Get to the point without steamrolling',
    example: '"Let\'s talk about what\'s really going on" vs "Stop making excuses"',
    category: 'Communication',
  },
  {
    id: 'supportive_not_coddling',
    thisLabel: 'Supportive',
    notThatLabel: 'coddling',
    description: 'Encourage growth without creating dependency',
    example: '"You can do hard things" vs "Poor thing, don\'t push yourself"',
    category: 'Support',
  },
  {
    id: 'knowledgeable_not_jargony',
    thisLabel: 'Knowledgeable',
    notThatLabel: 'jargon-heavy',
    description: 'Share expertise in accessible language anyone can understand',
    example: '"When we feel stuck in loops..." vs "Rumination is a cognitive distortion that..."',
    category: 'Language',
  },
  {
    id: 'relatable_not_oversharing',
    thisLabel: 'Relatable',
    notThatLabel: 'oversharing',
    description: 'Connect through shared humanity without making it about you',
    example: '"I\'ve been there too" vs "Let me tell you about my trauma..."',
    category: 'Boundaries',
  },
  {
    id: 'passionate_not_preachy',
    thisLabel: 'Passionate',
    notThatLabel: 'preachy',
    description: 'Care deeply without lecturing or moralizing',
    example: '"This matters so much because..." vs "Everyone needs to understand that..."',
    category: 'Energy',
  },
  {
    id: 'encouraging_not_cheerleader',
    thisLabel: 'Encouraging',
    notThatLabel: 'cheerleader-y',
    description: 'Offer genuine support without toxic positivity',
    example: '"Progress isn\'t always linear, and that\'s okay" vs "You\'ve got this!! So amazing!!"',
    category: 'Support',
  },
  {
    id: 'thoughtful_not_wishy_washy',
    thisLabel: 'Thoughtful',
    notThatLabel: 'wishy-washy',
    description: 'Acknowledge nuance while still taking a clear stance',
    example: '"It depends, but here\'s how to think about it..." vs "Well, it could go either way..."',
    category: 'Clarity',
  },
  {
    id: 'curious_not_interrogating',
    thisLabel: 'Curious',
    notThatLabel: 'interrogating',
    description: 'Ask questions that invite reflection, not defensiveness',
    example: '"What do you notice when that happens?" vs "Why do you keep doing that?"',
    category: 'Approach',
  },
  {
    id: 'empathetic_not_pitying',
    thisLabel: 'Empathetic',
    notThatLabel: 'pitying',
    description: 'Understand struggles without treating people as fragile',
    example: '"That sounds really challenging" vs "Oh you poor thing"',
    category: 'Connection',
  },
  {
    id: 'authentic_not_performative',
    thisLabel: 'Authentic',
    notThatLabel: 'performatively vulnerable',
    description: 'Be genuine without using vulnerability as a marketing tactic',
    example: '"I struggled with this too" vs "I\'m crying as I write this post..."',
    category: 'Authenticity',
  },
  {
    id: 'grounded_not_boring',
    thisLabel: 'Grounded & practical',
    notThatLabel: 'boring',
    description: 'Offer real, actionable advice with personality',
    example: '"Here\'s a simple trick that actually works" vs "Step 1: breathe. Step 2: breathe again."',
    category: 'Substance',
  },
];

/**
 * VoiceStyleEditor - Select "This, Not That" voice guidelines
 *
 * @param {Object} props - Component props
 * @param {Object} props.data - Current module data
 * @param {Function} props.onSave - Save callback
 * @param {Function} props.onClose - Close callback
 * @param {boolean} props.saving - Whether save is in progress
 * @returns {JSX.Element}
 */
function VoiceStyleEditor({ data = {}, onSave, onClose, saving }) {
  // State
  const [selectedStatements, setSelectedStatements] = useState(
    data.selected_statements || []
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Derived state
  const selectionCount = selectedStatements.length;
  const isComplete = selectionCount >= REQUIRED_SELECTIONS;
  const canSelectMore = selectionCount < REQUIRED_SELECTIONS;

  /**
   * Toggle statement selection
   */
  const toggleStatement = useCallback((statementId) => {
    setSelectedStatements((prev) => {
      if (prev.includes(statementId)) {
        // Remove
        return prev.filter((id) => id !== statementId);
      }
      // Add (if not at max)
      if (prev.length >= REQUIRED_SELECTIONS) {
        return prev;
      }
      return [...prev, statementId];
    });
    setHasChanges(true);
  }, []);

  /**
   * Reset selections
   */
  const handleReset = useCallback(() => {
    setSelectedStatements([]);
    setHasChanges(true);
  }, []);

  /**
   * Handle save
   */
  const handleSave = useCallback(async () => {
    // Build the voice style data
    const selectedData = selectedStatements.map((id) => {
      const statement = VOICE_STYLE_STATEMENTS.find((s) => s.id === id);
      return {
        id,
        thisLabel: statement?.thisLabel,
        notThatLabel: statement?.notThatLabel,
      };
    });

    const newStatus = selectionCount >= REQUIRED_SELECTIONS ? 'complete' : 'in_progress';

    console.log('[VoiceStyleEditor] Saving:', {
      selected: selectedStatements.length,
      status: newStatus,
    });

    try {
      await onSave(
        {
          selected_statements: selectedStatements,
          voice_guidelines: selectedData,
        },
        newStatus
      );
      setHasChanges(false);
    } catch (err) {
      console.error('[VoiceStyleEditor] Save failed:', err);
    }
  }, [selectedStatements, selectionCount, onSave]);

  /**
   * Get summary of selected voice styles
   */
  const getVoiceSummary = useMemo(() => {
    if (selectedStatements.length === 0) return null;

    return selectedStatements
      .map((id) => {
        const statement = VOICE_STYLE_STATEMENTS.find((s) => s.id === id);
        return statement ? `${statement.thisLabel}, not ${statement.notThatLabel}` : null;
      })
      .filter(Boolean);
  }, [selectedStatements]);

  return (
    <div className={styles.container}>
      {/* Info banner */}
      <div className={styles.infoBanner}>
        <Info className={styles.infoIcon} />
        <div>
          <p className={styles.infoTitle}>Define Your Voice</p>
          <p className={styles.infoText}>
            Select {REQUIRED_SELECTIONS} statements that describe how you want your content to sound.
            These guide the AI when generating your blog posts, social content, and emails.
          </p>
        </div>
      </div>

      {/* Selection counter */}
      <div className={styles.selectionCounter}>
        <MessageSquare className={styles.counterIcon} />
        <span className={styles.counterText}>
          {selectionCount} of {REQUIRED_SELECTIONS} selected
        </span>
        {isComplete && (
          <span className={styles.completeTag}>
            <Check className={styles.checkIcon} />
            Ready to save
          </span>
        )}
      </div>

      {/* Voice summary (when selections made) */}
      {getVoiceSummary && getVoiceSummary.length > 0 && (
        <div className={styles.voiceSummary}>
          <Sparkles className={styles.summaryIcon} />
          <div className={styles.summaryContent}>
            <span className={styles.summaryLabel}>Your Voice:</span>
            <div className={styles.summaryTags}>
              {getVoiceSummary.map((summary, idx) => (
                <span key={idx} className={styles.summaryTag}>
                  {summary}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Statement cards */}
      <div className={styles.cardsGrid}>
        {VOICE_STYLE_STATEMENTS.map((statement) => {
          const isSelected = selectedStatements.includes(statement.id);
          const isDisabled = !isSelected && !canSelectMore;

          return (
            <button
              key={statement.id}
              type="button"
              className={clsx(
                styles.statementCard,
                isSelected && styles.selected,
                isDisabled && styles.disabled
              )}
              onClick={() => !isDisabled && toggleStatement(statement.id)}
              disabled={isDisabled}
            >
              {/* Selection indicator */}
              {isSelected && (
                <div className={styles.selectedBadge}>
                  <Check className={styles.badgeIcon} />
                </div>
              )}

              {/* This / Not That header */}
              <div className={styles.cardHeader}>
                <span className={styles.thisLabel}>{statement.thisLabel}</span>
                <span className={styles.notThatSeparator}>not</span>
                <span className={styles.notThatLabel}>{statement.notThatLabel}</span>
              </div>

              {/* Description */}
              <p className={styles.cardDescription}>{statement.description}</p>

              {/* Example */}
              <p className={styles.cardExample}>{statement.example}</p>

              {/* Category tag */}
              <span className={styles.categoryTag}>{statement.category}</span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <Button
          variant="ghost"
          onClick={handleReset}
          leftIcon={RotateCcw}
          disabled={selectedStatements.length === 0}
        >
          Reset
        </Button>

        <div className={styles.footerActions}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanges && selectedStatements.length > 0}
            leftIcon={Save}
          >
            {isComplete ? 'Save Voice Style' : `Select ${REQUIRED_SELECTIONS - selectionCount} more`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default VoiceStyleEditor;
