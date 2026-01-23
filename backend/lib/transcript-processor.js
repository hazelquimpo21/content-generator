/**
 * ============================================================================
 * TRANSCRIPT PROCESSOR SERVICE
 * ============================================================================
 * Processes transcripts to add timestamps and estimate speaker changes
 * using Whisper's verbose_json segments WITHOUT requiring AssemblyAI.
 *
 * Features:
 * - Format Whisper segments with [HH:MM:SS] timestamps
 * - Estimate speaker turns based on pause detection and content analysis
 * - Use LLM for intelligent speaker change detection
 * - Support manual speaker labeling
 *
 * Usage:
 *   import { processTranscriptWithTimestamps, estimateSpeakers } from './transcript-processor.js';
 *   const result = await processTranscriptWithTimestamps(segments, { estimateSpeakers: true });
 * ============================================================================
 */

import OpenAI from 'openai';
import logger from './logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Minimum pause (in seconds) that might indicate a speaker change
const SPEAKER_CHANGE_PAUSE_THRESHOLD = 1.5;

// Cost for GPT-4o-mini speaker detection
const SPEAKER_DETECTION_COST_PER_1K_INPUT = 0.00015;
const SPEAKER_DETECTION_COST_PER_1K_OUTPUT = 0.0006;

// ============================================================================
// TIMESTAMP FORMATTING
// ============================================================================

/**
 * Formats seconds to [HH:MM:SS] timestamp string.
 *
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted timestamp like [00:05:32]
 */
export function formatTimestamp(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return '[00:00:00]';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  return `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
}

/**
 * Formats milliseconds to [HH:MM:SS] timestamp string.
 *
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted timestamp
 */
export function formatTimestampMs(ms) {
  return formatTimestamp(ms / 1000);
}

// ============================================================================
// SEGMENT PROCESSING
// ============================================================================

/**
 * Processes Whisper verbose_json segments into timestamped utterances.
 * Groups segments into logical utterances based on pauses.
 *
 * @param {Array} segments - Whisper verbose_json segments
 * @param {Object} options - Processing options
 * @param {number} options.pauseThreshold - Seconds of pause to split utterances (default: 1.0)
 * @returns {Array} Processed utterances with timestamps
 */
export function processSegmentsToUtterances(segments, options = {}) {
  const { pauseThreshold = 1.0 } = options;

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return [];
  }

  const utterances = [];
  let currentUtterance = null;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const text = segment.text?.trim();

    if (!text) continue;

    // Start time in seconds (Whisper provides seconds)
    const startTime = segment.start || 0;
    const endTime = segment.end || startTime;

    if (!currentUtterance) {
      // Start a new utterance
      currentUtterance = {
        start: startTime,
        end: endTime,
        startMs: Math.round(startTime * 1000),
        endMs: Math.round(endTime * 1000),
        text: text,
        segments: [segment],
      };
    } else {
      // Check if there's a significant pause
      const pauseDuration = startTime - currentUtterance.end;

      if (pauseDuration >= pauseThreshold) {
        // Save current utterance and start a new one
        utterances.push(currentUtterance);
        currentUtterance = {
          start: startTime,
          end: endTime,
          startMs: Math.round(startTime * 1000),
          endMs: Math.round(endTime * 1000),
          text: text,
          segments: [segment],
        };
      } else {
        // Continue current utterance
        currentUtterance.end = endTime;
        currentUtterance.endMs = Math.round(endTime * 1000);
        currentUtterance.text += ' ' + text;
        currentUtterance.segments.push(segment);
      }
    }
  }

  // Don't forget the last utterance
  if (currentUtterance) {
    utterances.push(currentUtterance);
  }

  return utterances;
}

// ============================================================================
// SPEAKER ESTIMATION (HEURISTIC-BASED)
// ============================================================================

/**
 * Estimates speaker changes using heuristic analysis.
 * Uses pause detection, dialogue patterns, and content analysis.
 *
 * @param {Array} utterances - Array of utterance objects
 * @returns {Array} Utterances with estimated speaker IDs
 */
export function estimateSpeakersHeuristic(utterances) {
  if (!utterances || utterances.length === 0) {
    return [];
  }

  // Patterns that might indicate speaker changes or questions
  const questionPatterns = [
    /^(so|now|well|okay|alright|right|and|but)\s*[,.]?\s*(what|how|why|when|where|who|can|could|would|do|does|did|is|are|have|has)/i,
    /\?\s*$/,
    /^(tell me|explain|describe|share|what's|how's|who's|when's|where's|why's)/i,
  ];

  const responsePatterns = [
    /^(yes|no|yeah|yep|nope|absolutely|definitely|certainly|sure|exactly|right|correct|well|so|i think|i believe|in my|from my)/i,
    /^(that's|it's|there's|we've|i've|they've)/i,
  ];

  let currentSpeaker = 'A';
  const speakers = new Set(['A']);
  let lastUtteranceEnd = 0;

  return utterances.map((utterance, index) => {
    const text = utterance.text.trim();
    const pauseFromLast = utterance.start - lastUtteranceEnd;

    // Determine if we should switch speakers
    let shouldSwitch = false;

    // 1. Long pause suggests speaker change
    if (pauseFromLast >= SPEAKER_CHANGE_PAUSE_THRESHOLD && index > 0) {
      shouldSwitch = true;
    }

    // 2. Question followed by response pattern
    if (index > 0) {
      const prevText = utterances[index - 1].text.trim();
      const isAfterQuestion = questionPatterns.some(p => p.test(prevText));
      const isResponse = responsePatterns.some(p => p.test(text));

      if (isAfterQuestion && isResponse) {
        shouldSwitch = true;
      }
    }

    // 3. Explicit dialogue markers
    if (/^(interviewer|host|guest|speaker\s*[a-z]?):/i.test(text)) {
      shouldSwitch = true;
    }

    // Switch speaker if needed
    if (shouldSwitch && index > 0) {
      currentSpeaker = currentSpeaker === 'A' ? 'B' : 'A';
      speakers.add(currentSpeaker);
    }

    lastUtteranceEnd = utterance.end;

    return {
      ...utterance,
      speaker: currentSpeaker,
      speakerLabel: `Speaker ${currentSpeaker}`,
    };
  });
}

// ============================================================================
// SPEAKER ESTIMATION (LLM-BASED)
// ============================================================================

/**
 * Uses GPT-4o-mini to intelligently detect speaker changes.
 * More accurate than heuristics but costs ~$0.001-0.005 per transcript.
 *
 * @param {Array} utterances - Array of utterance objects
 * @param {Object} options - Options
 * @param {number} options.expectedSpeakers - Expected number of speakers (default: 2)
 * @returns {Promise<Object>} Utterances with speaker assignments and metadata
 */
export async function estimateSpeakersWithLLM(utterances, options = {}) {
  const { expectedSpeakers = 2 } = options;

  if (!utterances || utterances.length === 0) {
    return { utterances: [], speakers: [], cost: 0 };
  }

  logger.info('Estimating speakers with LLM', {
    utteranceCount: utterances.length,
    expectedSpeakers,
  });

  // Prepare transcript segments for LLM analysis
  // Include timestamps and text for context
  const transcriptForAnalysis = utterances
    .map((u, i) => `[${i}] ${formatTimestamp(u.start)} ${u.text}`)
    .join('\n');

  // Limit to ~50 utterances per batch for cost efficiency
  const MAX_UTTERANCES_PER_BATCH = 50;
  const batches = [];

  for (let i = 0; i < utterances.length; i += MAX_UTTERANCES_PER_BATCH) {
    batches.push(utterances.slice(i, i + MAX_UTTERANCES_PER_BATCH));
  }

  const allAssignments = [];
  let totalCost = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchStart = batchIndex * MAX_UTTERANCES_PER_BATCH;

    const batchText = batch
      .map((u, i) => `[${batchStart + i}] ${formatTimestamp(u.start)} ${u.text}`)
      .join('\n');

    const prompt = `You are analyzing a transcript to identify different speakers. The transcript has approximately ${expectedSpeakers} speakers (could be a podcast, interview, or conversation).

Analyze each numbered segment and assign a speaker letter (A, B, C, etc.) based on:
1. Context and content of what's being said
2. Speaking patterns and style
3. Questions vs answers pattern (interviewer vs interviewee)
4. Topic expertise indicators
5. Natural conversation turn-taking

Here is the transcript:
${batchText}

Respond with ONLY a JSON array of speaker assignments in this exact format:
[{"index": 0, "speaker": "A"}, {"index": 1, "speaker": "B"}, ...]

Important:
- Use letters A, B, C, etc. for speakers
- Be consistent - same speaker should always get the same letter
- Consider conversation flow and context
- Output ONLY the JSON array, no other text`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing transcripts and identifying different speakers. Respond only with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      });

      const content = response.choices[0].message.content.trim();

      // Parse the JSON response
      let assignments;
      try {
        // Handle potential markdown code blocks
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          assignments = JSON.parse(jsonMatch[0]);
        } else {
          assignments = JSON.parse(content);
        }
      } catch (parseError) {
        logger.warn('Failed to parse LLM speaker response, using heuristics', {
          error: parseError.message,
          content: content.substring(0, 200),
        });
        // Fall back to heuristics for this batch
        const heuristicBatch = estimateSpeakersHeuristic(batch);
        assignments = heuristicBatch.map((u, i) => ({
          index: batchStart + i,
          speaker: u.speaker,
        }));
      }

      allAssignments.push(...assignments);

      // Calculate cost
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      const batchCost = (inputTokens / 1000) * SPEAKER_DETECTION_COST_PER_1K_INPUT +
                        (outputTokens / 1000) * SPEAKER_DETECTION_COST_PER_1K_OUTPUT;
      totalCost += batchCost;

    } catch (error) {
      logger.error('LLM speaker estimation failed for batch', {
        batchIndex,
        error: error.message,
      });
      // Fall back to heuristics for this batch
      const heuristicBatch = estimateSpeakersHeuristic(batch);
      allAssignments.push(...heuristicBatch.map((u, i) => ({
        index: batchStart + i,
        speaker: u.speaker,
      })));
    }
  }

  // Apply assignments to utterances
  const speakerSet = new Set();
  const processedUtterances = utterances.map((utterance, index) => {
    const assignment = allAssignments.find(a => a.index === index);
    const speaker = assignment?.speaker || 'A';
    speakerSet.add(speaker);

    return {
      ...utterance,
      speaker,
      speakerLabel: `Speaker ${speaker}`,
    };
  });

  // Build speakers array
  const speakers = Array.from(speakerSet)
    .sort()
    .map(id => ({ id, label: `Speaker ${id}` }));

  logger.info('LLM speaker estimation complete', {
    speakersDetected: speakers.length,
    totalCost: totalCost.toFixed(4),
  });

  return {
    utterances: processedUtterances,
    speakers,
    cost: totalCost,
  };
}

// ============================================================================
// TRANSCRIPT FORMATTING
// ============================================================================

/**
 * Formats utterances into a readable transcript with timestamps and speakers.
 *
 * @param {Array} utterances - Array of utterance objects with speaker assignments
 * @param {Object} options - Formatting options
 * @param {boolean} options.includeSpeakers - Include speaker labels (default: true)
 * @param {boolean} options.includeTimestamps - Include timestamps (default: true)
 * @returns {string} Formatted transcript
 */
export function formatTranscript(utterances, options = {}) {
  const { includeSpeakers = true, includeTimestamps = true } = options;

  if (!utterances || utterances.length === 0) {
    return '';
  }

  return utterances.map(u => {
    let line = '';

    if (includeTimestamps) {
      line += formatTimestamp(u.start) + ' ';
    }

    if (includeSpeakers && u.speakerLabel) {
      line += `${u.speakerLabel}: `;
    }

    line += u.text;

    return line;
  }).join('\n\n');
}

/**
 * Formats utterances into plain text without timestamps or speakers.
 *
 * @param {Array} utterances - Array of utterance objects
 * @returns {string} Plain transcript text
 */
export function formatPlainTranscript(utterances) {
  return formatTranscript(utterances, {
    includeSpeakers: false,
    includeTimestamps: false,
  });
}

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

/**
 * Processes Whisper segments into a complete transcript with timestamps and speakers.
 * This is the main entry point for transcript processing.
 *
 * @param {Array} segments - Whisper verbose_json segments
 * @param {Object} options - Processing options
 * @param {boolean} options.estimateSpeakers - Whether to estimate speakers (default: false)
 * @param {boolean} options.useLLM - Use LLM for speaker estimation (default: true if estimateSpeakers)
 * @param {number} options.expectedSpeakers - Expected number of speakers (default: 2)
 * @param {number} options.pauseThreshold - Pause threshold in seconds (default: 1.0)
 * @returns {Promise<Object>} Processed transcript result
 */
export async function processTranscriptWithTimestamps(segments, options = {}) {
  const {
    estimateSpeakers: doEstimateSpeakers = false,
    useLLM = true,
    expectedSpeakers = 2,
    pauseThreshold = 1.0,
  } = options;

  logger.info('Processing transcript with timestamps', {
    segmentCount: segments?.length || 0,
    estimateSpeakers: doEstimateSpeakers,
    useLLM,
    expectedSpeakers,
  });

  // Step 1: Process segments into utterances
  let utterances = processSegmentsToUtterances(segments, { pauseThreshold });

  // Step 2: Estimate speakers if requested
  let speakers = [];
  let speakerEstimationCost = 0;

  if (doEstimateSpeakers && utterances.length > 0) {
    if (useLLM) {
      const llmResult = await estimateSpeakersWithLLM(utterances, { expectedSpeakers });
      utterances = llmResult.utterances;
      speakers = llmResult.speakers;
      speakerEstimationCost = llmResult.cost;
    } else {
      utterances = estimateSpeakersHeuristic(utterances);
      // Build speakers from heuristic results
      const speakerSet = new Set(utterances.map(u => u.speaker));
      speakers = Array.from(speakerSet).sort().map(id => ({ id, label: `Speaker ${id}` }));
    }
  }

  // Step 3: Format transcripts
  const formattedTranscript = formatTranscript(utterances, {
    includeSpeakers: doEstimateSpeakers,
    includeTimestamps: true,
  });

  const plainTranscript = formatPlainTranscript(utterances);

  // Step 4: Calculate duration from segments
  const audioDurationSeconds = segments?.length > 0
    ? segments[segments.length - 1].end || 0
    : 0;

  logger.info('Transcript processing complete', {
    utteranceCount: utterances.length,
    speakerCount: speakers.length,
    formattedLength: formattedTranscript.length,
    estimationCost: speakerEstimationCost.toFixed(4),
  });

  return {
    // Plain transcript for pipeline compatibility
    transcript: plainTranscript,

    // Formatted transcript with timestamps and speakers
    formattedTranscript,

    // Detailed utterances for UI
    utterances,

    // Speaker metadata
    speakers,
    hasSpeakerLabels: doEstimateSpeakers && speakers.length > 0,

    // Audio duration
    audioDurationSeconds,
    audioDurationMinutes: Math.round((audioDurationSeconds / 60) * 100) / 100,

    // Cost tracking
    speakerEstimationCost,
    formattedEstimationCost: `$${speakerEstimationCost.toFixed(4)}`,

    // Processing metadata
    provider: 'whisper-enhanced',
    usedLLM: doEstimateSpeakers && useLLM,
  };
}

// ============================================================================
// SPEAKER LABEL APPLICATION
// ============================================================================

/**
 * Applies custom speaker labels to processed utterances.
 * Similar to AssemblyAI's applySpeakerLabels but for our processed data.
 *
 * @param {Object} transcriptData - Processed transcript data
 * @param {Object} speakerLabels - Map of speaker IDs to labels { "A": "Host Name", "B": "Guest" }
 * @returns {Object} Updated transcript data with new labels
 */
export function applyCustomSpeakerLabels(transcriptData, speakerLabels) {
  const { utterances, speakers } = transcriptData;

  if (!utterances || !speakerLabels) {
    return transcriptData;
  }

  // Update utterances with new labels
  const updatedUtterances = utterances.map(u => ({
    ...u,
    speakerLabel: speakerLabels[u.speaker] || u.speakerLabel,
  }));

  // Update speakers array
  const updatedSpeakers = speakers.map(s => ({
    ...s,
    label: speakerLabels[s.id] || s.label,
  }));

  // Regenerate formatted transcript
  const formattedTranscript = formatTranscript(updatedUtterances, {
    includeSpeakers: true,
    includeTimestamps: true,
  });

  return {
    ...transcriptData,
    utterances: updatedUtterances,
    speakers: updatedSpeakers,
    formattedTranscript,
    speakerLabels,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  formatTimestamp,
  formatTimestampMs,
  processSegmentsToUtterances,
  estimateSpeakersHeuristic,
  estimateSpeakersWithLLM,
  formatTranscript,
  formatPlainTranscript,
  processTranscriptWithTimestamps,
  applyCustomSpeakerLabels,
};
