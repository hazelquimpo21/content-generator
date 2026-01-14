/**
 * ============================================================================
 * CONFIRM DIALOG COMPONENT
 * ============================================================================
 * A specialized modal for confirmation dialogs, especially for destructive
 * actions like delete. Provides clear messaging, cancel/confirm buttons,
 * and optional loading state.
 *
 * Usage:
 *   <ConfirmDialog
 *     isOpen={showDialog}
 *     onClose={() => setShowDialog(false)}
 *     onConfirm={handleDelete}
 *     title="Delete Episode"
 *     message="Are you sure you want to delete this episode?"
 *     confirmLabel="Delete"
 *     variant="danger"
 *   />
 * ============================================================================
 */

import { useState } from 'react';
import { AlertTriangle, Trash2, AlertCircle, Info } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import styles from './ConfirmDialog.module.css';

/**
 * Icons for different dialog variants
 */
const VARIANT_ICONS = {
  danger: Trash2,
  warning: AlertTriangle,
  info: Info,
};

/**
 * ConfirmDialog component
 *
 * @param {boolean} isOpen - Whether the dialog is visible
 * @param {Function} onClose - Called when dialog should close (cancel, backdrop click, etc.)
 * @param {Function} onConfirm - Called when user confirms the action
 * @param {string} title - Dialog title (e.g., "Delete Episode")
 * @param {string} message - Main confirmation message
 * @param {string} [description] - Optional additional description/warning text
 * @param {string} [confirmLabel="Confirm"] - Label for the confirm button
 * @param {string} [cancelLabel="Cancel"] - Label for the cancel button
 * @param {string} [variant="danger"] - Visual variant: "danger", "warning", or "info"
 * @param {boolean} [loading=false] - Shows loading state on confirm button
 * @param {boolean} [disabled=false] - Disables confirm button
 */
function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  disabled = false,
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  // Get the appropriate icon for this variant
  const IconComponent = VARIANT_ICONS[variant] || AlertCircle;

  /**
   * Handle confirm action with internal loading state management
   * This allows async onConfirm handlers to show loading state
   */
  async function handleConfirm() {
    try {
      setIsConfirming(true);
      await onConfirm();
    } catch (error) {
      // Error handling is delegated to the parent component
      // We just re-throw after resetting our state
      setIsConfirming(false);
      throw error;
    } finally {
      // Only reset if the dialog is still open (it might close on success)
      if (isOpen) {
        setIsConfirming(false);
      }
    }
  }

  /**
   * Handle cancel/close
   * Prevents closing while an action is in progress
   */
  function handleClose() {
    if (!isConfirming && !loading) {
      onClose();
    }
  }

  // Determine if we're in a loading state (either prop or internal)
  const isLoading = loading || isConfirming;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size="sm"
      closeOnBackdrop={!isLoading}
      closeOnEscape={!isLoading}
      showCloseButton={!isLoading}
      footer={
        <div className={styles.footer}>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            loading={isLoading}
            disabled={disabled}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className={styles.content}>
        {/* Icon with variant-specific styling */}
        <div className={`${styles.iconWrapper} ${styles[variant]}`}>
          <IconComponent className={styles.icon} />
        </div>

        {/* Message */}
        <div className={styles.textContent}>
          <p className={styles.message}>{message}</p>

          {/* Optional description for additional context */}
          {description && (
            <p className={styles.description}>{description}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
