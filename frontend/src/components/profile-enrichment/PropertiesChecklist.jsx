/**
 * ============================================================================
 * PROPERTIES CHECKLIST COMPONENT
 * ============================================================================
 * Step in onboarding that asks users what properties they have
 * (website, podcast, newsletter, bio text).
 * Determines which import options to show in the next step.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { Globe, Mic, Mail, FileText, Check } from 'lucide-react';
import { Button } from '@components/shared';
import styles from './PropertiesChecklist.module.css';

// Property options with icons
const PROPERTIES = [
  {
    id: 'website',
    label: 'Practice/Business Website',
    description: 'A website with your bio, services, or about page',
    icon: Globe,
  },
  {
    id: 'podcast',
    label: 'Podcast',
    description: 'A podcast you host or co-host',
    icon: Mic,
  },
  {
    id: 'newsletter',
    label: 'Newsletter/Substack',
    description: 'An email newsletter or publication',
    icon: Mail,
  },
  {
    id: 'bio',
    label: 'Existing bio or about text',
    description: 'Text you can paste from your existing bio',
    icon: FileText,
  },
];

/**
 * Properties Checklist component for onboarding
 *
 * @param {Object} props
 * @param {Object} props.data - Current properties data { has_website, has_podcast, etc. }
 * @param {Function} props.onSave - Called when user continues (data, status)
 * @param {Function} props.onSkip - Called when user skips this step
 * @param {boolean} props.saving - Loading state
 */
function PropertiesChecklist({ data = {}, onSave, onSkip, saving }) {
  const [selected, setSelected] = useState({
    website: data.has_website || false,
    podcast: data.has_podcast || false,
    newsletter: data.has_newsletter || false,
    bio: data.has_bio || false,
  });

  // Update local state when data prop changes
  useEffect(() => {
    if (data) {
      setSelected({
        website: data.has_website || false,
        podcast: data.has_podcast || false,
        newsletter: data.has_newsletter || false,
        bio: data.has_bio || false,
      });
    }
  }, [data]);

  const handleToggle = (id) => {
    setSelected((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const hasAnySelected = Object.values(selected).some(Boolean);

  const handleContinue = () => {
    const profileData = {
      properties: {
        has_website: selected.website,
        has_podcast: selected.podcast,
        has_newsletter: selected.newsletter,
        has_bio: selected.bio,
      },
    };

    // Mark as partial if any selected (they'll complete more in next steps)
    // Mark as complete if none selected (they're done with this step)
    const status = hasAnySelected ? 'partial' : 'complete';
    onSave(profileData, status);
  };

  const handleNoneOfThese = () => {
    const profileData = {
      properties: {
        has_website: false,
        has_podcast: false,
        has_newsletter: false,
        has_bio: false,
      },
    };
    onSave(profileData, 'partial');
  };

  return (
    <div className={styles.container}>
      <div className={styles.checklistGrid}>
        {PROPERTIES.map((property) => {
          const Icon = property.icon;
          const isSelected = selected[property.id];

          return (
            <button
              key={property.id}
              type="button"
              className={`${styles.propertyCard} ${isSelected ? styles.selected : ''}`}
              onClick={() => handleToggle(property.id)}
              aria-pressed={isSelected}
            >
              <div className={styles.cardContent}>
                <div className={styles.iconWrapper}>
                  <Icon className={styles.icon} />
                </div>
                <div className={styles.textContent}>
                  <span className={styles.label}>{property.label}</span>
                  <span className={styles.description}>{property.description}</span>
                </div>
                <div className={styles.checkbox}>
                  {isSelected && <Check className={styles.checkIcon} />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className={styles.actions}>
        <Button variant="ghost" onClick={handleNoneOfThese} disabled={saving}>
          I don't have any of these
        </Button>
        <Button variant="primary" onClick={handleContinue} loading={saving}>
          {hasAnySelected ? 'Continue' : 'Skip to Profile'}
        </Button>
      </div>

      <p className={styles.hint}>
        {hasAnySelected
          ? "We'll help you import content from these in the next step"
          : 'No worries! You can build your profile from scratch'}
      </p>
    </div>
  );
}

export default PropertiesChecklist;
