/**
 * ============================================================================
 * STAGE 4: PARAGRAPH-LEVEL OUTLINES
 * ============================================================================
 * Creates detailed paragraph-level breakdowns for each section of the blog.
 *
 * Input: Stage 3 outline + Stage 2 quotes
 * Output: Detailed paragraph roadmap (JSON)
 * Model: GPT-5 mini (OpenAI)
 * ============================================================================
 */

import { callOpenAIWithFunctions } from '../lib/api-client-openai.js';
import { loadStagePrompt } from '../lib/prompt-loader.js';
import logger from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

// ============================================================================
// FUNCTION SCHEMA
// ============================================================================

const PARAGRAPH_OUTLINES_SCHEMA = {
  name: 'paragraph_outlines',
  description: 'Detailed paragraph-level breakdown of each blog section',
  parameters: {
    type: 'object',
    properties: {
      section_details: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            section_number: { type: 'number' },
            section_title: { type: 'string' },
            paragraphs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  para_number: { type: 'number' },
                  main_point: {
                    type: 'string',
                    description: 'Key message of this paragraph',
                  },
                  supporting_elements: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Quotes, examples, or concepts to include',
                  },
                  transition_note: {
                    type: ['string', 'null'],
                    description: 'How this connects to the next paragraph',
                  },
                },
                required: ['para_number', 'main_point', 'supporting_elements'],
              },
            },
          },
          required: ['section_number', 'section_title', 'paragraphs'],
        },
      },
    },
    required: ['section_details'],
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

function validateOutput(data) {
  if (!data.section_details || !Array.isArray(data.section_details)) {
    throw new ValidationError('section_details', 'Missing section details array');
  }

  const sections = data.section_details;

  if (sections.length < 3) {
    throw new ValidationError('section_details', 'Need at least 3 sections');
  }

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];

    if (!s.section_title) {
      throw new ValidationError(`section_details[${i}].section_title`, 'Missing title');
    }

    if (!s.paragraphs || s.paragraphs.length < 1) {
      throw new ValidationError(`section_details[${i}].paragraphs`, 'Need at least 1 paragraph');
    }

    for (let j = 0; j < s.paragraphs.length; j++) {
      const p = s.paragraphs[j];

      if (!p.main_point || p.main_point.length < 10) {
        throw new ValidationError(
          `section_details[${i}].paragraphs[${j}].main_point`,
          'Main point is too short'
        );
      }
    }
  }

  return true;
}

// ============================================================================
// MAIN ANALYZER FUNCTION
// ============================================================================

export async function outlineParagraphs(context) {
  const { episodeId, transcript, evergreen, previousStages } = context;

  logger.stageStart(4, 'Paragraph-Level Outlines', episodeId);

  const prompt = await loadStagePrompt('stage-04-paragraph-outlines', {
    transcript,
    evergreen,
    previousStages,
  });

  const response = await callOpenAIWithFunctions(
    prompt,
    [PARAGRAPH_OUTLINES_SCHEMA],
    {
      episodeId,
      stageNumber: 4,
      functionCall: 'paragraph_outlines',
      temperature: 0.6,
    }
  );

  const outputData = response.functionCall;

  if (!outputData) {
    throw new ValidationError('response', 'No function call output returned');
  }

  validateOutput(outputData);

  logger.stageComplete(4, 'Paragraph-Level Outlines', episodeId, response.durationMs, response.cost);

  return {
    output_data: outputData,
    output_text: null,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cost_usd: response.cost,
  };
}

export default outlineParagraphs;
