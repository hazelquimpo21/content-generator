/**
 * ============================================================================
 * PROCESSING SCREEN PAGE
 * ============================================================================
 * Real-time display of episode processing progress.
 * Shows stage-by-stage status with animated indicators.
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { Button, Card, ProgressBar, Spinner } from '@components/shared';
import api from '@utils/api-client';
import styles from './ProcessingScreen.module.css';

// Stage definitions (10 stages: 0-9)
const STAGES = [
  { number: 0, name: 'Transcript Preprocessing', description: 'Analyzing long transcripts with AI' },
  { number: 1, name: 'Transcript Analysis', description: 'Extracting themes and structure' },
  { number: 2, name: 'Quote Extraction', description: 'Finding key quotes and insights' },
  { number: 3, name: 'Title Generation', description: 'Creating compelling titles' },
  { number: 4, name: 'Summary Writing', description: 'Writing episode summaries' },
  { number: 5, name: 'Outline Creation', description: 'Building blog post outline' },
  { number: 6, name: 'Blog Post Draft', description: 'Writing full blog post' },
  { number: 7, name: 'Blog Post Editing', description: 'Polishing and refining' },
  { number: 8, name: 'Social Content', description: 'Creating social media posts' },
  { number: 9, name: 'Email Campaign', description: 'Writing email content' },
];

const TOTAL_STAGES = 10;

/**
 * ProcessingScreen page component
 */
function ProcessingScreen() {
  const { id: episodeId } = useParams();
  const navigate = useNavigate();
  const pollInterval = useRef(null);

  // State
  const [loading, setLoading] = useState(true);
  const [episode, setEpisode] = useState(null);
  const [stages, setStages] = useState([]);
  const [error, setError] = useState(null);

  // Fetch initial data and start polling
  useEffect(() => {
    fetchStatus();

    // Poll for updates every 2 seconds
    pollInterval.current = setInterval(fetchStatus, 2000);

    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [episodeId]);

  // Stop polling when completed or errored
  useEffect(() => {
    if (episode?.status === 'completed' || episode?.status === 'error') {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    }
  }, [episode?.status]);

  async function fetchStatus() {
    try {
      const data = await api.episodes.getWithStages(episodeId);
      setEpisode(data.episode);
      setStages(data.stages || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }

  // Get stage status
  function getStageStatus(stageNumber) {
    const stage = stages.find((s) => s.stage_number === stageNumber);
    return stage?.status || 'pending';
  }

  // Get stage icon
  function getStageIcon(status) {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className={styles.iconCompleted} />;
      case 'processing':
        return <Loader2 className={styles.iconProcessing} />;
      case 'failed':
        return <AlertCircle className={styles.iconFailed} />;
      default:
        return <Circle className={styles.iconPending} />;
    }
  }

  // Calculate progress
  const completedStages = stages.filter((s) => s.status === 'completed').length;
  const progress = Math.round((completedStages / TOTAL_STAGES) * 100);

  if (loading) {
    return <Spinner centered text="Loading processing status..." />;
  }

  if (!episode) {
    return (
      <Card className={styles.errorCard}>
        <AlertCircle size={48} />
        <h2>Episode Not Found</h2>
        <p>The episode you're looking for doesn't exist.</p>
        <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
      </Card>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>
          {episode.status === 'completed'
            ? 'Processing Complete!'
            : episode.status === 'error'
            ? 'Processing Failed'
            : 'Processing Episode...'}
        </h1>
        <p className={styles.subtitle}>
          {episode.episode_context?.title || 'Untitled Episode'}
        </p>
      </header>

      {/* Progress bar */}
      <Card className={styles.progressCard}>
        <ProgressBar
          value={completedStages}
          max={TOTAL_STAGES}
          label={
            episode.status === 'completed'
              ? 'All stages completed'
              : `Stage ${episode.current_stage ?? 0} of ${TOTAL_STAGES - 1}`
          }
          showPercentage
          animated={episode.status === 'processing'}
        />
      </Card>

      {/* Stages list */}
      <div className={styles.stagesList}>
        {STAGES.map((stage) => {
          const status = getStageStatus(stage.number);
          const stageData = stages.find((s) => s.stage_number === stage.number);

          return (
            <div
              key={stage.number}
              className={`${styles.stageItem} ${styles[`stage-${status}`]}`}
            >
              <div className={styles.stageIcon}>
                {getStageIcon(status)}
              </div>

              <div className={styles.stageContent}>
                <div className={styles.stageHeader}>
                  <h3 className={styles.stageName}>
                    {stage.number}. {stage.name}
                  </h3>
                  {status === 'completed' && stageData?.duration_ms && (
                    <span className={styles.stageDuration}>
                      {(stageData.duration_ms / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
                <p className={styles.stageDescription}>{stage.description}</p>

                {status === 'failed' && stageData?.error_message && (
                  <p className={styles.stageError}>{stageData.error_message}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      {episode.status === 'completed' && (
        <div className={styles.actions}>
          <Button
            size="lg"
            rightIcon={ChevronRight}
            onClick={() => navigate(`/episodes/${episodeId}/review`)}
          >
            View Generated Content
          </Button>

          {episode.total_cost_usd && (
            <p className={styles.costInfo}>
              Total cost: ${episode.total_cost_usd.toFixed(4)}
            </p>
          )}
        </div>
      )}

      {episode.status === 'error' && (
        <div className={styles.actions}>
          <p className={styles.errorMessage}>{episode.error_message}</p>
          <div className={styles.actionButtons}>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Back to Dashboard
            </Button>
            <Button
              onClick={async () => {
                try {
                  await api.episodes.process(episodeId, {
                    startFromStage: episode.current_stage ?? 0,
                  });
                  fetchStatus();
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              Retry Processing
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}
    </div>
  );
}

export default ProcessingScreen;
