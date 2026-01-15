/**
 * ============================================================================
 * EDITABLE TEXT COMPONENT
 * ============================================================================
 * A reusable inline text editing component with save/cancel functionality.
 * Supports single-line input or multiline textarea.
 *
 * Features:
 * - Click to edit mode
 * - Save/Cancel buttons
 * - Loading state during save
 * - Error handling with comprehensive logging
 * - Keyboard shortcuts (Enter to save, Escape to cancel)
 * - Character limit validation
 * ============================================================================
 */

import { useState, useRef, useEffect } from 'react';
import { Edit3, Check, X, AlertCircle } from 'lucide-react';
import { Button } from '@components/shared';
import styles from './EditableText.module.css';

/**
 * Log levels for consistent error logging
 */
const LOG_PREFIX = '[EditableText]';

/**
 * EditableText component for inline editing of text content
 *
 * @param {Object} props
 * @param {string} props.value - Current text value
 * @param {Function} props.onSave - Async function called with new value when saving
 * @param {string} props.placeholder - Placeholder text for empty input
 * @param {boolean} props.multiline - Use textarea instead of input (default: false)
 * @param {number} props.maxLength - Maximum character limit (optional)
 * @param {number} props.minLength - Minimum character limit (default: 1)
 * @param {string} props.className - Additional CSS class for wrapper
 * @param {string} props.textClassName - Additional CSS class for display text
 * @param {boolean} props.disabled - Disable editing (default: false)
 * @param {string} props.label - Accessible label for the edit button
 * @param {boolean} props.showEditButton - Show edit button on hover (default: true)
 * @param {number} props.rows - Number of rows for textarea (default: 3)
 * @param {Function} props.onCancel - Optional callback when edit is cancelled
 * @param {string} props.itemId - Identifier for logging purposes
 */
function EditableText({
  value,
  onSave,
  placeholder = 'Enter text...',
  multiline = false,
  maxLength,
  minLength = 1,
  className = '',
  textClassName = '',
  disabled = false,
  label = 'Edit',
  showEditButton = true,
  rows = 3,
  onCancel,
  itemId = 'unknown',
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Sync edit value when external value changes (and not editing)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value || '');
    }
  }, [value, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Select all text for easy replacement
      if (inputRef.current.select) {
        inputRef.current.select();
      }
      console.log(`${LOG_PREFIX} Edit mode started for item: ${itemId}`);
    }
  }, [isEditing, itemId]);

  /**
   * Start editing mode
   */
  function handleStartEdit() {
    if (disabled) {
      console.log(`${LOG_PREFIX} Edit blocked - component is disabled (item: ${itemId})`);
      return;
    }
    setError(null);
    setEditValue(value || '');
    setIsEditing(true);
  }

  /**
   * Cancel editing and revert changes
   */
  function handleCancel() {
    console.log(`${LOG_PREFIX} Edit cancelled for item: ${itemId}`);
    setIsEditing(false);
    setEditValue(value || '');
    setError(null);
    if (onCancel) {
      onCancel();
    }
  }

  /**
   * Validate and save the edited value
   */
  async function handleSave() {
    const trimmedValue = editValue.trim();

    // Validation
    if (trimmedValue.length < minLength) {
      const errorMsg = `Text must be at least ${minLength} character${minLength > 1 ? 's' : ''}`;
      console.warn(`${LOG_PREFIX} Validation failed for item ${itemId}: ${errorMsg}`, {
        value: trimmedValue,
        minLength,
        actualLength: trimmedValue.length,
      });
      setError(errorMsg);
      return;
    }

    if (maxLength && trimmedValue.length > maxLength) {
      const errorMsg = `Text must be ${maxLength} characters or less`;
      console.warn(`${LOG_PREFIX} Validation failed for item ${itemId}: ${errorMsg}`, {
        value: trimmedValue.substring(0, 50) + '...',
        maxLength,
        actualLength: trimmedValue.length,
      });
      setError(errorMsg);
      return;
    }

    // Skip save if value unchanged
    if (trimmedValue === (value || '').trim()) {
      console.log(`${LOG_PREFIX} No changes detected for item: ${itemId}, closing editor`);
      setIsEditing(false);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      console.log(`${LOG_PREFIX} Saving changes for item: ${itemId}`, {
        previousLength: (value || '').length,
        newLength: trimmedValue.length,
      });

      await onSave(trimmedValue);

      console.log(`${LOG_PREFIX} Save successful for item: ${itemId}`);
      setIsEditing(false);
    } catch (err) {
      const errorMsg = err.message || 'Failed to save changes';
      console.error(`${LOG_PREFIX} Save failed for item: ${itemId}`, {
        error: err.message,
        errorStack: err.stack,
        itemId,
        valueLength: trimmedValue.length,
      });
      setError(errorMsg);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Handle keyboard events
   */
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Enter' && e.metaKey && multiline) {
      // Cmd/Ctrl + Enter to save in multiline mode
      e.preventDefault();
      handleSave();
    }
  }

  /**
   * Handle input change with character limit feedback
   */
  function handleChange(e) {
    const newValue = e.target.value;
    setEditValue(newValue);

    // Clear error when user starts typing
    if (error) {
      setError(null);
    }

    // Log if approaching character limit
    if (maxLength && newValue.length > maxLength * 0.9) {
      console.log(`${LOG_PREFIX} Approaching character limit for item: ${itemId}`, {
        currentLength: newValue.length,
        maxLength,
        remaining: maxLength - newValue.length,
      });
    }
  }

  // Render edit mode
  if (isEditing) {
    const InputComponent = multiline ? 'textarea' : 'input';
    const charCount = editValue.length;
    const showCharCount = maxLength && charCount > maxLength * 0.7;

    return (
      <div className={`${styles.editContainer} ${className}`}>
        <div className={styles.inputWrapper}>
          <InputComponent
            ref={inputRef}
            type={multiline ? undefined : 'text'}
            value={editValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={saving}
            rows={multiline ? rows : undefined}
            className={`${styles.input} ${multiline ? styles.textarea : ''} ${error ? styles.inputError : ''}`}
            aria-label={label}
            aria-invalid={!!error}
            aria-describedby={error ? 'edit-error' : undefined}
          />
          {showCharCount && (
            <span
              className={`${styles.charCount} ${charCount > maxLength ? styles.charCountOver : ''}`}
            >
              {charCount}/{maxLength}
            </span>
          )}
        </div>

        {error && (
          <div id="edit-error" className={styles.errorMessage} role="alert">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <div className={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            leftIcon={Check}
            onClick={handleSave}
            loading={saving}
            disabled={saving || editValue.trim().length < minLength}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={X}
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Render display mode
  return (
    <div className={`${styles.displayContainer} ${className}`}>
      <span className={`${styles.displayText} ${textClassName}`}>
        {value || <span className={styles.placeholder}>{placeholder}</span>}
      </span>
      {showEditButton && !disabled && (
        <button
          type="button"
          className={styles.editButton}
          onClick={handleStartEdit}
          title={label}
          aria-label={label}
        >
          <Edit3 size={14} />
        </button>
      )}
    </div>
  );
}

export default EditableText;
