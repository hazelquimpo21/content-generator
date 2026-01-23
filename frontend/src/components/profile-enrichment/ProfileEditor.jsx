/**
 * ============================================================================
 * PROFILE EDITOR COMPONENT
 * ============================================================================
 * Enhanced wrapper around profile building with two modes:
 * - Quick Mode: Compact form to edit all fields at once
 * - Guided Mode: Step-by-step wizard with explanations
 *
 * Also includes import/re-import functionality.
 * ============================================================================
 */

import { useState } from 'react';
import {
  RefreshCw,
  Download,
  Zap,
  BookOpen,
  HelpCircle,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Button, useToast } from '@components/shared';
import MadlibsWizard from './MadlibsWizard';
import ImportContent from './ImportContent';
import styles from './ProfileEditor.module.css';

// ============================================================================
// PROFILE COMPLETENESS CHECKER
// ============================================================================

function getProfileCompleteness(data) {
  const checks = [
    { field: 'name', label: 'Your name', filled: !!data?.name },
    { field: 'credentials', label: 'Your credentials', filled: !!data?.credentials },
    { field: 'location', label: 'Your location', filled: !!data?.location },
    { field: 'primary_revenue', label: 'Primary revenue stream', filled: !!data?.primary_revenue },
    { field: 'client_types', label: 'Client types', filled: data?.client_types?.length > 0 },
    { field: 'client_problems', label: 'Client goals', filled: data?.client_problems?.length > 0 },
  ];

  const filledCount = checks.filter(c => c.filled).length;
  const percentage = Math.round((filledCount / checks.length) * 100);

  return { checks, filledCount, total: checks.length, percentage };
}

// ============================================================================
// MODE TABS
// ============================================================================

const MODES = [
  {
    id: 'quick',
    label: 'Quick Edit',
    icon: Zap,
    description: 'Edit all fields at once'
  },
  {
    id: 'guided',
    label: 'Guided Setup',
    icon: BookOpen,
    description: 'Step-by-step with help'
  }
];

// ============================================================================
// PROFILE COMPLETENESS INDICATOR
// ============================================================================

function CompletenessIndicator({ data }) {
  const { checks, percentage } = getProfileCompleteness(data);
  const isComplete = percentage === 100;

  return (
    <div className={styles.completeness}>
      <div className={styles.completenessHeader}>
        <div className={styles.completenessTitle}>
          {isComplete ? (
            <>
              <CheckCircle2 className={styles.completenessIconSuccess} />
              <span>Profile Complete</span>
            </>
          ) : (
            <>
              <AlertCircle className={styles.completenessIconWarning} />
              <span>Profile {percentage}% Complete</span>
            </>
          )}
        </div>
        <button type="button" className={styles.completenessToggle}>
          <HelpCircle className={styles.helpIcon} />
        </button>
      </div>

      <div className={styles.completenessBar}>
        <div
          className={styles.completenessProgress}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className={styles.completenessChecks}>
        {checks.map((check) => (
          <div
            key={check.field}
            className={`${styles.completenessCheck} ${check.filled ? styles.checkFilled : ''}`}
          >
            {check.filled ? (
              <CheckCircle2 className={styles.checkIcon} />
            ) : (
              <div className={styles.checkEmpty} />
            )}
            <span>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * ProfileEditor - Settings page wrapper for profile management
 *
 * @param {Object} props
 * @param {Object} props.data - Profile module data from brandDiscovery
 * @param {Object} props.referenceData - Word banks and reference data
 * @param {Function} props.onSave - Save handler
 * @param {boolean} props.saving - Loading state
 */
function ProfileEditor({ data = {}, referenceData = {}, onSave, saving }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState('quick');
  const [showImport, setShowImport] = useState(false);
  const [enrichedData, setEnrichedData] = useState({});

  const properties = data.properties || {};
  const hasAnyProperties = properties.has_website ||
    properties.has_podcast ||
    properties.has_newsletter ||
    properties.has_bio;

  const handleImportComplete = (extractedData, importedSources) => {
    setEnrichedData(extractedData || {});
    setShowImport(false);
    showToast({
      message: `Successfully imported from ${importedSources.length} source(s). Review and save your profile below.`,
      variant: 'success'
    });
  };

  const handleSave = async (profileData, status) => {
    // Merge properties back in
    const dataWithProperties = {
      ...profileData,
      properties: data.properties || {},
    };
    await onSave(dataWithProperties, status);
  };

  // Show import flow
  if (showImport) {
    return (
      <div className={styles.importContainer}>
        <div className={styles.importHeader}>
          <h3>Import Your Content</h3>
          <p>We'll analyze your existing content to pre-fill your profile.</p>
        </div>
        <ImportContent
          properties={properties}
          onComplete={handleImportComplete}
          onSkip={() => setShowImport(false)}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header with mode tabs */}
      <div className={styles.header}>
        <div className={styles.modeTabs}>
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                className={`${styles.modeTab} ${mode === m.id ? styles.modeTabActive : ''}`}
                onClick={() => setMode(m.id)}
              >
                <Icon className={styles.modeTabIcon} />
                <div className={styles.modeTabContent}>
                  <span className={styles.modeTabLabel}>{m.label}</span>
                  <span className={styles.modeTabDescription}>{m.description}</span>
                </div>
              </button>
            );
          })}
        </div>

        {hasAnyProperties && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Download}
            onClick={() => setShowImport(true)}
          >
            Import Content
          </Button>
        )}
      </div>

      {/* Completeness indicator */}
      <CompletenessIndicator data={data} />

      {/* Profile editor content based on mode */}
      <div className={styles.content}>
        {mode === 'quick' ? (
          // Quick mode: compact form
          <MadlibsWizard
            data={data}
            referenceData={referenceData}
            onSave={handleSave}
            saving={saving}
            enrichedData={enrichedData}
            compact={true}
          />
        ) : (
          // Guided mode: step-by-step wizard
          <MadlibsWizard
            data={data}
            referenceData={referenceData}
            onSave={handleSave}
            saving={saving}
            enrichedData={enrichedData}
            compact={false}
            onCancel={() => setMode('quick')}
          />
        )}
      </div>
    </div>
  );
}

export default ProfileEditor;
