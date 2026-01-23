/**
 * ============================================================================
 * PROFILE EDITOR COMPONENT
 * ============================================================================
 * Wrapper around MadlibsProfile for use in Settings page.
 * Includes import/re-import functionality.
 * ============================================================================
 */

import { useState } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import { Button, Card, useToast } from '@components/shared';
import MadlibsProfile from './MadlibsProfile';
import ImportContent from './ImportContent';
import styles from './ProfileEditor.module.css';

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

  if (showImport) {
    return (
      <Card
        title="Import Content"
        subtitle="Analyze your existing content to update your profile"
      >
        <ImportContent
          properties={properties}
          onComplete={handleImportComplete}
          onSkip={() => setShowImport(false)}
        />
      </Card>
    );
  }

  return (
    <div className={styles.container}>
      {hasAnyProperties && (
        <div className={styles.importBar}>
          <span className={styles.importText}>
            Want to update from your content?
          </span>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Download}
            onClick={() => setShowImport(true)}
          >
            Re-import Content
          </Button>
        </div>
      )}

      <MadlibsProfile
        data={data}
        referenceData={referenceData}
        onSave={handleSave}
        saving={saving}
        enrichedData={enrichedData}
      />
    </div>
  );
}

export default ProfileEditor;
