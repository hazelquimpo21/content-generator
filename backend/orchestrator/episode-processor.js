/**
 * ============================================================================
 * EPISODE PROCESSOR MODULE
 * ============================================================================
 * Orchestrates the complete 9-stage AI pipeline for processing an episode.
 * Handles state management, progress tracking, and error recovery.
 *
 * Flow:
 * 1. Load episode and evergreen content
 * 2. Create stage records (pending)
 * 3. For each stage 1-9:
 *    - Mark processing
 *    - Run analyzer
 *    - Save output
 *    - Update progress
 * 4. Mark episode complete
 *
 * Usage:
 *   import { processEpisode } from './orchestrator/episode-processor.js';
 *   await processEpisode('episode-uuid');
 * ============================================================================
 */

import logger from '../lib/logger.js';
import { episodeRepo, stageRepo, evergreenRepo } from '../lib/supabase-client.js';
import { ProcessingError, NotFoundError } from '../lib/errors.js';
import { runStage, STAGE_NAMES } from './stage-runner.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const TOTAL_STAGES = 9;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Loads the processing context (episode + evergreen content)
 * @param {string} episodeId - Episode UUID
 * @returns {Promise<Object>} Processing context
 */
async function loadContext(episodeId) {
  logger.debug('📦 Loading processing context', { episodeId });

  // Load episode
  const episode = await episodeRepo.findById(episodeId);

  if (!episode) {
    logger.error('Episode not found during context loading', { episodeId });
    throw new NotFoundError('episode', episodeId);
  }

  logger.debug('📄 Episode loaded', {
    episodeId,
    transcriptLength: episode.transcript?.length,
    status: episode.status,
    hasContext: !!episode.episode_context && Object.keys(episode.episode_context).length > 0,
  });

  // Load evergreen content
  const evergreen = await evergreenRepo.get();
  const hasEvergreen = evergreen && Object.keys(evergreen).some(k =>
    evergreen[k] && Object.keys(evergreen[k]).length > 0
  );

  logger.debug('📚 Evergreen content loaded', {
    episodeId,
    hasTherapistProfile: !!evergreen.therapist_profile && Object.keys(evergreen.therapist_profile).length > 0,
    hasPodcastInfo: !!evergreen.podcast_info && Object.keys(evergreen.podcast_info).length > 0,
    hasVoiceGuidelines: !!evergreen.voice_guidelines && Object.keys(evergreen.voice_guidelines).length > 0,
  });

  return {
    episodeId,
    transcript: episode.transcript,
    episodeContext: episode.episode_context || {},
    evergreen,
    previousStages: {},
  };
}

/**
 * Loads previous stage outputs into context
 * @param {Object} context - Processing context
 * @param {number} upToStage - Load outputs up to this stage
 */
async function loadPreviousStages(context, upToStage) {
  logger.debug('📥 Loading previous stage outputs', {
    episodeId: context.episodeId,
    upToStage,
  });

  const stages = await stageRepo.findAllByEpisode(context.episodeId);
  let loadedCount = 0;

  for (const stage of stages) {
    if (stage.stage_number < upToStage && stage.status === 'completed') {
      context.previousStages[stage.stage_number] = stage.output_data || {
        output_text: stage.output_text,
      };
      loadedCount++;
    }
  }

  logger.debug('📥 Previous stages loaded', {
    episodeId: context.episodeId,
    loadedCount,
    stagesLoaded: Object.keys(context.previousStages).map(Number),
  });
}

// ============================================================================
// MAIN PROCESSOR FUNCTION
// ============================================================================

/**
 * Processes an episode through all 9 stages
 *
 * @param {string} episodeId - Episode UUID
 * @param {Object} [options] - Processing options
 * @param {number} [options.startFromStage=1] - Stage to start from
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<Object>} Processing result
 * @throws {ProcessingError} If processing fails
 *
 * @example
 * await processEpisode('uuid', {
 *   onProgress: (stage, status) => console.log(`Stage ${stage}: ${status}`)
 * });
 */
export async function processEpisode(episodeId, options = {}) {
  const { startFromStage = 1, onProgress } = options;

  logger.info('🎬 Starting episode processing', {
    episodeId,
    startFromStage,
    totalStages: TOTAL_STAGES,
    isResume: startFromStage > 1,
  });

  const startTime = Date.now();
  let totalCost = 0;
  let stagesCompleted = 0;

  try {
    // Load context
    logger.debug('📦 Phase 1: Loading context', { episodeId });
    const context = await loadContext(episodeId);

    // Update episode status to processing
    logger.debug('📝 Phase 2: Updating episode status', { episodeId, newStatus: 'processing' });
    await episodeRepo.updateStatus(episodeId, 'processing', startFromStage);

    // Create stage records if starting fresh
    if (startFromStage === 1) {
      logger.debug('📋 Phase 3: Creating stage records (fresh start)', { episodeId });
      await stageRepo.createAllStages(episodeId);
    } else {
      // Load previous stage outputs if resuming
      logger.debug('📋 Phase 3: Loading previous stages (resume)', { episodeId, startFromStage });
      await loadPreviousStages(context, startFromStage);
    }

    logger.info('🚀 Beginning stage processing loop', {
      episodeId,
      startStage: startFromStage,
      endStage: TOTAL_STAGES,
    });

    // Process each stage
    for (let stageNum = startFromStage; stageNum <= TOTAL_STAGES; stageNum++) {
      const stageName = STAGE_NAMES[stageNum];
      const stageStartTime = Date.now();

      logger.info(`▶️ Stage ${stageNum}/${TOTAL_STAGES}: ${stageName}`, {
        episodeId,
        stage: stageNum,
        stageName,
        previousStagesAvailable: Object.keys(context.previousStages).length,
      });

      // Report progress
      if (onProgress) {
        onProgress(stageNum, 'processing', stageName);
      }

      // Mark stage as processing
      await stageRepo.markProcessing(episodeId, stageNum);

      // Update episode current stage
      await episodeRepo.updateStatus(episodeId, 'processing', stageNum);

      try {
        // Run the stage
        logger.debug(`🔄 Executing stage ${stageNum} analyzer`, { episodeId, stage: stageNum });
        const result = await runStage(stageNum, context);

        const stageDuration = Date.now() - stageStartTime;

        // Save result to database
        await stageRepo.markCompleted(episodeId, stageNum, result);

        // Add to context for next stage
        context.previousStages[stageNum] = result.output_data || {
          output_text: result.output_text,
        };

        // Track total cost
        totalCost += result.cost_usd;
        stagesCompleted++;

        logger.info(`✅ Stage ${stageNum}/${TOTAL_STAGES} completed: ${stageName}`, {
          episodeId,
          stage: stageNum,
          stageDurationMs: stageDuration,
          stageCostUsd: result.cost_usd,
          inputTokens: result.input_tokens,
          outputTokens: result.output_tokens,
          runningTotalCost: totalCost,
          stagesCompleted,
          stagesRemaining: TOTAL_STAGES - stageNum,
        });

        // Report progress
        if (onProgress) {
          onProgress(stageNum, 'completed', stageName);
        }

      } catch (stageError) {
        const stageDuration = Date.now() - stageStartTime;

        logger.error(`❌ Stage ${stageNum} failed: ${stageName}`, {
          episodeId,
          stage: stageNum,
          stageName,
          error: stageError.message,
          errorType: stageError.name,
          stageDurationMs: stageDuration,
          stagesCompletedBeforeFailure: stagesCompleted,
        });

        // Mark stage as failed
        await stageRepo.markFailed(
          episodeId,
          stageNum,
          stageError.message,
          stageError.toJSON ? stageError.toJSON() : { message: stageError.message }
        );

        // Update episode status
        await episodeRepo.update(episodeId, {
          status: 'error',
          error_message: `Failed at Stage ${stageNum} (${stageName}): ${stageError.message}`,
        });

        // Report failure
        if (onProgress) {
          onProgress(stageNum, 'failed', stageName);
        }

        throw stageError;
      }
    }

    // Calculate total duration
    const totalDuration = Date.now() - startTime;
    const durationSeconds = Math.floor(totalDuration / 1000);

    // Mark episode as complete
    await episodeRepo.update(episodeId, {
      status: 'completed',
      current_stage: TOTAL_STAGES,
      total_cost_usd: totalCost,
      total_duration_seconds: durationSeconds,
      processing_completed_at: new Date().toISOString(),
    });

    logger.info('🎉 Episode processing complete!', {
      episodeId,
      stagesCompleted,
      totalCostUsd: totalCost,
      totalDurationSeconds: durationSeconds,
      averageSecondsPerStage: Math.round(durationSeconds / stagesCompleted),
      averageCostPerStage: (totalCost / stagesCompleted).toFixed(4),
    });

    return {
      episodeId,
      status: 'completed',
      totalCost,
      durationSeconds,
      stagesCompleted: TOTAL_STAGES,
    };

  } catch (error) {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

    logger.error('Episode processing failed', {
      episodeId,
      error: error.message,
      errorType: error.name,
      stagesCompletedBeforeFailure: stagesCompleted,
      costBeforeFailure: totalCost,
      elapsedSecondsBeforeFailure: elapsedSeconds,
    });

    throw error;
  }
}

/**
 * Regenerates a single stage without running the full pipeline
 *
 * @param {string} episodeId - Episode UUID
 * @param {number} stageNumber - Stage to regenerate
 * @returns {Promise<Object>} Regeneration result
 */
export async function regenerateStage(episodeId, stageNumber) {
  logger.info('Regenerating single stage', { episodeId, stageNumber });

  // Load context
  const context = await loadContext(episodeId);

  // Load all completed previous stages
  await loadPreviousStages(context, stageNumber);

  // Mark stage as processing
  await stageRepo.markProcessing(episodeId, stageNumber);

  try {
    // Run the stage
    const result = await runStage(stageNumber, context);

    // Save result
    await stageRepo.markCompleted(episodeId, stageNumber, result);

    logger.info('Stage regeneration complete', {
      episodeId,
      stageNumber,
      cost: result.cost_usd,
    });

    return result;

  } catch (error) {
    await stageRepo.markFailed(episodeId, stageNumber, error.message);
    throw error;
  }
}

/**
 * Gets the current processing status of an episode
 * @param {string} episodeId - Episode UUID
 * @returns {Promise<Object>} Status information
 */
export async function getProcessingStatus(episodeId) {
  const episode = await episodeRepo.findByIdWithStages(episodeId);

  const completedStages = episode.stages.filter(s => s.status === 'completed').length;
  const failedStages = episode.stages.filter(s => s.status === 'failed');
  const currentStage = episode.stages.find(s => s.status === 'processing');

  return {
    episodeId,
    status: episode.status,
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
