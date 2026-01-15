/**
 * ============================================================================
 * EPISODE PROCESSOR MODULE (Phase-Based Architecture)
 * ============================================================================
 * Orchestrates the complete 4-phase AI pipeline for processing an episode.
 *
 * Architecture Overview:
 * ----------------------
 * The pipeline processes podcasts through 4 phases with parallel execution:
 *
 *   PRE-GATE → PHASE 1 → PHASE 2 → PHASE 3 → PHASE 4
 *              Extract    Plan      Write    Distribute
 *
 * Phase Breakdown:
 * ----------------
 * PRE-GATE: Conditional preprocessing
 *   - Only runs if transcript exceeds 8000 tokens
 *   - Compresses transcript using Claude Haiku
 *
 * PHASE 1: EXTRACT (Parallel) ⚡
 *   - analyze: Extract metadata, themes, episode_crux (CANONICAL SUMMARY)
 *   - quotes: Extract verbatim quotes (CANONICAL QUOTES SOURCE)
 *   → Both run in PARALLEL (only need transcript)
 *
 * PHASE 2: PLAN (Grouped)
 *   - outline: Create high-level blog structure
 *   - paragraphs: Create paragraph-level details (needs outline)
 *   - headlines: Generate title options (needs outline)
 *   → outline runs first, then paragraphs + headlines in PARALLEL
 *
 * PHASE 3: WRITE (Sequential)
 *   - draft: Write the complete blog post
 *   - refine: Polish and remove AI patterns
 *   → Must be sequential (refine needs draft)
 *
 * PHASE 4: DISTRIBUTE (Parallel) ⚡
 *   - social: Generate social media posts
 *   - email: Generate email newsletter
 *   → Both run in PARALLEL (only need refined post)
 *
 * Performance Benefits:
 * ---------------------
 * - ~25-30% faster than fully sequential execution
 * - Phase 1: 2 parallel tasks save ~5-8 seconds
 * - Phase 2: 2 parallel tasks (after outline) save ~3-5 seconds
 * - Phase 4: 2 parallel tasks save ~5-8 seconds
 *
 * Error Handling:
 * ---------------
 * - ATOMIC PHASES: Phase either fully succeeds or fully fails
 * - PHASE-LEVEL RETRY: If any task fails, entire phase can be retried
 * - CHECKPOINTS: Completed phases are saved for resume capability
 * - FAIL FAST: On failure, stop immediately (don't waste API calls)
 *
 * Database Compatibility:
 * -----------------------
 * - Uses existing stage_outputs table (stages 0-9)
 * - Task IDs map to stage numbers for backward compatibility
 * - Resume from specific stage is supported
 *
 * Usage:
 *   import { processEpisode } from './orchestrator/episode-processor.js';
 *
 *   // Fresh start
 *   await processEpisode('episode-uuid');
 *
 *   // Resume from specific phase
 *   await processEpisode('episode-uuid', { resumeFromPhase: 'plan' });
 *
 *   // Resume from specific stage (backward compatible)
 *   await processEpisode('episode-uuid', { startFromStage: 3 });
 *
 * ============================================================================
 */

import logger from '../lib/logger.js';
import { episodeRepo, stageRepo, evergreenRepo } from '../lib/supabase-client.js';
import { ProcessingError, NotFoundError } from '../lib/errors.js';
import { estimateTokens } from '../lib/cost-calculator.js';

// Phase configuration and executor
import {
  PHASES,
  PHASE_ORDER,
  TASKS,
  getPhaseConfig,
  getStageNumber,
  getTaskKey,
  STAGE_TO_TASK,
} from './phase-config.js';
import { executePhase, createPhaseCheckpoint } from './phase-executor.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Token threshold for triggering preprocessing.
 * Transcripts above this size will be compressed before processing.
 */
const PREPROCESSING_THRESHOLD_TOKENS = 8000;

/**
 * Total number of stages (for backward compatibility with DB).
 */
const TOTAL_STAGES = 10;

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Logs a visual separator for phase transitions.
 *
 * @param {string} message - Message to display
 * @param {string} emoji - Emoji prefix
 */
function logPhaseBanner(message, emoji = '═') {
  const line = emoji.repeat(60);
  logger.info(`\n${line}`);
  logger.info(message);
  logger.info(`${line}\n`);
}

/**
 * Formats duration in human-readable format.
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// ============================================================================
// CONTEXT LOADING
// ============================================================================

/**
 * Loads the processing context required for phase execution.
 *
 * The context includes:
 * - Episode transcript and metadata
 * - Evergreen content (therapist profile, podcast info, voice guidelines)
 * - Container for previous stage outputs (populated as phases complete)
 *
 * @param {string} episodeId - Episode UUID
 * @returns {Promise<Object>} Processing context object
 * @throws {NotFoundError} If episode doesn't exist
 *
 * @example
 * const context = await loadContext('uuid');
 * // context = {
 * //   episodeId: 'uuid',
 * //   transcript: '...',
 * //   episodeContext: { guest_name: '...' },
 * //   evergreen: { therapist_profile: {...}, ... },
 * //   previousStages: {},
 * //   transcriptTokens: 12000,
 * //   needsPreprocessing: true
 * // }
 */
async function loadContext(episodeId) {
  logger.debug('📦 Loading processing context', { episodeId });

  // -------------------------------------------------------------------------
  // Load episode from database
  // -------------------------------------------------------------------------
  const episode = await episodeRepo.findById(episodeId);

  if (!episode) {
    logger.error('❌ Episode not found', { episodeId });
    throw new NotFoundError('episode', episodeId);
  }

  const transcriptLength = episode.transcript?.length || 0;
  const transcriptWordCount = episode.transcript?.split(/\s+/).length || 0;
  const transcriptTokens = estimateTokens(episode.transcript || '');

  logger.debug('📄 Episode loaded', {
    episodeId,
    transcriptLength,
    transcriptWordCount,
    transcriptTokens,
    status: episode.status,
    hasContext: !!episode.episode_context && Object.keys(episode.episode_context).length > 0,
  });

  // -------------------------------------------------------------------------
  // Load evergreen content
  // -------------------------------------------------------------------------
  const evergreen = await evergreenRepo.get();
  const hasEvergreen = evergreen && Object.keys(evergreen).some(k =>
    evergreen[k] && Object.keys(evergreen[k]).length > 0
  );

  logger.debug('📚 Evergreen content loaded', {
    episodeId,
    hasTherapistProfile: !!evergreen?.therapist_profile && Object.keys(evergreen.therapist_profile).length > 0,
    hasPodcastInfo: !!evergreen?.podcast_info && Object.keys(evergreen.podcast_info).length > 0,
    hasVoiceGuidelines: !!evergreen?.voice_guidelines && Object.keys(evergreen.voice_guidelines).length > 0,
  });

  // -------------------------------------------------------------------------
  // Build context object
  // -------------------------------------------------------------------------
  return {
    episodeId,
    transcript: episode.transcript,
    episodeContext: episode.episode_context || {},
    evergreen,
    previousStages: {},  // Populated during processing or from DB for resume
    // Preprocessing metadata
    transcriptTokens,
    needsPreprocessing: transcriptTokens > PREPROCESSING_THRESHOLD_TOKENS,
  };
}

/**
 * Loads completed stage outputs for resume capability.
 *
 * When resuming from a specific phase, we need to load all completed
 * stages from previous phases into the context.
 *
 * @param {Object} context - Processing context (modified in place)
 * @param {string} resumeFromPhase - Phase to resume from
 * @returns {Promise<void>}
 */
async function loadPreviousStagesForResume(context, resumeFromPhase) {
  const phaseIndex = PHASE_ORDER.indexOf(resumeFromPhase);

  if (phaseIndex <= 0) {
    // Starting from beginning or pregate - no previous stages needed
    return;
  }

  logger.debug('📥 Loading previous stage outputs for resume', {
    episodeId: context.episodeId,
    resumeFromPhase,
    phaseIndex,
  });

  // Get all phases before the resume point
  const completedPhases = PHASE_ORDER.slice(0, phaseIndex);

  // Get all stage numbers from completed phases
  const stageNumbersNeeded = [];
  for (const phaseId of completedPhases) {
    const phase = PHASES[phaseId];
    for (const taskKey of phase.tasks) {
      stageNumbersNeeded.push(getStageNumber(taskKey));
    }
  }

  logger.debug('📥 Loading stages', {
    episodeId: context.episodeId,
    stagesNeeded: stageNumbersNeeded,
  });

  // Fetch all stage records for this episode
  const stages = await stageRepo.findAllByEpisode(context.episodeId);
  let loadedCount = 0;
  const missingStages = [];

  // Load completed stage outputs into context
  for (const stageNum of stageNumbersNeeded) {
    const stage = stages.find(s => s.stage_number === stageNum);

    if (stage && stage.status === 'completed') {
      // Merge both output_data and output_text into previousStages
      context.previousStages[stageNum] = {
        ...(stage.output_data || {}),
        output_text: stage.output_text || null,
      };
      loadedCount++;
    } else {
      missingStages.push({
        stage: stageNum,
        status: stage?.status || 'not found',
      });
    }
  }

  if (missingStages.length > 0) {
    logger.warn('⚠️ Some previous stages not completed - resume may fail', {
      episodeId: context.episodeId,
      resumeFromPhase,
      missingStages,
    });
  }

  logger.debug('📥 Previous stages loaded', {
    episodeId: context.episodeId,
    loadedCount,
    expectedCount: stageNumbersNeeded.length,
    stagesLoaded: Object.keys(context.previousStages).map(Number),
  });
}

/**
 * Backward-compatible stage loading for numeric stage resume.
 *
 * @param {Object} context - Processing context
 * @param {number} upToStage - Load stages before this number
 */
async function loadPreviousStagesByNumber(context, upToStage) {
  logger.debug('📥 Loading previous stages (legacy mode)', {
    episodeId: context.episodeId,
    upToStage,
  });

  const stages = await stageRepo.findAllByEpisode(context.episodeId);

  for (const stage of stages) {
    if (stage.stage_number < upToStage && stage.status === 'completed') {
      context.previousStages[stage.stage_number] = {
        ...(stage.output_data || {}),
        output_text: stage.output_text || null,
      };
    }
  }

  logger.debug('📥 Stages loaded', {
    episodeId: context.episodeId,
    stagesLoaded: Object.keys(context.previousStages).length,
  });
}

// ============================================================================
// PRE-GATE: PREPROCESSING CHECK
// ============================================================================

/**
 * Runs the pre-gate check and preprocessing if needed.
 *
 * The pre-gate:
 * 1. Checks if transcript exceeds the token threshold
 * 2. If yes, runs Claude Haiku to compress the transcript
 * 3. If no, skips preprocessing (saves time and cost)
 *
 * @param {Object} context - Processing context
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Pre-gate result
 */
async function runPregate(context, options = {}) {
  const { episodeId, onProgress } = options;

  // -------------------------------------------------------------------------
  // Check if preprocessing is needed
  // -------------------------------------------------------------------------
  if (!context.needsPreprocessing) {
    logger.info('🚪 PRE-GATE: Skipping preprocessing', {
      episodeId,
      transcriptTokens: context.transcriptTokens,
      threshold: PREPROCESSING_THRESHOLD_TOKENS,
      reason: 'Transcript below threshold',
    });

    // Mark stage 0 as skipped in database
    await stageRepo.markCompleted(episodeId, 0, {
      output_data: {
        preprocessed: false,
        skipped: true,
        reason: 'Transcript below threshold',
        transcriptTokens: context.transcriptTokens,
      },
      output_text: null,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
    });

    return {
      phaseId: 'pregate',
      skipped: true,
      cost: 0,
      durationMs: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Preprocessing needed - run the pregate phase
  // -------------------------------------------------------------------------
  logger.info('🚪 PRE-GATE: Running preprocessing', {
    episodeId,
    transcriptTokens: context.transcriptTokens,
    threshold: PREPROCESSING_THRESHOLD_TOKENS,
  });

  if (onProgress) {
    onProgress('pregate', 'processing', 'Preprocessing transcript');
  }

  // Execute the pregate phase (single task: preprocess)
  const result = await executePhase('pregate', context, {
    episodeId,
    onTaskStart: (taskKey, config) => {
      stageRepo.markProcessing(episodeId, getStageNumber(taskKey));
    },
    onTaskComplete: async (taskKey, taskResult) => {
      const stageNum = taskResult.stageNumber;
      await stageRepo.markCompleted(episodeId, stageNum, taskResult.result);
    },
  });

  if (onProgress) {
    onProgress('pregate', 'completed', 'Preprocessing complete');
  }

  return result;
}

// ============================================================================
// MAIN PROCESSOR FUNCTION
// ============================================================================

/**
 * Processes an episode through the 4-phase AI pipeline.
 *
 * This is the main entry point for episode processing. It orchestrates
 * all phases and manages state, progress tracking, and error handling.
 *
 * Pipeline Execution:
 * -------------------
 * 1. PRE-GATE: Check transcript size, preprocess if needed
 * 2. PHASE 1 (Extract): analyze + quotes in PARALLEL
 * 3. PHASE 2 (Plan): outline → (paragraphs + headlines) in PARALLEL
 * 4. PHASE 3 (Write): draft → refine in SEQUENCE
 * 5. PHASE 4 (Distribute): social + email in PARALLEL
 *
 * Resume Capability:
 * ------------------
 * - resumeFromPhase: Resume from a specific phase (e.g., 'plan')
 * - startFromStage: Resume from a specific stage number (backward compatible)
 *
 * @param {string} episodeId - Episode UUID to process
 * @param {Object} [options] - Processing options
 * @param {string} [options.resumeFromPhase] - Phase to resume from
 * @param {number} [options.startFromStage] - Stage number to resume from (legacy)
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<Object>} Processing result with status, cost, duration
 * @throws {ProcessingError} If any phase fails
 * @throws {NotFoundError} If episode doesn't exist
 *
 * @example
 * // Fresh start
 * await processEpisode('uuid');
 *
 * // Resume from Plan phase
 * await processEpisode('uuid', { resumeFromPhase: 'plan' });
 *
 * // With progress callback
 * await processEpisode('uuid', {
 *   onProgress: (phase, status, message) => {
 *     console.log(`${phase}: ${status} - ${message}`);
 *   }
 * });
 */
export async function processEpisode(episodeId, options = {}) {
  const {
    resumeFromPhase,
    startFromStage,  // Backward compatibility
    onProgress,
  } = options;

  // -------------------------------------------------------------------------
  // Determine starting point
  // -------------------------------------------------------------------------
  let startPhaseIndex = 0;

  // Handle legacy startFromStage option
  if (startFromStage !== undefined && startFromStage > 0) {
    // Find which phase contains this stage
    const taskKey = getTaskKey(startFromStage);
    if (taskKey) {
      for (let i = 0; i < PHASE_ORDER.length; i++) {
        const phase = PHASES[PHASE_ORDER[i]];
        if (phase.tasks.includes(taskKey)) {
          startPhaseIndex = i;
          break;
        }
      }
    }
    logger.info('🔄 Converting legacy startFromStage to phase', {
      startFromStage,
      taskKey,
      startPhase: PHASE_ORDER[startPhaseIndex],
    });
  } else if (resumeFromPhase) {
    startPhaseIndex = PHASE_ORDER.indexOf(resumeFromPhase);
    if (startPhaseIndex === -1) {
      throw new ProcessingError(-1, 'Processor', `Unknown phase: ${resumeFromPhase}`);
    }
  }

  const isResume = startPhaseIndex > 0 || (startFromStage !== undefined && startFromStage > 0);

  // -------------------------------------------------------------------------
  // Log processing start
  // -------------------------------------------------------------------------
  logPhaseBanner(`🎬 EPISODE PROCESSING ${isResume ? '(RESUME)' : '(FRESH START)'}`);

  logger.info('🎬 Starting episode processing', {
    episodeId,
    isResume,
    startPhase: PHASE_ORDER[startPhaseIndex],
    startPhaseIndex,
    totalPhases: PHASE_ORDER.length,
  });

  const overallStartTime = Date.now();
  let totalCost = 0;
  let phasesCompleted = 0;
  const phaseResults = {};

  try {
    // -----------------------------------------------------------------------
    // Load context
    // -----------------------------------------------------------------------
    logger.info('📦 Loading context...', { episodeId });
    const context = await loadContext(episodeId);

    // -----------------------------------------------------------------------
    // Handle resume: load previous stages
    // -----------------------------------------------------------------------
    if (isResume) {
      if (startFromStage !== undefined) {
        await loadPreviousStagesByNumber(context, startFromStage);
      } else {
        await loadPreviousStagesForResume(context, PHASE_ORDER[startPhaseIndex]);
      }
    }

    // -----------------------------------------------------------------------
    // Update episode status
    // -----------------------------------------------------------------------
    await episodeRepo.updateStatus(episodeId, 'processing', 0);

    // -----------------------------------------------------------------------
    // Create stage records if fresh start
    // -----------------------------------------------------------------------
    if (!isResume) {
      logger.info('📋 Creating stage records...', { episodeId });
      await stageRepo.createAllStages(episodeId);
    }

    // -----------------------------------------------------------------------
    // Process each phase
    // -----------------------------------------------------------------------
    for (let i = startPhaseIndex; i < PHASE_ORDER.length; i++) {
      const phaseId = PHASE_ORDER[i];
      const phaseConfig = PHASES[phaseId];

      // ---------------------------------------------------------------------
      // Special handling for pregate (conditional)
      // ---------------------------------------------------------------------
      if (phaseId === 'pregate') {
        const pregateResult = await runPregate(context, {
          episodeId,
          onProgress,
        });
        phaseResults.pregate = pregateResult;
        totalCost += pregateResult.cost || 0;
        phasesCompleted++;
        continue;
      }

      // ---------------------------------------------------------------------
      // Log phase start
      // ---------------------------------------------------------------------
      logPhaseBanner(`${phaseConfig.emoji} ${phaseConfig.name}`);

      if (onProgress) {
        onProgress(phaseId, 'processing', phaseConfig.description);
      }

      // Update episode current stage (use first task's stage number)
      const firstTaskStage = getStageNumber(phaseConfig.tasks[0]);
      await episodeRepo.updateStatus(episodeId, 'processing', firstTaskStage);

      // ---------------------------------------------------------------------
      // Execute the phase
      // ---------------------------------------------------------------------
      const phaseStartTime = Date.now();

      const phaseResult = await executePhase(phaseId, context, {
        episodeId,
        // Task-level callbacks for DB updates
        onTaskStart: async (taskKey, config) => {
          const stageNum = getStageNumber(taskKey);
          await stageRepo.markProcessing(episodeId, stageNum);
          await episodeRepo.updateStatus(episodeId, 'processing', stageNum);
        },
        onTaskComplete: async (taskKey, taskResult) => {
          const stageNum = taskResult.stageNumber;
          await stageRepo.markCompleted(episodeId, stageNum, taskResult.result);

          // Special handling: Save AI-generated title from Stage 1
          if (stageNum === 1 && taskResult.result?.output_data?.episode_basics?.title) {
            const generatedTitle = taskResult.result.output_data.episode_basics.title;
            logger.debug('💾 Saving generated title', { episodeId, title: generatedTitle });
            await episodeRepo.update(episodeId, { title: generatedTitle });
          }
        },
        // Phase-level callbacks
        onPhaseStart: (phaseId, config) => {
          if (onProgress) {
            onProgress(phaseId, 'started', config.name);
          }
        },
        onPhaseComplete: (phaseId, config, result) => {
          if (onProgress) {
            onProgress(phaseId, 'completed', `${config.name} - $${result.totalCost.toFixed(4)}`);
          }
        },
      });

      // ---------------------------------------------------------------------
      // Record phase results
      // ---------------------------------------------------------------------
      phaseResults[phaseId] = phaseResult;
      totalCost += phaseResult.totalCost;
      phasesCompleted++;

      // Create checkpoint for resume capability
      const checkpoint = createPhaseCheckpoint(context, phaseId);

      logger.info(`${phaseConfig.emoji} Phase complete: ${phaseConfig.name}`, {
        phaseId,
        tasksCompleted: phaseResult.tasks.length,
        phaseCost: phaseResult.totalCost.toFixed(4),
        phaseDuration: formatDuration(phaseResult.durationMs),
        runningTotalCost: totalCost.toFixed(4),
        phasesCompleted,
        phasesRemaining: PHASE_ORDER.length - i - 1,
        episodeId,
      });
    }

    // -----------------------------------------------------------------------
    // Calculate final metrics
    // -----------------------------------------------------------------------
    const totalDurationMs = Date.now() - overallStartTime;
    const durationSeconds = Math.floor(totalDurationMs / 1000);

    // -----------------------------------------------------------------------
    // Mark episode as complete
    // -----------------------------------------------------------------------
    await episodeRepo.update(episodeId, {
      status: 'completed',
      current_stage: 9,  // Last stage
      total_cost_usd: totalCost,
      total_duration_seconds: durationSeconds,
      processing_completed_at: new Date().toISOString(),
    });

    // -----------------------------------------------------------------------
    // Log completion
    // -----------------------------------------------------------------------
    logPhaseBanner('🎉 EPISODE PROCESSING COMPLETE');

    logger.info('🎉 Episode processing complete!', {
      episodeId,
      phasesCompleted,
      totalCost: totalCost.toFixed(4),
      totalDuration: formatDuration(totalDurationMs),
      durationSeconds,
      phaseBreakdown: Object.entries(phaseResults).map(([id, r]) => ({
        phase: id,
        cost: r.totalCost?.toFixed(4) || '0.0000',
        duration: formatDuration(r.durationMs || 0),
        tasks: r.tasks?.length || (r.skipped ? 'skipped' : 0),
      })),
    });

    return {
      episodeId,
      status: 'completed',
      totalCost,
      durationSeconds,
      phasesCompleted,
      phaseResults,
    };

  } catch (error) {
    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------
    const elapsedMs = Date.now() - overallStartTime;

    logger.error('❌ Episode processing failed', {
      episodeId,
      error: error.message,
      errorType: error.name,
      stageNumber: error.stageNumber,
      stageName: error.stageName,
      phasesCompletedBeforeFailure: phasesCompleted,
      costBeforeFailure: totalCost.toFixed(4),
      elapsedTime: formatDuration(elapsedMs),
    });

    // Update episode status
    await episodeRepo.update(episodeId, {
      status: 'error',
      error_message: error.message,
    });

    // Mark the failed stage if we know which one
    if (error.stageNumber !== undefined && error.stageNumber >= 0) {
      await stageRepo.markFailed(
        episodeId,
        error.stageNumber,
        error.message,
        error.toJSON ? error.toJSON() : { message: error.message }
      );
    }

    throw error;
  }
}

// ============================================================================
// SINGLE STAGE REGENERATION
// ============================================================================

/**
 * Regenerates a single stage without running the full pipeline.
 *
 * Useful for:
 * - Fixing a specific stage that failed
 * - Re-running a stage with updated prompts
 * - Testing individual analyzers
 *
 * @param {string} episodeId - Episode UUID
 * @param {number} stageNumber - Stage to regenerate (0-9)
 * @returns {Promise<Object>} Regeneration result
 */
export async function regenerateStage(episodeId, stageNumber) {
  logger.info('🔄 Regenerating single stage', { episodeId, stageNumber });

  // Load context
  const context = await loadContext(episodeId);

  // Load all completed previous stages
  await loadPreviousStagesByNumber(context, stageNumber);

  // Mark stage as processing
  await stageRepo.markProcessing(episodeId, stageNumber);

  try {
    // Import runStage directly for single stage execution
    const { runStage } = await import('./stage-runner.js');
    const result = await runStage(stageNumber, context);

    // Save result
    await stageRepo.markCompleted(episodeId, stageNumber, result);

    logger.info('✅ Stage regeneration complete', {
      episodeId,
      stageNumber,
      cost: result.cost_usd?.toFixed(4),
    });

    return result;

  } catch (error) {
    await stageRepo.markFailed(episodeId, stageNumber, error.message);
    throw error;
  }
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

/**
 * Gets the current processing status of an episode.
 *
 * @param {string} episodeId - Episode UUID
 * @returns {Promise<Object>} Status information
 */
export async function getProcessingStatus(episodeId) {
  const episode = await episodeRepo.findByIdWithStages(episodeId);

  const completedStages = episode.stages.filter(s => s.status === 'completed').length;
  const failedStages = episode.stages.filter(s => s.status === 'failed');
  const currentStage = episode.stages.find(s => s.status === 'processing');

  // Determine current phase based on completed stages
  let currentPhase = null;
  for (const phaseId of PHASE_ORDER) {
    const phase = PHASES[phaseId];
    const phaseStages = phase.tasks.map(t => getStageNumber(t));
    const phaseComplete = phaseStages.every(s =>
      episode.stages.find(st => st.stage_number === s)?.status === 'completed'
    );

    if (!phaseComplete) {
      currentPhase = phaseId;
      break;
    }
  }

  return {
    episodeId,
    status: episode.status,
    currentPhase,
    progress: {
      completed: completedStages,
      total: TOTAL_STAGES,
      percentage: Math.round((completedStages / TOTAL_STAGES) * 100),
    },
    currentStage: currentStage
      ? { number: currentStage.stage_number, name: currentStage.stage_name }
      : null,
    failedStages: failedStages.map(s => ({
      number: s.stage_number,
      name: s.stage_name,
      error: s.error_message,
    })),
    totalCost: episode.total_cost_usd,
    duration: episode.total_duration_seconds,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  processEpisode,
  regenerateStage,
  getProcessingStatus,
};
