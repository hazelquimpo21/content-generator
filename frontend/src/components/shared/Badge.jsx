/**
 * ============================================================================
 * BADGE COMPONENT
 * ============================================================================
 * Small label for status indicators, tags, and counts.
 *
 * Variants:
 * - default: Neutral gray
 * - primary: Sage accent
 * - success: Green
 * - warning: Slate
 * - error: Red
 * - info: Blue
 *
 * Status-specific (auto-colored):
 * - pending, processing, completed, failed
 * ============================================================================
 */

import clsx from 'clsx';
import styles from './Badge.module.css';

// Status to variant mapping
const STATUS_VARIANTS = {
  pending: 'default',
  processing: 'warning',
  completed: 'success',
  failed: 'error',
  error: 'error',
};

/**
 * Badge component for labels and status
 */
function Badge({
  children,
  variant = 'default',
  status,
  size = 'md',
  dot = false,
  className,
  ...props
}) {
  // If status is provided, use the mapped variant
  const resolvedVariant = status ? STATUS_VARIANTS[status] || 'default' : variant;

  return (
    <span
      className={clsx(
        styles.badge,
        styles[resolvedVariant],
        styles[size],
        className
      )}
      {...props}
    >
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}

export default Badge;
