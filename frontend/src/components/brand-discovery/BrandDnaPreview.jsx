/**
 * ============================================================================
 * BRAND DNA PREVIEW COMPONENT
 * ============================================================================
 * Displays the synthesized Brand DNA after modules are completed.
 * Shows key elements: brand promise, voice characteristics, archetypes,
 * anti-patterns, and content pillars.
 *
 * This preview helps users understand how their brand identity will
 * influence content generation across all platforms.
 * ============================================================================
 */

import { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Quote,
  Volume2,
  AlertTriangle,
  Layers,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@components/shared';
import styles from './BrandDnaPreview.module.css';

/**
 * Format a date for display
 *
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * BrandDnaPreview - Displays synthesized Brand DNA
 *
 * @param {Object} props - Component props
 * @param {Object} props.brandDna - The synthesized Brand DNA object
 * @param {string} props.generatedAt - When the Brand DNA was generated
 * @param {Function} props.onRegenerate - Callback to regenerate Brand DNA
 * @param {boolean} props.regenerating - Whether regeneration is in progress
 * @returns {JSX.Element}
 */
function BrandDnaPreview({
  brandDna,
  generatedAt,
  onRegenerate,
  regenerating = false,
}) {
  const [expanded, setExpanded] = useState(true);

  if (!brandDna) {
    return null;
  }

  const {
    brand_promise,
    voice_characteristics,
    archetypes,
    anti_patterns,
    content_pillars,
    platform_adaptations,
  } = brandDna;

  return (
    <div className={styles.container}>
      {/* Header */}
      <button
        className={styles.header}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className={styles.headerLeft}>
          <Sparkles className={styles.headerIcon} />
          <div className={styles.headerText}>
            <h3 className={styles.headerTitle}>Your Brand DNA</h3>
            {generatedAt && (
              <p className={styles.headerMeta}>
                Generated {formatDate(generatedAt)}
              </p>
            )}
          </div>
        </div>

        <div className={styles.headerRight}>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={RefreshCw}
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate();
            }}
            loading={regenerating}
            className={styles.regenerateButton}
          >
            Regenerate
          </Button>
          {expanded ? (
            <ChevronUp className={styles.chevron} />
          ) : (
            <ChevronDown className={styles.chevron} />
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className={styles.content}>
          {/* Brand Promise */}
          {brand_promise && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <Quote className={styles.sectionIcon} />
                <h4 className={styles.sectionTitle}>Brand Promise</h4>
              </div>
              <blockquote className={styles.brandPromise}>
                {brand_promise}
              </blockquote>
            </section>
          )}

          {/* Archetypes */}
          {archetypes && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <Users className={styles.sectionIcon} />
                <h4 className={styles.sectionTitle}>Brand Archetypes</h4>
              </div>
              <div className={styles.archetypes}>
                {archetypes.primary && (
                  <div className={clsx(styles.archetype, styles.primary)}>
                    <span className={styles.archetypeLabel}>Primary</span>
                    <span className={styles.archetypeName}>{archetypes.primary}</span>
                  </div>
                )}
                {archetypes.secondary && (
                  <div className={clsx(styles.archetype, styles.secondary)}>
                    <span className={styles.archetypeLabel}>Secondary</span>
                    <span className={styles.archetypeName}>{archetypes.secondary}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Voice Characteristics */}
          {voice_characteristics && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <Volume2 className={styles.sectionIcon} />
                <h4 className={styles.sectionTitle}>Voice Characteristics</h4>
              </div>
              <div className={styles.voiceGrid}>
                {voice_characteristics.tone && (
                  <div className={styles.voiceItem}>
                    <span className={styles.voiceLabel}>Tone</span>
                    <div className={styles.tags}>
                      {voice_characteristics.tone.map((t, i) => (
                        <span key={i} className={styles.tag}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {voice_characteristics.language && (
                  <div className={styles.voiceItem}>
                    <span className={styles.voiceLabel}>Language</span>
                    <div className={styles.tags}>
                      {voice_characteristics.language.map((l, i) => (
                        <span key={i} className={styles.tag}>{l}</span>
                      ))}
                    </div>
                  </div>
                )}
                {voice_characteristics.personality && (
                  <div className={styles.voiceItem}>
                    <span className={styles.voiceLabel}>Personality</span>
                    <div className={styles.tags}>
                      {voice_characteristics.personality.map((p, i) => (
                        <span key={i} className={styles.tag}>{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Content Pillars */}
          {content_pillars && content_pillars.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <Layers className={styles.sectionIcon} />
                <h4 className={styles.sectionTitle}>Suggested Content Pillars</h4>
              </div>
              <div className={styles.pillars}>
                {content_pillars.map((pillar, index) => (
                  <div key={index} className={styles.pillar}>
                    <span className={styles.pillarName}>{pillar.name}</span>
                    {pillar.description && (
                      <span className={styles.pillarDescription}>
                        {pillar.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Anti-Patterns */}
          {anti_patterns && anti_patterns.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <AlertTriangle className={styles.sectionIcon} />
                <h4 className={styles.sectionTitle}>What to Avoid</h4>
              </div>
              <ul className={styles.antiPatterns}>
                {anti_patterns.map((pattern, index) => (
                  <li key={index} className={styles.antiPattern}>
                    {pattern}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Platform Adaptations Summary */}
          {platform_adaptations && Object.keys(platform_adaptations).length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <Sparkles className={styles.sectionIcon} />
                <h4 className={styles.sectionTitle}>Platform Adaptations</h4>
              </div>
              <p className={styles.platformNote}>
                Your Brand DNA will be adapted for {Object.keys(platform_adaptations).length} platforms
                based on your channel priorities. Each platform will receive tailored content
                that maintains your voice while respecting platform norms.
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default BrandDnaPreview;
