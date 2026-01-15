/**
 * ============================================================================
 * BUTTON COMPONENT
 * ============================================================================
 * Reusable button with multiple variants and sizes.
 *
 * Variants:
 * - primary: Filled sage (main actions)
 * - secondary: Outlined (secondary actions)
 * - ghost: Text only (tertiary actions)
 * - danger: Red (destructive actions)
 *
 * Sizes:
 * - sm: Small buttons (28px height)
 * - md: Medium buttons (36px height) - default
 * - lg: Large buttons (44px height)
 * ============================================================================
 */

import { forwardRef } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import styles from './Button.module.css';

/**
 * Button component with variants and loading state
 */
const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    disabled = false,
    loading = false,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    type = 'button',
    className,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={clsx(
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        loading && styles.loading,
        className
      )}
      {...props}
    >
      {/* Loading spinner */}
      {loading && (
        <Loader2 className={styles.spinner} aria-hidden="true" />
      )}

      {/* Left icon */}
      {!loading && LeftIcon && (
        <LeftIcon className={styles.icon} aria-hidden="true" />
      )}

      {/* Button text */}
      <span className={styles.text}>{children}</span>

      {/* Right icon */}
      {RightIcon && (
        <RightIcon className={styles.icon} aria-hidden="true" />
      )}
    </button>
  );
});

export default Button;
