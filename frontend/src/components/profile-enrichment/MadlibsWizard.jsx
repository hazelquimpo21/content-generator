/**
 * ============================================================================
 * MADLIBS WIZARD COMPONENT
 * ============================================================================
 * A delightful, multipage wizard for building your profile step-by-step.
 * Breaks the profile into digestible sections with explanations and encouragement.
 *
 * Features:
 * - Step-by-step progression with visual progress
 * - "Why this matters" explanations for each section
 * - Encouraging copy and celebration moments
 * - Can be used in both onboarding and settings contexts
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  X,
  Sparkles,
  User,
  MapPin,
  Briefcase,
  Users,
  Lightbulb,
  PartyPopper,
  ChevronRight
} from 'lucide-react';
import { Button } from '@components/shared';
import styles from './MadlibsWizard.module.css';

// ============================================================================
// WIZARD STEPS CONFIGURATION
// ============================================================================

const WIZARD_STEPS = [
  {
    id: 'identity',
    title: 'Who You Are',
    icon: User,
    description: 'Let\'s start with the basics about you and your practice.',
    whyItMatters: 'Your name and credentials help establish trust and credibility. When we generate content, we\'ll reference you correctly and professionally.',
    tip: 'Include your most impressive credentials first - they help readers understand your expertise at a glance.',
    fields: ['name', 'credentials', 'business_name'],
    celebration: 'Great start! You\'re on your way to content that sounds like you. 🎯'
  },
  {
    id: 'location',
    title: 'Where You Work',
    icon: MapPin,
    description: 'Tell us about your location and who you can serve.',
    whyItMatters: 'Location helps us tailor content to your audience. If you serve clients nationally, we can write for a broader audience. Local practitioners get content with regional relevance.',
    tip: 'If you offer telehealth, you can serve clients in multiple states - select all that apply!',
    fields: ['location', 'service_scope'],
    celebration: 'Perfect! Now we know where your magic happens. 🌍'
  },
  {
    id: 'business',
    title: 'Your Business Model',
    icon: Briefcase,
    description: 'How do you make money? This shapes the content we create.',
    whyItMatters: 'Understanding your revenue streams helps us create content that actually drives business. If you sell courses, we\'ll craft CTAs differently than if you\'re 1:1 focused.',
    tip: 'Don\'t be shy - list all your income sources. Diverse revenue = diverse content opportunities.',
    fields: ['primary_revenue', 'secondary_revenue'],
    celebration: 'Nice! We\'re learning how to help you grow. 💰'
  },
  {
    id: 'clients',
    title: 'Your Ideal Clients',
    icon: Users,
    description: 'Who do you love working with? This is where the magic happens.',
    whyItMatters: 'This is the heart of great content. When we know exactly who you serve, we can write directly to them - their fears, hopes, and language.',
    tip: 'Think about your favorite clients - what do they have in common? Those patterns are gold.',
    fields: ['client_types', 'client_subcultures', 'client_problems', 'differentiator'],
    celebration: 'Amazing! You\'re all set to create content that resonates. ✨'
  }
];

// ============================================================================
// WORD BANK MODAL
// ============================================================================

function WordBankModal({
  options,
  selected,
  onSelect,
  placeholder,
  title,
  maxSelections = 6,
  single = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const currentSelected = single
    ? (selected ? [selected] : [])
    : (Array.isArray(selected) ? selected : []);
  const selectionCount = currentSelected.length;
  const effectiveMax = single ? 1 : maxSelections;
  const isMaxReached = selectionCount >= effectiveMax;

  const handleToggle = (value) => {
    if (single) {
      onSelect(value);
      setIsOpen(false);
    } else {
      if (currentSelected.includes(value)) {
        onSelect(currentSelected.filter((v) => v !== value));
      } else if (!isMaxReached) {
        onSelect([...currentSelected, value]);
      }
    }
  };

  const handleAddCustom = () => {
    if (customValue.trim() && !currentSelected.includes(customValue.trim())) {
      if (single) {
        onSelect(customValue.trim());
        setIsOpen(false);
      } else if (!isMaxReached) {
        onSelect([...currentSelected, customValue.trim()]);
      }
      setCustomValue('');
    }
  };

  const handleRemove = (value, e) => {
    e?.stopPropagation();
    if (single) {
      onSelect('');
    } else {
      onSelect(currentSelected.filter((v) => v !== value));
    }
  };

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
    if (single || selectionCount === 1) return currentSelected[0];
    return `${selectionCount} selected`;
  };

  const modalContent = (
    <div className={styles.modalOverlay} onClick={() => setIsOpen(false)}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleRow}>
            <Sparkles className={styles.modalIcon} />
            <h3 className={styles.modalTitle}>{title || 'Select options'}</h3>
          </div>
          <div className={styles.modalMeta}>
            {!single && (
              <span className={styles.modalCount}>
                {selectionCount} / {effectiveMax} selected
              </span>
            )}
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

        <div className={styles.modalCustomInput}>
          <input
            type="text"
            placeholder={isMaxReached && !single ? `Max ${effectiveMax} reached` : "Type your own..."}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            disabled={isMaxReached && !single}
          />
          <button
            type="button"
            onClick={handleAddCustom}
            disabled={!customValue.trim() || (isMaxReached && !single)}
          >
            <Plus />
          </button>
        </div>

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
      <div className={styles.selectorContainer}>
        <button
          type="button"
          className={`${styles.selectorTrigger} ${selectionCount > 0 ? styles.filled : ''}`}
          onClick={() => setIsOpen(true)}
        >
          <span className={styles.selectorValue}>{getDisplayValue()}</span>
          {selectionCount > 0 && !single && (
            <span className={styles.selectionCount}>{selectionCount}</span>
          )}
          <Sparkles className={styles.sparkleIcon} />
        </button>

        {!single && selectionCount > 0 && (
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

      {isOpen && createPortal(modalContent, document.body)}
    </>
  );
}

// ============================================================================
// STEP CONTENT COMPONENTS
// ============================================================================

function IdentityStep({ profile, updateField }) {
  return (
    <div className={styles.stepFields}>
      <div className={styles.madlibsText}>
        <span>I'm </span>
        <input
          type="text"
          name="name"
          id="wizard-name"
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
          id="wizard-credentials"
          autoComplete="honorific-suffix"
          className={styles.inlineInput}
          placeholder="PhD, LMFT, etc."
          value={profile.credentials}
          onChange={(e) => updateField('credentials', e.target.value)}
        />
        <span>.</span>
      </div>

      <div className={styles.madlibsText}>
        <span>My business name is </span>
        <input
          type="text"
          name="organization"
          id="wizard-business-name"
          autoComplete="organization"
          className={`${styles.inlineInput} ${styles.wide}`}
          placeholder="your practice name (optional)"
          value={profile.business_name}
          onChange={(e) => updateField('business_name', e.target.value)}
        />
        <span>.</span>
      </div>
    </div>
  );
}

function LocationStep({ profile, updateField, wordBanks }) {
  return (
    <div className={styles.stepFields}>
      <div className={styles.madlibsText}>
        <span>I'm based in </span>
        <input
          type="text"
          name="address-level2"
          id="wizard-location"
          autoComplete="address-level2"
          className={styles.inlineInput}
          placeholder="City, State"
          value={profile.location}
          onChange={(e) => updateField('location', e.target.value)}
        />
        <span>.</span>
      </div>

      <div className={styles.madlibsText}>
        <span>I serve clients </span>
        <WordBankModal
          options={wordBanks.serviceScopes || []}
          selected={profile.service_scope}
          onSelect={(value) => updateField('service_scope', value)}
          placeholder="select your service areas"
          title="Where do you serve clients?"
          maxSelections={4}
        />
        <span>.</span>
      </div>
    </div>
  );
}

function BusinessStep({ profile, updateField, wordBanks }) {
  return (
    <div className={styles.stepFields}>
      <div className={styles.madlibsText}>
        <span>My main revenue stream is </span>
        <WordBankModal
          options={wordBanks.revenueTypes || []}
          selected={profile.primary_revenue}
          onSelect={(value) => updateField('primary_revenue', value)}
          placeholder="choose your primary income"
          title="What's your main revenue stream?"
          single
        />
        <span>.</span>
      </div>

      <div className={styles.madlibsText}>
        <span>I also make money from </span>
        <WordBankModal
          options={wordBanks.revenueTypes || []}
          selected={profile.secondary_revenue}
          onSelect={(value) => updateField('secondary_revenue', value)}
          placeholder="other income sources (optional)"
          title="What other revenue streams do you have?"
          maxSelections={5}
        />
        <span>.</span>
      </div>
    </div>
  );
}

function ClientsStep({ profile, updateField, wordBanks }) {
  return (
    <div className={styles.stepFields}>
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
          placeholder="communities (optional)"
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
          id="wizard-differentiator"
          autoComplete="off"
          className={`${styles.inlineInput} ${styles.extraWide}`}
          placeholder="what makes you unique"
          value={profile.differentiator}
          onChange={(e) => updateField('differentiator', e.target.value)}
        />
        <span>.</span>
      </div>
    </div>
  );
}

// ============================================================================
// COMPLETION CELEBRATION
// ============================================================================

function CompletionCelebration({ profile, onFinish }) {
  return (
    <div className={styles.celebration}>
      <div className={styles.celebrationIcon}>
        <PartyPopper />
      </div>
      <h2 className={styles.celebrationTitle}>Your Profile is Complete!</h2>
      <p className={styles.celebrationText}>
        We now have everything we need to create content that sounds authentically like you.
        Here's a quick summary:
      </p>

      <div className={styles.profileSummary}>
        <div className={styles.summaryItem}>
          <User className={styles.summaryIcon} />
          <div>
            <strong>{profile.name || 'You'}</strong>
            {profile.credentials && <span>, {profile.credentials}</span>}
            {profile.business_name && <span> at {profile.business_name}</span>}
          </div>
        </div>

        {profile.location && (
          <div className={styles.summaryItem}>
            <MapPin className={styles.summaryIcon} />
            <div>Based in {profile.location}</div>
          </div>
        )}

        {profile.primary_revenue && (
          <div className={styles.summaryItem}>
            <Briefcase className={styles.summaryIcon} />
            <div>Primary focus: {profile.primary_revenue}</div>
          </div>
        )}

        {profile.client_types?.length > 0 && (
          <div className={styles.summaryItem}>
            <Users className={styles.summaryIcon} />
            <div>Serving: {profile.client_types.slice(0, 3).join(', ')}</div>
          </div>
        )}
      </div>

      <div className={styles.celebrationActions}>
        <Button
          variant="primary"
          rightIcon={ChevronRight}
          onClick={onFinish}
          size="lg"
        >
          Finish & Save
        </Button>
      </div>

      <p className={styles.celebrationNote}>
        You can always update this later in Settings.
      </p>
    </div>
  );
}

// ============================================================================
// MAIN WIZARD COMPONENT
// ============================================================================

function MadlibsWizard({
  data = {},
  referenceData = {},
  onSave,
  saving,
  enrichedData = {},
  compact = false,  // For settings page, shows all at once
  onCancel
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);

  const [profile, setProfile] = useState({
    name: data.name || enrichedData.name?.value || '',
    credentials: data.credentials || enrichedData.credentials?.value || '',
    business_name: data.business_name || enrichedData.business_name?.value || '',
    location: data.location || enrichedData.location?.value || '',
    client_locations: data.client_locations || [],
    service_scope: data.service_scope || enrichedData.service_scope?.value || [],
    podcast_name: data.podcast_name || enrichedData.podcast_name?.value || '',
    newsletter_name: data.newsletter_name || enrichedData.newsletter_name?.value || '',
    primary_revenue: data.primary_revenue || enrichedData.primary_revenue?.value || '',
    secondary_revenue: data.secondary_revenue || enrichedData.secondary_revenue?.value || [],
    client_types: data.client_types || enrichedData.client_types?.value || [],
    client_subcultures: data.client_subcultures || [],
    client_problems: data.client_problems || enrichedData.client_problems?.value || [],
    differentiator: data.differentiator || enrichedData.differentiator?.value || '',
    properties: data.properties || {},
  });

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setProfile((prev) => ({ ...prev, ...data }));
    }
  }, [data]);

  const updateField = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const wordBanks = referenceData.wordBanks || {};
  const step = WIZARD_STEPS[currentStep];
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      setShowCompletion(true);
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (showCompletion) {
      setShowCompletion(false);
    } else {
      setCurrentStep((prev) => Math.max(0, prev - 1));
    }
  };

  const handleFinish = () => {
    const hasRequiredFields = profile.name && profile.primary_revenue;
    const status = hasRequiredFields ? 'complete' : 'partial';
    onSave(profile, status);
  };

  const handleCompactSave = () => {
    const hasRequiredFields = profile.name && profile.primary_revenue;
    const status = hasRequiredFields ? 'complete' : 'partial';
    onSave(profile, status);
  };

  // Compact mode: Show all sections at once (for Settings page)
  if (compact) {
    return (
      <div className={styles.compactContainer}>
        {WIZARD_STEPS.map((wizardStep, index) => {
          const StepIcon = wizardStep.icon;
          return (
            <div key={wizardStep.id} className={styles.compactSection}>
              <div className={styles.compactHeader}>
                <div className={styles.compactTitleRow}>
                  <StepIcon className={styles.compactIcon} />
                  <h3 className={styles.compactTitle}>{wizardStep.title}</h3>
                </div>
                <p className={styles.compactDescription}>{wizardStep.description}</p>
              </div>

              {wizardStep.id === 'identity' && (
                <IdentityStep profile={profile} updateField={updateField} />
              )}
              {wizardStep.id === 'location' && (
                <LocationStep profile={profile} updateField={updateField} wordBanks={wordBanks} />
              )}
              {wizardStep.id === 'business' && (
                <BusinessStep profile={profile} updateField={updateField} wordBanks={wordBanks} />
              )}
              {wizardStep.id === 'clients' && (
                <ClientsStep profile={profile} updateField={updateField} wordBanks={wordBanks} />
              )}
            </div>
          );
        })}

        <div className={styles.compactActions}>
          <Button
            variant="primary"
            onClick={handleCompactSave}
            loading={saving}
          >
            Save Profile
          </Button>
        </div>
      </div>
    );
  }

  // Wizard mode: Step by step
  if (showCompletion) {
    return (
      <div className={styles.container}>
        <CompletionCelebration
          profile={profile}
          onFinish={handleFinish}
        />
        <div className={styles.navigation}>
          <Button
            variant="ghost"
            leftIcon={ArrowLeft}
            onClick={handleBack}
          >
            Back to edit
          </Button>
        </div>
      </div>
    );
  }

  const StepIcon = step.icon;

  return (
    <div className={styles.container}>
      {/* Progress indicator */}
      <div className={styles.progressBar}>
        {WIZARD_STEPS.map((s, index) => (
          <div
            key={s.id}
            className={`${styles.progressStep} ${index <= currentStep ? styles.progressStepActive : ''} ${index < currentStep ? styles.progressStepComplete : ''}`}
          >
            <div className={styles.progressDot}>
              {index < currentStep ? <Check className={styles.progressCheck} /> : index + 1}
            </div>
            <span className={styles.progressLabel}>{s.title}</span>
          </div>
        ))}
      </div>

      {/* Step header */}
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrapper}>
          <StepIcon className={styles.stepIcon} />
        </div>
        <h2 className={styles.stepTitle}>{step.title}</h2>
        <p className={styles.stepDescription}>{step.description}</p>
      </div>

      {/* Why it matters callout */}
      <div className={styles.whyItMatters}>
        <div className={styles.whyHeader}>
          <Lightbulb className={styles.whyIcon} />
          <span>Why this matters</span>
        </div>
        <p>{step.whyItMatters}</p>
      </div>

      {/* Step content */}
      <div className={styles.stepContent}>
        {step.id === 'identity' && (
          <IdentityStep profile={profile} updateField={updateField} />
        )}
        {step.id === 'location' && (
          <LocationStep profile={profile} updateField={updateField} wordBanks={wordBanks} />
        )}
        {step.id === 'business' && (
          <BusinessStep profile={profile} updateField={updateField} wordBanks={wordBanks} />
        )}
        {step.id === 'clients' && (
          <ClientsStep profile={profile} updateField={updateField} wordBanks={wordBanks} />
        )}
      </div>

      {/* Tip */}
      <div className={styles.tip}>
        <Sparkles className={styles.tipIcon} />
        <p>{step.tip}</p>
      </div>

      {/* Navigation */}
      <div className={styles.navigation}>
        <div className={styles.navLeft}>
          {!isFirstStep && (
            <Button
              variant="ghost"
              leftIcon={ArrowLeft}
              onClick={handleBack}
            >
              Back
            </Button>
          )}
          {onCancel && isFirstStep && (
            <Button
              variant="ghost"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
        </div>

        <Button
          variant="primary"
          rightIcon={isLastStep ? Check : ArrowRight}
          onClick={handleNext}
        >
          {isLastStep ? 'Review & Finish' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}

export default MadlibsWizard;
