/**
 * ============================================================================
 * PROMPT LOADER MODULE
 * ============================================================================
 * Loads and processes AI prompt templates from markdown files.
 * Handles variable substitution and caching for performance.
 *
 * Features:
 * - Loads prompt templates from /prompts directory
 * - Variable substitution with {{VARIABLE}} syntax
 * - In-memory caching of templates
 * - Shared components (never-use list, quality frameworks)
 *
 * Usage:
 *   import { loadPrompt } from './lib/prompt-loader.js';
 *   const prompt = await loadPrompt('stage-01', {
 *     TRANSCRIPT: 'podcast transcript...',
 *     PODCAST_NAME: 'The Mindful Therapist'
 *   });
 * ============================================================================
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { prepareTranscript, calculateTranscriptBudget, estimateTranscriptTokens } from './transcript-handler.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Get directory path for this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Prompts directory path
const PROMPTS_DIR = join(__dirname, '..', 'prompts');

// Cache for loaded templates
const templateCache = new Map();

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clears the template cache
 * Useful for development when templates change
 */
export function clearCache() {
  templateCache.clear();
  logger.debug('Prompt template cache cleared');
}

/**
 * Gets cache statistics
 * @returns {Object} Cache info
 */
export function getCacheStats() {
  return {
    size: templateCache.size,
    keys: Array.from(templateCache.keys()),
  };
}

// ============================================================================
// FILE LOADING
// ============================================================================

/**
 * Reads a template file and caches it
 * @param {string} filename - Template filename (without extension)
 * @param {string} [subdir] - Subdirectory (e.g., 'shared')
 * @returns {Promise<string>} Template content
 */
async function readTemplate(filename, subdir = '') {
  const cacheKey = subdir ? `${subdir}/${filename}` : filename;

  // Check cache first
  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey);
  }

  // Build file path
  const filePath = subdir
    ? join(PROMPTS_DIR, subdir, `${filename}.md`)
    : join(PROMPTS_DIR, `${filename}.md`);

  try {
    const content = await readFile(filePath, 'utf-8');
    templateCache.set(cacheKey, content);
    logger.debug('Loaded prompt template', { filename, subdir });
    return content;
  } catch (error) {
    logger.error('Failed to load prompt template', {
      filename,
      subdir,
      error: error.message,
    });
    throw new Error(`Prompt template not found: ${cacheKey}`);
  }
}

// ============================================================================
// VARIABLE SUBSTITUTION
// ============================================================================

/**
 * Substitutes variables in a template string
 * Variables are in {{VARIABLE_NAME}} format
 *
 * @param {string} template - Template with variables
 * @param {Object} variables - Key-value pairs for substitution
 * @returns {string} Processed template
 */
function substituteVariables(template, variables) {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    // Handle different value types
    let stringValue;
    if (value === null || value === undefined) {
      stringValue = '';
    } else if (typeof value === 'object') {
      stringValue = JSON.stringify(value, null, 2);
    } else {
      stringValue = String(value);
    }

    // Replace all occurrences of {{KEY}}
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, stringValue);
  }

  return result;
}

/**
 * Checks for any remaining unsubstituted variables
 * @param {string} content - Processed template
 * @returns {string[]} List of unsubstituted variable names
 */
function findUnsubstitutedVariables(content) {
  const pattern = /\{\{([A-Z_]+)\}\}/g;
  const matches = [];
  let match;

  while ((match = pattern.exec(content)) !== null) {
    matches.push(match[1]);
  }

  return [...new Set(matches)]; // Remove duplicates
}

// ============================================================================
// SHARED CONTENT
// ============================================================================

/**
 * Loads the universal "never use" list
 * @returns {Promise<string>} Never use list content
 */
export async function loadNeverUseList() {
  return readTemplate('never-use-list', 'shared');
}

/**
 * Loads the quality frameworks
 * @returns {Promise<string>} Quality frameworks content
 */
export async function loadQualityFrameworks() {
  return readTemplate('quality-frameworks', 'shared');
}

// ============================================================================
// MAIN PROMPT LOADING
// ============================================================================

/**
 * Loads and processes a stage prompt template
 *
 * @param {string} stageName - Stage template name (e.g., 'stage-01')
 * @param {Object} [variables={}] - Variables for substitution
 * @param {Object} [options={}] - Loading options
 * @param {boolean} [options.includeNeverUse=true] - Include never-use list
 * @param {boolean} [options.includeQualityFrameworks=false] - Include quality frameworks
 * @returns {Promise<string>} Processed prompt
 *
 * @example
 * const prompt = await loadPrompt('stage-01-transcript-analysis', {
 *   PODCAST_NAME: 'The Mindful Therapist',
 *   THERAPIST_NAME: 'Dr. Emily Carter',
 *   TRANSCRIPT: transcriptText,
 * });
 */
export async function loadPrompt(stageName, variables = {}, options = {}) {
  const {
    includeNeverUse = true,
    includeQualityFrameworks = false,
  } = options;

  // Load main template
  let template = await readTemplate(stageName);

  // Optionally include shared content
  if (includeNeverUse) {
    try {
      const neverUse = await loadNeverUseList();
      template = template.replace('{{NEVER_USE_LIST}}', neverUse);
      // If no placeholder, prepend to template
      if (!template.includes(neverUse)) {
        template = `${neverUse}\n\n${template}`;
      }
    } catch {
      // Never-use list is optional
      template = template.replace('{{NEVER_USE_LIST}}', '');
    }
  }

  if (includeQualityFrameworks) {
    try {
      const frameworks = await loadQualityFrameworks();
      template = template.replace('{{QUALITY_FRAMEWORKS}}', frameworks);
    } catch {
      template = template.replace('{{QUALITY_FRAMEWORKS}}', '');
    }
  }

  // Substitute variables
  const processed = substituteVariables(template, variables);

  // Warn about unsubstituted variables (but don't fail)
  const remaining = findUnsubstitutedVariables(processed);
  if (remaining.length > 0) {
    logger.warn('Unsubstituted variables in prompt', {
      stageName,
      variables: remaining,
    });
  }

  return processed;
}

/**
 * Loads a prompt with all stage context
 * Convenience method that gathers context from evergreen content
 * Now includes smart transcript truncation to handle long podcasts
 *
 * @param {string} stageName - Stage template name
 * @param {Object} context - Processing context
 * @param {string} context.transcript - Episode transcript
 * @param {Object} context.evergreen - Evergreen content
 * @param {Object} [context.previousStages] - Previous stage outputs
 * @param {string} [context.episodeId] - Episode ID for logging
 * @returns {Promise<Object>} Object with processed prompt and metadata
 */
export async function loadStagePrompt(stageName, context) {
  const { transcript, evergreen, previousStages = {}, episodeId = null } = context;

  // Extract stage number from stage name (e.g., 'stage-01-transcript-analysis' -> 1)
  const stageMatch = stageName.match(/stage-(\d+)/);
  const stageNumber = stageMatch ? parseInt(stageMatch[1], 10) : 1;

  // Determine the model being used for this stage
  const model = stageNumber <= 6 ? 'gpt-5-mini' : 'claude-sonnet-4';

  // Calculate available token budget for transcript
  const transcriptBudget = calculateTranscriptBudget(stageNumber, model, previousStages);

  // Prepare transcript with smart truncation if needed
  const preparedTranscript = prepareTranscript(transcript, {
    maxTokens: transcriptBudget,
    model,
    stageNumber,
    episodeId,
  });

  // Log if transcript was truncated (important for debugging)
  if (preparedTranscript.wasTruncated) {
    logger.warn('Transcript was truncated to fit context limit', {
      stageName,
      stageNumber,
      episodeId,
      originalTokens: preparedTranscript.originalTokens,
      truncatedTokens: preparedTranscript.truncatedTokens,
      removedPercent: preparedTranscript.truncationDetails?.removedPercent,
      model,
      transcriptBudget,
    });
  }

  // Build variables from context
  const variables = {
    // Transcript (now potentially truncated)
    TRANSCRIPT: preparedTranscript.text,

    // Therapist info
    THERAPIST_NAME: evergreen?.therapist_profile?.name || 'the therapist',
    CREDENTIALS: evergreen?.therapist_profile?.credentials || '',
    BIO: evergreen?.therapist_profile?.bio || '',
    WEBSITE: evergreen?.therapist_profile?.website || '',

    // Podcast info
    PODCAST_NAME: evergreen?.podcast_info?.name || 'the podcast',
    TAGLINE: evergreen?.podcast_info?.tagline || '',
    TARGET_AUDIENCE: evergreen?.podcast_info?.target_audience || '',
    CONTENT_PILLARS: evergreen?.podcast_info?.content_pillars?.join(', ') || '',

    // Voice guidelines
    VOICE_GUIDELINES: JSON.stringify(evergreen?.voice_guidelines || {}, null, 2),
    TONE: evergreen?.voice_guidelines?.tone?.join(', ') || '',

    // Previous stage outputs
    STAGE_1_OUTPUT: JSON.stringify(previousStages[1] || {}, null, 2),
    STAGE_2_OUTPUT: JSON.stringify(previousStages[2] || {}, null, 2),
    STAGE_3_OUTPUT: JSON.stringify(previousStages[3] || {}, null, 2),
    STAGE_4_OUTPUT: JSON.stringify(previousStages[4] || {}, null, 2),
    STAGE_5_OUTPUT: JSON.stringify(previousStages[5] || {}, null, 2),
    STAGE_6_OUTPUT: previousStages[6]?.output_text || '',
    STAGE_7_OUTPUT: previousStages[7]?.output_text || '',

    // Episode crux (from stage 1)
    EPISODE_CRUX: previousStages[1]?.episode_crux || '',
    EPISODE_TITLE: previousStages[1]?.episode_basics?.title || 'Untitled Episode',

    // Add transcript metadata for prompts that may want to reference it
    TRANSCRIPT_TRUNCATED: preparedTranscript.wasTruncated ? 'true' : 'false',
    TRANSCRIPT_ORIGINAL_TOKENS: String(preparedTranscript.originalTokens),
  };

  const promptText = await loadPrompt(stageName, variables);

  // Log final prompt token estimate
  const promptTokens = estimateTranscriptTokens(promptText);
  logger.debug('Prompt prepared', {
    stageName,
    stageNumber,
    promptTokens,
    transcriptTokens: preparedTranscript.truncatedTokens,
    wasTruncated: preparedTranscript.wasTruncated,
  });

  return promptText;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadPrompt,
  loadStagePrompt,
  loadNeverUseList,
  loadQualityFrameworks,
  clearCache,
  getCacheStats,
};
