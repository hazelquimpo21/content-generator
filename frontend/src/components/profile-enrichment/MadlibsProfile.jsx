/**
 * ============================================================================
 * MADLIBS PROFILE COMPONENT
 * ============================================================================
 * Interactive fill-in-the-blanks profile builder for therapists and coaches.
 * Allows users to build their profile through guided prompts with word banks.
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { Save, ChevronDown, X, Plus } from 'lucide-react';
import { Button, Input } from '@components/shared';
import styles from './MadlibsProfile.module.css';

/**
 * WordBankSelector - Dropdown for selecting from word bank options
 */
function WordBankSelector({
  options,
  selected,
  onSelect,
  onCustomAdd,
  placeholder,
  multiple = false,
  maxSelections = 3,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const containerRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (value) => {
    if (multiple) {
      const currentSelected = Array.isArray(selected) ? selected : [];
      if (currentSelected.includes(value)) {
        onSelect(currentSelected.filter((v) => v !== value));
      } else if (currentSelected.length < maxSelections) {
        onSelect([...currentSelected, value]);
      }
    } else {
      onSelect(value);
      setIsOpen(false);
    }
  };

  const handleAddCustom = () => {
    if (customValue.trim()) {
      if (multiple) {
        const currentSelected = Array.isArray(selected) ? selected : [];
        if (currentSelected.length < maxSelections) {
          onSelect([...currentSelected, customValue.trim()]);
        }
      } else {
        onSelect(customValue.trim());
        setIsOpen(false);
      }
      setCustomValue('');
    }
  };

  const handleRemove = (value) => {
    if (multiple) {
      onSelect((Array.isArray(selected) ? selected : []).filter((v) => v !== value));
    } else {
      onSelect('');
    }
  };

  const displayValue = multiple
    ? Array.isArray(selected) && selected.length > 0
      ? selected.join(', ')
      : placeholder
    : selected || placeholder;

  const isSelected = (value) =>
    multiple
      ? Array.isArray(selected) && selected.includes(value)
      : selected === value;

  return (
    <div className={styles.selectorContainer} ref={containerRef}>
      <button
        type="button"
        className={`${styles.selectorTrigger} ${selected && (multiple ? selected.length > 0 : true) ? styles.filled : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={styles.selectorValue}>{displayValue}</span>
        <ChevronDown
          className={`${styles.selectorIcon} ${isOpen ? styles.open : ''}`}
        />
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownOptions}>
            {options.map((option) => (
              <button
                key={option.id || option.label}
                type="button"
                className={`${styles.option} ${isSelected(option.label) ? styles.selectedOption : ''}`}
                onClick={() => handleSelect(option.label)}
              >
                <span>{option.label}</span>
                {option.description && (
                  <span className={styles.optionDescription}>
                    {option.description}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className={styles.customInput}>
            <input
              type="text"
              placeholder="Add your own..."
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustom();
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddCustom}
              disabled={!customValue.trim()}
            >
              <Plus className={styles.addIcon} />
            </button>
          </div>
        </div>
      )}

      {/* Selected items as tags (for multiple selection) */}
      {multiple && Array.isArray(selected) && selected.length > 0 && (
        <div className={styles.selectedTags}>
          {selected.map((item) => (
            <span key={item} className={styles.tag}>
              {item}
              <button type="button" onClick={() => handleRemove(item)}>
                <X className={styles.tagRemove} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * MadlibsProfile - Main component
 */
function MadlibsProfile({ data = {}, referenceData = {}, onSave, saving, enrichedData = {} }) {
  // Initialize state from data prop, with enrichedData as fallback
  const [profile, setProfile] = useState({
    // Identity
    name: data.name || enrichedData.name?.value || '',
    credentials: data.credentials || enrichedData.credentials?.value || '',
    business_name: data.business_name || enrichedData.business_name?.value || '',

    // Location
    location: data.location || enrichedData.location?.value || '',
    client_locations: data.client_locations || [],
    service_scope: data.service_scope || 'nationwide',

    // Properties
    podcast_name: data.podcast_name || enrichedData.podcast_name?.value || '',
    newsletter_name: data.newsletter_name || enrichedData.newsletter_name?.value || '',

    // Business model
    primary_revenue: data.primary_revenue || enrichedData.primary_revenue?.value || '',
    secondary_revenue: data.secondary_revenue || enrichedData.secondary_revenue?.value || [],

    // Clients
    client_types: data.client_types || enrichedData.client_types?.value || [],
    client_subcultures: data.client_subcultures || [],
    client_problems: data.client_problems || enrichedData.client_problems?.value || [],
    differentiator: data.differentiator || enrichedData.differentiator?.value || '',
  });

  // Update when data changes
  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setProfile((prev) => ({
        ...prev,
        ...data,
      }));
    }
  }, [data]);

  const updateField = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    // Calculate if profile is complete enough
    const hasRequiredFields = profile.name && profile.primary_revenue;
    const status = hasRequiredFields ? 'complete' : 'partial';
    onSave(profile, status);
  };

  // Get word banks from reference data
  const wordBanks = referenceData.wordBanks || {};

  return (
    <div className={styles.container}>
      {/* Section 1: Who You Are */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Who You Are</h3>
        <div className={styles.madlibsText}>
          <span>I'm </span>
          <input
            type="text"
            className={styles.inlineInput}
            placeholder="your name"
            value={profile.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
          <span> and my credentials are </span>
          <input
            type="text"
            className={styles.inlineInput}
            placeholder="PhD, LMFT, etc."
            value={profile.credentials}
            onChange={(e) => updateField('credentials', e.target.value)}
          />
          <span>. My business name is </span>
          <input
            type="text"
            className={`${styles.inlineInput} ${styles.wide}`}
            placeholder="your practice name"
            value={profile.business_name}
            onChange={(e) => updateField('business_name', e.target.value)}
          />
          <span>.</span>
        </div>
      </div>

      {/* Section 2: Where You Work */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Where You Work</h3>
        <div className={styles.madlibsText}>
          <span>I'm based in </span>
          <input
            type="text"
            className={styles.inlineInput}
            placeholder="City, State"
            value={profile.location}
            onChange={(e) => updateField('location', e.target.value)}
          />
          <span> and I serve clients </span>
          <WordBankSelector
            options={wordBanks.serviceScopes || []}
            selected={profile.service_scope}
            onSelect={(value) => updateField('service_scope', value)}
            placeholder="service area"
          />
          <span>.</span>
        </div>
      </div>

      {/* Section 3: Your Properties (conditional) */}
      {(data.properties?.has_podcast || data.properties?.has_newsletter) && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Your Properties</h3>
          <div className={styles.madlibsText}>
            {data.properties?.has_podcast && (
              <>
                <span>My podcast is called </span>
                <input
                  type="text"
                  className={`${styles.inlineInput} ${styles.wide}`}
                  placeholder="podcast name"
                  value={profile.podcast_name}
                  onChange={(e) => updateField('podcast_name', e.target.value)}
                />
                <span>. </span>
              </>
            )}
            {data.properties?.has_newsletter && (
              <>
                <span>My newsletter is </span>
                <input
                  type="text"
                  className={`${styles.inlineInput} ${styles.wide}`}
                  placeholder="newsletter name"
                  value={profile.newsletter_name}
                  onChange={(e) => updateField('newsletter_name', e.target.value)}
                />
                <span>.</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Section 4: Business Model */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Your Business Model</h3>
        <div className={styles.madlibsText}>
          <span>My main revenue stream is </span>
          <WordBankSelector
            options={wordBanks.revenueTypes || []}
            selected={profile.primary_revenue}
            onSelect={(value) => updateField('primary_revenue', value)}
            placeholder="primary revenue"
          />
          <span>. I also make money from </span>
          <WordBankSelector
            options={wordBanks.revenueTypes || []}
            selected={profile.secondary_revenue}
            onSelect={(value) => updateField('secondary_revenue', value)}
            placeholder="other revenue streams"
            multiple
            maxSelections={3}
          />
          <span>.</span>
        </div>
      </div>

      {/* Section 5: Your Clients */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Your Clients</h3>
        <div className={styles.madlibsText}>
          <span>My clients are typically </span>
          <WordBankSelector
            options={wordBanks.clientTypes || []}
            selected={profile.client_types}
            onSelect={(value) => updateField('client_types', value)}
            placeholder="client types"
            multiple
            maxSelections={4}
          />
          <span>.</span>
        </div>

        <div className={styles.madlibsText}>
          <span>They're sometimes part of these communities: </span>
          <WordBankSelector
            options={wordBanks.subcultures || []}
            selected={profile.client_subcultures}
            onSelect={(value) => updateField('client_subcultures', value)}
            placeholder="communities/subcultures"
            multiple
            maxSelections={3}
          />
          <span>.</span>
        </div>

        <div className={styles.madlibsText}>
          <span>They come to me because they're trying to </span>
          <WordBankSelector
            options={wordBanks.clientProblems || []}
            selected={profile.client_problems}
            onSelect={(value) => updateField('client_problems', value)}
            placeholder="problems to solve"
            multiple
            maxSelections={3}
          />
          <span>.</span>
        </div>

        <div className={styles.madlibsText}>
          <span>They choose me over others because </span>
          <input
            type="text"
            className={`${styles.inlineInput} ${styles.extraWide}`}
            placeholder="what makes you unique"
            value={profile.differentiator}
            onChange={(e) => updateField('differentiator', e.target.value)}
          />
          <span>.</span>
        </div>
      </div>

      {/* Save button */}
      <div className={styles.actions}>
        <Button
          variant="primary"
          leftIcon={Save}
          onClick={handleSave}
          loading={saving}
        >
          Save & Continue
        </Button>
      </div>
    </div>
  );
}

export default MadlibsProfile;
