/**
 * ============================================================================
 * SPEAKER TRANSCRIPTION SERVICE (AssemblyAI)
 * ============================================================================
 * Provides audio-to-text transcription with speaker diarization using AssemblyAI.
 * Identifies unique speakers and provides timestamps throughout the transcript.
 *
 * Features:
 * - Speaker diarization (identifies who said what)
 * - Per-utterance timestamps
 * - Speaker labeling support (rename Speaker A to "Dr. Smith")
 * - Automatic language detection
 * - Cost calculation and usage tracking
 *
 * AssemblyAI API Details:
 * - Base pricing: $0.00025/second ($0.015/minute)
 * - Speaker diarization: included in base price
 * - Max file size: 5 GB (via URL), 200 MB (direct upload)
 * - Supported formats: Most audio/video formats
 *
 * Usage:
 *   import { transcribeWithSpeakers } from './lib/speaker-transcription.js';
 *   const result = await transcribeWithSpeakers(audioBuffer, { filename: 'podcast.mp3' });
 *   console.log(result.utterances); // Array of speaker-labeled segments
 * ============================================================================
 */

import logger from './logger.js';
import { APIError, ValidationError, TimeoutError } from './errors.js';
import { retryWithBackoff, createAPIRetryConfig } from './retry-logic.js';
import { apiLogRepo } from './supabase-client.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

if (!ASSEMBLYAI_API_KEY) {
  logger.warn('ASSEMBLYAI_API_KEY not set - Speaker diarization will not be available');
}

// AssemblyAI API endpoints
const ASSEMBLYAI_BASE_URL = 'https://api.assemblyai.com/v2';
const UPLOAD_ENDPOINT = `${ASSEMBLYAI_BASE_URL}/upload`;
const TRANSCRIPT_ENDPOINT = `${ASSEMBLYAI_BASE_URL}/transcript`;

// Pricing per second (as of January 2025)
// Source: https://www.assemblyai.com/pricing
const ASSEMBLYAI_PRICE_PER_SECOND = 0.00025; // $0.015/minute = $0.00025/second

// Maximum file size for direct upload (200 MB)
const MAX_UPLOAD_SIZE_BYTES = 200 * 1024 * 1024;

// Polling interval for transcript status (in milliseconds)
const POLLING_INTERVAL_MS = 3000;

// Maximum time to wait for transcription (10 minutes)
const MAX_TRANSCRIPTION_WAIT_MS = 10 * 60 * 1000;

// Supported audio formats (AssemblyAI is very flexible)
const SUPPORTED_FORMATS = [
  'mp3', 'mp4', 'm4a', 'wav', 'webm', 'flac', 'ogg', 'mpeg', 'mpga',
  'aac', 'wma', 'aiff', 'opus', 'amr',
];

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates the audio file before uploading to AssemblyAI.
 *
 * @param {Buffer|Blob} audioData - The audio file data
 * @param {Object} options - Validation options
 * @param {string} options.filename - Original filename
 * @throws {ValidationError} If validation fails
 */
function validateAudioFile(audioData, options = {}) {
  const { filename } = options;

  logger.debug('Validating audio file for speaker transcription', {
    hasFilename: !!filename,
    dataSize: audioData?.length || audioData?.size || 0,
  });

  if (!audioData) {
    logger.error('Speaker transcription validation failed: No data provided', { filename });
    throw new ValidationError('audioData', 'Audio file data is required');
  }

  const fileSize = audioData.length || audioData.size;

  if (fileSize > MAX_UPLOAD_SIZE_BYTES) {
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    logger.error('Speaker transcription validation failed: File too large', {
      filename,
      fileSizeMB,
      maxSizeMB: MAX_UPLOAD_SIZE_BYTES / (1024 * 1024),
    });
    throw new ValidationError(
      'audioData',
      `Audio file size (${fileSizeMB} MB) exceeds maximum of ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)} MB for speaker diarization`
    );
  }

  if (fileSize < 1000) {
    logger.error('Speaker transcription validation failed: File too small', { filename, fileSize });
    throw new ValidationError('audioData', 'Audio file appears to be empty or corrupted (less than 1KB)');
  }

  // Extract and validate extension
  let extension = null;
  if (filename) {
    const parts = filename.toLowerCase().split('.');
    if (parts.length > 1) {
      extension = parts[parts.length - 1];
    }
  }

  if (extension && !SUPPORTED_FORMATS.includes(extension)) {
    logger.error('Speaker transcription validation failed: Unsupported format', {
      filename,
      extension,
      supportedFormats: SUPPORTED_FORMATS,
    });
    throw new ValidationError(
      'audioData',
      `Unsupported audio format: .${extension}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`
    );
  }

  logger.debug('Audio file validation passed for speaker transcription', {
    filename,
    extension,
    fileSizeKB: Math.round(fileSize / 1024),
  });

  return { extension, fileSize };
}

// ============================================================================
// ASSEMBLYAI API HELPERS
// ============================================================================

/**
 * Makes an authenticated request to AssemblyAI API.
 *
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
async function assemblyAIFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': ASSEMBLYAI_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return response;
}

/**
 * Uploads audio file to AssemblyAI and returns the upload URL.
 *
 * @param {Buffer} audioData - Audio file buffer
 * @param {string} filename - Original filename for logging
 * @returns {Promise<string>} Upload URL to use for transcription
 */
async function uploadAudioToAssemblyAI(audioData, filename) {
  const startTime = Date.now();

  logger.info('Uploading audio to AssemblyAI', {
    filename,
    fileSizeMB: (audioData.length / (1024 * 1024)).toFixed(2),
  });

  const retryConfig = createAPIRetryConfig('AssemblyAI Upload');

  const response = await retryWithBackoff(async () => {
    const res = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/octet-stream',
        'Transfer-Encoding': 'chunked',
      },
      body: audioData,
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'Unable to read error body');
      logger.error('AssemblyAI upload failed', {
        status: res.status,
        statusText: res.statusText,
        errorBody,
        filename,
      });
      throw new APIError('assemblyai', res.status, `Upload failed: ${res.statusText}`, { errorBody });
    }

    return res.json();
  }, retryConfig);

  const uploadDurationMs = Date.now() - startTime;

  logger.info('Audio uploaded to AssemblyAI successfully', {
    filename,
    uploadDurationMs,
    uploadUrl: response.upload_url ? 'received' : 'missing',
  });

  if (!response.upload_url) {
    logger.error('AssemblyAI upload response missing upload_url', {
      filename,
      response: JSON.stringify(response).substring(0, 500),
    });
    throw new APIError('assemblyai', 500, 'Upload response missing upload_url');
  }

  return response.upload_url;
}

/**
 * Starts transcription job with speaker diarization enabled.
 *
 * @param {string} audioUrl - URL of the uploaded audio
 * @param {Object} options - Transcription options
 * @returns {Promise<string>} Transcript ID for polling
 */
async function startTranscription(audioUrl, options = {}) {
  const {
    language = null, // null = auto-detect
    speakersExpected = null, // null = auto-detect number of speakers
  } = options;

  logger.info('Starting AssemblyAI transcription with speaker diarization', {
    hasLanguage: !!language,
    speakersExpected,
  });

  const requestBody = {
    audio_url: audioUrl,
    speaker_labels: true, // Enable speaker diarization
  };

  // Add language settings
  if (language) {
    // Use specific language code
    requestBody.language_code = language;
  } else {
    // Enable automatic language detection (required for universal model)
    requestBody.language_detection = true;
  }

  if (speakersExpected && speakersExpected > 0) {
    requestBody.speakers_expected = speakersExpected;
  }

  const retryConfig = createAPIRetryConfig('AssemblyAI Transcription Start');

  const response = await retryWithBackoff(async () => {
    const res = await assemblyAIFetch(TRANSCRIPT_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'Unable to read error body');
      logger.error('AssemblyAI transcription start failed', {
        status: res.status,
        statusText: res.statusText,
        errorBody,
      });
      throw new APIError('assemblyai', res.status, `Transcription start failed: ${res.statusText}`, { errorBody });
    }

    return res.json();
  }, retryConfig);

  if (!response.id) {
    logger.error('AssemblyAI transcription response missing ID', {
      response: JSON.stringify(response).substring(0, 500),
    });
    throw new APIError('assemblyai', 500, 'Transcription response missing ID');
  }

  logger.info('AssemblyAI transcription job started', {
    transcriptId: response.id,
    status: response.status,
  });

  return response.id;
}

/**
 * Polls for transcription completion.
 *
 * @param {string} transcriptId - Transcript ID to poll
 * @returns {Promise<Object>} Completed transcript data
 */
async function pollForTranscription(transcriptId) {
  const startTime = Date.now();
  const pollingUrl = `${TRANSCRIPT_ENDPOINT}/${transcriptId}`;

  logger.info('Polling for AssemblyAI transcription completion', { transcriptId });

  while (true) {
    // Check timeout
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > MAX_TRANSCRIPTION_WAIT_MS) {
      logger.error('AssemblyAI transcription timed out', {
        transcriptId,
        elapsedMs,
        maxWaitMs: MAX_TRANSCRIPTION_WAIT_MS,
      });
      throw new TimeoutError('AssemblyAI transcription', MAX_TRANSCRIPTION_WAIT_MS);
    }

    const response = await assemblyAIFetch(pollingUrl);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unable to read error body');
      logger.error('AssemblyAI polling request failed', {
        transcriptId,
        status: response.status,
        errorBody,
      });
      throw new APIError('assemblyai', response.status, `Polling failed: ${response.statusText}`, { errorBody });
    }

    const data = await response.json();

    logger.debug('AssemblyAI transcription status', {
      transcriptId,
      status: data.status,
      elapsedMs,
    });

    if (data.status === 'completed') {
      logger.info('AssemblyAI transcription completed', {
        transcriptId,
        elapsedMs,
        audioDurationSeconds: data.audio_duration,
        speakersDetected: data.utterances ? new Set(data.utterances.map(u => u.speaker)).size : 0,
      });
      return data;
    }

    if (data.status === 'error') {
      logger.error('AssemblyAI transcription failed', {
        transcriptId,
        error: data.error,
        elapsedMs,
      });
      throw new APIError('assemblyai', 500, `Transcription failed: ${data.error}`, { transcriptId });
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
  }
}

// ============================================================================
// MAIN TRANSCRIPTION FUNCTION
// ============================================================================

/**
 * Transcribes audio with speaker diarization using AssemblyAI.
 *
 * @param {Buffer|Blob} audioData - The audio file data
 * @param {Object} [options] - Transcription options
 * @param {string} options.filename - Original filename (required)
 * @param {string} [options.language] - Language code (e.g., 'en'). Auto-detected if omitted
 * @param {number} [options.speakersExpected] - Expected number of speakers. Auto-detected if omitted
 * @param {string} [options.episodeId] - Episode ID for logging
 * @returns {Promise<Object>} Transcription result with speaker labels
 *
 * @example
 * const result = await transcribeWithSpeakers(audioBuffer, {
 *   filename: 'podcast.mp3',
 *   speakersExpected: 2,
 * });
 * console.log(result.utterances);
 * // [
 * //   { speaker: 'A', start: 0, end: 5000, text: 'Welcome to the show.' },
 * //   { speaker: 'B', start: 5200, end: 10000, text: 'Thanks for having me.' },
 * // ]
 */
export async function transcribeWithSpeakers(audioData, options = {}) {
  const {
    filename = 'audio.mp3',
    language,
    speakersExpected,
    episodeId = null,
  } = options;

  const startTime = Date.now();

  // ============================================================================
  // STEP 1: VALIDATE API KEY
  // ============================================================================
  if (!ASSEMBLYAI_API_KEY) {
    logger.error('AssemblyAI API key not configured', { filename, episodeId });
    throw new ValidationError(
      'configuration',
      'Speaker diarization is not available. ASSEMBLYAI_API_KEY is not configured.'
    );
  }

  // ============================================================================
  // STEP 2: VALIDATE AUDIO FILE
  // ============================================================================
  logger.info('Starting speaker transcription', {
    filename,
    language: language || 'auto-detect',
    speakersExpected: speakersExpected || 'auto-detect',
    episodeId,
  });

  const { fileSize } = validateAudioFile(audioData, { filename });

  // ============================================================================
  // STEP 3: UPLOAD AUDIO TO ASSEMBLYAI
  // ============================================================================
  const audioBuffer = audioData instanceof Buffer ? audioData : Buffer.from(await audioData.arrayBuffer());
  const uploadUrl = await uploadAudioToAssemblyAI(audioBuffer, filename);

  // ============================================================================
  // STEP 4: START TRANSCRIPTION WITH SPEAKER DIARIZATION
  // ============================================================================
  const transcriptId = await startTranscription(uploadUrl, {
    language,
    speakersExpected,
  });

  // ============================================================================
  // STEP 5: POLL FOR COMPLETION
  // ============================================================================
  const transcriptData = await pollForTranscription(transcriptId);

  // ============================================================================
  // STEP 6: PROCESS RESULTS
  // ============================================================================
  const processingDurationMs = Date.now() - startTime;
  const audioDurationSeconds = transcriptData.audio_duration || 0;
  const audioDurationMinutes = audioDurationSeconds / 60;
  const estimatedCost = audioDurationSeconds * ASSEMBLYAI_PRICE_PER_SECOND;

  // Extract unique speakers
  const speakers = new Set();
  const utterances = (transcriptData.utterances || []).map(u => {
    speakers.add(u.speaker);
    return {
      speaker: u.speaker, // 'A', 'B', 'C', etc.
      start: u.start, // Start time in milliseconds
      end: u.end, // End time in milliseconds
      text: u.text, // Spoken text
      confidence: u.confidence, // Confidence score
    };
  });

  // Create speaker metadata for labeling
  const speakerList = Array.from(speakers).sort().map(speakerId => ({
    id: speakerId,
    label: `Speaker ${speakerId}`, // Default label, user can rename
  }));

  // Format transcript with timestamps and speaker labels
  const formattedTranscript = formatTranscriptWithSpeakers(utterances);

  // Plain text transcript (for pipeline compatibility)
  const plainTranscript = transcriptData.text || utterances.map(u => u.text).join(' ');

  logger.info('Speaker transcription completed successfully', {
    episodeId,
    filename,
    processingDurationMs,
    audioDurationSeconds,
    audioDurationMinutes: audioDurationMinutes.toFixed(2),
    estimatedCost: estimatedCost.toFixed(4),
    speakersDetected: speakerList.length,
    utteranceCount: utterances.length,
    transcriptLength: plainTranscript.length,
  });

  // ============================================================================
  // STEP 7: LOG TO DATABASE (non-blocking)
  // ============================================================================
  apiLogRepo.create({
    provider: 'assemblyai',
    model: 'universal',
    endpoint: '/v2/transcript',
    input_tokens: 0, // AssemblyAI doesn't use tokens
    output_tokens: 0,
    cost_usd: estimatedCost,
    episode_id: episodeId,
    stage_number: null,
    response_time_ms: processingDurationMs,
    success: true,
    metadata: {
      audio_duration_seconds: audioDurationSeconds,
      filename,
      speakers_detected: speakerList.length,
      utterance_count: utterances.length,
      transcript_id: transcriptId,
    },
  }).catch((logError) => {
    logger.warn('Failed to log speaker transcription to database', {
      error: logError.message,
      episodeId,
    });
  });

  // ============================================================================
  // STEP 8: RETURN RESULT
  // ============================================================================
  return {
    // Plain transcript (for pipeline compatibility)
    transcript: plainTranscript,

    // Formatted transcript with speakers and timestamps
    formattedTranscript,

    // Speaker-labeled utterances
    utterances,

    // Speaker metadata for UI labeling
    speakers: speakerList,

    // Audio metadata
    audioDurationSeconds,
    audioDurationMinutes: Math.round(audioDurationMinutes * 100) / 100,
    detectedLanguage: transcriptData.language_code || null,

    // Processing metrics
    processingDurationMs,
    estimatedCost,
    formattedCost: `$${estimatedCost.toFixed(4)}`,

    // Request info
    provider: 'assemblyai',
    model: 'universal',
    filename,
    transcriptId,
    hasSpeakerLabels: true,
  };
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Formats a timestamp from milliseconds to [HH:MM:SS] format.
 *
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
  }
  return `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
}

/**
 * Formats transcript with speaker labels and timestamps.
 *
 * @param {Array} utterances - Array of utterance objects
 * @param {Object} [speakerLabels] - Map of speaker IDs to custom labels
 * @returns {string} Formatted transcript
 *
 * @example
 * // Output:
 * // [00:00:12] Speaker A: Welcome back to the podcast.
 * // [00:00:18] Speaker B: Thanks for having me.
 */
export function formatTranscriptWithSpeakers(utterances, speakerLabels = {}) {
  if (!utterances || utterances.length === 0) {
    return '';
  }

  return utterances.map(u => {
    const timestamp = formatTimestamp(u.start);
    const speakerLabel = speakerLabels[u.speaker] || `Speaker ${u.speaker}`;
    return `${timestamp} ${speakerLabel}: ${u.text}`;
  }).join('\n\n');
}

/**
 * Applies custom speaker labels to utterances and reformats transcript.
 *
 * @param {Object} transcriptionResult - Result from transcribeWithSpeakers
 * @param {Object} speakerLabels - Map of speaker IDs to custom labels
 * @returns {Object} Updated result with labeled speakers
 *
 * @example
 * const labeled = applySpeakerLabels(result, {
 *   'A': 'Dr. Smith (Host)',
 *   'B': 'Jane Doe (Guest)',
 * });
 */
export function applySpeakerLabels(transcriptionResult, speakerLabels) {
  const { utterances, speakers, ...rest } = transcriptionResult;

  // Update speaker metadata with labels
  const labeledSpeakers = speakers.map(s => ({
    ...s,
    label: speakerLabels[s.id] || s.label,
  }));

  // Update utterances with labeled speaker names
  const labeledUtterances = utterances.map(u => ({
    ...u,
    speakerLabel: speakerLabels[u.speaker] || `Speaker ${u.speaker}`,
  }));

  // Reformat transcript with new labels
  const formattedTranscript = formatTranscriptWithSpeakers(utterances, speakerLabels);

  return {
    ...rest,
    utterances: labeledUtterances,
    speakers: labeledSpeakers,
    formattedTranscript,
    speakerLabels,
  };
}

// ============================================================================
// COST ESTIMATION
// ============================================================================

/**
 * Estimates the cost of speaker transcription based on file size.
 *
 * @param {number} fileSizeBytes - Audio file size in bytes
 * @param {Object} [options] - Estimation options
 * @param {number} [options.bitrate=128] - Assumed bitrate in kbps
 * @returns {Object} Cost estimate
 */
export function estimateSpeakerTranscriptionCost(fileSizeBytes, options = {}) {
  const { bitrate = 128 } = options;

  if (!fileSizeBytes || fileSizeBytes <= 0) {
    return {
      estimatedDurationMinutes: 0,
      estimatedDurationSeconds: 0,
      estimatedCost: 0,
      formattedCost: '$0.00',
      pricePerMinute: ASSEMBLYAI_PRICE_PER_SECOND * 60,
      note: 'No file size provided',
    };
  }

  // Calculate estimated duration
  const fileSizeBits = fileSizeBytes * 8;
  const bitrateBps = bitrate * 1000;
  const estimatedDurationSeconds = fileSizeBits / bitrateBps;
  const estimatedDurationMinutes = estimatedDurationSeconds / 60;

  // Calculate cost
  const estimatedCost = estimatedDurationSeconds * ASSEMBLYAI_PRICE_PER_SECOND;

  logger.debug('Speaker transcription cost estimated', {
    fileSizeMB: (fileSizeBytes / (1024 * 1024)).toFixed(2),
    bitrate,
    estimatedDurationMinutes: estimatedDurationMinutes.toFixed(2),
    estimatedCost: estimatedCost.toFixed(4),
  });

  return {
    estimatedDurationMinutes: Math.round(estimatedDurationMinutes * 100) / 100,
    estimatedDurationSeconds: Math.round(estimatedDurationSeconds),
    estimatedCost: Math.round(estimatedCost * 10000) / 10000,
    formattedCost: `$${estimatedCost.toFixed(4)}`,
    pricePerMinute: ASSEMBLYAI_PRICE_PER_SECOND * 60,
    fileSizeMB: Math.round((fileSizeBytes / (1024 * 1024)) * 100) / 100,
    note: `Estimated based on ${bitrate} kbps bitrate. Includes speaker diarization.`,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Checks if speaker transcription is available (API key configured).
 *
 * @returns {boolean} True if AssemblyAI is configured
 */
export function isSpeakerTranscriptionAvailable() {
  return !!ASSEMBLYAI_API_KEY;
}

/**
 * Gets information about speaker transcription requirements.
 *
 * @returns {Object} Requirements and limits
 */
export function getSpeakerTranscriptionRequirements() {
  return {
    available: isSpeakerTranscriptionAvailable(),
    supportedFormats: SUPPORTED_FORMATS,
    maxFileSizeMB: MAX_UPLOAD_SIZE_BYTES / (1024 * 1024),
    maxFileSizeBytes: MAX_UPLOAD_SIZE_BYTES,
    pricePerMinute: ASSEMBLYAI_PRICE_PER_SECOND * 60,
    provider: 'assemblyai',
    features: [
      'Speaker diarization (identifies unique speakers)',
      'Per-utterance timestamps',
      'Automatic language detection',
      'Speaker labeling support',
    ],
  };
}

/**
 * Tests the AssemblyAI API connection.
 *
 * @returns {Promise<boolean>} True if connection works
 */
export async function testAssemblyAIConnection() {
  if (!ASSEMBLYAI_API_KEY) {
    logger.warn('Cannot test AssemblyAI connection: API key not configured');
    return false;
  }

  logger.debug('Testing AssemblyAI API connection...');

  try {
    const response = await assemblyAIFetch(TRANSCRIPT_ENDPOINT);
    // A 401 means the API is reachable but key is invalid
    // A 400 or other error means the API is reachable
    if (response.status === 401) {
      logger.error('AssemblyAI connection test failed: Invalid API key');
      return false;
    }

    logger.info('AssemblyAI API connection test passed');
    return true;
  } catch (error) {
    logger.error('AssemblyAI connection test failed', {
      error: error.message,
    });
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  transcribeWithSpeakers,
  formatTranscriptWithSpeakers,
  applySpeakerLabels,
  estimateSpeakerTranscriptionCost,
  isSpeakerTranscriptionAvailable,
  getSpeakerTranscriptionRequirements,
  testAssemblyAIConnection,
  ASSEMBLYAI_PRICE_PER_SECOND,
  MAX_UPLOAD_SIZE_BYTES,
  SUPPORTED_FORMATS,
};
