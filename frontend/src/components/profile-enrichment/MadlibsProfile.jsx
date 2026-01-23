/**
 * ============================================================================
 * MADLIBS PROFILE COMPONENT
 * ============================================================================
 * Interactive fill-in-the-blanks profile builder for therapists and coaches.
 * Allows users to build their profile through guided prompts with word banks.
 * Features click-to-toggle multi-select with visual checkbox indicators.
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Save, ChevronDown, X, Plus, Check, MousePointerClick, Sparkles } from 'lucide-react';
import { Button } from '@components/shared';
import styles from './MadlibsProfile.module.css';

/**
 * WordBankSelector - Click-to-toggle dropdown for selecting from word bank options
 *
 * Features:
 * - Single or multi-select modes
 * - Visual checkbox indicators for multi-select
 * - Selection count badge
 * - Click to toggle (no ctrl/cmd needed)
 * - Custom value input
 */
function WordBankSelector({
  options,
  selected,
  onSelect,
  placeholder,
  multiple = false,
  maxSelections = 5,
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

  // Get current selection as array for multi-select
  const currentSelected = multiple
    ? (Array.isArray(selected) ? selected : [])
    : (selected ? [selected] : []);

  const selectionCount = currentSelected.length;
  const isMaxReached = multiple && selectionCount >= maxSelections;

  const handleSelect = (value) => {
    if (multiple) {
      if (currentSelected.includes(value)) {
        // Deselect - always allowed
        onSelect(currentSelected.filter((v) => v !== value));
      } else if (!isMaxReached) {
        // Select - only if under max
        onSelect([...currentSelected, value]);
      }
    } else {
      onSelect(value);
      setIsOpen(false);
    }
  };

  const handleAddCustom = () => {
    if (customValue.trim()) {
      const trimmedValue = customValue.trim();
      if (multiple) {
        if (!isMaxReached && !currentSelected.includes(trimmedValue)) {
          onSelect([...currentSelected, trimmedValue]);
        }
      } else {
        onSelect(trimmedValue);
        setIsOpen(false);
      }
      setCustomValue('');
    }
  };

  const handleRemove = (value, e) => {
    e?.stopPropagation();
    if (multiple) {
      onSelect(currentSelected.filter((v) => v !== value));
    } else {
      onSelect('');
    }
  };

  const isSelected = (value) => currentSelected.includes(value);

  // Display value for trigger button
  const getDisplayValue = () => {
    if (multiple) {
      if (selectionCount === 0) return placeholder;
      if (selectionCount === 1) return currentSelected[0];
      return `${selectionCount} selected`;
    }
    return selected || placeholder;
  };

  const hasFilled = multiple ? selectionCount > 0 : !!selected;

  return (
    <div className={styles.selectorContainer} ref={containerRef}>
      <button
        type="button"
        className={`${styles.selectorTrigger} ${hasFilled ? styles.filled : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={styles.selectorValue}>{getDisplayValue()}</span>
        {multiple && selectionCount > 0 && (
          <span className={styles.selectionCount}>{selectionCount}</span>
        )}
        <ChevronDown
          className={`${styles.selectorIcon} ${isOpen ? styles.open : ''}`}
        />
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="listbox">
          {/* Header with helpful hint */}
          {multiple && (
            <div className={styles.dropdownHeader}>
              <span className={styles.dropdownHint}>
                <MousePointerClick />
                Click to select
              </span>
              <span className={styles.selectionStatus}>
                {selectionCount} / {maxSelections}
              </span>
            </div>
          )}

          <div className={styles.dropdownOptions}>
            {options.map((option) => {
              const optionSelected = isSelected(option.label);
              const disabled = !optionSelected && isMaxReached;

              return (
                <button
                  key={option.id || option.label}
                  type="button"
                  role="option"
                  aria-selected={optionSelected}
                  className={`
                    ${styles.option}
                    ${optionSelected ? styles.selectedOption : ''}
                    ${disabled ? styles.maxReached : ''}
                  `}
                  onClick={() => !disabled && handleSelect(option.label)}
                  disabled={disabled}
                >
                  {/* Checkbox indicator for multi-select */}
                  {multiple && (
                    <span className={styles.optionCheckbox}>
                      <Check className={styles.optionCheckIcon} />
                    </span>
                  )}
                  <span className={styles.optionContent}>
                    <span className={styles.optionLabel}>{option.label}</span>
                    {option.description && (
                      <span className={styles.optionDescription}>
                        {option.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom input */}
          <div className={styles.customInput}>
            <input
              type="text"
              placeholder={isMaxReached ? `Max ${maxSelections} reached` : "Type your own..."}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustom();
                }
              }}
              disabled={isMaxReached}
            />
            <button
              type="button"
              onClick={handleAddCustom}
              disabled={!customValue.trim() || isMaxReached}
              aria-label="Add custom option"
            >
              <Plus className={styles.addIcon} />
            </button>
          </div>
        </div>
      )}

      {/* Selected items as tags (for multiple selection) */}
      {multiple && selectionCount > 0 && (
        <div className={styles.selectedTags}>
          {currentSelected.map((item) => (
            <span key={item} className={styles.tag}>
              {item}
              <button
                type="button"
                onClick={(e) => handleRemove(item, e)}
                aria-label={`Remove ${item}`}
              >
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
 * WordBankModal - Full-screen modal with clickable tag grid
 *
 * Features:
 * - Beautiful modal overlay with word cloud layout
 * - Click tags to toggle selection
 * - Visual feedback with animations
 * - Custom value input
 * - Works great for larger option sets
 */
function WordBankModal({
  options,
  selected,
  onSelect,
  placeholder,
  title,
  maxSelections = 6,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const currentSelected = Array.isArray(selected) ? selected : [];
  const selectionCount = currentSelected.length;
  const isMaxReached = selectionCount >= maxSelections;

  const handleToggle = (value) => {
    if (currentSelected.includes(value)) {
      onSelect(currentSelected.filter((v) => v !== value));
    } else if (!isMaxReached) {
      onSelect([...currentSelected, value]);
    }
  };

  const handleAddCustom = () => {
    if (customValue.trim() && !isMaxReached && !currentSelected.includes(customValue.trim())) {
      onSelect([...currentSelected, customValue.trim()]);
      setCustomValue('');
    }
  };

  const handleRemove = (value, e) => {
    e?.stopPropagation();
    onSelect(currentSelected.filter((v) => v !== value));
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const getDisplayValue = () => {
    if (selectionCount === 0) return placeholder;
    if (selectionCount === 1) return currentSelected[0];
    return `${selectionCount} selected`;
  };

  const modalContent = (
    <div className={styles.modalOverlay} onClick={() => setIsOpen(false)}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleRow}>
            <Sparkles className={styles.modalIcon} />
            <h3 className={styles.modalTitle}>{title || 'Select options'}</h3>
          </div>
          <div className={styles.modalMeta}>
            <span className={styles.modalCount}>
              {selectionCount} / {maxSelections} selected
            </span>
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setIsOpen(false)}
              aria-label="Close"
            >
              <X />
            </button>
          </div>
        </div>

        {/* Word Bank Grid */}
        <div className={styles.wordBankGrid}>
          {options.map((option) => {
            const optionSelected = currentSelected.includes(option.label);
            const disabled = !optionSelected && isMaxReached;

            return (
              <button
                key={option.id || option.label}
                type="button"
                className={`
                  ${styles.wordBankTag}
                  ${optionSelected ? styles.wordBankTagSelected : ''}
                  ${disabled ? styles.wordBankTagDisabled : ''}
                `}
                onClick={() => !disabled && handleToggle(option.label)}
                disabled={disabled}
              >
                {optionSelected && <Check className={styles.wordBankCheck} />}
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom Input */}
        <div className={styles.modalCustomInput}>
          <input
            type="text"
            placeholder={isMaxReached ? `Max ${maxSelections} reached` : "Add your own..."}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            disabled={isMaxReached}
          />
          <button
            type="button"
            onClick={handleAddCustom}
            disabled={!customValue.trim() || isMaxReached}
          >
            <Plus />
          </button>
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <Button variant="primary" onClick={() => setIsOpen(false)}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Trigger */}
      <div className={styles.selectorContainer}>
        <button
          type="button"
          className={`${styles.selectorTrigger} ${styles.modalTrigger} ${selectionCount > 0 ? styles.filled : ''}`}
          onClick={() => setIsOpen(true)}
        >
          <span className={styles.selectorValue}>{getDisplayValue()}</span>
          {selectionCount > 0 && (
            <span className={styles.selectionCount}>{selectionCount}</span>
          )}
          <Sparkles className={styles.sparkleIcon} />
        </button>

        {/* Selected tags below trigger */}
        {selectionCount > 0 && (
          <div className={styles.selectedTags}>
            {currentSelected.map((item) => (
              <span key={item} className={styles.tag}>
                {item}
                <button
                  type="button"
                  onClick={(e) => handleRemove(item, e)}
                  aria-label={`Remove ${item}`}
                >
                  <X className={styles.tagRemove} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Modal via portal */}
      {isOpen && createPortal(modalContent, document.body)}
    </>
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
    service_scope: data.service_scope || enrichedData.service_scope?.value || [],

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

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleSave();
  };

  return (
    <form className={styles.container} onSubmit={handleFormSubmit} autoComplete="on">
      {/* Section 1: Who You Are */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Who You Are</h3>
        <div className={styles.madlibsText}>
          <span>I'm </span>
          <input
            type="text"
            name="name"
            id="profile-name"
            autoComplete="name"
            className={styles.inlineInput}
            placeholder="your name"
            value={profile.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
          <span> and my credentials are </span>
          <input
            type="text"
            name="credentials"
            id="profile-credentials"
            autoComplete="honorific-suffix"
            className={styles.inlineInput}
            placeholder="PhD, LMFT, etc."
            value={profile.credentials}
            onChange={(e) => updateField('credentials', e.target.value)}
          />
          <span>. My business name is </span>
          <input
            type="text"
            name="organization"
            id="profile-business-name"
            autoComplete="organization"
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
            name="address-level2"
            id="profile-location"
            autoComplete="address-level2"
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
            placeholder="service areas"
            multiple
            maxSelections={4}
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
                  name="podcast-name"
                  id="profile-podcast-name"
                  autoComplete="off"
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
                  name="newsletter-name"
                  id="profile-newsletter-name"
                  autoComplete="off"
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
            maxSelections={5}
          />
          <span>.</span>
        </div>
      </div>

      {/* Section 5: Your Clients */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Your Clients</h3>
        <div className={styles.madlibsText}>
          <span>My clients are typically </span>
          <WordBankModal
            options={wordBanks.clientTypes || []}
            selected={profile.client_types}
            onSelect={(value) => updateField('client_types', value)}
            placeholder="choose client types"
            title="Who are your ideal clients?"
            maxSelections={6}
          />
          <span>.</span>
        </div>

        <div className={styles.madlibsText}>
          <span>They're sometimes part of these communities: </span>
          <WordBankModal
            options={wordBanks.subcultures || []}
            selected={profile.client_subcultures}
            onSelect={(value) => updateField('client_subcultures', value)}
            placeholder="choose communities"
            title="What communities do they belong to?"
            maxSelections={5}
          />
          <span>.</span>
        </div>

        <div className={styles.madlibsText}>
          <span>They come to me because they're trying to </span>
          <WordBankModal
            options={wordBanks.clientProblems || []}
            selected={profile.client_problems}
            onSelect={(value) => updateField('client_problems', value)}
            placeholder="choose their goals"
            title="What problems are they trying to solve?"
            maxSelections={5}
          />
          <span>.</span>
        </div>

        <div className={styles.madlibsText}>
          <span>They choose me over others because </span>
          <input
            type="text"
            name="differentiator"
            id="profile-differentiator"
            autoComplete="off"
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
          type="submit"
          variant="primary"
          leftIcon={Save}
          loading={saving}
        >
          Save & Continue
        </Button>
      </div>
    </form>
  );
}

export default MadlibsProfile;
