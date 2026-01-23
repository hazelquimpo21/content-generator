/**
 * ============================================================================
 * BRAND MAGIC EXPLAINER
 * ============================================================================
 * An educational component that explains how the Brand Identity system works.
 * Helps users understand how their inputs translate into personalized content.
 *
 * Can be shown as:
 * - Inline explainer (compact)
 * - Full onboarding card (expanded)
 * - Modal tooltip
 * ============================================================================
 */

import { useState } from 'react';
import {
  Sparkles,
  User,
  Sliders,
  Heart,
  Target,
  FileText,
  Wand2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Zap,
  Palette
} from 'lucide-react';
import styles from './BrandMagicExplainer.module.css';

// ============================================================================
// HOW IT WORKS STEPS
// ============================================================================

const HOW_IT_WORKS_STEPS = [
  {
    icon: User,
    title: 'You Tell Us About You',
    description: 'Share your credentials, who you serve, and what makes you unique.',
    color: 'blue'
  },
  {
    icon: Sliders,
    title: 'You Set Your Vibe',
    description: 'Adjust sliders to define your tone — from clinical to relatable, formal to casual.',
    color: 'purple'
  },
  {
    icon: Heart,
    title: 'You Choose Your Values',
    description: 'Select the core beliefs that guide your work and resonate with your audience.',
    color: 'pink'
  },
  {
    icon: Wand2,
    title: 'We Generate Your DNA',
    description: 'Our AI combines everything into a unique "Brand DNA" that captures your voice.',
    color: 'gold'
  }
];

// ============================================================================
// WHAT YOU GET
// ============================================================================

const WHAT_YOU_GET = [
  {
    icon: FileText,
    title: 'Blog posts that sound like you',
    description: 'Not generic AI content — writing that reflects your expertise and personality.'
  },
  {
    icon: Target,
    title: 'Content that speaks to your audience',
    description: 'Messaging calibrated for the specific people you want to reach.'
  },
  {
    icon: Palette,
    title: 'Consistent brand voice',
    description: 'Every piece of content feels cohesive, building trust with your audience.'
  }
];

// ============================================================================
// QUICK TIPS
// ============================================================================

const QUICK_TIPS = [
  {
    emoji: '🎯',
    tip: 'Be specific about who you serve. "Anxious high-achievers in tech" is better than "people with anxiety".'
  },
  {
    emoji: '🎨',
    tip: 'Your Vibe sliders have the biggest impact. Move them to the extremes if you have a strong voice.'
  },
  {
    emoji: '💡',
    tip: 'Don\'t overthink it! You can always adjust your settings later as you see the content.'
  }
];

// ============================================================================
// COMPACT EXPLAINER
// ============================================================================

function CompactExplainer({ expanded, onToggle }) {
  return (
    <div className={styles.compact}>
      <button
        type="button"
        className={styles.compactHeader}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className={styles.compactLeft}>
          <Sparkles className={styles.compactIcon} />
          <span className={styles.compactTitle}>How Brand Magic Works</span>
        </div>
        {expanded ? (
          <ChevronUp className={styles.compactChevron} />
        ) : (
          <ChevronDown className={styles.compactChevron} />
        )}
      </button>

      {expanded && (
        <div className={styles.compactContent}>
          <p className={styles.compactIntro}>
            Your Brand Identity is like a recipe for your content. We combine your profile,
            vibe, and values to create content that sounds authentically like you.
          </p>

          <div className={styles.compactSteps}>
            {HOW_IT_WORKS_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className={styles.compactStep}>
                  <div className={`${styles.compactStepIcon} ${styles[step.color]}`}>
                    <Icon />
                  </div>
                  <div className={styles.compactStepContent}>
                    <strong>{step.title}</strong>
                    <span>{step.description}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.compactTip}>
            <Lightbulb className={styles.tipIcon} />
            <p>
              <strong>Pro tip:</strong> The more specific you are about your audience and values,
              the more personalized your content will be.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FULL EXPLAINER (for onboarding)
// ============================================================================

function FullExplainer({ onContinue }) {
  return (
    <div className={styles.full}>
      <div className={styles.fullHeader}>
        <div className={styles.fullIconWrapper}>
          <Sparkles className={styles.fullIcon} />
        </div>
        <h2 className={styles.fullTitle}>How Brand Magic Works</h2>
        <p className={styles.fullSubtitle}>
          In a few minutes, you'll create a unique Brand DNA that makes all your content
          sound authentically like you.
        </p>
      </div>

      <div className={styles.stepsContainer}>
        {HOW_IT_WORKS_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === HOW_IT_WORKS_STEPS.length - 1;

          return (
            <div key={step.title} className={styles.stepCard}>
              <div className={styles.stepNumber}>{index + 1}</div>
              <div className={`${styles.stepIconWrapper} ${styles[step.color]}`}>
                <Icon className={styles.stepIcon} />
              </div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDescription}>{step.description}</p>
              {!isLast && (
                <div className={styles.stepArrow}>
                  <ArrowRight />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.whatYouGet}>
        <h3 className={styles.sectionTitle}>
          <Zap className={styles.sectionIcon} />
          What You Get
        </h3>
        <div className={styles.benefitsList}>
          {WHAT_YOU_GET.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div key={benefit.title} className={styles.benefitItem}>
                <Icon className={styles.benefitIcon} />
                <div>
                  <strong>{benefit.title}</strong>
                  <p>{benefit.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.tipsSection}>
        <h3 className={styles.sectionTitle}>
          <Lightbulb className={styles.sectionIcon} />
          Quick Tips
        </h3>
        <div className={styles.tipsList}>
          {QUICK_TIPS.map((tip, index) => (
            <div key={index} className={styles.tipItem}>
              <span className={styles.tipEmoji}>{tip.emoji}</span>
              <p>{tip.tip}</p>
            </div>
          ))}
        </div>
      </div>

      {onContinue && (
        <div className={styles.fullActions}>
          <button
            type="button"
            className={styles.continueButton}
            onClick={onContinue}
          >
            <span>Got it, let's start</span>
            <ArrowRight className={styles.continueArrow} />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MINI TOOLTIP VERSION
// ============================================================================

function MiniExplainer() {
  return (
    <div className={styles.mini}>
      <div className={styles.miniHeader}>
        <Sparkles className={styles.miniIcon} />
        <span>Brand Magic</span>
      </div>
      <p className={styles.miniText}>
        We combine your profile, vibe, and values to create content that sounds like you wrote it yourself.
      </p>
      <div className={styles.miniSteps}>
        <span>Profile</span>
        <ArrowRight className={styles.miniArrow} />
        <span>Vibe</span>
        <ArrowRight className={styles.miniArrow} />
        <span>Values</span>
        <ArrowRight className={styles.miniArrow} />
        <span className={styles.miniHighlight}>Your Content</span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

function BrandMagicExplainer({ variant = 'compact', onContinue }) {
  const [expanded, setExpanded] = useState(false);

  if (variant === 'full') {
    return <FullExplainer onContinue={onContinue} />;
  }

  if (variant === 'mini') {
    return <MiniExplainer />;
  }

  // Default: compact with expandable content
  return (
    <CompactExplainer
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
    />
  );
}

export default BrandMagicExplainer;
