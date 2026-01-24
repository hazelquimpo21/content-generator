/**
 * ============================================================================
 * PROCESSING SCREEN PAGE
 * ============================================================================
 * Real-time display of episode processing progress.
 * Shows phase-by-phase status with stages grouped by phase.
 *
 * Architecture:
 * - PRE-GATE: Stage 0 (conditional preprocessing)
 * - PHASE 1 (Extract): Stages 1-2 (parallel)
 * - PHASE 2 (Plan): Stages 3-5 (outline first, then 4-5 parallel)
 * - PHASE 3 (Write): Stages 6-7 (sequential)
 * - PHASE 4 (Distribute): Stages 8-9 (parallel)
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
  ArrowLeft,
  Info,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { Button, Card, ProgressBar, Spinner, useToast } from '@components/shared';
import api from '@utils/api-client';
import styles from './ProcessingScreen.module.css';

// ============================================================================
// PHASE DEFINITIONS
// ============================================================================
// 5-phase architecture matching backend phase-config.js
// ============================================================================
const PHASES = [
  {
    id: 'pregate',
    name: 'Pre-Processing',
    emoji: '🔍',
    description: 'Preparing transcript for analysis',
    stages: [
      { number: 0, name: 'Transcript Preprocessing', description: 'Compressing long transcripts' },
    ],
  },
  {
    id: 'extract',
    name: 'Extract',
    emoji: '📊',
    description: 'Analyzing transcript and extracting key content',
    parallel: true,
    stages: [
      { number: 1, name: 'Transcript Analysis', description: 'Extracting themes and metadata' },
      { number: 2, name: 'Content Building Blocks', description: 'Quotes, tips, Q&As, and blog ideas' },
    ],
  },
  {
    id: 'plan',
    name: 'Plan',
    emoji: '📝',
    description: 'Planning two articles: Episode Recap + Topic Article',
    stages: [
      { number: 3, name: 'Dual Article Planning', description: 'Selecting blog idea and creating outlines' },
      { number: 4, name: 'Paragraph Details', description: 'Planning paragraph content' },
      { number: 5, name: 'Headlines & Copy', description: 'Generating title options' },
    ],
  },
  {
    id: 'write',
    name: 'Write',
    emoji: '✍️',
    description: 'Drafting and refining both blog articles',
    stages: [
      { number: 6, name: 'Dual Article Draft', description: 'Writing Episode Recap + Topic Article' },
      { number: 7, name: 'Article Refinement', description: 'Polishing both articles' },
    ],
  },
  {
    id: 'distribute',
    name: 'Distribute',
    emoji: '📤',
    description: 'Creating social media and email content',
    parallel: true,
    stages: [
      { number: 8, name: 'Social Content', description: 'Creating social media posts' },
      { number: 9, name: 'Email Campaign', description: 'Writing email newsletter' },
    ],
  },
];

const TOTAL_PHASES = 5;
const TOTAL_STAGES = 10;

// Estimated duration in seconds (based on phase architecture)
const ESTIMATED_DURATION_SECONDS = 210; // ~3.5 minutes

/**
 * ProcessingScreen page component
 */
function ProcessingScreen() {
  const { id: episodeId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const pollInterval = useRef(null);
  const hasShownCompletionToast = useRef(false);

  // State
  const [loading, setLoading] = useState(true);
  const [episode, setEpisode] = useState(null);
  const [stages, setStages] = useState([]);
  const [error, setError] = useState(null);
  const [startTime] = useState(Date.now());
  const [expandedPhases, setExpandedPhases] = useState({});
  const [canceling, setCanceling] = useState(false);

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

      // Show completion toast (only once)
      if (episode?.status === 'completed' && !hasShownCompletionToast.current) {
        hasShownCompletionToast.current = true;
        const title = episode.title || episode.episode_context?.title || 'Episode';
        showToast({
          message: 'Processing complete!',
          description: `"${title}" is ready to review.`,
          variant: 'success',
          duration: 5000,
        });
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

  /**
   * Cancel processing and navigate to dashboard
   */
  async function handleCancel() {
    try {
      setCanceling(true);
      await api.episodes.cancel(episodeId);

      // Stop polling
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }

      showToast({
        message: 'Processing cancelled',
        description: 'You can restart processing anytime from the dashboard.',
        variant: 'info',
        duration: 5000,
      });

      // Navigate to dashboard
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to cancel processing');
      setCanceling(false);
    }
  }

  // Get stage data by number
  function getStageData(stageNumber) {
    return stages.find((s) => s.stage_number === stageNumber);
  }

  // Get stage status
  function getStageStatus(stageNumber) {
    const stage = getStageData(stageNumber);
    return stage?.status || 'pending';
  }

  // Get phase status based on its stages
  function getPhaseStatus(phase) {
    const stageStatuses = phase.stages.map((s) => getStageStatus(s.number));

    if (stageStatuses.some((s) => s === 'failed')) return 'failed';
    if (stageStatuses.every((s) => s === 'completed')) return 'completed';
    if (stageStatuses.some((s) => s === 'processing')) return 'processing';
    if (stageStatuses.some((s) => s === 'completed')) return 'partial';
    return 'pending';
  }

  // Get phase icon
  function getPhaseIcon(status) {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className={styles.iconCompleted} />;
      case 'processing':
      case 'partial':
        return <Loader2 className={styles.iconProcessing} />;
      case 'failed':
        return <AlertCircle className={styles.iconFailed} />;
      default:
        return <Circle className={styles.iconPending} />;
    }
  }

  // Get stage icon (smaller)
  function getStageIcon(status) {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className={styles.stageIconCompleted} size={16} />;
      case 'processing':
        return <Loader2 className={styles.stageIconProcessing} size={16} />;
      case 'failed':
        return <AlertCircle className={styles.stageIconFailed} size={16} />;
      default:
        return <Circle className={styles.stageIconPending} size={16} />;
    }
  }

  // Toggle phase expansion
  function togglePhase(phaseId) {
    setExpandedPhases((prev) => ({
      ...prev,
      [phaseId]: !prev[phaseId],
    }));
  }

  // Calculate phase duration
  function getPhaseDuration(phase) {
    let totalMs = 0;
    phase.stages.forEach((s) => {
      const stageData = getStageData(s.number);
      if (stageData?.duration_seconds) {
        totalMs += stageData.duration_seconds * 1000;
      }
    });
    return totalMs > 0 ? (totalMs / 1000).toFixed(1) : null;
  }

  // Calculate progress
  const completedStages = stages.filter((s) => s.status === 'completed').length;
  const completedPhases = PHASES.filter((p) => getPhaseStatus(p) === 'completed').length;
  const progress = Math.round((completedStages / TOTAL_STAGES) * 100);

  // Calculate time estimate
  const getTimeEstimate = () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, ESTIMATED_DURATION_SECONDS - elapsed);
    if (remaining > 60) {
      return `~${Math.ceil(remaining / 60)}m remaining`;
    }
    if (remaining > 0) {
      return `~${remaining}s remaining`;
    }
    return 'Finishing up...';
  };

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
      {/* Back button */}
      <button className={styles.backButton} onClick={() => navigate('/')}>
        <ArrowLeft size={18} />
        <span>Back to Episodes</span>
      </button>

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
          {episode.title || episode.episode_context?.title || 'Untitled Episode'}
        </p>
      </header>

      {/* Info banner - only show during processing */}
      {episode.status === 'processing' && (
        <div className={styles.infoBanner}>
          <Info size={18} />
          <p>
            You don't need to stay on this page. Processing continues in the background
            and we'll update the episode when it's ready. {getTimeEstimate()}
          </p>
        </div>
      )}

      {/* Cancel button - only show during processing */}
      {episode.status === 'processing' && (
        <div className={styles.cancelSection}>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={X}
            onClick={handleCancel}
            loading={canceling}
            disabled={canceling}
          >
            {canceling ? 'Cancelling...' : 'Cancel Processing'}
          </Button>
        </div>
      )}

      {/* Progress bar */}
      <Card className={styles.progressCard}>
        <ProgressBar
          value={completedStages}
          max={TOTAL_STAGES}
          label={
            episode.status === 'completed'
              ? 'All phases completed'
              : `Phase ${completedPhases + 1} of ${TOTAL_PHASES}`
          }
          showPercentage
          animated={episode.status === 'processing'}
        />
      </Card>

      {/* Phases list */}
      <div className={styles.phasesList}>
        {PHASES.map((phase) => {
          const phaseStatus = getPhaseStatus(phase);
          const isExpanded = expandedPhases[phase.id] ?? (phaseStatus === 'processing' || phaseStatus === 'partial');
          const phaseDuration = getPhaseDuration(phase);

          return (
            <div
              key={phase.id}
              className={`${styles.phaseItem} ${styles[`phase-${phaseStatus}`]}`}
            >
              {/* Phase header */}
              <button
                className={styles.phaseHeader}
                onClick={() => togglePhase(phase.id)}
              >
                <div className={styles.phaseIcon}>
                  {getPhaseIcon(phaseStatus)}
                </div>

                <div className={styles.phaseInfo}>
                  <div className={styles.phaseTitleRow}>
                    <h3 className={styles.phaseName}>
                      {phase.emoji} {phase.name}
                    </h3>
                    {phase.parallel && phaseStatus !== 'pending' && (
                      <span className={styles.parallelBadge}>parallel</span>
                    )}
                  </div>
                  <p className={styles.phaseDescription}>{phase.description}</p>
                </div>

                <div className={styles.phaseRight}>
                  {phaseStatus === 'completed' && phaseDuration && (
                    <span className={styles.phaseDuration}>{phaseDuration}s</span>
                  )}
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </button>

              {/* Stages (collapsible) */}
              {isExpanded && (
                <div className={styles.stagesList}>
                  {phase.stages.map((stage) => {
                    const stageStatus = getStageStatus(stage.number);
                    const stageData = getStageData(stage.number);

                    return (
                      <div
                        key={stage.number}
                        className={`${styles.stageItem} ${styles[`stage-${stageStatus}`]}`}
                      >
                        <div className={styles.stageIcon}>
                          {getStageIcon(stageStatus)}
                        </div>

                        <div className={styles.stageContent}>
                          <div className={styles.stageHeader}>
                            <span className={styles.stageName}>{stage.name}</span>
                            {stageStatus === 'completed' && stageData?.duration_seconds && (
                              <span className={styles.stageDuration}>
                                {stageData.duration_seconds.toFixed(1)}s
                              </span>
                            )}
                          </div>
                          <p className={styles.stageDescription}>{stage.description}</p>

                          {stageStatus === 'failed' && stageData?.error_message && (
                            <p className={styles.stageError}>{stageData.error_message}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
              {episode.total_duration_seconds && (
                <> · {Math.round(episode.total_duration_seconds / 60)}m {episode.total_duration_seconds % 60}s</>
              )}
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
