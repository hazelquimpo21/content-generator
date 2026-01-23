/**
 * ============================================================================
 * AUDIO TRANSCRIPTION ROUTES
 * ============================================================================
 * API endpoints for audio-to-text transcription using OpenAI's Whisper API.
 * Handles audio file uploads and returns transcribed text.
 *
 * Routes:
 * POST   /api/transcription              - Transcribe an audio file
 * POST   /api/transcription/estimate     - Estimate transcription cost
 * GET    /api/transcription/requirements - Get supported formats and limits
 *
 * Authorization:
 * - All routes require authentication
 * - Users can only transcribe audio for their own use
 *
 * File Upload:
 * - Uses multer for multipart/form-data handling
 * - Supports: mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, ogg
 * - Max file size: 100 MB (files over 25MB are automatically chunked)
 * ============================================================================
 */

import { Router } from 'express';
import multer from 'multer';
import {
  transcribeAudioWithChunking,
  estimateTranscriptionCost,
  getAudioRequirements,
} from '../../lib/audio-transcription.js';
import {
  transcribeWithSpeakers,
  estimateSpeakerTranscriptionCost,
  getSpeakerTranscriptionRequirements,
  isSpeakerTranscriptionAvailable,
  applySpeakerLabels,
} from '../../lib/speaker-transcription.js';
import {
  processTranscriptWithTimestamps,
  applyCustomSpeakerLabels,
} from '../../lib/transcript-processor.js';
import { ValidationError } from '../../lib/errors.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import logger from '../../lib/logger.js';

const router = Router();

// ============================================================================
// MULTER CONFIGURATION FOR FILE UPLOADS
// ============================================================================

/**
 * Configure multer for audio file uploads.
 * Files are stored in memory as Buffer for processing.
 * This is efficient for files under 25 MB (Whisper's limit).
 */
const storage = multer.memoryStorage();

/**
 * File filter to validate audio file types.
 * Accepts common audio formats supported by Whisper API.
 */
const fileFilter = (req, file, cb) => {
  // Define allowed MIME types for audio files
  const allowedMimeTypes = [
    // Standard audio MIME types
    'audio/mpeg',           // mp3
    'audio/mp3',            // mp3 (alternative)
    'audio/mp4',            // m4a, mp4 audio
    'audio/m4a',            // m4a
    'audio/x-m4a',          // m4a (alternative)
    'audio/wav',            // wav
    'audio/x-wav',          // wav (alternative)
    'audio/wave',           // wav (alternative)
    'audio/webm',           // webm
    'audio/flac',           // flac
    'audio/x-flac',         // flac (alternative)
    'audio/ogg',            // ogg
    // Video types that may contain audio-only content
    'video/mp4',            // mp4 (sometimes audio is served as video/mp4)
    'video/webm',           // webm (sometimes audio is served as video/webm)
    // Generic types that browsers sometimes use
    'application/octet-stream', // Generic binary (check extension instead)
  ];

  // Check MIME type
  if (allowedMimeTypes.includes(file.mimetype)) {
    logger.debug('Audio file filter: Accepted by MIME type', {
      filename: file.originalname,
      mimetype: file.mimetype,
    });
    cb(null, true);
    return;
  }

  // For generic/unknown MIME types, check file extension
  const extension = file.originalname.toLowerCase().split('.').pop();
  const allowedExtensions = ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'flac', 'ogg', 'mpeg', 'mpga'];

  if (allowedExtensions.includes(extension)) {
    logger.debug('Audio file filter: Accepted by extension', {
      filename: file.originalname,
      mimetype: file.mimetype,
      extension,
    });
    cb(null, true);
    return;
  }

  // Reject unsupported file types
  logger.warn('Audio file filter: Rejected unsupported file type', {
    filename: file.originalname,
    mimetype: file.mimetype,
    extension,
  });

  cb(
    new ValidationError(
      'file',
      `Unsupported audio format: ${file.mimetype} (.${extension}). ` +
      `Supported formats: MP3, MP4, M4A, WAV, WEBM, FLAC, OGG`
    ),
    false
  );
};

/**
 * Multer upload middleware instance.
 * Configured for single audio file upload with:
 * - Memory storage (files as Buffer)
 * - 100 MB size limit (files over 25MB are chunked automatically)
 * - Audio file type filtering
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max (chunked if > 25MB)
    files: 1, // Only allow one file per request
  },
});

// ============================================================================
// ERROR HANDLING MIDDLEWARE FOR MULTER
// ============================================================================

/**
 * Handles multer-specific errors with user-friendly messages.
 * Wraps the multer upload middleware to catch and format errors.
 *
 * @param {string} fieldName - Expected form field name for the file
 * @returns {Function} Express middleware function
 */
function handleUpload(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        // Handle multer-specific errors
        if (err instanceof multer.MulterError) {
          switch (err.code) {
            case 'LIMIT_FILE_SIZE':
              logger.warn('Upload error: File too large', {
                userId: req.user?.id,
                fieldName,
                error: err.message,
              });
              return next(new ValidationError(
                'file',
                'Audio file exceeds maximum size of 100 MB. Please compress the file or split it into smaller segments.'
              ));

            case 'LIMIT_FILE_COUNT':
              logger.warn('Upload error: Too many files', {
                userId: req.user?.id,
                fieldName,
              });
              return next(new ValidationError(
                'file',
                'Only one audio file can be uploaded at a time.'
              ));

            case 'LIMIT_UNEXPECTED_FILE':
              logger.warn('Upload error: Unexpected field', {
                userId: req.user?.id,
                fieldName,
                receivedField: err.field,
              });
              return next(new ValidationError(
                'file',
                `File must be uploaded in the '${fieldName}' field.`
              ));

            default:
              logger.error('Upload error: Unknown multer error', {
                userId: req.user?.id,
                code: err.code,
                message: err.message,
              });
              return next(new ValidationError('file', `Upload error: ${err.message}`));
          }
        }

        // Handle our ValidationError from file filter
        if (err instanceof ValidationError) {
          return next(err);
        }

        // Handle other unexpected errors
        logger.error('Upload error: Unexpected error', {
          userId: req.user?.id,
          error: err.message,
          stack: err.stack,
        });
        return next(new ValidationError('file', 'Failed to process audio file upload.'));
      }

      next();
    });
  };
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/transcription/requirements
 * Returns information about supported audio formats and limits.
 * Useful for frontend validation before upload.
 *
 * Response:
 * {
 *   supportedFormats: ['mp3', 'mp4', ...],
 *   maxFileSizeMB: 25,
 *   pricePerMinute: 0.006,
 *   model: 'whisper-1'
 * }
 */
router.get('/requirements', requireAuth, (req, res) => {
  logger.debug('Audio requirements requested', {
    userId: req.user.id,
  });

  const requirements = getAudioRequirements();

  res.json({
    success: true,
    requirements,
  });
});

/**
 * POST /api/transcription/estimate
 * Estimates the cost of transcribing an audio file based on file size.
 * Call this before transcription to show users the expected cost.
 *
 * Request Body (JSON):
 * {
 *   fileSizeBytes: number,   // Audio file size in bytes
 *   bitrate?: number         // Optional: Assumed bitrate in kbps (default: 128)
 * }
 *
 * Response:
 * {
 *   estimatedDurationMinutes: 5.2,
 *   estimatedCost: 0.0312,
 *   formattedCost: "$0.0312"
 * }
 */
router.post('/estimate', requireAuth, (req, res, next) => {
  try {
    const { fileSizeBytes, bitrate } = req.body;

    // Validate file size
    if (!fileSizeBytes || typeof fileSizeBytes !== 'number' || fileSizeBytes <= 0) {
      throw new ValidationError(
        'fileSizeBytes',
        'File size in bytes is required and must be a positive number'
      );
    }

    logger.debug('Transcription cost estimate requested', {
      userId: req.user.id,
      fileSizeBytes,
      fileSizeMB: (fileSizeBytes / (1024 * 1024)).toFixed(2),
      bitrate: bitrate || 'default (128)',
    });

    const estimate = estimateTranscriptionCost(fileSizeBytes, {
      bitrate: bitrate || 128,
    });

    logger.info('Transcription cost estimated', {
      userId: req.user.id,
      fileSizeMB: estimate.fileSizeMB,
      estimatedDurationMinutes: estimate.estimatedDurationMinutes,
      estimatedCost: estimate.estimatedCost,
    });

    res.json({
      success: true,
      estimate,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/transcription
 * Transcribes an uploaded audio file using OpenAI's Whisper API.
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Field 'audio': The audio file to transcribe
 * - Optional query params:
 *   - language: ISO-639-1 language code (e.g., 'en', 'es') - auto-detected if not provided
 *   - response_format: 'text' | 'json' | 'srt' | 'vtt' | 'verbose_json' (default: 'text')
 *   - prompt: Optional text to guide transcription style
 *
 * Response:
 * {
 *   success: true,
 *   transcript: "Transcribed text...",
 *   audioDurationMinutes: 5.2,
 *   estimatedCost: 0.0312,
 *   processingDurationMs: 15234,
 *   model: "whisper-1"
 * }
 *
 * NOTE: handleUpload runs BEFORE requireAuth to prevent EPIPE errors.
 * When auth fails during a large file upload, the server would close the
 * connection before the client finishes sending data, causing EPIPE.
 * By consuming the upload first, we ensure the full request is received
 * before any auth rejection.
 */
router.post('/', handleUpload('audio'), requireAuth, async (req, res, next) => {
  try {
    // Validate that a file was uploaded
    if (!req.file) {
      logger.warn('Transcription request missing audio file', {
        userId: req.user.id,
        hasBody: !!req.body,
        bodyKeys: req.body ? Object.keys(req.body) : [],
      });
      throw new ValidationError(
        'audio',
        'No audio file provided. Please upload an audio file in the "audio" field.'
      );
    }

    // Extract options from query/body
    const {
      language,
      response_format = 'text',
      prompt,
    } = { ...req.query, ...req.body };

    // Log transcription request
    logger.info('Audio transcription requested', {
      userId: req.user.id,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      fileSizeKB: Math.round(req.file.size / 1024),
      fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2),
      language: language || 'auto-detect',
      responseFormat: response_format,
      hasPrompt: !!prompt,
    });

    // Validate response format
    const validFormats = ['text', 'json', 'srt', 'vtt', 'verbose_json'];
    if (!validFormats.includes(response_format)) {
      throw new ValidationError(
        'response_format',
        `Invalid response format: ${response_format}. Valid formats: ${validFormats.join(', ')}`
      );
    }

    // Perform transcription (automatically chunks large files)
    const result = await transcribeAudioWithChunking(req.file.buffer, {
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      language,
      prompt,
      responseFormat: response_format,
    });

    // Log successful transcription
    logger.info('Audio transcription completed', {
      userId: req.user.id,
      filename: req.file.originalname,
      audioDurationMinutes: result.audioDurationMinutes,
      transcriptLength: result.transcript?.length || 0,
      estimatedCost: result.estimatedCost,
      processingDurationMs: result.processingDurationMs,
      chunked: result.chunked || false,
      totalChunks: result.totalChunks || 1,
    });

    // Return result
    res.json({
      success: true,
      // Core transcript data
      transcript: result.transcript,

      // Audio metadata
      audioDurationSeconds: result.audioDurationSeconds,
      audioDurationMinutes: result.audioDurationMinutes,
      detectedLanguage: result.detectedLanguage,

      // Segments (only for verbose_json format)
      segments: result.segments,

      // Cost and processing info
      estimatedCost: result.estimatedCost,
      formattedCost: result.formattedCost,
      processingDurationMs: result.processingDurationMs,

      // Chunking info
      chunked: result.chunked || false,
      totalChunks: result.totalChunks || 1,

      // Request info
      model: result.model,
      responseFormat: result.responseFormat,
      filename: result.filename,
    });
  } catch (error) {
    // Log error with context
    logger.error('Audio transcription failed', {
      userId: req.user?.id,
      filename: req.file?.originalname,
      fileSizeKB: req.file ? Math.round(req.file.size / 1024) : null,
      error: error.message,
      errorType: error.constructor.name,
      statusCode: error.statusCode,
    });

    next(error);
  }
});

/**
 * POST /api/transcription/with-episode
 * Transcribes an audio file and automatically creates a new episode.
 * Combines transcription with episode creation for a streamlined workflow.
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Field 'audio': The audio file to transcribe
 * - Optional fields:
 *   - title: Episode title (auto-generated if not provided)
 *   - language: ISO-639-1 language code
 *   - episode_context: JSON string with additional context
 *
 * Response:
 * {
 *   success: true,
 *   episode: { id, title, status, ... },
 *   transcription: { ... }
 * }
 *
 * NOTE: handleUpload runs BEFORE requireAuth to prevent EPIPE errors.
 * See comment on POST / route for explanation.
 */
router.post('/with-episode', handleUpload('audio'), requireAuth, async (req, res, next) => {
  try {
    // Validate that a file was uploaded
    if (!req.file) {
      throw new ValidationError(
        'audio',
        'No audio file provided. Please upload an audio file in the "audio" field.'
      );
    }

    const { title, language, episode_context } = req.body;

    logger.info('Audio transcription with episode creation requested', {
      userId: req.user.id,
      filename: req.file.originalname,
      fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2),
      hasTitle: !!title,
      hasContext: !!episode_context,
    });

    // Step 1: Transcribe the audio (automatically chunks large files)
    const transcriptionResult = await transcribeAudioWithChunking(req.file.buffer, {
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      language,
      responseFormat: 'text',
    });

    // Validate transcript length (minimum 500 characters for episode creation)
    if (!transcriptionResult.transcript || transcriptionResult.transcript.length < 500) {
      throw new ValidationError(
        'transcript',
        `Transcription is too short (${transcriptionResult.transcript?.length || 0} characters). ` +
        'Minimum 500 characters required for episode creation. ' +
        'Please ensure the audio contains sufficient spoken content.'
      );
    }

    // Step 2: Import episode repo and create episode
    // Note: Dynamic import to avoid circular dependencies
    const { episodeRepo } = await import('../../lib/supabase-client.js');
    const { estimateEpisodeCost } = await import('../../lib/cost-calculator.js');

    // Parse episode context if provided as string
    let parsedContext = {};
    if (episode_context) {
      try {
        parsedContext = typeof episode_context === 'string'
          ? JSON.parse(episode_context)
          : episode_context;
      } catch (parseError) {
        logger.warn('Failed to parse episode_context, using empty object', {
          userId: req.user.id,
          error: parseError.message,
        });
      }
    }

    // Create the episode
    const episode = await episodeRepo.create({
      transcript: transcriptionResult.transcript,
      title: title || `Transcribed from ${req.file.originalname}`,
      episode_context: parsedContext,
      user_id: req.user.id,
    });

    // Calculate processing estimate
    const estimate = estimateEpisodeCost(transcriptionResult.transcript);

    logger.info('Episode created from audio transcription', {
      userId: req.user.id,
      episodeId: episode.id,
      transcriptLength: transcriptionResult.transcript.length,
      audioDurationMinutes: transcriptionResult.audioDurationMinutes,
      transcriptionCost: transcriptionResult.estimatedCost,
    });

    res.status(201).json({
      success: true,
      episode: {
        ...episode,
        wordCount: transcriptionResult.transcript.split(/\s+/).length,
      },
      transcription: {
        audioDurationMinutes: transcriptionResult.audioDurationMinutes,
        transcriptLength: transcriptionResult.transcript.length,
        estimatedCost: transcriptionResult.estimatedCost,
        formattedCost: transcriptionResult.formattedCost,
        processingDurationMs: transcriptionResult.processingDurationMs,
        detectedLanguage: transcriptionResult.detectedLanguage,
      },
      estimate: {
        processingCost: estimate.formattedCost,
        processingTime: estimate.formattedTime,
      },
    });
  } catch (error) {
    logger.error('Audio transcription with episode creation failed', {
      userId: req.user?.id,
      filename: req.file?.originalname,
      error: error.message,
      errorType: error.constructor.name,
    });

    next(error);
  }
});

// ============================================================================
// ENHANCED TRANSCRIPTION ROUTES (WITHOUT ASSEMBLYAI)
// ============================================================================

/**
 * POST /api/transcription/enhanced
 * Transcribes audio with timestamps and optional speaker estimation.
 * Uses OpenAI Whisper with verbose_json format and local processing.
 * Does NOT require AssemblyAI - uses GPT-4o-mini for speaker estimation.
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Field 'audio': The audio file to transcribe
 * - Optional fields:
 *   - language: ISO-639-1 language code
 *   - estimate_speakers: 'true' to enable speaker estimation (default: false)
 *   - use_llm: 'true' to use LLM for smarter speaker detection (default: true)
 *   - expected_speakers: Number of expected speakers (1-10, default: 2)
 *
 * Response:
 * {
 *   success: true,
 *   transcript: "Plain text...",
 *   formattedTranscript: "[00:00:12] Speaker A: Hello...",
 *   utterances: [...],
 *   speakers: [{ id: 'A', label: 'Speaker A' }, ...],
 *   audioDurationMinutes: 45.2
 * }
 */
router.post('/enhanced', handleUpload('audio'), requireAuth, async (req, res, next) => {
  try {
    // Validate that a file was uploaded
    if (!req.file) {
      logger.warn('Enhanced transcription request missing audio file', {
        userId: req.user.id,
      });
      throw new ValidationError(
        'audio',
        'No audio file provided. Please upload an audio file in the "audio" field.'
      );
    }

    // Extract options from body
    const {
      language,
      estimate_speakers,
      use_llm = 'true',
      expected_speakers,
    } = req.body;

    // Parse boolean options
    const estimateSpeakers = estimate_speakers === 'true' || estimate_speakers === true;
    const useLLM = use_llm === 'true' || use_llm === true;

    // Parse expected speakers
    let expectedSpeakers = 2;
    if (expected_speakers) {
      expectedSpeakers = parseInt(expected_speakers, 10);
      if (isNaN(expectedSpeakers) || expectedSpeakers < 1 || expectedSpeakers > 10) {
        expectedSpeakers = 2;
      }
    }

    logger.info('Enhanced transcription requested', {
      userId: req.user.id,
      filename: req.file.originalname,
      fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2),
      estimateSpeakers,
      useLLM,
      expectedSpeakers,
      language: language || 'auto-detect',
    });

    // Step 1: Transcribe with verbose_json to get segments
    const transcriptionResult = await transcribeAudioWithChunking(req.file.buffer, {
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      language,
      responseFormat: 'verbose_json',
    });

    // Step 2: Process transcript with timestamps and optional speaker estimation
    // Note: For large files that were chunked, segments may not be available
    const hasSegments = transcriptionResult.segments && transcriptionResult.segments.length > 0;

    let processedResult;

    if (hasSegments) {
      // Normal path: process segments with timestamps and optional speaker estimation
      processedResult = await processTranscriptWithTimestamps(
        transcriptionResult.segments,
        {
          estimateSpeakers,
          useLLM,
          expectedSpeakers,
        }
      );
    } else {
      // Fallback for large chunked files without segments:
      // Use the plain transcript directly without timestamp/speaker processing
      logger.info('No segments available (likely chunked large file), using plain transcript fallback', {
        userId: req.user.id,
        filename: req.file.originalname,
        chunked: transcriptionResult.chunked,
        totalChunks: transcriptionResult.totalChunks,
      });

      // Create a minimal result structure with the plain transcript
      processedResult = {
        transcript: transcriptionResult.transcript,
        formattedTranscript: transcriptionResult.transcript, // Same as plain for fallback
        utterances: [],
        speakers: [],
        hasSpeakerLabels: false,
        audioDurationSeconds: transcriptionResult.audioDurationSeconds,
        audioDurationMinutes: transcriptionResult.audioDurationMinutes,
        speakerEstimationCost: 0,
        provider: 'whisper-chunked',
        usedLLM: false,
      };
    }

    // Calculate total cost (transcription + speaker estimation)
    const totalCost = (transcriptionResult.estimatedCost || 0) + (processedResult.speakerEstimationCost || 0);

    logger.info('Enhanced transcription completed', {
      userId: req.user.id,
      filename: req.file.originalname,
      audioDurationMinutes: processedResult.audioDurationMinutes || transcriptionResult.audioDurationMinutes,
      utteranceCount: processedResult.utterances.length,
      speakerCount: processedResult.speakers.length,
      transcriptionCost: transcriptionResult.estimatedCost,
      speakerEstimationCost: processedResult.speakerEstimationCost,
      totalCost,
      usedFallback: !hasSegments,
    });

    res.json({
      success: true,

      // Plain transcript (pipeline-compatible)
      transcript: processedResult.transcript,

      // Formatted with timestamps and speakers (or plain transcript for fallback)
      formattedTranscript: processedResult.formattedTranscript,

      // Detailed utterances for preview/UI (empty for fallback)
      utterances: processedResult.utterances,

      // Speaker metadata
      speakers: processedResult.speakers,
      hasSpeakerLabels: processedResult.hasSpeakerLabels,

      // Audio metadata
      audioDurationSeconds: processedResult.audioDurationSeconds || transcriptionResult.audioDurationSeconds,
      audioDurationMinutes: processedResult.audioDurationMinutes || transcriptionResult.audioDurationMinutes,
      detectedLanguage: transcriptionResult.detectedLanguage,

      // Cost breakdown
      transcriptionCost: transcriptionResult.estimatedCost,
      speakerEstimationCost: processedResult.speakerEstimationCost,
      totalCost,
      formattedCost: `$${totalCost.toFixed(4)}`,

      // Processing info
      processingDurationMs: transcriptionResult.processingDurationMs,
      provider: processedResult.provider,
      usedLLM: processedResult.usedLLM,

      // Request info
      model: transcriptionResult.model,
      filename: transcriptionResult.filename,
      chunked: transcriptionResult.chunked || false,
      totalChunks: transcriptionResult.totalChunks || 1,
    });
  } catch (error) {
    logger.error('Enhanced transcription failed', {
      userId: req.user?.id,
      filename: req.file?.originalname,
      error: error.message,
      errorType: error.constructor.name,
    });
    next(error);
  }
});

/**
 * POST /api/transcription/enhanced/with-episode
 * Enhanced transcription (timestamps + speakers) with episode creation.
 * Uses Whisper + GPT-4o-mini instead of AssemblyAI.
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Field 'audio': The audio file to transcribe
 * - Optional fields:
 *   - title: Episode title
 *   - language: ISO-639-1 language code
 *   - estimate_speakers: 'true' to enable speaker estimation
 *   - use_llm: 'true' to use LLM for speaker detection
 *   - expected_speakers: Number of expected speakers
 *   - episode_context: JSON string with additional context
 */
router.post('/enhanced/with-episode', handleUpload('audio'), requireAuth, async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ValidationError(
        'audio',
        'No audio file provided. Please upload an audio file in the "audio" field.'
      );
    }

    const {
      title,
      language,
      estimate_speakers,
      use_llm = 'true',
      expected_speakers,
      episode_context,
    } = req.body;

    // Parse options
    const estimateSpeakers = estimate_speakers === 'true' || estimate_speakers === true;
    const useLLM = use_llm === 'true' || use_llm === true;
    let expectedSpeakers = 2;
    if (expected_speakers) {
      expectedSpeakers = parseInt(expected_speakers, 10);
      if (isNaN(expectedSpeakers) || expectedSpeakers < 1 || expectedSpeakers > 10) {
        expectedSpeakers = 2;
      }
    }

    logger.info('Enhanced transcription with episode creation requested', {
      userId: req.user.id,
      filename: req.file.originalname,
      fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2),
      estimateSpeakers,
      hasTitle: !!title,
    });

    // Step 1: Transcribe with verbose_json
    const transcriptionResult = await transcribeAudioWithChunking(req.file.buffer, {
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      language,
      responseFormat: 'verbose_json',
    });

    // Step 2: Process transcript with timestamps and speakers
    const processedResult = await processTranscriptWithTimestamps(
      transcriptionResult.segments || [],
      {
        estimateSpeakers,
        useLLM,
        expectedSpeakers,
      }
    );

    // Validate transcript length
    if (!processedResult.transcript || processedResult.transcript.length < 500) {
      throw new ValidationError(
        'transcript',
        `Transcription is too short (${processedResult.transcript?.length || 0} characters). ` +
        'Minimum 500 characters required for episode creation.'
      );
    }

    // Step 3: Create episode
    const { episodeRepo } = await import('../../lib/supabase-client.js');
    const { estimateEpisodeCost } = await import('../../lib/cost-calculator.js');

    // Parse episode context
    let parsedContext = {};
    if (episode_context) {
      try {
        parsedContext = typeof episode_context === 'string'
          ? JSON.parse(episode_context)
          : episode_context;
      } catch (parseError) {
        logger.warn('Failed to parse episode_context', {
          userId: req.user.id,
          error: parseError.message,
        });
      }
    }

    // Add speaker metadata to context
    if (estimateSpeakers) {
      parsedContext.speakers = processedResult.speakers;
      parsedContext.hasSpeakerDiarization = true;
      parsedContext.speakerProvider = 'whisper-enhanced';
    }

    // Create episode with formatted transcript (includes speakers/timestamps)
    const episode = await episodeRepo.create({
      transcript: estimateSpeakers ? processedResult.formattedTranscript : processedResult.transcript,
      title: title || `Transcribed from ${req.file.originalname}`,
      episode_context: parsedContext,
      user_id: req.user.id,
    });

    const estimate = estimateEpisodeCost(processedResult.transcript);
    const totalCost = (transcriptionResult.estimatedCost || 0) + (processedResult.speakerEstimationCost || 0);

    logger.info('Episode created from enhanced transcription', {
      userId: req.user.id,
      episodeId: episode.id,
      transcriptLength: processedResult.transcript.length,
      speakersDetected: processedResult.speakers.length,
      totalCost,
    });

    res.status(201).json({
      success: true,
      episode: {
        ...episode,
        wordCount: processedResult.transcript.split(/\s+/).length,
      },
      transcription: {
        // Core data
        transcript: processedResult.transcript,
        formattedTranscript: processedResult.formattedTranscript,

        // Speaker info
        speakers: processedResult.speakers,
        utterances: processedResult.utterances,
        hasSpeakerLabels: processedResult.hasSpeakerLabels,

        // Metadata
        audioDurationMinutes: processedResult.audioDurationMinutes || transcriptionResult.audioDurationMinutes,
        transcriptLength: processedResult.transcript.length,
        totalCost,
        formattedCost: `$${totalCost.toFixed(4)}`,
        processingDurationMs: transcriptionResult.processingDurationMs,
        detectedLanguage: transcriptionResult.detectedLanguage,
        provider: processedResult.provider,
        usedLLM: processedResult.usedLLM,
      },
      estimate: {
        processingCost: estimate.formattedCost,
        processingTime: estimate.formattedTime,
      },
    });
  } catch (error) {
    logger.error('Enhanced transcription with episode creation failed', {
      userId: req.user?.id,
      filename: req.file?.originalname,
      error: error.message,
      errorType: error.constructor.name,
    });
    next(error);
  }
});

/**
 * POST /api/transcription/enhanced/label
 * Applies custom speaker labels to an enhanced transcription result.
 *
 * Request Body:
 * {
 *   speakerLabels: { "A": "Dr. Smith", "B": "Jane Doe" },
 *   utterances: [...],
 *   speakers: [...]
 * }
 */
router.post('/enhanced/label', requireAuth, (req, res, next) => {
  try {
    const { speakerLabels, utterances, speakers } = req.body;

    if (!speakerLabels || typeof speakerLabels !== 'object') {
      throw new ValidationError(
        'speakerLabels',
        'Speaker labels object is required. Example: { "A": "Host", "B": "Guest" }'
      );
    }

    if (!utterances || !Array.isArray(utterances)) {
      throw new ValidationError(
        'utterances',
        'Utterances array is required from the transcription result'
      );
    }

    logger.info('Applying speaker labels to enhanced transcription', {
      userId: req.user.id,
      speakerCount: Object.keys(speakerLabels).length,
      utteranceCount: utterances.length,
    });

    // Apply labels using the processor function
    const result = applyCustomSpeakerLabels(
      { utterances, speakers: speakers || [] },
      speakerLabels
    );

    logger.info('Speaker labels applied successfully', {
      userId: req.user.id,
      labeledSpeakers: result.speakers.map(s => s.label),
    });

    res.json({
      success: true,
      formattedTranscript: result.formattedTranscript,
      speakers: result.speakers,
      utterances: result.utterances,
      speakerLabels: result.speakerLabels,
    });
  } catch (error) {
    logger.error('Failed to apply speaker labels', {
      userId: req.user?.id,
      error: error.message,
    });
    next(error);
  }
});

/**
 * GET /api/transcription/enhanced/requirements
 * Returns information about enhanced transcription capabilities.
 */
router.get('/enhanced/requirements', requireAuth, (req, res) => {
  logger.debug('Enhanced transcription requirements requested', {
    userId: req.user.id,
  });

  const whisperReqs = getAudioRequirements();

  res.json({
    success: true,
    requirements: {
      ...whisperReqs,
      features: [
        'Timestamps for each segment',
        'Speaker estimation (heuristic or LLM)',
        'No AssemblyAI required',
        'Full transcript preview',
        'Custom speaker labeling',
      ],
      speakerEstimation: {
        available: true,
        methods: ['heuristic', 'llm'],
        llmModel: 'gpt-4o-mini',
        llmCostPer1000Utterances: '~$0.002-0.005',
        maxSpeakers: 10,
      },
      note: 'Enhanced transcription uses Whisper for transcription and optional GPT-4o-mini for speaker detection',
    },
  });
});

// ============================================================================
// SPEAKER DIARIZATION ROUTES
// ============================================================================

/**
 * GET /api/transcription/speaker/requirements
 * Returns information about speaker transcription capabilities and limits.
 * Useful for frontend to check availability and display appropriate UI.
 *
 * Response:
 * {
 *   available: true,
 *   supportedFormats: ['mp3', 'mp4', ...],
 *   maxFileSizeMB: 200,
 *   pricePerMinute: 0.015,
 *   features: ['Speaker diarization', ...]
 * }
 */
router.get('/speaker/requirements', requireAuth, (req, res) => {
  logger.debug('Speaker transcription requirements requested', {
    userId: req.user.id,
  });

  const requirements = getSpeakerTranscriptionRequirements();

  res.json({
    success: true,
    requirements,
  });
});

/**
 * POST /api/transcription/speaker/estimate
 * Estimates the cost of speaker transcription based on file size.
 *
 * Request Body (JSON):
 * {
 *   fileSizeBytes: number,
 *   bitrate?: number
 * }
 *
 * Response:
 * {
 *   estimatedDurationMinutes: 5.2,
 *   estimatedCost: 0.078,
 *   formattedCost: "$0.0780"
 * }
 */
router.post('/speaker/estimate', requireAuth, (req, res, next) => {
  try {
    const { fileSizeBytes, bitrate } = req.body;

    if (!fileSizeBytes || typeof fileSizeBytes !== 'number' || fileSizeBytes <= 0) {
      throw new ValidationError(
        'fileSizeBytes',
        'File size in bytes is required and must be a positive number'
      );
    }

    logger.debug('Speaker transcription cost estimate requested', {
      userId: req.user.id,
      fileSizeBytes,
      fileSizeMB: (fileSizeBytes / (1024 * 1024)).toFixed(2),
    });

    const estimate = estimateSpeakerTranscriptionCost(fileSizeBytes, {
      bitrate: bitrate || 128,
    });

    logger.info('Speaker transcription cost estimated', {
      userId: req.user.id,
      fileSizeMB: estimate.fileSizeMB,
      estimatedDurationMinutes: estimate.estimatedDurationMinutes,
      estimatedCost: estimate.estimatedCost,
    });

    res.json({
      success: true,
      estimate,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/transcription/speaker
 * Transcribes audio with speaker diarization using AssemblyAI.
 * Returns transcript with speaker labels and timestamps.
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Field 'audio': The audio file to transcribe
 * - Optional fields:
 *   - language: ISO-639-1 language code (e.g., 'en')
 *   - speakers_expected: Expected number of speakers (helps accuracy)
 *
 * Response:
 * {
 *   success: true,
 *   transcript: "Plain text transcript...",
 *   formattedTranscript: "[00:00:12] Speaker A: Welcome...",
 *   utterances: [...],
 *   speakers: [{ id: 'A', label: 'Speaker A' }, ...],
 *   audioDurationMinutes: 45.2,
 *   estimatedCost: 0.678
 * }
 */
router.post('/speaker', handleUpload('audio'), requireAuth, async (req, res, next) => {
  try {
    // Check if speaker transcription is available
    if (!isSpeakerTranscriptionAvailable()) {
      logger.error('Speaker transcription requested but not configured', {
        userId: req.user.id,
      });
      throw new ValidationError(
        'configuration',
        'Speaker diarization is not available. Please contact support.'
      );
    }

    // Validate that a file was uploaded
    if (!req.file) {
      logger.warn('Speaker transcription request missing audio file', {
        userId: req.user.id,
        hasBody: !!req.body,
        bodyKeys: req.body ? Object.keys(req.body) : [],
      });
      throw new ValidationError(
        'audio',
        'No audio file provided. Please upload an audio file in the "audio" field.'
      );
    }

    // Extract options from body
    const { language, speakers_expected } = req.body;

    // Parse speakers_expected if provided
    let speakersExpected = null;
    if (speakers_expected) {
      speakersExpected = parseInt(speakers_expected, 10);
      if (isNaN(speakersExpected) || speakersExpected < 1 || speakersExpected > 10) {
        throw new ValidationError(
          'speakers_expected',
          'Expected speakers must be a number between 1 and 10'
        );
      }
    }

    logger.info('Speaker transcription requested', {
      userId: req.user.id,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      fileSizeKB: Math.round(req.file.size / 1024),
      fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2),
      language: language || 'auto-detect',
      speakersExpected: speakersExpected || 'auto-detect',
    });

    // Perform speaker transcription
    const result = await transcribeWithSpeakers(req.file.buffer, {
      filename: req.file.originalname,
      language,
      speakersExpected,
    });

    logger.info('Speaker transcription completed', {
      userId: req.user.id,
      filename: req.file.originalname,
      audioDurationMinutes: result.audioDurationMinutes,
      speakersDetected: result.speakers.length,
      utteranceCount: result.utterances.length,
      estimatedCost: result.estimatedCost,
      processingDurationMs: result.processingDurationMs,
    });

    res.json({
      success: true,
      // Plain transcript (pipeline-compatible)
      transcript: result.transcript,

      // Formatted with speakers and timestamps
      formattedTranscript: result.formattedTranscript,

      // Detailed utterances for UI
      utterances: result.utterances,

      // Speaker metadata for labeling
      speakers: result.speakers,

      // Audio metadata
      audioDurationSeconds: result.audioDurationSeconds,
      audioDurationMinutes: result.audioDurationMinutes,
      detectedLanguage: result.detectedLanguage,

      // Cost and processing
      estimatedCost: result.estimatedCost,
      formattedCost: result.formattedCost,
      processingDurationMs: result.processingDurationMs,

      // Provider info
      provider: result.provider,
      transcriptId: result.transcriptId,
      hasSpeakerLabels: true,
    });
  } catch (error) {
    logger.error('Speaker transcription failed', {
      userId: req.user?.id,
      filename: req.file?.originalname,
      fileSizeKB: req.file ? Math.round(req.file.size / 1024) : null,
      error: error.message,
      errorType: error.constructor.name,
      statusCode: error.statusCode,
    });

    next(error);
  }
});

/**
 * POST /api/transcription/speaker/with-episode
 * Transcribes audio with speaker diarization and creates an episode.
 * Combines speaker transcription with episode creation for a streamlined workflow.
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Field 'audio': The audio file to transcribe
 * - Optional fields:
 *   - title: Episode title
 *   - language: ISO-639-1 language code
 *   - speakers_expected: Expected number of speakers
 *   - episode_context: JSON string with additional context
 *
 * Response:
 * {
 *   success: true,
 *   episode: { id, title, ... },
 *   transcription: { speakers, utterances, ... }
 * }
 */
router.post('/speaker/with-episode', handleUpload('audio'), requireAuth, async (req, res, next) => {
  try {
    // Check availability
    if (!isSpeakerTranscriptionAvailable()) {
      throw new ValidationError(
        'configuration',
        'Speaker diarization is not available. Please contact support.'
      );
    }

    if (!req.file) {
      throw new ValidationError(
        'audio',
        'No audio file provided. Please upload an audio file in the "audio" field.'
      );
    }

    const { title, language, speakers_expected, episode_context } = req.body;

    // Parse speakers_expected
    let speakersExpected = null;
    if (speakers_expected) {
      speakersExpected = parseInt(speakers_expected, 10);
      if (isNaN(speakersExpected) || speakersExpected < 1 || speakersExpected > 10) {
        throw new ValidationError(
          'speakers_expected',
          'Expected speakers must be a number between 1 and 10'
        );
      }
    }

    logger.info('Speaker transcription with episode creation requested', {
      userId: req.user.id,
      filename: req.file.originalname,
      fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2),
      hasTitle: !!title,
      speakersExpected: speakersExpected || 'auto-detect',
    });

    // Step 1: Transcribe with speaker diarization
    const transcriptionResult = await transcribeWithSpeakers(req.file.buffer, {
      filename: req.file.originalname,
      language,
      speakersExpected,
    });

    // Validate transcript length
    if (!transcriptionResult.transcript || transcriptionResult.transcript.length < 500) {
      throw new ValidationError(
        'transcript',
        `Transcription is too short (${transcriptionResult.transcript?.length || 0} characters). ` +
        'Minimum 500 characters required for episode creation.'
      );
    }

    // Step 2: Create episode
    const { episodeRepo } = await import('../../lib/supabase-client.js');
    const { estimateEpisodeCost } = await import('../../lib/cost-calculator.js');

    // Parse episode context
    let parsedContext = {};
    if (episode_context) {
      try {
        parsedContext = typeof episode_context === 'string'
          ? JSON.parse(episode_context)
          : episode_context;
      } catch (parseError) {
        logger.warn('Failed to parse episode_context', {
          userId: req.user.id,
          error: parseError.message,
        });
      }
    }

    // Add speaker metadata to context
    parsedContext.speakers = transcriptionResult.speakers;
    parsedContext.hasSpeakerDiarization = true;
    parsedContext.transcriptId = transcriptionResult.transcriptId;

    // Create episode with formatted transcript (includes speakers/timestamps)
    const episode = await episodeRepo.create({
      transcript: transcriptionResult.formattedTranscript, // Use formatted version
      title: title || `Transcribed from ${req.file.originalname}`,
      episode_context: parsedContext,
      user_id: req.user.id,
    });

    const estimate = estimateEpisodeCost(transcriptionResult.transcript);

    logger.info('Episode created from speaker transcription', {
      userId: req.user.id,
      episodeId: episode.id,
      transcriptLength: transcriptionResult.transcript.length,
      speakersDetected: transcriptionResult.speakers.length,
      audioDurationMinutes: transcriptionResult.audioDurationMinutes,
      transcriptionCost: transcriptionResult.estimatedCost,
    });

    res.status(201).json({
      success: true,
      episode: {
        ...episode,
        wordCount: transcriptionResult.transcript.split(/\s+/).length,
      },
      transcription: {
        // Core data
        transcript: transcriptionResult.transcript,
        formattedTranscript: transcriptionResult.formattedTranscript,

        // Speaker info
        speakers: transcriptionResult.speakers,
        utterances: transcriptionResult.utterances,
        hasSpeakerLabels: true,

        // Metadata
        audioDurationMinutes: transcriptionResult.audioDurationMinutes,
        transcriptLength: transcriptionResult.transcript.length,
        estimatedCost: transcriptionResult.estimatedCost,
        formattedCost: transcriptionResult.formattedCost,
        processingDurationMs: transcriptionResult.processingDurationMs,
        detectedLanguage: transcriptionResult.detectedLanguage,
        transcriptId: transcriptionResult.transcriptId,
      },
      estimate: {
        processingCost: estimate.formattedCost,
        processingTime: estimate.formattedTime,
      },
    });
  } catch (error) {
    logger.error('Speaker transcription with episode creation failed', {
      userId: req.user?.id,
      filename: req.file?.originalname,
      error: error.message,
      errorType: error.constructor.name,
    });

    next(error);
  }
});

/**
 * POST /api/transcription/speaker/label
 * Applies custom speaker labels to a transcription result.
 * Call this after transcription to rename speakers (e.g., "Speaker A" -> "Dr. Smith").
 *
 * Request Body:
 * {
 *   transcriptId: "abc123",
 *   speakerLabels: {
 *     "A": "Dr. Smith (Host)",
 *     "B": "Jane Doe (Guest)"
 *   },
 *   utterances: [...] // Original utterances from transcription
 * }
 *
 * Response:
 * {
 *   success: true,
 *   formattedTranscript: "[00:00:12] Dr. Smith (Host): Welcome...",
 *   speakers: [{ id: 'A', label: 'Dr. Smith (Host)' }, ...],
 *   utterances: [...] // Updated with speakerLabel field
 * }
 */
router.post('/speaker/label', requireAuth, (req, res, next) => {
  try {
    const { speakerLabels, utterances, speakers } = req.body;

    if (!speakerLabels || typeof speakerLabels !== 'object') {
      throw new ValidationError(
        'speakerLabels',
        'Speaker labels object is required. Example: { "A": "Host", "B": "Guest" }'
      );
    }

    if (!utterances || !Array.isArray(utterances)) {
      throw new ValidationError(
        'utterances',
        'Utterances array is required from the original transcription'
      );
    }

    if (!speakers || !Array.isArray(speakers)) {
      throw new ValidationError(
        'speakers',
        'Speakers array is required from the original transcription'
      );
    }

    logger.info('Applying speaker labels', {
      userId: req.user.id,
      speakerCount: Object.keys(speakerLabels).length,
      utteranceCount: utterances.length,
    });

    // Apply labels using the helper function
    const result = applySpeakerLabels(
      { utterances, speakers },
      speakerLabels
    );

    logger.info('Speaker labels applied successfully', {
      userId: req.user.id,
      labeledSpeakers: result.speakers.map(s => s.label),
    });

    res.json({
      success: true,
      formattedTranscript: result.formattedTranscript,
      speakers: result.speakers,
      utterances: result.utterances,
      speakerLabels: result.speakerLabels,
    });
  } catch (error) {
    logger.error('Failed to apply speaker labels', {
      userId: req.user?.id,
      error: error.message,
    });
    next(error);
  }
});

export default router;
