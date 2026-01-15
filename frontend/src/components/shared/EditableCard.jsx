/**
 * ============================================================================
 * EDITABLE CARD COMPONENT
 * ============================================================================
 * A reusable card component for editing complex items with multiple fields.
 * Supports inline editing with save/cancel/delete functionality.
 *
 * Features:
 * - Multi-field editing
 * - Delete confirmation
 * - Loading states
 * - Comprehensive error logging
 * - Keyboard navigation
 * ============================================================================
 */

import { useState, useRef, useEffect } from 'react';
import { Edit3, Check, X, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@components/shared';
import styles from './EditableCard.module.css';

/**
 * Log prefix for consistent logging
 */
const LOG_PREFIX = '[EditableCard]';

/**
 * Field configuration type
 * @typedef {Object} FieldConfig
 * @property {string} key - Field key in the item object
 * @property {string} label - Display label
 * @property {boolean} required - Whether field is required
 * @property {boolean} multiline - Use textarea (default: false)
 * @property {number} maxLength - Maximum character limit
 * @property {string} placeholder - Placeholder text
 * @property {number} rows - Rows for textarea (default: 2)
 */

/**
 * EditableCard component for editing multi-field items
 *
 * @param {Object} props
 * @param {Object} props.item - The item data object
 * @param {FieldConfig[]} props.fields - Array of field configurations
 * @param {Function} props.onSave - Async function called with updated item
 * @param {Function} props.onDelete - Async function called to delete item (optional)
 * @param {boolean} props.canDelete - Whether delete is allowed (default: true if onDelete provided)
 * @param {string} props.className - Additional CSS class
 * @param {boolean} props.disabled - Disable editing
 * @param {string} props.itemId - Identifier for logging
 * @param {React.ReactNode} props.children - Content to render in view mode
 * @param {React.ReactNode} props.actions - Additional action buttons for view mode
 * @param {Function} props.renderViewMode - Custom render function for view mode
 * @param {string} props.deleteConfirmText - Text for delete confirmation
 */
function EditableCard({
  item,
  fields,
  onSave,
  onDelete,
  canDelete = !!onDelete,
  className = '',
  disabled = false,
  itemId = 'unknown',
  children,
  actions,
  renderViewMode,
  deleteConfirmText = 'Are you sure you want to delete this item?',
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);
  const firstInputRef = useRef(null);

  // Sync edit values if item prop changes while in edit mode (edge case)
  useEffect(() => {
    if (isEditing && item) {
      // Only update fields that haven't been modified by the user
      setEditValues((prev) => {
        const updated = { ...prev };
        let hasChanges = false;
        fields.forEach((field) => {
          // Only sync if value is still at its original state
          if (prev[field.key] === '' && item[field.key]) {
            updated[field.key] = item[field.key];
            hasChanges = true;
          }
        });
        return hasChanges ? updated : prev;
      });
    }
  }, [item, fields, isEditing]);

  // Focus first input when entering edit mode
  useEffect(() => {
    if (isEditing && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [isEditing]);

  /**
   * Start editing mode
   */
  function handleStartEdit() {
    if (disabled) {
      console.log(`${LOG_PREFIX} Edit blocked - component is disabled (item: ${itemId})`);
      return;
    }

    // Initialize values synchronously to avoid blank state on first render
    const initialValues = {};
    fields.forEach((field) => {
      initialValues[field.key] = item?.[field.key] || '';
    });
    setEditValues(initialValues);
    setErrors({});
    setGeneralError(null);

    console.log(`${LOG_PREFIX} Edit mode started for item: ${itemId}`, {
      fieldCount: fields.length,
      fieldKeys: fields.map((f) => f.key),
    });

    setIsEditing(true);
  }

  /**
   * Cancel editing
   */
  function handleCancel() {
    console.log(`${LOG_PREFIX} Edit cancelled for item: ${itemId}`);
    setIsEditing(false);
    setEditValues({});
    setErrors({});
    setGeneralError(null);
    setShowDeleteConfirm(false);
  }

  /**
   * Update a field value
   */
  function handleFieldChange(key, value) {
    setEditValues((prev) => ({
      ...prev,
      [key]: value,
    }));

    // Clear field error when user types
    if (errors[key]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  }

  /**
   * Validate all fields
   * @returns {boolean} True if valid
   */
  function validateFields() {
    const newErrors = {};
    let isValid = true;

    fields.forEach((field) => {
      const value = (editValues[field.key] || '').trim();

      // Required check
      if (field.required && !value) {
        newErrors[field.key] = `${field.label} is required`;
        isValid = false;
        console.warn(`${LOG_PREFIX} Validation failed for item ${itemId}:`, {
          field: field.key,
          error: 'Required field is empty',
        });
      }

      // Max length check
      if (field.maxLength && value.length > field.maxLength) {
        newErrors[field.key] = `${field.label} must be ${field.maxLength} characters or less`;
        isValid = false;
        console.warn(`${LOG_PREFIX} Validation failed for item ${itemId}:`, {
          field: field.key,
          error: 'Exceeds max length',
          maxLength: field.maxLength,
          actualLength: value.length,
        });
      }
    });

    setErrors(newErrors);
    return isValid;
  }

  /**
   * Save changes
   */
  async function handleSave() {
    if (!validateFields()) {
      return;
    }

    // Build updated item
    const updatedItem = { ...item };
    fields.forEach((field) => {
      updatedItem[field.key] = (editValues[field.key] || '').trim();
    });

    // Check if anything actually changed
    let hasChanges = false;
    fields.forEach((field) => {
      if ((item?.[field.key] || '').trim() !== updatedItem[field.key]) {
        hasChanges = true;
      }
    });

    if (!hasChanges) {
      console.log(`${LOG_PREFIX} No changes detected for item: ${itemId}, closing editor`);
      setIsEditing(false);
      return;
    }

    try {
      setSaving(true);
      setGeneralError(null);

      console.log(`${LOG_PREFIX} Saving changes for item: ${itemId}`, {
        changedFields: fields
          .filter((f) => (item?.[f.key] || '').trim() !== updatedItem[f.key])
          .map((f) => f.key),
      });

      await onSave(updatedItem);

      console.log(`${LOG_PREFIX} Save successful for item: ${itemId}`);
      setIsEditing(false);
    } catch (err) {
      const errorMsg = err.message || 'Failed to save changes';
      console.error(`${LOG_PREFIX} Save failed for item: ${itemId}`, {
        error: err.message,
        errorStack: err.stack,
        itemId,
        editValues,
      });
      setGeneralError(errorMsg);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Handle delete
   */
  async function handleDelete() {
    if (!onDelete) {
      console.error(`${LOG_PREFIX} Delete called but no onDelete handler provided (item: ${itemId})`);
      return;
    }

    try {
      setDeleting(true);
      setGeneralError(null);

      console.log(`${LOG_PREFIX} Deleting item: ${itemId}`);

      await onDelete(item);

      console.log(`${LOG_PREFIX} Delete successful for item: ${itemId}`);
      // Parent will remove from list, no need to close edit mode
    } catch (err) {
      const errorMsg = err.message || 'Failed to delete item';
      console.error(`${LOG_PREFIX} Delete failed for item: ${itemId}`, {
        error: err.message,
        errorStack: err.stack,
        itemId,
      });
      setGeneralError(errorMsg);
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  /**
   * Handle keyboard events
   */
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }

  // Render edit mode
  if (isEditing) {
    return (
      <div className={`${styles.editCard} ${className}`} onKeyDown={handleKeyDown}>
        {/* Delete confirmation overlay */}
        {showDeleteConfirm && (
          <div className={styles.deleteConfirmOverlay}>
            <div className={styles.deleteConfirm}>
              <p>{deleteConfirmText}</p>
              <div className={styles.deleteConfirmActions}>
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={Trash2}
                  onClick={handleDelete}
                  loading={deleting}
                >
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit form */}
        <div className={styles.editForm}>
          {fields.map((field, index) => {
            const InputComponent = field.multiline ? 'textarea' : 'input';
            const value = editValues[field.key] || '';
            const fieldError = errors[field.key];
            const showCharCount = field.maxLength && value.length > field.maxLength * 0.7;

            return (
              <div key={field.key} className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {field.label}
                  {field.required && <span className={styles.required}>*</span>}
                </label>
                <div className={styles.inputWrapper}>
                  <InputComponent
                    ref={index === 0 ? firstInputRef : null}
                    type={field.multiline ? undefined : 'text'}
                    value={value}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                    disabled={saving || deleting}
                    rows={field.multiline ? field.rows || 2 : undefined}
                    className={`${styles.input} ${field.multiline ? styles.textarea : ''} ${fieldError ? styles.inputError : ''}`}
                    aria-invalid={!!fieldError}
                    aria-describedby={fieldError ? `error-${field.key}` : undefined}
                  />
                  {showCharCount && (
                    <span
                      className={`${styles.charCount} ${value.length > field.maxLength ? styles.charCountOver : ''}`}
                    >
                      {value.length}/{field.maxLength}
                    </span>
                  )}
                </div>
                {fieldError && (
                  <div id={`error-${field.key}`} className={styles.fieldError} role="alert">
                    <AlertCircle size={12} />
                    <span>{fieldError}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* General error */}
        {generalError && (
          <div className={styles.generalError} role="alert">
            <AlertCircle size={14} />
            <span>{generalError}</span>
          </div>
        )}

        {/* Actions */}
        <div className={styles.editActions}>
          <div className={styles.saveActions}>
            <Button
              variant="primary"
              size="sm"
              leftIcon={Check}
              onClick={handleSave}
              loading={saving}
              disabled={saving || deleting}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={X}
              onClick={handleCancel}
              disabled={saving || deleting}
            >
              Cancel
            </Button>
          </div>
          {canDelete && onDelete && (
            <Button
              variant="danger"
              size="sm"
              leftIcon={Trash2}
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving || deleting || showDeleteConfirm}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Render view mode
  return (
    <div className={`${styles.viewCard} ${className}`}>
      {renderViewMode ? (
        renderViewMode(item)
      ) : (
        children
      )}
      <div className={styles.viewActions}>
        {!disabled && (
          <button
            type="button"
            className={styles.editButton}
            onClick={handleStartEdit}
            title="Edit"
            aria-label="Edit item"
          >
            <Edit3 size={14} />
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}

export default EditableCard;
