/**
 * ============================================================================
 * MODULE CARD COMPONENT
 * ============================================================================
 * Individual card for each brand discovery module.
 * Displays status, progress, and opens the module-specific editor.
 *
 * Module statuses:
 *   - not_started: Gray, shows "Start" CTA
 *   - in_progress: Yellow/amber, shows "Continue" CTA
 *   - complete: Green, shows "Edit" CTA
 *
 * Each module has its own editor component rendered in a modal/drawer.
 * ============================================================================
 */

import { useState, useCallback, lazy, Suspense } from 'react';
import {
  FileText,
  Sliders,
  Heart,
  Compass,
  Users,
  Share2,
  Check,
  Clock,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { Button, Modal, Spinner } from '@components/shared';
import styles from './ModuleCard.module.css';

// Lazy load module editors for code splitting
const SourcesEditor = lazy(() => import('./modules/SourcesEditor'));
const VibeEditor = lazy(() => import('./modules/VibeEditor'));
const ValuesEditor = lazy(() => import('./modules/ValuesEditor'));
const MethodEditor = lazy(() => import('./modules/MethodEditor'));
const AudienceEditor = lazy(() => import('./modules/AudienceEditor'));
const ChannelsEditor = lazy(() => import('./modules/ChannelsEditor'));

// Icon mapping
const ICON_MAP = {
  FileText,
  Sliders,
  Heart,
  Compass,
  Users,
  Share2,
};

// Editor component mapping
const EDITOR_MAP = {
  sources: SourcesEditor,
  vibe: VibeEditor,
  values: ValuesEditor,
  method: MethodEditor,
  audience: AudienceEditor,
  channels: ChannelsEditor,
};

// Status labels and actions
const STATUS_CONFIG = {
  not_started: {
    label: 'Not Started',
    action: 'Start',
    variant: 'default',
  },
  in_progress: {
    label: 'In Progress',
    action: 'Continue',
    variant: 'warning',
  },
  complete: {
    label: 'Complete',
    action: 'Edit',
    variant: 'success',
  },
};

/**
 * ModuleCard - Individual module card with status and editor
 *
 * @param {Object} props - Component props
 * @param {string} props.moduleId - Unique module identifier
 * @param {string} props.title - Display title
 * @param {string} props.description - Short description
 * @param {string} props.icon - Icon name from ICON_MAP
 * @param {string} props.color - Accent color for the module
 * @param {string} props.status - Current status (not_started|in_progress|complete)
 * @param {Object} props.data - Module-specific data
 * @param {Object} props.referenceData - Reference data (values deck, archetypes, etc.)
 * @param {Function} props.onUpdate - Callback when module data changes
 * @param {boolean} props.isActive - Whether this module's editor is open
 * @param {Function} props.onActivate - Callback to open editor
 * @param {Function} props.onDeactivate - Callback to close editor
 * @returns {JSX.Element}
 */
function ModuleCard({
  moduleId,
  title,
  description,
  icon,
  color,
  status = 'not_started',
  data = {},
  referenceData,
  onUpdate,
  isActive,
  onActivate,
  onDeactivate,
}) {
  const [saving, setSaving] = useState(false);

  // Get the icon component
  const IconComponent = ICON_MAP[icon] || FileText;

  // Get status configuration
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.not_started;

  // Get the editor component for this module
  const EditorComponent = EDITOR_MAP[moduleId];

  /**
   * Handle save from editor
   */
  const handleSave = useCallback(async (newData, newStatus) => {
    try {
      setSaving(true);
      await onUpdate(newData, newStatus);
      // Don't close modal on save - let user continue editing
    } catch (err) {
      console.error('[ModuleCard] Save failed:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [onUpdate]);

  /**
   * Handle close (with optional save)
   */
  const handleClose = useCallback(() => {
    onDeactivate();
  }, [onDeactivate]);

  /**
   * Get preview text based on module data
   */
  const getPreviewText = useCallback(() => {
    switch (moduleId) {
      case 'sources':
        if (data.sources?.length > 0) {
          return `${data.sources.length} source(s) added`;
        }
        return 'No sources yet';

      case 'vibe':
        if (data.warmth !== undefined) {
          return 'Tone configured';
        }
        return 'Set your tone';

      case 'values':
        if (data.selected?.length > 0) {
          return `${data.selected.length} values selected`;
        }
        return 'Select your values';

      case 'method':
        const modCount = data.modalities?.length || 0;
        const specCount = data.specialties?.length || 0;
        if (modCount > 0 || specCount > 0) {
          return `${modCount} modalities, ${specCount} specialties`;
        }
        return 'Define your approach';

      case 'audience':
        if (data.primary_archetype) {
          return data.primary_archetype;
        }
        return 'Identify your audience';

      case 'channels':
        if (data.priorities?.length > 0) {
          return `${data.priorities.length} platforms ranked`;
        }
        return 'Rank your platforms';

      default:
        return '';
    }
  }, [moduleId, data]);

  return (
    <>
      {/* Card */}
      <div
        className={clsx(styles.card, styles[`status-${status}`])}
        style={{ '--module-color': color }}
      >
        {/* Status indicator */}
        <div className={clsx(styles.statusBadge, styles[`badge-${statusConfig.variant}`])}>
          {status === 'complete' ? (
            <Check className={styles.statusIcon} />
          ) : status === 'in_progress' ? (
            <Clock className={styles.statusIcon} />
          ) : null}
          <span>{statusConfig.label}</span>
        </div>

        {/* Card content */}
        <div className={styles.cardContent}>
          <div className={styles.iconWrapper} style={{ backgroundColor: color }}>
            <IconComponent className={styles.icon} />
          </div>

          <h3 className={styles.title}>{title}</h3>
          <p className={styles.description}>{description}</p>

          {/* Preview text */}
          <p className={styles.preview}>{getPreviewText()}</p>
        </div>

        {/* Action button */}
        <Button
          variant={status === 'complete' ? 'secondary' : 'primary'}
          size="sm"
          className={styles.actionButton}
          onClick={onActivate}
          rightIcon={ChevronRight}
        >
          {statusConfig.action}
        </Button>
      </div>

      {/* Editor Modal */}
      {isActive && EditorComponent && (
        <Modal
          isOpen={isActive}
          onClose={handleClose}
          title={title}
          size="lg"
        >
          <Suspense fallback={<Spinner centered text="Loading editor..." />}>
            <EditorComponent
              data={data}
              referenceData={referenceData}
              onSave={handleSave}
              onClose={handleClose}
              saving={saving}
            />
          </Suspense>
        </Modal>
      )}
    </>
  );
}

export default ModuleCard;
