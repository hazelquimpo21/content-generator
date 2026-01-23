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

export default router;
