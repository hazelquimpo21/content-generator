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
  logger.debug('Loading processing context', { episodeId });

  // Load episode
  const episode = await episodeRepo.findById(episodeId);

  if (!episode) {
    throw new NotFoundError('episode', episodeId);
  }

  // Load evergreen content
  const evergreen = await evergreenRepo.get();

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
  const stages = await stageRepo.findAllByEpisode(context.episodeId);

  for (const stage of stages) {
    if (stage.stage_number < upToStage && stage.status === 'completed') {
      context.previousStages[stage.stage_number] = stage.output_data || {
        output_text: stage.output_text,
      };
    }
  }
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

  logger.info('🎬 Starting episode processing', { episodeId, startFromStage });

  const startTime = Date.now();
  let totalCost = 0;

  try {
    // Load context
    const context = await loadContext(episodeId);

    // Update episode status to processing
    await episodeRepo.updateStatus(episodeId, 'processing', startFromStage);

    // Create stage records if starting fresh
    if (startFromStage === 1) {
      await stageRepo.createAllStages(episodeId);
    } else {
      // Load previous stage outputs if resuming
      await loadPreviousStages(context, startFromStage);
    }

    // Process each stage
    for (let stageNum = startFromStage; stageNum <= TOTAL_STAGES; stageNum++) {
      const stageName = STAGE_NAMES[stageNum];

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
        const result = await runStage(stageNum, context);

        // Save result to database
        await stageRepo.markCompleted(episodeId, stageNum, result);

        // Add to context for next stage
        context.previousStages[stageNum] = result.output_data || {
          output_text: result.output_text,
        };

        // Track total cost
        totalCost += result.cost_usd;

        // Report progress
        if (onProgress) {
          onProgress(stageNum, 'completed', stageName);
        }

      } catch (stageError) {
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
      totalCost: `$${totalCost.toFixed(4)}`,
      duration: `${durationSeconds}s`,
    });

    return {
      episodeId,
      status: 'completed',
      totalCost,
      durationSeconds,
      stagesCompleted: TOTAL_STAGES,
    };

  } catch (error) {
    logger.error('Episode processing failed', {
      episodeId,
      error: error.message,
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
