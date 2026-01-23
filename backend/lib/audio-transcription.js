/**
 * ============================================================================
 * AUDIO TRANSCRIPTION SERVICE
 * ============================================================================
 * Provides audio-to-text transcription using OpenAI's Whisper API.
 * Supports various audio formats (mp3, mp4, mpeg, mpga, m4a, wav, webm).
 *
 * Features:
 * - Audio file transcription with OpenAI Whisper
 * - Automatic retry with exponential backoff for transient errors
 * - Comprehensive error logging for troubleshooting
 * - Cost calculation and usage tracking
 * - Support for multiple response formats (text, json, srt, vtt)
 * - Language detection and specification
 *
 * Whisper API Details:
 * - Model: whisper-1
 * - Max file size: 25 MB
 * - Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm
 * - Pricing: $0.006 per minute of audio
 *
 * Usage:
 *   import { transcribeAudio, estimateTranscriptionCost } from './lib/audio-transcription.js';
 *   const result = await transcribeAudio(audioBuffer, { filename: 'podcast.mp3' });
 *   console.log(result.transcript);
 * ============================================================================
 */

import OpenAI from 'openai';
import logger from './logger.js';
import { APIError, ValidationError } from './errors.js';
import { retryWithBackoff, createAPIRetryConfig } from './retry-logic.js';
import { apiLogRepo } from './supabase-client.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  logger.warn('OPENAI_API_KEY not set - Audio transcription calls will fail');
}

// Whisper model identifier
const WHISPER_MODEL = 'whisper-1';

// Pricing per minute of audio (as of January 2025)
// Source: https://openai.com/pricing
const WHISPER_PRICE_PER_MINUTE = 0.006;

// Maximum file size in bytes (25 MB)
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// Supported audio formats
const SUPPORTED_FORMATS = [
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'm4a',
  'wav',
  'webm',
  'flac',  // Also commonly supported
  'ogg',   // Also commonly supported
];

// MIME type to extension mapping for validation
const MIME_TO_EXTENSION = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',  // Some MP4 audio files have video MIME type
  'video/webm': 'webm',
};

// ============================================================================
// OPENAI CLIENT (SINGLETON)
// ============================================================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates the audio file before sending to API.
 * Checks file size, format, and basic integrity.
 *
 * @param {Buffer|Blob} audioData - The audio file data
 * @param {Object} options - Validation options
 * @param {string} options.filename - Original filename (for extension detection)
 * @param {string} [options.mimeType] - MIME type of the audio file
 * @throws {ValidationError} If validation fails
 */
function validateAudioFile(audioData, options = {}) {
  const { filename, mimeType } = options;

  // Log validation attempt for debugging
  logger.debug('Validating audio file', {
    hasFilename: !!filename,
    mimeType: mimeType || 'not provided',
    dataSize: audioData?.length || audioData?.size || 0,
  });

  // Check if data exists
  if (!audioData) {
    logger.error('Audio validation failed: No data provided', {
      filename,
    });
    throw new ValidationError(
      'audioData',
      'Audio file data is required'
    );
  }

  // Get file size (works for both Buffer and Blob)
  const fileSize = audioData.length || audioData.size;

  // Check file size
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    logger.error('Audio validation failed: File too large', {
      filename,
      fileSizeMB,
      maxSizeMB: MAX_FILE_SIZE_BYTES / (1024 * 1024),
    });
    throw new ValidationError(
      'audioData',
      `Audio file size (${fileSizeMB} MB) exceeds maximum of 25 MB`
    );
  }

  // Check minimum file size (avoid empty files)
  if (fileSize < 1000) {
    logger.error('Audio validation failed: File too small', {
      filename,
      fileSize,
    });
    throw new ValidationError(
      'audioData',
      'Audio file appears to be empty or corrupted (less than 1KB)'
    );
  }

  // Determine file extension from filename or MIME type
  let extension = null;

  if (filename) {
    // Extract extension from filename
    const parts = filename.toLowerCase().split('.');
    if (parts.length > 1) {
      extension = parts[parts.length - 1];
    }
  }

  // Fall back to MIME type if no extension found
  if (!extension && mimeType) {
    extension = MIME_TO_EXTENSION[mimeType.toLowerCase()];
  }

  // Validate extension
  if (!extension) {
    logger.warn('Audio validation: Could not determine file format', {
      filename,
      mimeType,
    });
    // Don't fail - let Whisper API try to process it
    // The API may still be able to handle it
  } else if (!SUPPORTED_FORMATS.includes(extension)) {
    logger.error('Audio validation failed: Unsupported format', {
      filename,
      extension,
      supportedFormats: SUPPORTED_FORMATS,
    });
    throw new ValidationError(
      'audioData',
      `Unsupported audio format: .${extension}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`
    );
  }

  logger.debug('Audio file validation passed', {
    filename,
    extension,
    fileSizeKB: Math.round(fileSize / 1024),
  });

  return { extension, fileSize };
}

// ============================================================================
// MAIN TRANSCRIPTION FUNCTION
// ============================================================================

/**
 * Transcribes an audio file using OpenAI's Whisper API.
 *
 * @param {Buffer|Blob|File} audioData - The audio file data to transcribe
 * @param {Object} [options] - Transcription options
 * @param {string} options.filename - Original filename (required for API)
 * @param {string} [options.mimeType] - MIME type of the audio file
 * @param {string} [options.language] - Language code (ISO-639-1). If not specified, Whisper auto-detects
 * @param {string} [options.prompt] - Optional text to guide model's style or continue previous segment
 * @param {string} [options.responseFormat='text'] - Response format: text, json, srt, vtt, verbose_json
 * @param {number} [options.temperature=0] - Sampling temperature (0-1). Higher = more random
 * @param {string} [options.episodeId] - Episode ID for logging (optional)
 * @returns {Promise<Object>} Transcription result
 *
 * @example
 * // Basic transcription
 * const result = await transcribeAudio(audioBuffer, { filename: 'podcast.mp3' });
 * console.log(result.transcript);
 *
 * @example
 * // With language hint and verbose output
 * const result = await transcribeAudio(audioBuffer, {
 *   filename: 'episode-42.m4a',
 *   language: 'en',
 *   responseFormat: 'verbose_json',
 * });
 * console.log(result.transcript);
 * console.log(result.segments); // Timestamped segments
 */
export async function transcribeAudio(audioData, options = {}) {
  const {
    filename = 'audio.mp3',
    mimeType,
    language,
    prompt,
    responseFormat = 'text',
    temperature = 0,
    episodeId = null,
  } = options;

  const startTime = Date.now();

  // ============================================================================
  // STEP 1: VALIDATE AUDIO FILE
  // ============================================================================
  logger.info('Starting audio transcription', {
    filename,
    mimeType: mimeType || 'auto-detect',
    language: language || 'auto-detect',
    responseFormat,
    episodeId,
  });

  const { extension, fileSize } = validateAudioFile(audioData, {
    filename,
    mimeType,
  });

  // ============================================================================
  // STEP 2: PREPARE FILE FOR UPLOAD
  // ============================================================================
  // OpenAI's Node.js SDK expects a File-like object with a name property
  // We need to create a proper File or Blob with the correct filename
  logger.debug('Preparing audio file for upload', {
    filename,
    extension,
    fileSizeKB: Math.round(fileSize / 1024),
    episodeId,
  });

  let audioFile;

  try {
    // Create a File object from the buffer
    // The OpenAI SDK v4+ expects a File-like object
    if (audioData instanceof Buffer) {
      // Convert Buffer to Blob, then to File
      const blob = new Blob([audioData], {
        type: mimeType || `audio/${extension || 'mpeg'}`,
      });
      // Create File-like object with name property
      audioFile = new File([blob], filename, {
        type: mimeType || `audio/${extension || 'mpeg'}`,
      });
    } else if (audioData instanceof Blob) {
      // If already a Blob, wrap in File
      audioFile = new File([audioData], filename, {
        type: audioData.type || mimeType || `audio/${extension || 'mpeg'}`,
      });
    } else if (audioData.name && audioData.type) {
      // Already a File object
      audioFile = audioData;
    } else {
      // Unknown type - try to use as-is
      logger.warn('Unknown audio data type, attempting to use as-is', {
        dataType: typeof audioData,
        hasLength: 'length' in audioData,
        episodeId,
      });
      audioFile = audioData;
    }
  } catch (fileError) {
    logger.error('Failed to prepare audio file for upload', {
      error: fileError.message,
      filename,
      episodeId,
    });
    throw new ValidationError(
      'audioData',
      `Failed to prepare audio file: ${fileError.message}`
    );
  }

  // ============================================================================
  // STEP 3: CALL WHISPER API WITH RETRY LOGIC
  // ============================================================================
  const retryConfig = createAPIRetryConfig('OpenAI Whisper');

  logger.debug('Calling OpenAI Whisper API', {
    model: WHISPER_MODEL,
    filename,
    language: language || 'auto',
    responseFormat,
    temperature,
    episodeId,
  });

  const response = await retryWithBackoff(async () => {
    try {
      // Build request parameters
      const requestParams = {
        file: audioFile,
        model: WHISPER_MODEL,
        response_format: responseFormat,
      };

      // Add optional parameters if provided
      if (language) {
        requestParams.language = language;
      }

      if (prompt) {
        requestParams.prompt = prompt;
      }

      if (temperature !== undefined && temperature > 0) {
        requestParams.temperature = temperature;
      }

      logger.debug('Whisper API request parameters', {
        model: WHISPER_MODEL,
        responseFormat: requestParams.response_format,
        hasLanguage: !!language,
        hasPrompt: !!prompt,
        temperature: requestParams.temperature,
        episodeId,
      });

      // Make the API call
      const transcription = await openai.audio.transcriptions.create(requestParams);

      return transcription;
    } catch (error) {
      // ============================================================================
      // ENHANCED ERROR LOGGING FOR WHISPER API FAILURES
      // ============================================================================
      // Common Whisper API errors:
      // - 400: Invalid file format, file too large, or malformed request
      // - 401: Invalid API key
      // - 413: File too large (should be caught by validation)
      // - 429: Rate limit exceeded
      // - 500-503: OpenAI service issues
      // ============================================================================

      const errorDetails = {
        episodeId,
        filename,
        fileSizeKB: Math.round(fileSize / 1024),
        errorMessage: error.message,
        errorStatus: error.status,
        errorCode: error.code,
        errorType: error.type,
      };

      // Specific error handling for common issues
      if (error.status === 400) {
        logger.error('Whisper API 400 error - Invalid request', {
          ...errorDetails,
          debugHint: 'Check file format, size, or request parameters',
        });
      } else if (error.status === 413) {
        logger.error('Whisper API 413 error - File too large', {
          ...errorDetails,
          debugHint: 'File exceeds 25 MB limit. Compress or split the audio.',
        });
      } else if (error.status === 429) {
        logger.warn('Whisper API 429 error - Rate limit exceeded', {
          ...errorDetails,
          debugHint: 'Too many requests. Will retry with backoff.',
        });
      } else {
        logger.error('Whisper API call failed', errorDetails);
      }

      // Convert to our APIError type for consistent handling
      throw new APIError(
        'openai',
        error.status || 500,
        error.message,
        { code: error.code, type: error.type, filename }
      );
    }
  }, retryConfig);

  // ============================================================================
  // STEP 4: PROCESS RESPONSE AND CALCULATE METRICS
  // ============================================================================
  const durationMs = Date.now() - startTime;

  // Extract transcript text based on response format
  let transcript;
  let segments = null;
  let detectedLanguage = null;
  let audioDurationSeconds = null;

  if (responseFormat === 'verbose_json') {
    // Verbose JSON includes additional metadata
    transcript = response.text;
    segments = response.segments || null;
    detectedLanguage = response.language || null;
    audioDurationSeconds = response.duration || null;
  } else if (responseFormat === 'json') {
    // Simple JSON response
    transcript = response.text;
  } else {
    // Text, SRT, or VTT format - response is the string directly
    transcript = response;
  }

  // Estimate audio duration from transcript if not provided
  // Rule of thumb: average speaking rate is ~150 words per minute
  if (!audioDurationSeconds && transcript) {
    const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
    audioDurationSeconds = Math.max(1, Math.round((wordCount / 150) * 60));
  }

  // Calculate estimated cost
  const audioDurationMinutes = audioDurationSeconds / 60;
  const estimatedCost = audioDurationMinutes * WHISPER_PRICE_PER_MINUTE;

  // ============================================================================
  // STEP 5: LOG RESULTS AND RETURN
  // ============================================================================
  logger.info('Audio transcription completed successfully', {
    episodeId,
    filename,
    durationMs,
    audioDurationSeconds,
    audioDurationMinutes: audioDurationMinutes.toFixed(2),
    transcriptLength: transcript?.length || 0,
    wordCount: transcript?.split(/\s+/).filter(w => w.length > 0).length || 0,
    estimatedCost: estimatedCost.toFixed(4),
    detectedLanguage,
    hasSegments: !!segments,
  });

  // Log to database for cost tracking (non-blocking)
  apiLogRepo.create({
    provider: 'openai',
    model: WHISPER_MODEL,
    endpoint: '/v1/audio/transcriptions',
    input_tokens: 0,  // Whisper doesn't use tokens
    output_tokens: 0,
    cost_usd: estimatedCost,
    episode_id: episodeId,
    stage_number: null,  // Not part of pipeline stages
    response_time_ms: durationMs,
    success: true,
    metadata: {
      audio_duration_seconds: audioDurationSeconds,
      filename,
      response_format: responseFormat,
    },
  }).catch((logError) => {
    // Don't fail transcription if logging fails
    logger.warn('Failed to log transcription to database', {
      error: logError.message,
      episodeId,
    });
  });

  // Return comprehensive result
  return {
    // Core transcript
    transcript,

    // Audio metadata
    audioDurationSeconds,
    audioDurationMinutes: Math.round(audioDurationMinutes * 100) / 100,
    detectedLanguage,

    // Additional data (for verbose_json format)
    segments,

    // Processing metrics
    processingDurationMs: durationMs,
    estimatedCost,
    formattedCost: `$${estimatedCost.toFixed(4)}`,

    // Request info
    model: WHISPER_MODEL,
    responseFormat,
    filename,
  };
}

// ============================================================================
// COST ESTIMATION
// ============================================================================

/**
 * Estimates the cost of transcribing audio based on file size.
 * Uses average bitrate assumptions to estimate duration.
 *
 * @param {number} fileSizeBytes - Audio file size in bytes
 * @param {Object} [options] - Estimation options
 * @param {number} [options.bitrate=128] - Assumed bitrate in kbps (default: 128 kbps for MP3)
 * @returns {Object} Cost estimate
 *
 * @example
 * const estimate = estimateTranscriptionCost(5 * 1024 * 1024); // 5 MB file
 * console.log(estimate.formattedCost); // "$0.03"
 */
export function estimateTranscriptionCost(fileSizeBytes, options = {}) {
  const { bitrate = 128 } = options;

  // Validate input
  if (!fileSizeBytes || fileSizeBytes <= 0) {
    return {
      estimatedDurationMinutes: 0,
      estimatedDurationSeconds: 0,
      estimatedCost: 0,
      formattedCost: '$0.00',
      pricePerMinute: WHISPER_PRICE_PER_MINUTE,
      note: 'No file size provided',
    };
  }

  // Calculate estimated duration
  // Formula: duration (seconds) = file size (bits) / bitrate (bits per second)
  const fileSizeBits = fileSizeBytes * 8;
  const bitrateBps = bitrate * 1000;  // Convert kbps to bps
  const estimatedDurationSeconds = fileSizeBits / bitrateBps;
  const estimatedDurationMinutes = estimatedDurationSeconds / 60;

  // Calculate cost
  const estimatedCost = estimatedDurationMinutes * WHISPER_PRICE_PER_MINUTE;

  logger.debug('Transcription cost estimated', {
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
    pricePerMinute: WHISPER_PRICE_PER_MINUTE,
    fileSizeMB: Math.round((fileSizeBytes / (1024 * 1024)) * 100) / 100,
    note: `Estimated based on ${bitrate} kbps bitrate`,
  };
}

/**
 * Calculates the actual cost of a transcription based on audio duration.
 *
 * @param {number} durationSeconds - Audio duration in seconds
 * @returns {Object} Cost breakdown
 */
export function calculateTranscriptionCost(durationSeconds) {
  const durationMinutes = durationSeconds / 60;
  const cost = durationMinutes * WHISPER_PRICE_PER_MINUTE;

  return {
    durationSeconds,
    durationMinutes: Math.round(durationMinutes * 100) / 100,
    cost: Math.round(cost * 10000) / 10000,
    formattedCost: `$${cost.toFixed(4)}`,
    pricePerMinute: WHISPER_PRICE_PER_MINUTE,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Tests the Whisper API connection with a minimal request.
 * Useful for health checks and API key validation.
 *
 * @returns {Promise<boolean>} True if connection works
 */
export async function testWhisperConnection() {
  logger.debug('Testing Whisper API connection...');

  // Create a minimal audio file (silence) for testing
  // This is a valid but tiny WAV file header
  const silentWav = Buffer.from([
    // RIFF header
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x24, 0x00, 0x00, 0x00, // File size - 8
    0x57, 0x41, 0x56, 0x45, // "WAVE"
    // fmt subchunk
    0x66, 0x6d, 0x74, 0x20, // "fmt "
    0x10, 0x00, 0x00, 0x00, // Subchunk1Size (16)
    0x01, 0x00,             // AudioFormat (1 = PCM)
    0x01, 0x00,             // NumChannels (1 = mono)
    0x44, 0xac, 0x00, 0x00, // SampleRate (44100)
    0x88, 0x58, 0x01, 0x00, // ByteRate
    0x02, 0x00,             // BlockAlign
    0x10, 0x00,             // BitsPerSample (16)
    // data subchunk
    0x64, 0x61, 0x74, 0x61, // "data"
    0x00, 0x00, 0x00, 0x00, // Subchunk2Size (0 - empty)
  ]);

  try {
    // Note: This will likely fail with a "audio too short" error,
    // but a 400 error means the API is reachable and key is valid
    await transcribeAudio(silentWav, {
      filename: 'test.wav',
      mimeType: 'audio/wav',
    });

    logger.info('Whisper API connection test passed');
    return true;
  } catch (error) {
    // A 400 error (audio too short) still means the API is working
    if (error.statusCode === 400 && error.message.includes('audio')) {
      logger.info('Whisper API connection test passed (received expected audio validation error)');
      return true;
    }

    logger.error('Whisper API connection test failed', {
      errorMessage: error.message,
      errorStatus: error.statusCode,
    });
    return false;
  }
}

/**
 * Gets information about supported audio formats.
 *
 * @returns {Object} Supported formats and limits
 */
export function getAudioRequirements() {
  return {
    supportedFormats: SUPPORTED_FORMATS,
    supportedMimeTypes: Object.keys(MIME_TO_EXTENSION),
    maxFileSizeMB: MAX_FILE_SIZE_BYTES / (1024 * 1024),
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    pricePerMinute: WHISPER_PRICE_PER_MINUTE,
    model: WHISPER_MODEL,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  transcribeAudio,
  estimateTranscriptionCost,
  calculateTranscriptionCost,
  testWhisperConnection,
  getAudioRequirements,
  WHISPER_MODEL,
  WHISPER_PRICE_PER_MINUTE,
  MAX_FILE_SIZE_BYTES,
  SUPPORTED_FORMATS,
};
