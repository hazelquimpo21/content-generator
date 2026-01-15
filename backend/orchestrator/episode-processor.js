/**
 * ============================================================================
 * EPISODE PROCESSOR MODULE
 * ============================================================================
 * Orchestrates the complete 10-stage AI pipeline for processing an episode.
 * Handles state management, progress tracking, and error recovery.
 *
 * Pipeline Architecture:
 * ----------------------
 * Stage 0: Transcript Preprocessing (Claude Haiku)
 *   - Compresses long transcripts for downstream processing
 *   - Automatically skipped for short transcripts (<8000 tokens)
 *
 * Stages 1-6: Analysis & Drafting (GPT-5 mini)
 *   - 1: Transcript Analysis - Extract metadata, guest info, topics
 *   - 2: Quote Extraction - Find key verbatim quotes
 *   - 3: Blog Outline - High-level post structure
 *   - 4: Paragraph Outlines - Detailed content plan
 *   - 5: Headlines & Copy - Generate title options
 *   - 6: Draft Generation - Write the blog post
 *
 * Stages 7-9: Refinement & Distribution (Claude Sonnet)
 *   - 7: Refinement Pass - Polish and improve the draft
 *   - 8: Social Content - Platform-specific posts
 *   - 9: Email Campaign - Newsletter content
 *
 * Processing Flow:
 * ----------------
 * 1. Load episode transcript and evergreen content
 * 2. Create pending stage records (if fresh start from stage 0)
 * 3. For each stage:
 *    a. Mark stage as 'processing'
 *    b. Run the stage analyzer (AI API call)
 *    c. Save output to database
 *    d. Mark stage as 'completed'
 *    e. Add output to context for next stage
 * 4. Mark episode as 'completed'
 *
 * Error Handling:
 * ---------------
 * - Stage failures are recorded with error details
 * - Episode status is set to 'error' on failure
 * - Partial progress is preserved for resume capability
 *
 * Usage:
 *   import { processEpisode } from './orchestrator/episode-processor.js';
 *   await processEpisode('episode-uuid');
 *
 *   // Resume from specific stage
 *   await processEpisode('episode-uuid', { startFromStage: 3 });
 * ============================================================================
 */

import logger from '../lib/logger.js';
import { episodeRepo, stageRepo, evergreenRepo } from '../lib/supabase-client.js';
import { ProcessingError, NotFoundError } from '../lib/errors.js';
import { runStage, STAGE_NAMES } from './stage-runner.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Total stages: 0 (preprocessing) + 1-9 (main pipeline) = 10 stages
const TOTAL_STAGES = 10;
const FIRST_STAGE = 0;  // Start with preprocessing
const LAST_STAGE = 9;   // End with email campaign

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Loads the processing context required for stage analyzers.
 *
 * The context includes:
 * - Episode transcript and metadata
 * - Evergreen content (therapist profile, podcast info, voice guidelines)
 * - Container for previous stage outputs
 *
 * @param {string} episodeId - Episode UUID
 * @returns {Promise<Object>} Processing context object
 * @throws {NotFoundError} If episode doesn't exist in database
 *
 * @example
 * const context = await loadContext('uuid-here');
 * // context = {
 * //   episodeId: 'uuid-here',
 * //   transcript: '...',
 * //   episodeContext: { guest_name: '...' },
 * //   evergreen: { therapist_profile: {...}, ... },
 * //   previousStages: {}
 * // }
 */
async function loadContext(episodeId) {
  logger.debug('📦 Loading processing context', { episodeId });

  // Load episode from database
  const episode = await episodeRepo.findById(episodeId);

  if (!episode) {
    logger.error('Episode not found during context loading', { episodeId });
    throw new NotFoundError('episode', episodeId);
  }

  // Log episode details for debugging
  logger.debug('📄 Episode loaded', {
    episodeId,
    transcriptLength: episode.transcript?.length,
    transcriptWordCount: episode.transcript?.split(/\s+/).length || 0,
    status: episode.status,
    hasContext: !!episode.episode_context && Object.keys(episode.episode_context).length > 0,
  });

  // Load evergreen content (therapist profile, podcast info, etc.)
  // This content is shared across all episodes and provides voice/style guidance
  const evergreen = await evergreenRepo.get();
  const hasEvergreen = evergreen && Object.keys(evergreen).some(k =>
    evergreen[k] && Object.keys(evergreen[k]).length > 0
  );

  logger.debug('📚 Evergreen content loaded', {
    episodeId,
    hasTherapistProfile: !!evergreen.therapist_profile && Object.keys(evergreen.therapist_profile).length > 0,
    hasPodcastInfo: !!evergreen.podcast_info && Object.keys(evergreen.podcast_info).length > 0,
    hasVoiceGuidelines: !!evergreen.voice_guidelines && Object.keys(evergreen.voice_guidelines).length > 0,
    hasSeoDefaults: !!evergreen.seo_defaults && Object.keys(evergreen.seo_defaults).length > 0,
  });

  // Return the processing context object
  // previousStages will be populated as each stage completes
  return {
    episodeId,
    transcript: episode.transcript,
    episodeContext: episode.episode_context || {},
    evergreen,
    previousStages: {},  // Populated during processing or loaded from DB for resumes
  };
}

/**
 * Loads previous stage outputs into the processing context.
 *
 * This is used when resuming processing from a specific stage.
 * Each stage analyzer may need outputs from previous stages as context.
 *
 * @param {Object} context - Processing context object (modified in place)
 * @param {number} upToStage - Load outputs for stages before this number
 * @returns {Promise<void>}
 *
 * @example
 * // Resuming from stage 4, need stages 0-3 outputs
 * await loadPreviousStages(context, 4);
 * // context.previousStages = { 0: {...}, 1: {...}, 2: {...}, 3: {...} }
 */
async function loadPreviousStages(context, upToStage) {
  logger.debug('📥 Loading previous stage outputs for resume', {
    episodeId: context.episodeId,
    upToStage,
    stagesNeeded: `0-${upToStage - 1}`,
  });

  // Fetch all stage records for this episode
  const stages = await stageRepo.findAllByEpisode(context.episodeId);
  let loadedCount = 0;
  const missingStages = [];

  // Load completed stage outputs into context
  for (const stage of stages) {
    if (stage.stage_number < upToStage) {
      if (stage.status === 'completed') {
        // Store BOTH output_data and output_text for downstream stages.
        // Some stages (like Stage 7) need output_text from previous stage (Stage 6).
        // Some stages need structured output_data. Merge both to ensure availability.
        context.previousStages[stage.stage_number] = {
          ...(stage.output_data || {}),
          output_text: stage.output_text || null,
        };
        loadedCount++;
      } else {
        // Track stages that aren't completed - may cause issues
        missingStages.push({
          stage: stage.stage_number,
          status: stage.status,
        });
      }
    }
  }

  // Warn if expected stages are missing
  if (missingStages.length > 0) {
    logger.warn('Some previous stages not completed - resume may fail', {
      episodeId: context.episodeId,
      upToStage,
      missingStages,
    });
  }

  logger.debug('📥 Previous stages loaded successfully', {
    episodeId: context.episodeId,
    loadedCount,
    stagesLoaded: Object.keys(context.previousStages).map(Number),
    expectedCount: upToStage,
  });
}

// ============================================================================
// MAIN PROCESSOR FUNCTION
// ============================================================================

/**
 * Processes an episode through all 10 stages (0-9) of the AI pipeline.
 *
 * Pipeline Stages:
 * ----------------
 * Stage 0: Transcript Preprocessing (Claude Haiku)
 *   - For long transcripts (>8000 tokens), creates compressed summary
 *   - Automatically skipped for short transcripts
 *
 * Stages 1-9: Main Content Pipeline
 *   - Uses outputs from previous stages as context
 *   - Each stage calls its analyzer and saves results
 *
 * Resume Capability:
 * ------------------
 * - Set startFromStage to resume from a specific stage
 * - Previous stage outputs are loaded from database
 * - IMPORTANT: Stage records must exist (created on fresh start)
 *
 * @param {string} episodeId - Episode UUID to process
 * @param {Object} [options] - Processing options
 * @param {number} [options.startFromStage=0] - Stage to start from (0-9)
 * @param {Function} [options.onProgress] - Progress callback (stage, status, name)
 * @returns {Promise<Object>} Processing result with status, cost, duration
 * @throws {ProcessingError} If any stage fails
 * @throws {NotFoundError} If episode doesn't exist
 *
 * @example
 * // Fresh start (all stages)
 * await processEpisode('uuid');
 *
 * // Resume from stage 3
 * await processEpisode('uuid', { startFromStage: 3 });
 *
 * // With progress callback
 * await processEpisode('uuid', {
 *   onProgress: (stage, status, name) => {
 *     console.log(`Stage ${stage} (${name}): ${status}`);
 *   }
 * });
 */
export async function processEpisode(episodeId, options = {}) {
  const { startFromStage = FIRST_STAGE, onProgress } = options;

  logger.info('🎬 Starting episode processing', {
    episodeId,
    startFromStage,
    totalStages: TOTAL_STAGES,
    firstStage: FIRST_STAGE,
    lastStage: LAST_STAGE,
    isResume: startFromStage > FIRST_STAGE,
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
    if (startFromStage === FIRST_STAGE) {
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
      endStage: LAST_STAGE,
    });

    // Process each stage (0 through 9)
    for (let stageNum = startFromStage; stageNum <= LAST_STAGE; stageNum++) {
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
        // IMPORTANT: Merge both output_data and output_text so downstream stages
        // can access either structured data OR text content as needed.
        // Stage 6 returns output_data (word_count, structure) AND output_text (blog post).
        // Stage 7 needs output_text for refinement.
        context.previousStages[stageNum] = {
          ...(result.output_data || {}),
          output_text: result.output_text || null,
        };

        // Track total cost
        totalCost += result.cost_usd;
        stagesCompleted++;

        // Log special info for Stage 0 preprocessing
        const stageLogExtra = {};
        if (stageNum === 0 && result.skipped) {
          stageLogExtra.preprocessingSkipped = true;
          stageLogExtra.reason = 'Transcript small enough for direct processing';
        }

        logger.info(`✅ Stage ${stageNum}/${LAST_STAGE} completed: ${stageName}`, {
          episodeId,
          stage: stageNum,
          stageDurationMs: stageDuration,
          stageCostUsd: result.cost_usd,
          inputTokens: result.input_tokens,
          outputTokens: result.output_tokens,
          runningTotalCost: totalCost,
          stagesCompleted,
          stagesRemaining: LAST_STAGE - stageNum,
          ...stageLogExtra,
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
      current_stage: LAST_STAGE,
      total_cost_usd: totalCost,
      total_duration_seconds: durationSeconds,
      processing_completed_at: new Date().toISOString(),
    });

    logger.info('🎉 Episode processing complete!', {
      episodeId,
      stagesCompleted,
      totalStages: TOTAL_STAGES,
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
      stagesCompleted,
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
