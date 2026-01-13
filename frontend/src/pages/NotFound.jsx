/**
 * ============================================================================
 * NOT FOUND PAGE
 * ============================================================================
 * 404 error page for unmatched routes.
 * ============================================================================
 */

import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@components/shared';
import styles from './NotFound.module.css';

/**
 * NotFound page component
 */
function NotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.code}>404</h1>
        <h2 className={styles.title}>Page Not Found</h2>
        <p className={styles.message}>
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className={styles.actions}>
          <Button
            as={Link}
            to="/"
            leftIcon={Home}
          >
            Back to Dashboard
          </Button>

          <Button
            variant="secondary"
            onClick={() => window.history.back()}
            leftIcon={ArrowLeft}
          >
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
