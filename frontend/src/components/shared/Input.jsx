/**
 * ============================================================================
 * INPUT COMPONENT
 * ============================================================================
 * Form input field with label, error state, and helper text support.
 * Supports text, email, password, number, and textarea variants.
 * ============================================================================
 */

import { forwardRef, useId } from 'react';
import clsx from 'clsx';
import styles from './Input.module.css';

/**
 * Input component for form fields
 */
const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    multiline = false,
    rows = 4,
    fullWidth = true,
    required = false,
    disabled = false,
    className,
    containerClassName,
    ...props
  },
  ref
) {
  // Generate unique ID for accessibility
  const generatedId = useId();
  const inputId = props.id || generatedId;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  // Common props for input/textarea
  const fieldProps = {
    ref,
    id: inputId,
    disabled,
    required,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': error ? errorId : helperText ? helperId : undefined,
    className: clsx(
      styles.field,
      error && styles.error,
      disabled && styles.disabled,
      className
    ),
    ...props,
  };

  return (
    <div className={clsx(styles.container, fullWidth && styles.fullWidth, containerClassName)}>
      {/* Label */}
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}

      {/* Input or Textarea */}
      {multiline ? (
        <textarea rows={rows} {...fieldProps} />
      ) : (
        <input {...fieldProps} />
      )}

      {/* Error message */}
      {error && (
        <p id={errorId} className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      {/* Helper text */}
      {!error && helperText && (
        <p id={helperId} className={styles.helperText}>
          {helperText}
        </p>
      )}
    </div>
  );
});

export default Input;
