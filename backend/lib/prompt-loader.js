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
 *
 * When Stage 0 preprocessing has been done, Stages 1-2 will use the
 * compressed summary instead of the raw transcript to avoid token limits.
 *
 * @param {string} stageName - Stage template name
 * @param {Object} context - Processing context
 * @param {string} context.transcript - Episode transcript
 * @param {Object} context.evergreen - Evergreen content
 * @param {Object} [context.previousStages] - Previous stage outputs
 * @returns {Promise<string>} Processed prompt
 */
export async function loadStagePrompt(stageName, context) {
  const { transcript, evergreen, previousStages = {} } = context;

  // Check if Stage 0 preprocessing was done
  const stage0Output = previousStages[0];
  const wasPreprocessed = stage0Output?.preprocessed === true;

  // For Stage 1, use preprocessed summary if available (saves tokens)
  // Stage 2 (quotes) ALWAYS uses original transcript for verbatim accuracy
  let effectiveTranscript = transcript;
  if (wasPreprocessed && stage0Output?.comprehensive_summary) {
    // Use the compressed summary for Stage 1 analysis (preserves all key info)
    effectiveTranscript = `[PREPROCESSED TRANSCRIPT SUMMARY - Full transcript was analyzed by Claude Haiku]\n\n${stage0Output.comprehensive_summary}`;

    // Add topics if available
    if (stage0Output.key_topics && stage0Output.key_topics.length > 0) {
      effectiveTranscript += `\n\n[KEY TOPICS IDENTIFIED]: ${stage0Output.key_topics.join(', ')}`;
    }

    // Add speaker info if available
    if (stage0Output.speakers) {
      effectiveTranscript += '\n\n[SPEAKERS IDENTIFIED]:';
      if (stage0Output.speakers.host?.name) {
        effectiveTranscript += `\n- Host: ${stage0Output.speakers.host.name}`;
        if (stage0Output.speakers.host.role) {
          effectiveTranscript += ` (${stage0Output.speakers.host.role})`;
        }
      }
      if (stage0Output.speakers.guest?.name) {
        effectiveTranscript += `\n- Guest: ${stage0Output.speakers.guest.name}`;
        if (stage0Output.speakers.guest.credentials) {
          effectiveTranscript += `, ${stage0Output.speakers.guest.credentials}`;
        }
        if (stage0Output.speakers.guest.expertise) {
          effectiveTranscript += ` - Expertise: ${stage0Output.speakers.guest.expertise}`;
        }
      }
    }

    // Add episode metadata if available
    if (stage0Output.episode_metadata) {
      effectiveTranscript += '\n\n[EPISODE METADATA FROM PREPROCESSING]:';
      if (stage0Output.episode_metadata.inferred_title) {
        effectiveTranscript += `\n- Suggested Title: ${stage0Output.episode_metadata.inferred_title}`;
      }
      if (stage0Output.episode_metadata.core_message) {
        effectiveTranscript += `\n- Core Message: ${stage0Output.episode_metadata.core_message}`;
      }
      if (stage0Output.episode_metadata.estimated_duration) {
        effectiveTranscript += `\n- Estimated Duration: ${stage0Output.episode_metadata.estimated_duration}`;
      }
    }

    logger.debug('📝 Using preprocessed transcript for prompt', {
      stageName,
      originalLength: transcript?.length,
      preprocessedLength: effectiveTranscript.length,
      compressionRatio: transcript ? (transcript.length / effectiveTranscript.length).toFixed(1) : 'N/A',
    });
  }

  // Build variables from context
  const variables = {
    // Transcript (may be preprocessed summary for stages 1-2)
    TRANSCRIPT: effectiveTranscript,

    // Original transcript (always available if needed)
    ORIGINAL_TRANSCRIPT: transcript,

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

    // Stage 0 preprocessing outputs (available for all subsequent stages)
    // NOTE: Quotes are NOT from Stage 0 - they come from Stage 2 (dedicated quote extraction)
    STAGE_0_OUTPUT: JSON.stringify(previousStages[0] || {}, null, 2),
    PREPROCESSED_SUMMARY: stage0Output?.comprehensive_summary || '',
    PREPROCESSED_TOPICS: stage0Output?.key_topics?.join(', ') || '',
    WAS_PREPROCESSED: wasPreprocessed ? 'true' : 'false',

    // Previous stage outputs (1-9)
    STAGE_1_OUTPUT: JSON.stringify(previousStages[1] || {}, null, 2),
    STAGE_2_OUTPUT: JSON.stringify(previousStages[2] || {}, null, 2),

    // Stage 2 quotes in standardized format: { text, speaker, context, usage }
    // This is the CANONICAL source of quotes for all downstream stages
    STAGE_2_QUOTES: JSON.stringify(previousStages[2]?.quotes || [], null, 2),
    STAGE_3_OUTPUT: JSON.stringify(previousStages[3] || {}, null, 2),
    STAGE_4_OUTPUT: JSON.stringify(previousStages[4] || {}, null, 2),
    STAGE_5_OUTPUT: JSON.stringify(previousStages[5] || {}, null, 2),
    STAGE_6_OUTPUT: previousStages[6]?.output_text || '',
    STAGE_7_OUTPUT: previousStages[7]?.output_text || '',

    // Episode crux (from stage 1, or stage 0 if available)
    EPISODE_CRUX: previousStages[1]?.episode_crux || stage0Output?.episode_metadata?.core_message || '',
    EPISODE_TITLE: previousStages[1]?.episode_basics?.title || stage0Output?.episode_metadata?.inferred_title || 'Untitled Episode',
  };

  return loadPrompt(stageName, variables);
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
