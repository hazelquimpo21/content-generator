/**
 * ============================================================================
 * SPINNER COMPONENT
 * ============================================================================
 * Loading spinner with optional text and size variants.
 * ============================================================================
 */

import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import styles from './Spinner.module.css';

/**
 * Spinner component for loading states
 */
function Spinner({
  size = 'md',
  text,
  centered = false,
  className,
  ...props
}) {
  return (
    <div
      className={clsx(
        styles.container,
        centered && styles.centered,
        className
      )}
      role="status"
      aria-label={text || 'Loading'}
      {...props}
    >
      <Loader2 className={clsx(styles.spinner, styles[size])} />
      {text && <span className={styles.text}>{text}</span>}
    </div>
  );
}

export default Spinner;
