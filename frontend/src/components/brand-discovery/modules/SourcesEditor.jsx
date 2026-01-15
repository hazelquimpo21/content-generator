/**
 * ============================================================================
 * SOURCES EDITOR
 * ============================================================================
 * Editor for the Sources module - allows users to paste content for voice
 * analysis. Content can be from their website, blog posts, newsletters, etc.
 *
 * Future: Will add URL scraping and file upload capabilities.
 * Current: Manual paste only (simpler, more reliable).
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import {
  Plus,
  Trash2,
  FileText,
  Globe,
  Mail,
  MessageSquare,
  Save,
  AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { Button, Input } from '@components/shared';
import styles from './SourcesEditor.module.css';

// Source type options
const SOURCE_TYPES = [
  { id: 'website', label: 'Website Copy', icon: Globe },
  { id: 'blog', label: 'Blog Post', icon: FileText },
  { id: 'newsletter', label: 'Newsletter', icon: Mail },
  { id: 'social', label: 'Social Post', icon: MessageSquare },
  { id: 'other', label: 'Other', icon: FileText },
];

// Minimum content length for analysis
const MIN_CONTENT_LENGTH = 100;
const MAX_SOURCES = 5;

/**
 * SourcesEditor - Edit sources for voice analysis
 *
 * @param {Object} props - Component props
 * @param {Object} props.data - Current module data
 * @param {Function} props.onSave - Save callback
 * @param {Function} props.onClose - Close callback
 * @param {boolean} props.saving - Whether save is in progress
 * @returns {JSX.Element}
 */
function SourcesEditor({ data = {}, onSave, onClose, saving }) {
  // Initialize sources from data or empty array
  const [sources, setSources] = useState(data.sources || []);
  const [activeSourceIndex, setActiveSourceIndex] = useState(
    sources.length > 0 ? 0 : null
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Add a new source
   */
  const handleAddSource = useCallback(() => {
    if (sources.length >= MAX_SOURCES) {
      setError(`Maximum ${MAX_SOURCES} sources allowed`);
      return;
    }

    const newSource = {
      id: `source_${Date.now()}`,
      type: 'website',
      title: '',
      content: '',
      addedAt: new Date().toISOString(),
    };

    setSources((prev) => [...prev, newSource]);
    setActiveSourceIndex(sources.length);
    setHasChanges(true);
    setError(null);
  }, [sources.length]);

  /**
   * Remove a source
   */
  const handleRemoveSource = useCallback((index) => {
    setSources((prev) => prev.filter((_, i) => i !== index));
    setActiveSourceIndex((current) => {
      if (current === index) {
        return index > 0 ? index - 1 : null;
      }
      if (current > index) {
        return current - 1;
      }
      return current;
    });
    setHasChanges(true);
  }, []);

  /**
   * Update a source field
   */
  const handleUpdateSource = useCallback((index, field, value) => {
    setSources((prev) =>
      prev.map((source, i) =>
        i === index ? { ...source, [field]: value } : source
      )
    );
    setHasChanges(true);
    setError(null);
  }, []);

  /**
   * Validate sources before save
   */
  const validateSources = useCallback(() => {
    const validSources = sources.filter(
      (s) => s.content && s.content.trim().length >= MIN_CONTENT_LENGTH
    );

    if (sources.length > 0 && validSources.length === 0) {
      return {
        valid: false,
        error: `Each source needs at least ${MIN_CONTENT_LENGTH} characters`,
      };
    }

    return { valid: true, sources: validSources };
  }, [sources]);

  /**
   * Handle save
   */
  const handleSave = useCallback(async () => {
    const validation = validateSources();

    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    // Determine status based on content
    const validSources = validation.sources || [];
    const newStatus = validSources.length > 0 ? 'complete' : 'not_started';

    console.log('[SourcesEditor] Saving:', {
      sourceCount: validSources.length,
      status: newStatus,
    });

    try {
      await onSave({ sources: validSources }, newStatus);
      setHasChanges(false);
    } catch (err) {
      setError(err.message || 'Failed to save');
    }
  }, [validateSources, onSave]);

  // Get active source
  const activeSource = activeSourceIndex !== null ? sources[activeSourceIndex] : null;

  // Calculate total word count
  const totalWordCount = sources.reduce((total, source) => {
    return total + (source.content?.split(/\s+/).filter(Boolean).length || 0);
  }, 0);

  return (
    <div className={styles.container}>
      {/* Info banner */}
      <div className={styles.infoBanner}>
        <p>
          Paste content from your website, blog posts, newsletters, or social media.
          This helps us understand your authentic voice and writing style.
        </p>
        <p className={styles.infoNote}>
          Tip: Include a variety of content types for the best voice analysis.
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className={styles.errorMessage}>
          <AlertCircle className={styles.errorIcon} />
          <span>{error}</span>
        </div>
      )}

      {/* Source tabs */}
      <div className={styles.sourceTabs}>
        {sources.map((source, index) => (
          <div
            key={source.id}
            className={clsx(
              styles.sourceTab,
              activeSourceIndex === index && styles.activeTab
            )}
            onClick={() => setActiveSourceIndex(index)}
            role="tab"
            tabIndex={0}
            aria-selected={activeSourceIndex === index}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveSourceIndex(index);
              }
            }}
          >
            <span className={styles.tabLabel}>
              {source.title || `Source ${index + 1}`}
            </span>
            <button
              className={styles.tabRemove}
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveSource(index);
              }}
              aria-label="Remove source"
            >
              <Trash2 className={styles.tabRemoveIcon} />
            </button>
          </button>
          </div>
        ))}

        {sources.length < MAX_SOURCES && (
          <button className={styles.addSourceButton} onClick={handleAddSource}>
            <Plus className={styles.addIcon} />
            <span>Add Source</span>
          </button>
        )}
      </div>

      {/* Source editor */}
      {activeSource ? (
        <div className={styles.sourceEditor}>
          {/* Source type selector */}
          <div className={styles.typeSelector}>
            <label className={styles.fieldLabel}>Content Type</label>
            <div className={styles.typeOptions}>
              {SOURCE_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    className={clsx(
                      styles.typeOption,
                      activeSource.type === type.id && styles.activeType
                    )}
                    onClick={() =>
                      handleUpdateSource(activeSourceIndex, 'type', type.id)
                    }
                  >
                    <Icon className={styles.typeIcon} />
                    <span>{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <Input
            label="Title (optional)"
            placeholder="e.g., About Page, Welcome Newsletter"
            value={activeSource.title || ''}
            onChange={(e) =>
              handleUpdateSource(activeSourceIndex, 'title', e.target.value)
            }
          />

          {/* Content */}
          <div className={styles.contentField}>
            <label className={styles.fieldLabel}>Content</label>
            <textarea
              className={styles.contentTextarea}
              placeholder="Paste your content here..."
              value={activeSource.content || ''}
              onChange={(e) =>
                handleUpdateSource(activeSourceIndex, 'content', e.target.value)
              }
              rows={12}
            />
            <div className={styles.contentMeta}>
              <span
                className={clsx(
                  styles.charCount,
                  activeSource.content?.length >= MIN_CONTENT_LENGTH && styles.valid
                )}
              >
                {activeSource.content?.length || 0} characters
                {activeSource.content?.length < MIN_CONTENT_LENGTH &&
                  ` (minimum ${MIN_CONTENT_LENGTH})`}
              </span>
              <span className={styles.wordCount}>
                {activeSource.content?.split(/\s+/).filter(Boolean).length || 0} words
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <FileText className={styles.emptyIcon} />
          <h4>No sources yet</h4>
          <p>Add your first content source to get started with voice analysis.</p>
          <Button onClick={handleAddSource} leftIcon={Plus}>
            Add Your First Source
          </Button>
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.footerStats}>
          {sources.length > 0 && (
            <>
              <span>{sources.length} source(s)</span>
              <span className={styles.divider}>|</span>
              <span>{totalWordCount.toLocaleString()} total words</span>
            </>
          )}
        </div>

        <div className={styles.footerActions}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanges && sources.length === (data.sources?.length || 0)}
            leftIcon={Save}
          >
            Save Sources
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SourcesEditor;
