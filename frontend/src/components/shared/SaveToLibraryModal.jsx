/**
 * ============================================================================
 * SAVE TO LIBRARY MODAL COMPONENT
 * ============================================================================
 * Modal for saving content to the library.
 * Allows users to set title, tags, and mark as favorite.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { Bookmark, Tag, X, Star } from 'lucide-react';
import clsx from 'clsx';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import styles from './SaveToLibraryModal.module.css';

/**
 * SaveToLibraryModal component
 */
function SaveToLibraryModal({
  isOpen,
  onClose,
  onSave,
  initialData = {},
  contentType = 'blog',
  platform = null,
  content = '',
  loading = false,
}) {
  // Form state
  const [title, setTitle] = useState(initialData.title || '');
  const [tags, setTags] = useState(initialData.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [isFavorite, setIsFavorite] = useState(initialData.is_favorite || false);

  // Reset form when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setTitle(initialData.title || '');
      setTags(initialData.tags || []);
      setTagInput('');
      setIsFavorite(initialData.is_favorite || false);
    }
  }, [isOpen, initialData.title, initialData.tags, initialData.is_favorite]);

  // Generate default title from content if needed
  useEffect(() => {
    if (isOpen && !title && content) {
      // Use first line or first 50 chars as default title
      const firstLine = content.split('\n')[0].replace(/^#+ /, '');
      const defaultTitle = firstLine.length > 50
        ? firstLine.substring(0, 47) + '...'
        : firstLine;
      setTitle(defaultTitle);
    }
  }, [isOpen, title, content]);

  // Handle tag input
  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  const addTag = () => {
    const newTag = tagInput.trim().toLowerCase();
    if (newTag && !tags.includes(newTag) && tags.length < 10) {
      setTags([...tags, newTag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  // Get content type display name
  const getContentTypeLabel = () => {
    const labels = {
      blog: 'Blog Post',
      social: platform ? `${platform.charAt(0).toUpperCase() + platform.slice(1)} Post` : 'Social Post',
      email: 'Email',
      headline: 'Headline',
      quote: 'Quote',
    };
    return labels[contentType] || 'Content';
  };

  // Handle form submit
  const handleSubmit = () => {
    if (!title.trim()) return;

    onSave({
      title: title.trim(),
      tags,
      is_favorite: isFavorite,
    });
  };

  // Content preview
  const contentPreview = content.length > 300
    ? content.substring(0, 297) + '...'
    : content;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Save to Library"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!title.trim() || loading}
            loading={loading}
            leftIcon={Bookmark}
          >
            Save to Library
          </Button>
        </>
      }
    >
      <div className={styles.content}>
        {/* Content Type Badge */}
        <div className={styles.contentTypeBadge}>
          {getContentTypeLabel()}
        </div>

        {/* Title Input */}
        <div className={styles.section}>
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a title for this content..."
            required
            error={title.trim() === '' ? 'Title is required' : undefined}
          />
        </div>

        {/* Tags Section */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>
            <Tag size={16} />
            Tags (Optional)
          </label>

          <div className={styles.tagsContainer}>
            {/* Existing tags */}
            <div className={styles.tagsList}>
              {tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                  <button
                    type="button"
                    className={styles.tagRemove}
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>

            {/* Tag input */}
            {tags.length < 10 && (
              <div className={styles.tagInputContainer}>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={addTag}
                  placeholder={tags.length === 0 ? 'Add tags...' : 'Add more...'}
                  className={styles.tagInput}
                />
              </div>
            )}
          </div>

          <p className={styles.tagHint}>
            Press Enter or comma to add a tag ({10 - tags.length} remaining)
          </p>
        </div>

        {/* Favorite Toggle */}
        <div className={styles.section}>
          <label className={clsx(styles.favoriteToggle, isFavorite && styles.active)}>
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
            />
            <Star size={16} className={styles.favoriteIcon} />
            <span>Mark as favorite</span>
          </label>
        </div>

        {/* Content Preview */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>Content Preview</label>
          <div className={styles.contentPreview}>
            {contentPreview}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default SaveToLibraryModal;
