/**
 * ============================================================================
 * IMPORT CONTENT COMPONENT
 * ============================================================================
 * Step in onboarding that allows users to import content from their
 * website, podcast, or bio text for AI analysis and profile enrichment.
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import {
  Globe,
  Mic,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Button, Input, Spinner } from '@components/shared';
import api from '@utils/api-client';
import styles from './ImportContent.module.css';

// Import types configuration
const IMPORT_TYPES = {
  website: {
    id: 'website',
    label: 'Website',
    icon: Globe,
    placeholder: 'https://yourpractice.com',
    helpText: 'Enter your website URL to import your about page, services, and bio',
    inputType: 'url',
  },
  podcast: {
    id: 'podcast_rss',
    label: 'Podcast RSS',
    icon: Mic,
    placeholder: 'https://feeds.example.com/yourpodcast',
    helpText: 'Enter your podcast RSS feed URL',
    inputType: 'url',
  },
  bio: {
    id: 'bio_text',
    label: 'Bio Text',
    icon: FileText,
    placeholder: 'Paste your bio or about page text here...',
    helpText: 'Paste at least 50 characters from your existing bio',
    inputType: 'textarea',
  },
};

// Job status polling interval
const POLL_INTERVAL = 2000;

/**
 * Import Content component for profile enrichment
 *
 * @param {Object} props
 * @param {Object} props.properties - Properties checklist data (has_website, etc.)
 * @param {Function} props.onComplete - Called when import is done with extracted data
 * @param {Function} props.onSkip - Called when user skips import
 */
function ImportContent({ properties = {}, onComplete, onSkip }) {
  // Determine which import options to show based on properties
  const availableImports = [];
  if (properties.has_website) availableImports.push('website');
  if (properties.has_podcast) availableImports.push('podcast');
  if (properties.has_bio) availableImports.push('bio');

  const [activeImport, setActiveImport] = useState(availableImports[0] || null);
  const [inputValue, setInputValue] = useState('');
  const [jobs, setJobs] = useState({}); // { [type]: { id, status, data, error } }
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pollRef = useRef(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  // Poll for job status updates
  useEffect(() => {
    const processingJobs = Object.values(jobs).filter(
      (job) => job.status === 'pending' || job.status === 'processing'
    );

    if (processingJobs.length > 0 && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        for (const job of processingJobs) {
          try {
            const response = await api.brandDiscovery.getScrapeJob(job.id);
            setJobs((prev) => ({
              ...prev,
              [job.type]: {
                ...prev[job.type],
                status: response.job.status,
                data: response.job.extractedData,
                error: response.job.error,
              },
            }));
          } catch (err) {
            console.error('Failed to poll job status:', err);
          }
        }
      }, POLL_INTERVAL);
    } else if (processingJobs.length === 0 && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current && processingJobs.length === 0) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobs]);

  const handleSubmit = async () => {
    if (!activeImport || !inputValue.trim()) return;

    const importConfig = IMPORT_TYPES[activeImport];
    setIsSubmitting(true);

    try {
      const params = {
        type: importConfig.id,
      };

      if (importConfig.inputType === 'textarea') {
        params.text = inputValue.trim();
      } else {
        params.url = inputValue.trim();
      }

      const response = await api.brandDiscovery.startScrapeJob(params);

      setJobs((prev) => ({
        ...prev,
        [activeImport]: {
          id: response.job.id,
          type: activeImport,
          status: response.job.status,
          data: null,
          error: null,
        },
      }));

      // Clear input and move to next available import type
      setInputValue('');
      const nextImport = availableImports.find(
        (type) => type !== activeImport && !jobs[type]
      );
      if (nextImport) {
        setActiveImport(nextImport);
      }
    } catch (err) {
      console.error('Failed to start scrape job:', err);
      setJobs((prev) => ({
        ...prev,
        [activeImport]: {
          id: null,
          type: activeImport,
          status: 'failed',
          data: null,
          error: err.message || 'Failed to start import',
        },
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = () => {
    // Collect all successful extractions
    const extractedData = {};
    Object.values(jobs).forEach((job) => {
      if (job.status === 'completed' && job.data) {
        Object.assign(extractedData, job.data);
      }
    });
    onComplete(extractedData, Object.keys(jobs));
  };

  const handleRetry = (type) => {
    setJobs((prev) => {
      const newJobs = { ...prev };
      delete newJobs[type];
      return newJobs;
    });
    setActiveImport(type);
  };

  // Check if any jobs completed successfully
  const hasSuccessfulJobs = Object.values(jobs).some(
    (job) => job.status === 'completed'
  );
  const hasProcessingJobs = Object.values(jobs).some(
    (job) => job.status === 'pending' || job.status === 'processing'
  );
  const allJobsDone = availableImports.every((type) => jobs[type]);

  const currentConfig = activeImport ? IMPORT_TYPES[activeImport] : null;

  return (
    <div className={styles.container}>
      {/* Import type tabs */}
      <div className={styles.tabs}>
        {availableImports.map((type) => {
          const config = IMPORT_TYPES[type];
          const Icon = config.icon;
          const job = jobs[type];
          const isActive = activeImport === type && !job;
          const isCompleted = job?.status === 'completed';
          const isFailed = job?.status === 'failed';
          const isProcessing =
            job?.status === 'pending' || job?.status === 'processing';

          return (
            <button
              key={type}
              className={`${styles.tab} ${isActive ? styles.activeTab : ''} ${
                isCompleted ? styles.completedTab : ''
              } ${isFailed ? styles.failedTab : ''}`}
              onClick={() => !job && setActiveImport(type)}
              disabled={!!job && !isFailed}
            >
              <Icon className={styles.tabIcon} />
              <span className={styles.tabLabel}>{config.label}</span>
              {isProcessing && <Loader2 className={styles.tabSpinner} />}
              {isCompleted && <CheckCircle className={styles.tabSuccess} />}
              {isFailed && (
                <button
                  className={styles.retryButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetry(type);
                  }}
                >
                  <RefreshCw className={styles.retryIcon} />
                </button>
              )}
            </button>
          );
        })}
      </div>

      {/* Input area */}
      {currentConfig && !jobs[activeImport] && (
        <div className={styles.inputArea}>
          {currentConfig.inputType === 'textarea' ? (
            <textarea
              className={styles.textarea}
              placeholder={currentConfig.placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              rows={6}
            />
          ) : (
            <Input
              type={currentConfig.inputType}
              placeholder={currentConfig.placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              fullWidth
            />
          )}
          <p className={styles.helpText}>{currentConfig.helpText}</p>

          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={!inputValue.trim()}
            rightIcon={ArrowRight}
          >
            Import & Analyze
          </Button>
        </div>
      )}

      {/* Status messages */}
      {hasProcessingJobs && (
        <div className={styles.statusArea}>
          <Spinner text="Analyzing your content..." />
        </div>
      )}

      {/* Job results */}
      {Object.entries(jobs).length > 0 && (
        <div className={styles.resultsArea}>
          {Object.entries(jobs).map(([type, job]) => {
            const config = IMPORT_TYPES[type];
            const Icon = config.icon;

            return (
              <div
                key={type}
                className={`${styles.resultCard} ${
                  job.status === 'completed' ? styles.successCard : ''
                } ${job.status === 'failed' ? styles.errorCard : ''}`}
              >
                <Icon className={styles.resultIcon} />
                <div className={styles.resultContent}>
                  <span className={styles.resultLabel}>{config.label}</span>
                  {job.status === 'completed' && (
                    <span className={styles.resultSuccess}>
                      Successfully analyzed
                    </span>
                  )}
                  {job.status === 'failed' && (
                    <span className={styles.resultError}>{job.error}</span>
                  )}
                  {(job.status === 'pending' || job.status === 'processing') && (
                    <span className={styles.resultProcessing}>Analyzing...</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onSkip} disabled={hasProcessingJobs}>
          Skip Import
        </Button>

        {(hasSuccessfulJobs || allJobsDone) && !hasProcessingJobs && (
          <Button variant="primary" onClick={handleContinue} rightIcon={ArrowRight}>
            Continue to Profile
          </Button>
        )}
      </div>

      {hasSuccessfulJobs && (
        <p className={styles.hint}>
          We found information to pre-fill your profile. You can review and edit
          everything in the next step.
        </p>
      )}
    </div>
  );
}

export default ImportContent;
