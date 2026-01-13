/**
 * ============================================================================
 * PROGRESS BAR COMPONENT
 * ============================================================================
 * Visual progress indicator with percentage and optional label.
 * Supports segmented mode for stage-based progress.
 * ============================================================================
 */

import clsx from 'clsx';
import styles from './ProgressBar.module.css';

/**
 * ProgressBar component
 */
function ProgressBar({
  value = 0,
  max = 100,
  label,
  showPercentage = true,
  size = 'md',
  segments,
  variant = 'primary',
  animated = false,
  className,
}) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);

  return (
    <div className={clsx(styles.container, className)}>
      {/* Label row */}
      {(label || showPercentage) && (
        <div className={styles.labelRow}>
          {label && <span className={styles.label}>{label}</span>}
          {showPercentage && (
            <span className={styles.percentage}>{percentage}%</span>
          )}
        </div>
      )}

      {/* Progress track */}
      <div
        className={clsx(styles.track, styles[size])}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label || `Progress: ${percentage}%`}
      >
        {segments ? (
          // Segmented mode
          <div className={styles.segments}>
            {Array.from({ length: segments }).map((_, index) => {
              const segmentValue = ((index + 1) / segments) * max;
              const isComplete = value >= segmentValue;
              const isActive = value >= (index / segments) * max && !isComplete;

              return (
                <div
                  key={index}
                  className={clsx(
                    styles.segment,
                    isComplete && styles.segmentComplete,
                    isActive && styles.segmentActive,
                    animated && isActive && styles.animated
                  )}
                />
              );
            })}
          </div>
        ) : (
          // Continuous mode
          <div
            className={clsx(
              styles.fill,
              styles[variant],
              animated && styles.animated
            )}
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
    </div>
  );
}

export default ProgressBar;
