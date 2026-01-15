/**
 * ============================================================================
 * BRAND DISCOVERY STUDIO
 * ============================================================================
 * Main container component for the Brand Discovery onboarding experience.
 * Manages the 6 interactive modules that help users define their brand:
 *   - Sources: Website/content for voice extraction
 *   - Vibe: Tone sliders (warm/professional, casual/authoritative, etc.)
 *   - Values: Card selection + ranking exercise
 *   - Method: Modalities and specialties selection
 *   - Audience: Target audience archetype selection
 *   - Channels: Platform priority ranking (drag-drop)
 *
 * When >= 2 modules are complete, synthesizes Brand DNA for content generation.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { Button, ProgressBar, Spinner, useToast } from '@components/shared';
import api from '@utils/api-client';
import ModuleCard from './ModuleCard';
import BrandDnaPreview from './BrandDnaPreview';
import styles from './BrandDiscoveryStudio.module.css';

// Module configuration with icons and labels
const MODULE_CONFIG = {
  sources: {
    id: 'sources',
    title: 'Sources',
    description: 'Add content samples for voice analysis',
    icon: 'FileText',
    color: '#8B7355',
  },
  vibe: {
    id: 'vibe',
    title: 'Vibe',
    description: 'Set your brand tone and energy',
    icon: 'Sliders',
    color: '#C4A77D',
  },
  values: {
    id: 'values',
    title: 'Values',
    description: 'Discover your core brand values',
    icon: 'Heart',
    color: '#D4A574',
  },
  method: {
    id: 'method',
    title: 'Method',
    description: 'Define your therapeutic approach',
    icon: 'Compass',
    color: '#A67C52',
  },
  audience: {
    id: 'audience',
    title: 'Audience',
    description: 'Identify your ideal client profile',
    icon: 'Users',
    color: '#9A7B4F',
  },
  channels: {
    id: 'channels',
    title: 'Channels',
    description: 'Prioritize your content platforms',
    icon: 'Share2',
    color: '#8B6914',
  },
};

// Module display order
const MODULE_ORDER = ['sources', 'vibe', 'values', 'method', 'audience', 'channels'];

/**
 * BrandDiscoveryStudio - Main container for brand discovery modules
 *
 * @param {Object} props - Component props
 * @param {boolean} props.defaultExpanded - Whether to start expanded (default: true)
 * @param {Function} props.onBrandDnaChange - Callback when Brand DNA is generated/updated
 * @returns {JSX.Element}
 */
function BrandDiscoveryStudio({ defaultExpanded = true, onBrandDnaChange }) {
  const { showToast } = useToast();

  // UI state
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [regenerating, setRegenerating] = useState(false);

  // Data state
  const [brandDiscovery, setBrandDiscovery] = useState(null);
  const [referenceData, setReferenceData] = useState(null);

  // Active module (for modal/expanded view)
  const [activeModule, setActiveModule] = useState(null);

  /**
   * Load brand discovery data and reference data on mount
   */
  useEffect(() => {
    loadBrandDiscovery();
  }, []);

  /**
   * Notify parent when Brand DNA changes
   */
  useEffect(() => {
    if (brandDiscovery?.brand_dna && onBrandDnaChange) {
      onBrandDnaChange(brandDiscovery.brand_dna);
    }
  }, [brandDiscovery?.brand_dna, onBrandDnaChange]);

  /**
   * Load brand discovery data from API
   */
  const loadBrandDiscovery = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load brand discovery and reference data in parallel
      const [discoveryResponse, refDataResponse] = await Promise.all([
        api.brandDiscovery.get(),
        api.brandDiscovery.getReferenceData(),
      ]);

      console.log('[BrandDiscoveryStudio] Data loaded:', {
        hasDiscovery: !!discoveryResponse.data,
        completion: discoveryResponse.data?.overall_completion_percent,
        hasBrandDna: !!discoveryResponse.data?.brand_dna,
      });

      setBrandDiscovery(discoveryResponse.data);
      setReferenceData(refDataResponse.data);
    } catch (err) {
      console.error('[BrandDiscoveryStudio] Failed to load data:', err);
      setError(err.message || 'Failed to load brand discovery data');
      showToast({ message: 'Failed to load brand discovery', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  /**
   * Update a module's data
   *
   * @param {string} moduleId - The module to update
   * @param {Object} data - New data for the module
   * @param {string} status - Optional new status
   */
  const handleModuleUpdate = useCallback(async (moduleId, data, status = null) => {
    try {
      console.log('[BrandDiscoveryStudio] Updating module:', moduleId, { data, status });

      const response = await api.brandDiscovery.updateModule(moduleId, data, status);

      // Update local state with response
      setBrandDiscovery(response.data);

      // Show success feedback
      const moduleTitle = MODULE_CONFIG[moduleId]?.title || moduleId;
      showToast({
        message: `${moduleTitle} updated`,
        variant: 'success',
      });

      console.log('[BrandDiscoveryStudio] Module updated:', {
        moduleId,
        newCompletion: response.data?.overall_completion_percent,
        hasBrandDna: !!response.data?.brand_dna,
      });

      return response;
    } catch (err) {
      console.error('[BrandDiscoveryStudio] Failed to update module:', moduleId, err);
      showToast({
        message: `Failed to update ${moduleId}: ${err.message}`,
        variant: 'error',
      });
      throw err;
    }
  }, [showToast]);

  /**
   * Manually regenerate Brand DNA
   */
  const handleRegenerateBrandDna = useCallback(async () => {
    try {
      setRegenerating(true);

      console.log('[BrandDiscoveryStudio] Regenerating Brand DNA...');
      const response = await api.brandDiscovery.regenerateBrandDna();

      setBrandDiscovery(response.data);

      showToast({
        message: 'Brand DNA regenerated successfully',
        variant: 'success',
      });

      console.log('[BrandDiscoveryStudio] Brand DNA regenerated:', {
        hasResult: !!response.data?.brand_dna,
      });
    } catch (err) {
      console.error('[BrandDiscoveryStudio] Failed to regenerate Brand DNA:', err);
      showToast({
        message: `Failed to regenerate Brand DNA: ${err.message}`,
        variant: 'error',
      });
    } finally {
      setRegenerating(false);
    }
  }, [showToast]);

  /**
   * Reset all brand discovery data
   */
  const handleReset = useCallback(async () => {
    if (!window.confirm('Are you sure you want to reset all brand discovery data? This cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      console.log('[BrandDiscoveryStudio] Resetting brand discovery...');

      const response = await api.brandDiscovery.reset();
      setBrandDiscovery(response.data);

      showToast({
        message: 'Brand discovery reset successfully',
        variant: 'success',
      });
    } catch (err) {
      console.error('[BrandDiscoveryStudio] Failed to reset:', err);
      showToast({
        message: `Failed to reset: ${err.message}`,
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  /**
   * Get module data from brandDiscovery state
   */
  const getModuleData = useCallback((moduleId) => {
    return brandDiscovery?.modules?.[moduleId] || { status: 'not_started', data: {} };
  }, [brandDiscovery]);

  /**
   * Calculate completed module count
   */
  const completedCount = brandDiscovery
    ? MODULE_ORDER.filter((id) => getModuleData(id).status === 'complete').length
    : 0;

  // Loading state
  if (loading && !brandDiscovery) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner text="Loading brand discovery..." />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Collapsible Header */}
      <button
        className={styles.header}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="brand-discovery-content"
      >
        <div className={styles.headerLeft}>
          <Sparkles className={styles.headerIcon} />
          <div className={styles.headerText}>
            <h2 className={styles.headerTitle}>Brand Discovery</h2>
            <p className={styles.headerSubtitle}>
              {completedCount === 0
                ? 'Define your brand identity for personalized content'
                : `${completedCount} of ${MODULE_ORDER.length} modules complete`}
            </p>
          </div>
        </div>

        <div className={styles.headerRight}>
          {brandDiscovery && (
            <ProgressBar
              value={brandDiscovery.overall_completion_percent || 0}
              max={100}
              showPercentage={false}
              size="sm"
              className={styles.headerProgress}
            />
          )}
          {expanded ? (
            <ChevronUp className={styles.chevron} />
          ) : (
            <ChevronDown className={styles.chevron} />
          )}
        </div>
      </button>

      {/* Expandable Content */}
      {expanded && (
        <div id="brand-discovery-content" className={styles.content}>
          {/* Error state */}
          {error && (
            <div className={styles.errorBanner}>
              <AlertCircle className={styles.errorIcon} />
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={loadBrandDiscovery}>
                Retry
              </Button>
            </div>
          )}

          {/* Module Grid */}
          <div className={styles.moduleGrid}>
            {MODULE_ORDER.map((moduleId) => {
              const config = MODULE_CONFIG[moduleId];
              const moduleData = getModuleData(moduleId);

              return (
                <ModuleCard
                  key={moduleId}
                  moduleId={moduleId}
                  title={config.title}
                  description={config.description}
                  icon={config.icon}
                  color={config.color}
                  status={moduleData.status}
                  data={moduleData.data}
                  referenceData={referenceData}
                  onUpdate={(data, status) => handleModuleUpdate(moduleId, data, status)}
                  isActive={activeModule === moduleId}
                  onActivate={() => setActiveModule(moduleId)}
                  onDeactivate={() => setActiveModule(null)}
                />
              );
            })}
          </div>

          {/* Brand DNA Preview */}
          {brandDiscovery?.brand_dna && (
            <BrandDnaPreview
              brandDna={brandDiscovery.brand_dna}
              generatedAt={brandDiscovery.brand_dna_generated_at}
              onRegenerate={handleRegenerateBrandDna}
              regenerating={regenerating}
            />
          )}

          {/* Actions */}
          <div className={styles.actions}>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={RefreshCw}
              onClick={handleReset}
              disabled={loading}
            >
              Reset All
            </Button>

            {completedCount >= 2 && !brandDiscovery?.brand_dna && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={Sparkles}
                onClick={handleRegenerateBrandDna}
                loading={regenerating}
              >
                Generate Brand DNA
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BrandDiscoveryStudio;
