/**
 * ============================================================================
 * CARD COMPONENT
 * ============================================================================
 * Container component with optional header, footer, and padding variants.
 * Used for grouping related content.
 * ============================================================================
 */

import clsx from 'clsx';
import styles from './Card.module.css';

/**
 * Card component
 */
function Card({
  children,
  title,
  subtitle,
  headerAction,
  footer,
  padding = 'md',
  hoverable = false,
  onClick,
  className,
  ...props
}) {
  // Handle keyboard events for accessibility when card is clickable
  const handleKeyDown = (e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(e);
    }
  };

  return (
    <div
      className={clsx(
        styles.card,
        styles[`padding-${padding}`],
        hoverable && styles.hoverable,
        onClick && styles.clickable,
        className
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {/* Header */}
      {(title || headerAction) && (
        <div className={styles.header}>
          <div className={styles.headerContent}>
            {title && <h3 className={styles.title}>{title}</h3>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {headerAction && (
            <div className={styles.headerAction}>{headerAction}</div>
          )}
        </div>
      )}

      {/* Body */}
      <div className={styles.body}>{children}</div>

      {/* Footer */}
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}

/**
 * Card.Section - Divider section within a card
 */
Card.Section = function CardSection({ children, className, ...props }) {
  return (
    <div className={clsx(styles.section, className)} {...props}>
      {children}
    </div>
  );
};

export default Card;
