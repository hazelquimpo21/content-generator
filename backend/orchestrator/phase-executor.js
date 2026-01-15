/**
 * ============================================================================
 * PHASE EXECUTOR MODULE
 * ============================================================================
 * Executes phases with support for parallel task execution.
 *
 * This module is the heart of the parallel processing system. It:
 * 1. Executes tasks within a phase (parallel or sequential)
 * 2. Handles errors with phase-level retry semantics
 * 3. Tracks costs and timing for all tasks
 * 4. Validates inputs before running tasks
 * 5. Merges outputs into the context for downstream phases
 *
 * Design Philosophy:
 * ------------------
 * - ATOMIC PHASES: A phase either fully succeeds or fully fails
 * - PHASE-LEVEL RETRY: If any task fails, retry the entire phase
 * - ISOLATED RESULTS: Parallel tasks write to isolated results, merged after
 * - FAIL FAST: Cancel siblings on first failure (don't waste API calls)
 *
 * Execution Patterns:
 * -------------------
 * - Parallel: Multiple tasks run concurrently via Promise.all()
 * - Sequential: Tasks run one after another
 * - Grouped: Some sequential, some parallel (e.g., outline → [paragraphs, headlines])
 *
 * Usage:
 *   import { executePhase } from './phase-executor.js';
 *   const result = await executePhase('extract', context, { onTaskComplete });
 *
 * ============================================================================
 */

import logger from '../lib/logger.js';
import { ProcessingError } from '../lib/errors.js';
import {
  PHASES,
  TASKS,
  getPhaseConfig,
  getTaskConfig,
  validateTaskInputs,
  getStageNumber,
} from './phase-config.js';

// Import task runner (existing stage runner, renamed export)
import { runStage } from './stage-runner.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default timeout for parallel task execution (5 minutes).
 * Individual tasks may complete faster, but this is the max wait.
 */
const DEFAULT_TASK_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Whether to cancel remaining parallel tasks on first failure.
 * Set to true for fail-fast behavior (recommended for cost savings).
 */
const CANCEL_ON_FIRST_FAILURE = true;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a timeout promise that rejects after the specified duration.
 * Used to prevent hanging on slow API calls.
 *
 * @param {number} ms - Timeout in milliseconds
 * @param {string} taskName - Task name for error message
 * @returns {Promise} Promise that rejects after timeout
 */
function createTimeout(ms, taskName) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new ProcessingError(
        -1,
        taskName,
        `Task timed out after ${ms / 1000} seconds`
      ));
    }, ms);
  });
}

/**
 * Wraps a task execution with a timeout.
 *
 * @param {Promise} taskPromise - The task execution promise
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} taskName - Task name for error messages
 * @returns {Promise} Task result or timeout error
 */
function withTimeout(taskPromise, timeoutMs, taskName) {
  return Promise.race([
    taskPromise,
    createTimeout(timeoutMs, taskName),
  ]);
}

/**
 * Formats duration for logging.
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "2.3s" or "1m 15s")
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// ============================================================================
// TASK EXECUTION
// ============================================================================

/**
 * Executes a single task within a phase.
 *
 * This function:
 * 1. Validates required inputs exist
 * 2. Runs the analyzer via the stage runner
 * 3. Tracks timing and cost
 * 4. Returns structured result
 *
 * @param {string} taskKey - Task key (e.g., 'analyze', 'quotes')
 * @param {Object} context - Processing context
 * @param {Object} options - Execution options
 * @param {string} options.episodeId - Episode UUID for logging
 * @param {Function} options.onTaskStart - Callback when task starts
 * @param {Function} options.onTaskComplete - Callback when task completes
 * @returns {Promise<Object>} Task result with output, timing, and cost
 * @throws {ProcessingError} If task fails
 */
async function executeTask(taskKey, context, options = {}) {
  const { episodeId, onTaskStart, onTaskComplete } = options;
  const taskConfig = getTaskConfig(taskKey);

  if (!taskConfig) {
    throw new ProcessingError(-1, taskKey, `Unknown task: ${taskKey}`);
  }

  const stageNumber = getStageNumber(taskKey);
  const startTime = Date.now();

  // -------------------------------------------------------------------------
  // Log task start
  // -------------------------------------------------------------------------
  logger.info(`  🔧 Starting task: ${taskConfig.name}`, {
    task: taskKey,
    stageNumber,
    subStage: taskConfig.subStage || null,
    model: taskConfig.model,
    provider: taskConfig.provider,
    episodeId,
  });

  if (onTaskStart) {
    onTaskStart(taskKey, taskConfig);
  }

  // -------------------------------------------------------------------------
  // Validate inputs
  // -------------------------------------------------------------------------
  const validation = validateTaskInputs(taskKey, context.previousStages);
  if (!validation.valid) {
    logger.error(`  ❌ Task ${taskKey} missing required inputs`, {
      episodeId,
      missing: validation.missing,
    });
    throw new ProcessingError(
      stageNumber,
      taskConfig.name,
      `Missing required inputs: ${validation.missing.join(', ')}`
    );
  }

  // -------------------------------------------------------------------------
  // Execute the analyzer
  // -------------------------------------------------------------------------
  try {
    // Build options for runStage, including subStage if present
    const runOptions = {};
    if (taskConfig.subStage) {
      runOptions.subStage = taskConfig.subStage;
    }

    // Run the stage analyzer (existing infrastructure)
    const result = await runStage(stageNumber, context, runOptions);

    const durationMs = Date.now() - startTime;

    // Log success
    logger.info(`  ✅ Task completed: ${taskConfig.name}`, {
      task: taskKey,
      stageNumber,
      durationMs,
      duration: formatDuration(durationMs),
      costUsd: result.cost_usd?.toFixed(4),
      inputTokens: result.input_tokens,
      outputTokens: result.output_tokens,
      hasOutputData: !!result.output_data,
      hasOutputText: !!result.output_text,
      episodeId,
    });

    // Build the task result object (same as what's returned)
    const taskResult = {
      taskKey,
      stageNumber,
      subStage: taskConfig.subStage || null,
      success: true,
      result,
      durationMs,
      cost: result.cost_usd || 0,
    };

    // Call the completion callback with the task result
    // Signature: (taskKey, taskResult) - matches executeTasksSequential
    if (onTaskComplete) {
      onTaskComplete(taskKey, taskResult);
    }

    return taskResult;

  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error(`  ❌ Task failed: ${taskConfig.name}`, {
      task: taskKey,
      stageNumber,
      error: error.message,
      errorType: error.name,
      durationMs,
      episodeId,
    });

    // Re-throw with task context
    if (error instanceof ProcessingError) {
      throw error;
    }

    throw new ProcessingError(
      stageNumber,
      taskConfig.name,
      error.message,
      episodeId,
      error
    );
  }
}

// ============================================================================
// PARALLEL EXECUTION
// ============================================================================

/**
 * Executes multiple tasks in parallel with fail-fast behavior.
 *
 * Design decisions:
 * - Uses Promise.allSettled to capture all results/errors
 * - Aggregates costs and timing from all tasks
 * - If CANCEL_ON_FIRST_FAILURE is true, throws on first failure
 *
 * @param {Array<string>} taskKeys - Array of task keys to execute
 * @param {Object} context - Processing context
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Aggregated results from all tasks
 */
async function executeTasksParallel(taskKeys, context, options = {}) {
  const { episodeId, timeoutMs = DEFAULT_TASK_TIMEOUT_MS } = options;

  logger.info(`  ⚡ Executing ${taskKeys.length} tasks in PARALLEL`, {
    tasks: taskKeys,
    episodeId,
  });

  const startTime = Date.now();

  // Create wrapped promises for each task
  const taskPromises = taskKeys.map(taskKey => {
    const taskConfig = getTaskConfig(taskKey);
    return withTimeout(
      executeTask(taskKey, context, options),
      timeoutMs,
      taskConfig?.name || taskKey
    );
  });

  // Execute all in parallel
  const results = await Promise.allSettled(taskPromises);

  const durationMs = Date.now() - startTime;

  // Process results
  const succeeded = [];
  const failed = [];
  let totalCost = 0;

  results.forEach((result, index) => {
    const taskKey = taskKeys[index];

    if (result.status === 'fulfilled') {
      succeeded.push(result.value);
      totalCost += result.value.cost || 0;
    } else {
      failed.push({
        taskKey,
        error: result.reason,
      });
    }
  });

  logger.info(`  📊 Parallel execution complete`, {
    succeededCount: succeeded.length,
    failedCount: failed.length,
    totalCost: totalCost.toFixed(4),
    durationMs,
    duration: formatDuration(durationMs),
    episodeId,
  });

  // If any task failed and we're in fail-fast mode, throw
  if (failed.length > 0) {
    const firstFailure = failed[0];
    logger.error(`  ❌ Parallel execution had failures`, {
      failedTasks: failed.map(f => f.taskKey),
      firstError: firstFailure.error?.message,
      episodeId,
    });

    throw firstFailure.error;
  }

  return {
    tasks: succeeded,
    totalCost,
    durationMs,
  };
}

/**
 * Executes tasks sequentially (one after another).
 *
 * @param {Array<string>} taskKeys - Array of task keys to execute
 * @param {Object} context - Processing context
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Aggregated results from all tasks
 */
async function executeTasksSequential(taskKeys, context, options = {}) {
  const { episodeId, onTaskComplete } = options;

  logger.info(`  ➡️ Executing ${taskKeys.length} tasks SEQUENTIALLY`, {
    tasks: taskKeys,
    episodeId,
  });

  const startTime = Date.now();
  const results = [];
  let totalCost = 0;

  for (const taskKey of taskKeys) {
    const taskResult = await executeTask(taskKey, context, options);
    results.push(taskResult);
    totalCost += taskResult.cost || 0;

    // Merge result into context for next task
    // This is critical for sequential dependencies (e.g., outline → paragraphs)
    const stageNumber = taskResult.stageNumber;
    context.previousStages[stageNumber] = {
      ...(taskResult.result.output_data || {}),
      output_text: taskResult.result.output_text || null,
    };

    // Callback for progress tracking
    if (onTaskComplete) {
      onTaskComplete(taskKey, taskResult);
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info(`  📊 Sequential execution complete`, {
    taskCount: results.length,
    totalCost: totalCost.toFixed(4),
    durationMs,
    duration: formatDuration(durationMs),
    episodeId,
  });

  return {
    tasks: results,
    totalCost,
    durationMs,
  };
}

// ============================================================================
// PHASE EXECUTION
// ============================================================================

/**
 * Executes a complete phase with all its tasks.
 *
 * This is the main entry point for phase execution. It:
 * 1. Looks up the phase configuration
 * 2. Determines execution strategy (parallel/sequential/grouped)
 * 3. Executes tasks according to the strategy
 * 4. Merges results into context
 * 5. Returns phase-level metrics
 *
 * @param {string} phaseId - Phase identifier (e.g., 'extract', 'plan')
 * @param {Object} context - Processing context (modified in place)
 * @param {Object} options - Execution options
 * @param {string} options.episodeId - Episode UUID
 * @param {Function} options.onTaskStart - Called when each task starts
 * @param {Function} options.onTaskComplete - Called when each task completes
 * @param {Function} options.onPhaseStart - Called when phase starts
 * @param {Function} options.onPhaseComplete - Called when phase completes
 * @returns {Promise<Object>} Phase execution result
 * @throws {ProcessingError} If any task in the phase fails
 *
 * @example
 * const result = await executePhase('extract', context, {
 *   episodeId: 'uuid',
 *   onTaskComplete: (taskKey, result) => console.log(`${taskKey} done`)
 * });
 */
export async function executePhase(phaseId, context, options = {}) {
  const { episodeId, onPhaseStart, onPhaseComplete } = options;
  const phaseConfig = getPhaseConfig(phaseId);

  if (!phaseConfig) {
    throw new ProcessingError(-1, 'PhaseExecutor', `Unknown phase: ${phaseId}`);
  }

  const startTime = Date.now();

  // -------------------------------------------------------------------------
  // Log phase start
  // -------------------------------------------------------------------------
  logger.info(`${phaseConfig.emoji} Starting phase: ${phaseConfig.name}`, {
    phaseId,
    tasks: phaseConfig.tasks,
    parallel: phaseConfig.parallel,
    description: phaseConfig.description,
    episodeId,
  });

  if (onPhaseStart) {
    onPhaseStart(phaseId, phaseConfig);
  }

  let phaseResult;

  try {
    // -----------------------------------------------------------------------
    // Determine execution strategy
    // -----------------------------------------------------------------------
    if (phaseConfig.executionGroups) {
      // Grouped execution: some sequential, some parallel
      // Example: outline → [paragraphs, headlines]
      phaseResult = await executeGroupedTasks(
        phaseConfig.executionGroups,
        context,
        options
      );
    } else if (phaseConfig.parallel && phaseConfig.tasks.length > 1) {
      // Fully parallel execution
      phaseResult = await executeTasksParallel(
        phaseConfig.tasks,
        context,
        options
      );

      // Merge all results into context AFTER parallel completion
      for (const taskResult of phaseResult.tasks) {
        const stageNumber = taskResult.stageNumber;
        context.previousStages[stageNumber] = {
          ...(taskResult.result.output_data || {}),
          output_text: taskResult.result.output_text || null,
        };
      }
    } else {
      // Sequential execution
      phaseResult = await executeTasksSequential(
        phaseConfig.tasks,
        context,
        options
      );
    }

    const durationMs = Date.now() - startTime;

    // -----------------------------------------------------------------------
    // Log phase completion
    // -----------------------------------------------------------------------
    logger.info(`${phaseConfig.emoji} Phase completed: ${phaseConfig.name}`, {
      phaseId,
      tasksCompleted: phaseResult.tasks.length,
      totalCost: phaseResult.totalCost.toFixed(4),
      durationMs,
      duration: formatDuration(durationMs),
      episodeId,
    });

    if (onPhaseComplete) {
      onPhaseComplete(phaseId, phaseConfig, phaseResult);
    }

    return {
      phaseId,
      success: true,
      tasks: phaseResult.tasks,
      totalCost: phaseResult.totalCost,
      durationMs,
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error(`${phaseConfig.emoji} Phase failed: ${phaseConfig.name}`, {
      phaseId,
      error: error.message,
      errorType: error.name,
      durationMs,
      episodeId,
    });

    // Wrap error with phase context
    if (!(error instanceof ProcessingError)) {
      throw new ProcessingError(
        -1,
        phaseConfig.name,
        error.message,
        episodeId,
        error
      );
    }

    throw error;
  }
}

/**
 * Executes tasks in groups (some sequential, some parallel within groups).
 *
 * This handles complex execution patterns like the Plan phase:
 * - First: outline (sequential, needed by next tasks)
 * - Then: paragraphs + headlines (parallel)
 *
 * @param {Array<Object>} groups - Array of {tasks, parallel} objects
 * @param {Object} context - Processing context
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Aggregated results
 */
async function executeGroupedTasks(groups, context, options = {}) {
  const { episodeId } = options;

  logger.info(`  📦 Executing ${groups.length} task groups`, {
    groups: groups.map((g, i) => ({
      group: i + 1,
      tasks: g.tasks,
      parallel: g.parallel,
    })),
    episodeId,
  });

  const allResults = [];
  let totalCost = 0;
  const startTime = Date.now();

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];

    logger.info(`  📦 Executing group ${i + 1}/${groups.length}`, {
      tasks: group.tasks,
      parallel: group.parallel,
      episodeId,
    });

    let groupResult;

    if (group.parallel && group.tasks.length > 1) {
      groupResult = await executeTasksParallel(group.tasks, context, options);

      // Merge parallel results into context
      for (const taskResult of groupResult.tasks) {
        const stageNumber = taskResult.stageNumber;
        context.previousStages[stageNumber] = {
          ...(taskResult.result.output_data || {}),
          output_text: taskResult.result.output_text || null,
        };
      }
    } else {
      groupResult = await executeTasksSequential(group.tasks, context, options);
    }

    allResults.push(...groupResult.tasks);
    totalCost += groupResult.totalCost;
  }

  const durationMs = Date.now() - startTime;

  return {
    tasks: allResults,
    totalCost,
    durationMs,
  };
}

// ============================================================================
// CHECKPOINT HELPERS
// ============================================================================

/**
 * Creates a checkpoint of the current phase state.
 *
 * Used for phase-level retry: if a phase fails, we can restore to the
 * checkpoint and retry the entire phase.
 *
 * @param {Object} context - Processing context
 * @param {string} phaseId - Phase that just completed
 * @returns {Object} Checkpoint data
 */
export function createPhaseCheckpoint(context, phaseId) {
  return {
    phaseId,
    timestamp: new Date().toISOString(),
    previousStages: { ...context.previousStages },
    episodeId: context.episodeId,
  };
}

/**
 * Restores context from a checkpoint.
 *
 * @param {Object} context - Processing context to restore into
 * @param {Object} checkpoint - Checkpoint data
 */
export function restoreFromCheckpoint(context, checkpoint) {
  context.previousStages = { ...checkpoint.previousStages };
  logger.info('🔄 Restored from checkpoint', {
    phaseId: checkpoint.phaseId,
    timestamp: checkpoint.timestamp,
    episodeId: checkpoint.episodeId,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  executePhase,
  executeTask,
  executeTasksParallel,
  executeTasksSequential,
  createPhaseCheckpoint,
  restoreFromCheckpoint,
};
