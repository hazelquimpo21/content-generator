/**
 * ============================================================================
 * PHASE CONFIGURATION MODULE
 * ============================================================================
 * Defines the 4-phase processing pipeline with parallel execution support.
 *
 * Architecture Overview:
 * ----------------------
 * The pipeline processes podcast transcripts through 4 distinct phases:
 *
 *   PRE-GATE → PHASE 1 → PHASE 2 → PHASE 3 → PHASE 4
 *              (Extract)  (Plan)   (Write)  (Distribute)
 *
 * Each phase contains tasks that may run in parallel (if they have no
 * inter-dependencies) or sequentially (if one depends on another).
 *
 * Parallelization Benefits:
 * -------------------------
 * - Phase 1: analyze + quotes run in parallel (both only need transcript)
 * - Phase 2: outline + headlines run in parallel (both only need Phase 1)
 * - Phase 3: draft → refine must be sequential (refine needs draft)
 * - Phase 4: 4 social platforms + email run in parallel (5 total tasks)
 *
 * Stage 8 Sub-Stages:
 * -------------------
 * Stage 8 (Social Content) is split into 4 focused platform-specific tasks:
 * - social_instagram: Instagram-optimized posts
 * - social_twitter: Twitter/X-optimized posts
 * - social_linkedin: LinkedIn-optimized posts
 * - social_facebook: Facebook-optimized posts
 *
 * Each platform task has its own prompt file and runs in parallel for
 * better quality output through specialization.
 *
 * Estimated time savings: ~25-30% faster than fully sequential execution.
 *
 * Design Philosophy:
 * ------------------
 * - Each analyzer does ONE focused thing well
 * - Clear phase boundaries create natural checkpoints
 * - Phase-level retries (not task-level) for simpler error handling
 * - Idempotent operations - safe to retry without side effects
 *
 * Usage:
 *   import { PHASES, PHASE_ORDER, getPhaseConfig } from './phase-config.js';
 *
 * ============================================================================
 */

import logger from '../lib/logger.js';

// ============================================================================
// TASK DEFINITIONS
// ============================================================================
// Each task maps to an existing analyzer. The task ID corresponds to the
// original stage number for backward compatibility with the database schema.
// ============================================================================

/**
 * Task configuration for all pipeline tasks.
 *
 * Each task has:
 * - id: Numeric ID (matches original stage number for DB compatibility)
 * - name: Human-readable name for logging and UI
 * - analyzer: Function name in the analyzers module
 * - model: AI model used
 * - provider: 'openai' or 'anthropic'
 * - description: What this task does (for logging)
 */
export const TASKS = {
  // -------------------------------------------------------------------------
  // PRE-GATE: Preprocessing (conditional)
  // -------------------------------------------------------------------------
  preprocess: {
    id: 0,
    name: 'Transcript Preprocessing',
    analyzer: 'preprocessTranscript',
    model: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    description: 'Compress long transcripts for downstream processing',
    // This task is special - it only runs if transcript exceeds threshold
    conditional: true,
  },

  // -------------------------------------------------------------------------
  // PHASE 1: EXTRACT - Read transcript and extract key information
  // -------------------------------------------------------------------------
  analyze: {
    id: 1,
    name: 'Transcript Analysis',
    analyzer: 'analyzeTranscript',
    model: 'gpt-5-mini',
    provider: 'openai',
    description: 'Extract metadata, themes, and episode crux (CANONICAL SUMMARY)',
  },
  quotes: {
    id: 2,
    name: 'Quote Extraction',
    analyzer: 'extractQuotes',
    model: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    description: 'Extract verbatim quotes (CANONICAL QUOTES SOURCE)',
  },

  // -------------------------------------------------------------------------
  // PHASE 2: PLAN - Structure the blog post
  // -------------------------------------------------------------------------
  outline: {
    id: 3,
    name: 'Blog Outline',
    analyzer: 'outlineHighLevel',
    model: 'gpt-5-mini',
    provider: 'openai',
    description: 'Create high-level blog post structure',
  },
  paragraphs: {
    id: 4,
    name: 'Paragraph Details',
    analyzer: 'outlineParagraphs',
    model: 'gpt-5-mini',
    provider: 'openai',
    description: 'Create detailed paragraph-level plans',
  },
  headlines: {
    id: 5,
    name: 'Headlines & Copy',
    analyzer: 'generateHeadlines',
    model: 'gpt-5-mini',
    provider: 'openai',
    description: 'Generate title options and copy variations',
  },

  // -------------------------------------------------------------------------
  // PHASE 3: WRITE - Generate and refine the blog post
  // -------------------------------------------------------------------------
  draft: {
    id: 6,
    name: 'Blog Draft',
    analyzer: 'draftBlogPost',
    model: 'gpt-5-mini',
    provider: 'openai',
    description: 'Write the complete blog post draft',
  },
  refine: {
    id: 7,
    name: 'Refinement',
    analyzer: 'refineWithClaude',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    description: 'Polish prose and remove AI patterns',
  },

  // -------------------------------------------------------------------------
  // PHASE 4: DISTRIBUTE - Create marketing content
  // -------------------------------------------------------------------------
  // Stage 8 is split into 4 parallel platform-specific sub-tasks
  // Each has the same stage ID (8) but different subStage identifiers
  social_instagram: {
    id: 8,
    subStage: 'instagram',
    name: 'Social Content (Instagram)',
    analyzer: 'generateInstagram',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    description: 'Generate Instagram posts',
  },
  social_twitter: {
    id: 8,
    subStage: 'twitter',
    name: 'Social Content (Twitter/X)',
    analyzer: 'generateTwitter',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    description: 'Generate Twitter/X posts',
  },
  social_linkedin: {
    id: 8,
    subStage: 'linkedin',
    name: 'Social Content (LinkedIn)',
    analyzer: 'generateLinkedIn',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    description: 'Generate LinkedIn posts',
  },
  social_facebook: {
    id: 8,
    subStage: 'facebook',
    name: 'Social Content (Facebook)',
    analyzer: 'generateFacebook',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    description: 'Generate Facebook posts',
  },
  email: {
    id: 9,
    name: 'Email Campaign',
    analyzer: 'generateEmail',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    description: 'Generate email newsletter content',
  },
};

// ============================================================================
// PHASE DEFINITIONS
// ============================================================================
// Phases group related tasks and define execution order.
// Tasks within a phase can run in parallel if 'parallel: true'.
// ============================================================================

/**
 * Phase configuration with task groupings and execution settings.
 *
 * Each phase has:
 * - id: Phase identifier (for logging and checkpoints)
 * - name: Human-readable name
 * - description: What this phase accomplishes
 * - tasks: Array of task keys (from TASKS) to execute
 * - parallel: Whether tasks can run concurrently
 * - requiredPhases: Which phases must complete first
 */
export const PHASES = {
  // -------------------------------------------------------------------------
  // PRE-GATE: Conditional preprocessing
  // -------------------------------------------------------------------------
  // This is NOT a numbered phase - it's a gate that runs before Phase 1.
  // Only executes if transcript exceeds the token threshold.
  // -------------------------------------------------------------------------
  pregate: {
    id: 'pregate',
    name: '🚪 Pre-Gate: Preprocessing',
    description: 'Compress long transcripts if needed (>8000 tokens)',
    tasks: ['preprocess'],
    parallel: false,  // Single task
    requiredPhases: [],
    // Special flag: this phase is conditional
    conditional: true,
    emoji: '🚪',
  },

  // -------------------------------------------------------------------------
  // PHASE 1: EXTRACT
  // -------------------------------------------------------------------------
  // Extract all information we need from the transcript.
  // Both tasks only need the transcript, so they run in PARALLEL.
  // -------------------------------------------------------------------------
  extract: {
    id: 'extract',
    name: '📤 Phase 1: Extract',
    description: 'Read transcript and extract metadata, summary, and quotes',
    tasks: ['analyze', 'quotes'],
    parallel: true,  // ✨ PARALLEL: Both only need transcript
    requiredPhases: ['pregate'],
    emoji: '📤',
  },

  // -------------------------------------------------------------------------
  // PHASE 2: PLAN
  // -------------------------------------------------------------------------
  // Structure the blog post using extracted information.
  //
  // Task dependencies within this phase:
  // - outline: needs Phase 1 (analyze, quotes)
  // - paragraphs: needs Phase 1 + outline → MUST wait for outline
  // - headlines: needs Phase 1 + outline → MUST wait for outline
  //
  // Execution order:
  // 1. outline (sequential - needed by paragraphs and headlines)
  // 2. paragraphs + headlines (parallel - both need outline)
  // -------------------------------------------------------------------------
  plan: {
    id: 'plan',
    name: '📋 Phase 2: Plan',
    description: 'Create blog outline, paragraph details, and headlines',
    tasks: ['outline', 'paragraphs', 'headlines'],
    parallel: false,  // Complex dependencies - handled by executor
    requiredPhases: ['extract'],
    // Special execution order for this phase
    executionGroups: [
      { tasks: ['outline'], parallel: false },           // First: outline
      { tasks: ['paragraphs', 'headlines'], parallel: true },  // Then: parallel
    ],
    emoji: '📋',
  },

  // -------------------------------------------------------------------------
  // PHASE 3: WRITE
  // -------------------------------------------------------------------------
  // Generate and refine the blog post.
  // SEQUENTIAL: refine needs the draft output.
  // -------------------------------------------------------------------------
  write: {
    id: 'write',
    name: '✍️ Phase 3: Write',
    description: 'Generate blog draft and refine it',
    tasks: ['draft', 'refine'],
    parallel: false,  // SEQUENTIAL: refine needs draft
    requiredPhases: ['plan'],
    emoji: '✍️',
  },

  // -------------------------------------------------------------------------
  // PHASE 4: DISTRIBUTE
  // -------------------------------------------------------------------------
  // Create marketing content from the refined blog post.
  // PARALLEL: All 5 tasks (4 social platforms + email) run concurrently.
  // -------------------------------------------------------------------------
  distribute: {
    id: 'distribute',
    name: '📣 Phase 4: Distribute',
    description: 'Generate social media posts (4 platforms) and email campaign',
    tasks: ['social_instagram', 'social_twitter', 'social_linkedin', 'social_facebook', 'email'],
    parallel: true,  // ✨ PARALLEL: All 5 tasks run concurrently
    requiredPhases: ['write'],
    emoji: '📣',
  },
};

/**
 * Ordered list of phases for sequential processing.
 * The executor processes phases in this order.
 */
export const PHASE_ORDER = ['pregate', 'extract', 'plan', 'write', 'distribute'];

// ============================================================================
// TASK DEPENDENCY MAPPING
// ============================================================================
// Maps each task to the tasks it depends on (needs data from).
// Used for validation and context building.
// ============================================================================

/**
 * Task dependencies - what each task needs from previous tasks.
 *
 * Key insight: Dependencies are expressed in terms of task outputs,
 * not phase outputs. This allows fine-grained validation.
 */
export const TASK_DEPENDENCIES = {
  // Pre-gate
  preprocess: [],  // Only needs transcript

  // Phase 1: Extract
  analyze: [],     // Only needs transcript
  quotes: [],      // Only needs transcript (ALWAYS original, not preprocessed)

  // Phase 2: Plan
  outline: ['analyze', 'quotes'],           // Needs Phase 1 outputs
  paragraphs: ['quotes', 'outline'],        // Needs quotes + outline
  headlines: ['analyze', 'outline'],        // Needs analysis + outline

  // Phase 3: Write
  draft: ['analyze', 'quotes', 'outline', 'paragraphs', 'headlines'],  // Needs everything
  refine: ['draft'],  // Needs the draft output_text

  // Phase 4: Distribute
  // All 4 social platform tasks have identical dependencies
  social_instagram: ['refine', 'quotes', 'headlines'],
  social_twitter: ['refine', 'quotes', 'headlines'],
  social_linkedin: ['refine', 'quotes', 'headlines'],
  social_facebook: ['refine', 'quotes', 'headlines'],
  email: ['refine', 'analyze', 'headlines'],  // Needs refined post + analysis + headlines
};

/**
 * Maps task IDs to what data they require from previousStages.
 * Used for validation before running a task.
 */
export const REQUIRED_PREVIOUS_DATA = {
  preprocess: [],
  analyze: [],
  quotes: [],
  outline: [
    { stage: 1, fields: ['episode_crux', 'episode_basics'] },
    { stage: 2, fields: ['quotes'] },
  ],
  paragraphs: [
    { stage: 2, fields: ['quotes'] },
    { stage: 3, fields: ['post_structure'] },
  ],
  headlines: [
    { stage: 1, fields: ['episode_crux'] },
    { stage: 3, fields: ['post_structure'] },
  ],
  draft: [
    { stage: 1, fields: ['episode_basics', 'episode_crux'] },
    { stage: 2, fields: ['quotes'] },
    { stage: 3, fields: ['post_structure'] },
    { stage: 4, fields: ['section_details'] },
    { stage: 5, fields: ['headlines'] },
  ],
  refine: [
    { stage: 6, fields: ['output_text'], required: true },
  ],
  // All 4 social platform tasks have identical requirements
  social_instagram: [
    { stage: 7, fields: ['output_text'], required: true },
    { stage: 2, fields: ['quotes'] },
  ],
  social_twitter: [
    { stage: 7, fields: ['output_text'], required: true },
    { stage: 2, fields: ['quotes'] },
  ],
  social_linkedin: [
    { stage: 7, fields: ['output_text'], required: true },
    { stage: 2, fields: ['quotes'] },
  ],
  social_facebook: [
    { stage: 7, fields: ['output_text'], required: true },
    { stage: 2, fields: ['quotes'] },
  ],
  email: [
    { stage: 7, fields: ['output_text'], required: true },
    { stage: 1, fields: ['episode_basics'] },
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets the configuration for a specific phase.
 *
 * @param {string} phaseId - Phase identifier (e.g., 'extract', 'plan')
 * @returns {Object|null} Phase configuration or null if not found
 */
export function getPhaseConfig(phaseId) {
  return PHASES[phaseId] || null;
}

/**
 * Gets the configuration for a specific task.
 *
 * @param {string} taskKey - Task key (e.g., 'analyze', 'quotes')
 * @returns {Object|null} Task configuration or null if not found
 */
export function getTaskConfig(taskKey) {
  return TASKS[taskKey] || null;
}

/**
 * Gets a task by its numeric ID (for backward compatibility).
 *
 * @param {number} taskId - Numeric task ID (0-9)
 * @returns {Object|null} Task configuration or null if not found
 */
export function getTaskById(taskId) {
  const taskKey = Object.keys(TASKS).find(key => TASKS[key].id === taskId);
  return taskKey ? { key: taskKey, ...TASKS[taskKey] } : null;
}

/**
 * Gets all tasks for a specific phase.
 *
 * @param {string} phaseId - Phase identifier
 * @returns {Array<Object>} Array of task configurations
 */
export function getTasksForPhase(phaseId) {
  const phase = PHASES[phaseId];
  if (!phase) return [];

  return phase.tasks.map(taskKey => ({
    key: taskKey,
    ...TASKS[taskKey],
  }));
}

/**
 * Gets the dependencies for a task.
 *
 * @param {string} taskKey - Task key
 * @returns {Array<string>} Array of task keys this task depends on
 */
export function getTaskDependencies(taskKey) {
  return TASK_DEPENDENCIES[taskKey] || [];
}

/**
 * Gets the required previous stage data for a task.
 *
 * @param {string} taskKey - Task key
 * @returns {Array<Object>} Array of {stage, fields, required} objects
 */
export function getRequiredPreviousData(taskKey) {
  return REQUIRED_PREVIOUS_DATA[taskKey] || [];
}

/**
 * Validates that required previous stage data exists.
 *
 * @param {string} taskKey - Task key to validate for
 * @param {Object} previousStages - The previousStages context object
 * @returns {Object} { valid: boolean, missing: Array<string> }
 */
export function validateTaskInputs(taskKey, previousStages) {
  const required = REQUIRED_PREVIOUS_DATA[taskKey] || [];
  const missing = [];

  for (const req of required) {
    const stageData = previousStages[req.stage];

    // Check if stage data exists
    if (!stageData) {
      if (req.required !== false) {
        missing.push(`Stage ${req.stage} output`);
      }
      continue;
    }

    // Check each required field
    for (const field of req.fields) {
      if (stageData[field] === undefined || stageData[field] === null) {
        if (req.required !== false) {
          missing.push(`Stage ${req.stage}.${field}`);
        }
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Gets human-readable status for logging.
 *
 * @param {string} phaseId - Phase identifier
 * @returns {Object} { emoji, name, tasks }
 */
export function getPhaseStatus(phaseId) {
  const phase = PHASES[phaseId];
  if (!phase) return { emoji: '❓', name: 'Unknown', tasks: [] };

  return {
    emoji: phase.emoji || '📦',
    name: phase.name,
    tasks: phase.tasks.map(t => TASKS[t]?.name || t),
  };
}

/**
 * Logs the full pipeline configuration for debugging.
 */
export function logPipelineConfig() {
  logger.info('📊 Pipeline Configuration', {
    totalPhases: PHASE_ORDER.length,
    totalTasks: Object.keys(TASKS).length,
    phases: PHASE_ORDER.map(p => ({
      id: p,
      name: PHASES[p].name,
      tasks: PHASES[p].tasks,
      parallel: PHASES[p].parallel,
    })),
  });
}

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================
// Maps between old stage numbers and new task keys for DB compatibility.
// ============================================================================

/**
 * Maps stage numbers to task keys (for backward compatibility).
 */
export const STAGE_TO_TASK = {
  0: 'preprocess',
  1: 'analyze',
  2: 'quotes',
  3: 'outline',
  4: 'paragraphs',
  5: 'headlines',
  6: 'draft',
  7: 'refine',
  8: 'social',
  9: 'email',
};

/**
 * Maps task keys to stage numbers (for DB storage).
 */
export const TASK_TO_STAGE = Object.fromEntries(
  Object.entries(STAGE_TO_TASK).map(([k, v]) => [v, parseInt(k)])
);

/**
 * Gets the stage number for a task (for DB storage).
 *
 * @param {string} taskKey - Task key
 * @returns {number} Stage number
 */
export function getStageNumber(taskKey) {
  return TASK_TO_STAGE[taskKey] ?? -1;
}

/**
 * Gets the task key for a stage number (for resume from DB).
 *
 * @param {number} stageNumber - Stage number
 * @returns {string|null} Task key or null if invalid
 */
export function getTaskKey(stageNumber) {
  return STAGE_TO_TASK[stageNumber] || null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  TASKS,
  PHASES,
  PHASE_ORDER,
  TASK_DEPENDENCIES,
  REQUIRED_PREVIOUS_DATA,
  STAGE_TO_TASK,
  TASK_TO_STAGE,
  getPhaseConfig,
  getTaskConfig,
  getTaskById,
  getTasksForPhase,
  getTaskDependencies,
  getRequiredPreviousData,
  validateTaskInputs,
  getPhaseStatus,
  getStageNumber,
  getTaskKey,
  logPipelineConfig,
};
