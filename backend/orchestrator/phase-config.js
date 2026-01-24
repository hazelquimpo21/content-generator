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
  // PRE-GATE: Content Brief (ALWAYS runs)
  // -------------------------------------------------------------------------
  content_brief: {
    id: 0,
    name: 'Content Brief',
    analyzer: 'createContentBrief',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    description: 'Create comprehensive content brief with themes, metadata, SEO overview',
    // No longer conditional - always runs
  },

  // -------------------------------------------------------------------------
  // PHASE 1: EXTRACT - Summary and quotes/tips
  // -------------------------------------------------------------------------
  summary: {
    id: 1,
    name: 'Episode Summary',
    analyzer: 'createEpisodeSummary',
    model: 'gpt-5-mini',
    provider: 'openai',
    description: 'Create in-depth summary and episode crux (CANONICAL SUMMARY)',
  },
  quotes_and_tips: {
    id: 2,
    name: 'Quotes & Tips Extraction',
    analyzer: 'extractQuotesAndTips',
    model: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    description: 'Extract verbatim quotes and actionable tips (CANONICAL SOURCE)',
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
  // PRE-GATE: Content Brief (ALWAYS runs)
  // -------------------------------------------------------------------------
  // Creates the foundational content brief with themes, metadata, and SEO overview.
  // This is the foundation for all downstream content creation.
  // -------------------------------------------------------------------------
  pregate: {
    id: 'pregate',
    name: '📋 Pre-Gate: Content Brief',
    description: 'Create content brief with themes, metadata, and SEO overview',
    tasks: ['content_brief'],
    parallel: false,  // Single task
    requiredPhases: [],
    // NOT conditional - always runs
    emoji: '📋',
  },

  // -------------------------------------------------------------------------
  // PHASE 1: EXTRACT
  // -------------------------------------------------------------------------
  // Create summary (using themes) and extract quotes/tips.
  // Both tasks can run in PARALLEL after content brief completes:
  // - summary: needs themes from Stage 0
  // - quotes_and_tips: only needs original transcript
  // -------------------------------------------------------------------------
  extract: {
    id: 'extract',
    name: '📤 Phase 1: Extract',
    description: 'Create episode summary and extract quotes/tips',
    tasks: ['summary', 'quotes_and_tips'],
    parallel: true,  // ✨ PARALLEL: summary needs Stage 0, quotes needs transcript
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
  content_brief: [],  // Only needs transcript

  // Phase 1: Extract
  summary: ['content_brief'],     // Needs themes from content brief
  quotes_and_tips: [],            // Only needs transcript (ALWAYS original)

  // Phase 2: Plan
  outline: ['summary', 'quotes_and_tips'],           // Needs Phase 1 outputs
  paragraphs: ['quotes_and_tips', 'outline'],        // Needs quotes + outline
  headlines: ['summary', 'outline'],                 // Needs summary + outline

  // Phase 3: Write
  draft: ['summary', 'quotes_and_tips', 'outline', 'paragraphs', 'headlines'],  // Needs everything
  refine: ['draft'],  // Needs the draft output_text

  // Phase 4: Distribute
  // All 4 social platform tasks have identical dependencies
  social_instagram: ['refine', 'quotes_and_tips', 'headlines'],
  social_twitter: ['refine', 'quotes_and_tips', 'headlines'],
  social_linkedin: ['refine', 'quotes_and_tips', 'headlines'],
  social_facebook: ['refine', 'quotes_and_tips', 'headlines'],
  email: ['refine', 'content_brief', 'headlines'],  // Needs refined post + content brief + headlines
};

/**
 * Maps task IDs to what data they require from previousStages.
 * Used for validation before running a task.
 *
 * Stage mapping:
 * - Stage 0: content_brief (themes, episode_name, seo_overview, etc.)
 * - Stage 1: summary (summary, episode_crux)
 * - Stage 2: quotes_and_tips (quotes[], tips[])
 */
export const REQUIRED_PREVIOUS_DATA = {
  content_brief: [],
  summary: [
    { stage: 0, fields: ['themes'], required: false },  // Gracefully degrade if missing
  ],
  quotes_and_tips: [],
  outline: [
    { stage: 1, fields: ['episode_crux', 'summary'] },
    { stage: 2, fields: ['quotes'] },
  ],
  paragraphs: [
    { stage: 2, fields: ['quotes'] },
    // Stage 3 dual-article format: episode_recap_outline + topic_article_outline
    { stage: 3, fields: ['episode_recap_outline', 'topic_article_outline'] },
  ],
  headlines: [
    { stage: 1, fields: ['episode_crux'] },
    // Stage 3 dual-article format: episode_recap_outline + topic_article_outline
    { stage: 3, fields: ['episode_recap_outline', 'topic_article_outline'] },
  ],
  draft: [
    { stage: 0, fields: ['episode_name', 'seo_overview'] },
    { stage: 1, fields: ['summary', 'episode_crux'] },
    { stage: 2, fields: ['quotes', 'tips'] },
    // Stage 3 dual-article format
    { stage: 3, fields: ['episode_recap_outline', 'topic_article_outline'] },
    { stage: 4, fields: ['section_details'] },
    { stage: 5, fields: ['headlines'] },
  ],
  refine: [
    { stage: 6, fields: ['output_text'], required: true },
  ],
  // All 4 social platform tasks have identical requirements
  social_instagram: [
    { stage: 7, fields: ['output_text'], required: true },
    { stage: 2, fields: ['quotes', 'tips'] },
  ],
  social_twitter: [
    { stage: 7, fields: ['output_text'], required: true },
    { stage: 2, fields: ['quotes', 'tips'] },
  ],
  social_linkedin: [
    { stage: 7, fields: ['output_text'], required: true },
    { stage: 2, fields: ['quotes', 'tips'] },
  ],
  social_facebook: [
    { stage: 7, fields: ['output_text'], required: true },
    { stage: 2, fields: ['quotes', 'tips'] },
  ],
  email: [
    { stage: 7, fields: ['output_text'], required: true },
    { stage: 0, fields: ['episode_name', 'seo_overview'] },
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
 * Note: Stage 8 has 4 platform-specific tasks, all mapping to stage_number 8.
 */
export const STAGE_TO_TASK = {
  0: 'content_brief',
  1: 'summary',
  2: 'quotes_and_tips',
  3: 'outline',
  4: 'paragraphs',
  5: 'headlines',
  6: 'draft',
  7: 'refine',
  // Stage 8 is split into 4 platform-specific tasks
  // Use 'social_instagram' as the primary mapping for backward compatibility
  8: 'social_instagram',
  9: 'email',
};

/**
 * Maps task keys to stage numbers (for DB storage).
 * Includes all 4 Stage 8 platform tasks.
 */
export const TASK_TO_STAGE = {
  content_brief: 0,
  summary: 1,
  quotes_and_tips: 2,
  outline: 3,
  paragraphs: 4,
  headlines: 5,
  draft: 6,
  refine: 7,
  // All 4 social platform tasks map to stage 8
  social_instagram: 8,
  social_twitter: 8,
  social_linkedin: 8,
  social_facebook: 8,
  email: 9,
};

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
