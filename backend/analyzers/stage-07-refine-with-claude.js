/**
 * ============================================================================
 * STAGE 7: REFINEMENT PASS WITH CLAUDE
 * ============================================================================
 * Polishes the blog post draft to improve flow, remove AI patterns,
 * and ensure voice consistency.
 *
 * Input: Stage 6 draft + voice guidelines
 * Output: Refined blog post in Markdown (text)
 * Model: Claude Sonnet 4 (Anthropic)
 * ============================================================================
 */

import { callClaudeEditor } from '../lib/api-client-anthropic.js';
import { loadStagePrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// VALIDATION
// ============================================================================

function validateOutput(content) {
  if (!content || content.trim().length < 500) {
    throw new ValidationError('content', 'Refined post is too short');
  }

  // Check markdown structure preserved
  if (!content.includes('#')) {
    throw new ValidationError('content', 'Refined post is missing headers');
  }

  // Check word count
  const wordCount = content.split(/\s+/).length;

  if (wordCount < 600) {
    throw new ValidationError('content', `Post too short after refinement: ${wordCount} words`);
  }

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

/**
 * Refines the blog post draft with Claude's editing capabilities
 *
 * @param {Object} context - Processing context
 * @param {string} context.episodeId - Episode UUID
 * @param {Object} context.evergreen - Evergreen settings (voice guidelines)
 * @param {Object} context.previousStages - Previous stage outputs (including stage 6)
 * @returns {Promise<Object>} Result with refined output_text
 */
export async function refineWithClaude(context) {
  const { episodeId, evergreen, previousStages } = context;

  logger.stageStart(7, 'Refinement Pass', episodeId);

  // Get the draft from stage 6
  const draft = previousStages[6]?.output_text;

  if (!draft) {
    throw new ValidationError('previousStages.6', 'Missing Stage 6 draft for refinement');
  }

  // Build editing instructions
  const instructions = `
Please refine this blog post with these specific goals:

1. **Language Polish**
   - Fix any awkward phrasing
   - Smooth transitions between paragraphs
   - Vary sentence length and structure

2. **Remove AI Patterns**
   - Eliminate phrases like "It's important to note", "In today's world", "Let's explore"
   - Remove anything that sounds formulaic or robotic

3. **Voice Consistency**
   - Maintain warm, conversational tone
   - Keep first-person perspective
   - Preserve the authentic voice described in guidelines

4. **Quality Checks**
   - Verify clinical accuracy
   - Ensure advice is appropriate
   - Confirm ~750 word target

Voice Guidelines:
${JSON.stringify(evergreen?.voice_guidelines || {}, null, 2)}

IMPORTANT: Only polish - do not add new content or remove key information.
`;

  // Use Claude's editor function
  const response = await callClaudeEditor(draft, instructions, {
    episodeId,
    stageNumber: 7,
  });

  const outputText = response.content.trim();

  validateOutput(outputText);

  logger.stageComplete(7, 'Refinement Pass', episodeId, response.durationMs, response.cost);

  return {
    output_data: null,
    output_text: outputText,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

export default refineWithClaude;
