/**
 * ============================================================================
 * TOAST NOTIFICATION COMPONENT
 * ============================================================================
 * Global toast notification system for displaying temporary messages.
 * Supports different variants (info, success, warning, error) and auto-dismiss.
 *
 * Usage:
 *   import { useToast } from '@components/shared';
 *   const { showToast } = useToast();
 *   showToast({ message: 'Processing started!', variant: 'info' });
 * ============================================================================
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, Info, CheckCircle2, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';
import styles from './Toast.module.css';

// ============================================================================
// CONTEXT
// ============================================================================

const ToastContext = createContext(null);

/**
 * Toast Provider - wrap your app with this to enable toasts
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback(({
    message,
    description,
    variant = 'info',
    duration = 5000,
    persistent = false,
    action,
    actionLabel,
  }) => {
    const id = Date.now() + Math.random();

    setToasts((prev) => [
      ...prev,
      { id, message, description, variant, duration, persistent, action, actionLabel },
    ]);

    // Auto-dismiss non-persistent toasts
    if (!persistent && duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }

    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, dismissAll }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

/**
 * Hook to access toast functions
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Toast container - renders all active toasts
 */
function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/**
 * Individual toast item
 */
function ToastItem({ toast, onDismiss }) {
  const { id, message, description, variant, action, actionLabel } = toast;

  const Icon = getVariantIcon(variant);

  return (
    <div className={`${styles.toast} ${styles[variant]}`} role="alert">
      <div className={styles.iconWrapper}>
        <Icon className={styles.icon} />
      </div>

      <div className={styles.content}>
        <p className={styles.message}>{message}</p>
        {description && <p className={styles.description}>{description}</p>}
        {action && (
          <button className={styles.action} onClick={action}>
            {actionLabel || 'View'}
          </button>
        )}
      </div>

      <button
        className={styles.dismiss}
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getVariantIcon(variant) {
  switch (variant) {
    case 'success':
      return CheckCircle2;
    case 'warning':
      return AlertTriangle;
    case 'error':
      return AlertCircle;
    case 'processing':
      return Loader2;
    case 'info':
    default:
      return Info;
  }
}

export default ToastProvider;
