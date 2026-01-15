/**
 * ============================================================================
 * ONBOARDING PAGE
 * ============================================================================
 * Guided onboarding experience for new users.
 * Walks users through Brand Discovery to set up their content profile.
 *
 * Flow:
 * 1. Welcome screen explaining the process
 * 2. Guided Brand Discovery modules (Vibe, Values first as they're most important)
 * 3. Completion screen with option to continue or skip
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Sliders,
  Heart,
  FileText,
  Compass,
  Users,
  Share2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button, ProgressBar, Spinner, useToast } from '@components/shared';
import api from '@utils/api-client';

// Import module editors from brand discovery
import VibeEditor from '../components/brand-discovery/modules/VibeEditor';
import ValuesEditor from '../components/brand-discovery/modules/ValuesEditor';
import SourcesEditor from '../components/brand-discovery/modules/SourcesEditor';
import MethodEditor from '../components/brand-discovery/modules/MethodEditor';
import AudienceEditor from '../components/brand-discovery/modules/AudienceEditor';
import ChannelsEditor from '../components/brand-discovery/modules/ChannelsEditor';

import styles from './Onboarding.module.css';

// Onboarding steps configuration
const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Content Pipeline',
    description: "Let's set up your brand identity so we can create content that sounds like you.",
    icon: Sparkles,
  },
  {
    id: 'vibe',
    title: 'Set Your Vibe',
    description: 'Adjust the sliders to define your brand tone and energy.',
    icon: Sliders,
    module: 'vibe',
    weight: 25,
  },
  {
    id: 'values',
    title: 'Discover Your Values',
    description: 'Select and rank the core values that guide your practice.',
    icon: Heart,
    module: 'values',
    weight: 25,
  },
  {
    id: 'complete',
    title: "You're All Set!",
    description: 'Your Brand DNA is ready. You can always refine it in Settings.',
    icon: Check,
  },
];

// Optional advanced steps (shown after initial completion)
const ADVANCED_STEPS = [
  {
    id: 'sources',
    title: 'Add Content Sources',
    description: 'Paste content samples for AI voice analysis.',
    icon: FileText,
    module: 'sources',
    weight: 15,
  },
  {
    id: 'method',
    title: 'Define Your Method',
    description: 'Select your therapeutic modalities and specialties.',
    icon: Compass,
    module: 'method',
    weight: 15,
  },
  {
    id: 'audience',
    title: 'Know Your Audience',
    description: 'Choose your target client archetypes.',
    icon: Users,
    module: 'audience',
    weight: 10,
  },
  {
    id: 'channels',
    title: 'Prioritize Channels',
    description: 'Rank your preferred content platforms.',
    icon: Share2,
    module: 'channels',
    weight: 10,
  },
];

/**
 * Onboarding page component
 */
function Onboarding() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brandDiscovery, setBrandDiscovery] = useState(null);
  const [referenceData, setReferenceData] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get active steps based on whether user wants advanced setup
  const activeSteps = showAdvanced
    ? [...ONBOARDING_STEPS.slice(0, -1), ...ADVANCED_STEPS, ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]]
    : ONBOARDING_STEPS;

  const currentStepData = activeSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === activeSteps.length - 1;
  const isModuleStep = !!currentStepData?.module;

  // Calculate progress (skip welcome and complete steps)
  const moduleSteps = activeSteps.filter(s => s.module);
  const completedModules = moduleSteps.filter(s => {
    const moduleData = brandDiscovery?.modules?.[s.module];
    return moduleData?.status === 'complete' || moduleData?.status === 'partial';
  });
  const progress = moduleSteps.length > 0
    ? Math.round((completedModules.length / moduleSteps.length) * 100)
    : 0;

  /**
   * Load brand discovery data on mount
   */
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [discoveryResponse, refDataResponse] = await Promise.all([
        api.brandDiscovery.get(),
        api.brandDiscovery.getReferenceData(),
      ]);

      setBrandDiscovery(discoveryResponse.brandDiscovery);
      setReferenceData(refDataResponse);

      // If user already has some progress, skip to appropriate step
      const completion = discoveryResponse.brandDiscovery?.overall_completion_percent || 0;
      if (completion >= 50) {
        // Already completed enough, go to completion screen
        setCurrentStep(activeSteps.length - 1);
      }
    } catch (err) {
      console.error('[Onboarding] Failed to load data:', err);
      showToast({ message: 'Failed to load data', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Save module data
   */
  const handleModuleSave = useCallback(async (moduleId, data, status = 'complete') => {
    try {
      setSaving(true);
      const response = await api.brandDiscovery.updateModule(moduleId, data, status);
      setBrandDiscovery(response.brandDiscovery);

      showToast({
        message: `${currentStepData.title} saved`,
        variant: 'success'
      });

      return response;
    } catch (err) {
      console.error('[Onboarding] Failed to save module:', err);
      showToast({ message: `Failed to save: ${err.message}`, variant: 'error' });
      throw err;
    } finally {
      setSaving(false);
    }
  }, [currentStepData, showToast]);

  /**
   * Navigate to next step
   */
  const handleNext = async () => {
    if (isLastStep) {
      // Refresh user to update onboarding status
      await refreshUser();
      navigate('/', { replace: true });
      return;
    }

    setCurrentStep(prev => Math.min(prev + 1, activeSteps.length - 1));
  };

  /**
   * Navigate to previous step
   */
  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  /**
   * Skip onboarding entirely
   */
  const handleSkip = async () => {
    await refreshUser();
    navigate('/', { replace: true });
  };

  /**
   * Get module data for current step
   */
  const getModuleData = (moduleId) => {
    return brandDiscovery?.modules?.[moduleId]?.data || {};
  };

  /**
   * Render the module editor for current step
   */
  const renderModuleEditor = () => {
    if (!currentStepData?.module) return null;

    const moduleId = currentStepData.module;
    const moduleData = getModuleData(moduleId);

    // Handle save and auto-advance to next step
    const handleSaveAndContinue = async (data, status) => {
      await handleModuleSave(moduleId, data, status);
      // Auto-advance after successful save
      handleNext();
    };

    const commonProps = {
      data: moduleData,
      referenceData,
      onSave: handleSaveAndContinue,
      onClose: handleBack, // Use back navigation for cancel
      saving,
    };

    switch (moduleId) {
      case 'vibe':
        return <VibeEditor {...commonProps} />;
      case 'values':
        return <ValuesEditor {...commonProps} />;
      case 'sources':
        return <SourcesEditor {...commonProps} />;
      case 'method':
        return <MethodEditor {...commonProps} />;
      case 'audience':
        return <AudienceEditor {...commonProps} />;
      case 'channels':
        return <ChannelsEditor {...commonProps} />;
      default:
        return null;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner text="Setting up your experience..." />
      </div>
    );
  }

  const StepIcon = currentStepData.icon;

  return (
    <div className={styles.container}>
      {/* Progress bar at top */}
      <div className={styles.progressWrapper}>
        <ProgressBar
          value={progress}
          max={100}
          showPercentage
          size="sm"
        />
        <span className={styles.stepIndicator}>
          Step {currentStep + 1} of {activeSteps.length}
        </span>
      </div>

      {/* Main content area */}
      <div className={styles.content}>
        {/* Step header */}
        <div className={styles.stepHeader}>
          <div className={styles.iconWrapper}>
            <StepIcon className={styles.stepIcon} />
          </div>
          <h1 className={styles.title}>{currentStepData.title}</h1>
          <p className={styles.description}>{currentStepData.description}</p>
        </div>

        {/* Step content */}
        <div className={styles.stepContent}>
          {/* Welcome step */}
          {currentStepData.id === 'welcome' && (
            <div className={styles.welcomeContent}>
              <div className={styles.welcomeFeatures}>
                <div className={styles.feature}>
                  <Sliders className={styles.featureIcon} />
                  <div>
                    <h3>Define Your Vibe</h3>
                    <p>Set your brand tone from clinical to relatable</p>
                  </div>
                </div>
                <div className={styles.feature}>
                  <Heart className={styles.featureIcon} />
                  <div>
                    <h3>Discover Your Values</h3>
                    <p>Identify what makes your practice unique</p>
                  </div>
                </div>
                <div className={styles.feature}>
                  <Sparkles className={styles.featureIcon} />
                  <div>
                    <h3>Generate Brand DNA</h3>
                    <p>AI-powered content that sounds like you</p>
                  </div>
                </div>
              </div>
              <p className={styles.timeEstimate}>
                This takes about 5 minutes
              </p>
            </div>
          )}

          {/* Module step - render the editor */}
          {isModuleStep && (
            <div className={styles.moduleWrapper}>
              {renderModuleEditor()}
            </div>
          )}

          {/* Completion step */}
          {currentStepData.id === 'complete' && (
            <div className={styles.completeContent}>
              <div className={styles.successBadge}>
                <Check className={styles.successIcon} />
              </div>
              <p className={styles.completionText}>
                Your Brand DNA has been created! We'll use this to generate content
                that matches your unique voice and values.
              </p>

              {!showAdvanced && (
                <button
                  className={styles.advancedLink}
                  onClick={() => {
                    setShowAdvanced(true);
                    setCurrentStep(activeSteps.length - 1); // Go to first advanced step
                  }}
                >
                  Want to refine further? Add more details
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation footer - hidden on module steps (editors have their own buttons) */}
      {!isModuleStep && (
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {!isFirstStep && (
              <Button
                variant="ghost"
                leftIcon={ArrowLeft}
                onClick={handleBack}
                disabled={saving}
              >
                Back
              </Button>
            )}
          </div>

          <div className={styles.footerRight}>
            {isFirstStep && (
              <Button
                variant="ghost"
                onClick={handleSkip}
              >
                Skip for now
              </Button>
            )}

            <Button
              variant="primary"
              rightIcon={isLastStep ? Check : ArrowRight}
              onClick={handleNext}
              loading={saving}
            >
              {isFirstStep ? "Let's Start" : isLastStep ? 'Go to Dashboard' : 'Continue'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Onboarding;
