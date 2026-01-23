/**
 * ============================================================================
 * AUDIO CHUNKING UTILITY
 * ============================================================================
 * Splits large audio files into smaller chunks for transcription.
 * Uses FFmpeg for audio processing.
 *
 * Features:
 * - Splits audio files into ~20MB chunks (under Whisper's 25MB limit)
 * - Preserves audio quality during splitting
 * - Handles various audio formats
 * - Cleans up temporary files after processing
 *
 * Requirements:
 * - FFmpeg must be installed on the system
 * - Temporary file storage for chunks
 *
 * Usage:
 *   import { splitAudioIntoChunks, isFFmpegAvailable } from './audio-chunking.js';
 *   const chunks = await splitAudioIntoChunks(audioBuffer, { filename: 'podcast.mp3' });
 * ============================================================================
 */

import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import logger from './logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Target chunk size in MB (keep under Whisper's 25MB limit)
const TARGET_CHUNK_SIZE_MB = 20;

// Chunk duration in seconds (roughly 20 minutes per chunk at 128kbps MP3)
// 20 min * 60 sec * 128 kbps / 8 bits = ~19.2 MB
const CHUNK_DURATION_SECONDS = 1200; // 20 minutes

// Maximum file size we'll accept (100 MB)
const MAX_LARGE_FILE_SIZE_MB = 100;
const MAX_LARGE_FILE_SIZE_BYTES = MAX_LARGE_FILE_SIZE_MB * 1024 * 1024;

// Whisper API limit
const WHISPER_MAX_SIZE_BYTES = 25 * 1024 * 1024;

// ============================================================================
// FFMPEG UTILITIES
// ============================================================================

/**
 * Checks if FFmpeg is available on the system.
 * @returns {Promise<boolean>}
 */
export async function isFFmpegAvailable() {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);

    ffmpeg.on('error', () => {
      logger.warn('FFmpeg not found on system - large file support disabled');
      resolve(false);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        logger.debug('FFmpeg is available');
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

/**
 * Gets audio duration in seconds using FFprobe.
 * @param {string} filePath - Path to audio file
 * @returns {Promise<number>} Duration in seconds
 */
async function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    let output = '';
    let errorOutput = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`FFprobe error: ${err.message}`));
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        if (isNaN(duration)) {
          reject(new Error('Could not parse audio duration'));
        } else {
          resolve(duration);
        }
      } else {
        reject(new Error(`FFprobe failed: ${errorOutput}`));
      }
    });
  });
}

/**
 * Splits audio file into chunks using FFmpeg.
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputDir - Directory for output chunks
 * @param {string} extension - File extension for chunks
 * @param {number} chunkDuration - Duration of each chunk in seconds
 * @returns {Promise<string[]>} Array of chunk file paths
 */
async function splitWithFFmpeg(inputPath, outputDir, extension, chunkDuration) {
  return new Promise((resolve, reject) => {
    const outputPattern = join(outputDir, `chunk_%03d.${extension}`);

    // FFmpeg command to split audio
    // -f segment: Use segment muxer
    // -segment_time: Duration of each segment
    // -c copy: Copy codec (no re-encoding, faster)
    // -reset_timestamps 1: Reset timestamps for each segment
    const args = [
      '-i', inputPath,
      '-f', 'segment',
      '-segment_time', String(chunkDuration),
      '-c', 'copy',
      '-reset_timestamps', '1',
      '-y', // Overwrite output files
      outputPattern,
    ];

    logger.debug('Running FFmpeg split command', {
      inputPath,
      outputPattern,
      chunkDuration,
    });

    const ffmpeg = spawn('ffmpeg', args);

    let errorOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg error: ${err.message}`));
    });

    ffmpeg.on('close', async (code) => {
      if (code === 0) {
        // Find all created chunk files
        const { readdir } = await import('fs/promises');
        const files = await readdir(outputDir);
        const chunkFiles = files
          .filter(f => f.startsWith('chunk_') && f.endsWith(`.${extension}`))
          .sort()
          .map(f => join(outputDir, f));

        logger.info('FFmpeg split completed', {
          chunkCount: chunkFiles.length,
          outputDir,
        });

        resolve(chunkFiles);
      } else {
        // Log FFmpeg error output for debugging
        logger.error('FFmpeg split failed', {
          code,
          errorOutput: errorOutput.slice(-1000), // Last 1000 chars
        });
        reject(new Error(`FFmpeg failed with code ${code}`));
      }
    });
  });
}

// ============================================================================
// MAIN CHUNKING FUNCTION
// ============================================================================

/**
 * Splits a large audio file into smaller chunks suitable for Whisper API.
 *
 * @param {Buffer} audioBuffer - The audio file data
 * @param {Object} options - Options
 * @param {string} options.filename - Original filename
 * @param {string} [options.mimeType] - MIME type
 * @returns {Promise<Object>} Chunking result
 *
 * @example
 * const result = await splitAudioIntoChunks(audioBuffer, { filename: 'podcast.mp3' });
 * console.log(result.chunks); // Array of { buffer, filename } objects
 */
export async function splitAudioIntoChunks(audioBuffer, options = {}) {
  const { filename = 'audio.mp3', mimeType } = options;
  const fileSize = audioBuffer.length;

  logger.info('Starting audio chunking', {
    filename,
    fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
  });

  // Validate file size
  if (fileSize > MAX_LARGE_FILE_SIZE_BYTES) {
    throw new Error(
      `File size (${(fileSize / (1024 * 1024)).toFixed(1)} MB) exceeds maximum of ${MAX_LARGE_FILE_SIZE_MB} MB`
    );
  }

  // If file is small enough, no chunking needed
  if (fileSize <= WHISPER_MAX_SIZE_BYTES) {
    logger.debug('File is small enough, no chunking needed', {
      filename,
      fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
    });

    return {
      chunked: false,
      chunks: [{ buffer: audioBuffer, filename }],
      totalChunks: 1,
      originalSize: fileSize,
    };
  }

  // Check FFmpeg availability
  const ffmpegAvailable = await isFFmpegAvailable();
  if (!ffmpegAvailable) {
    throw new Error(
      'FFmpeg is required for files larger than 25 MB. Please install FFmpeg on your server.'
    );
  }

  // Get file extension
  const extension = filename.toLowerCase().split('.').pop() || 'mp3';

  // Create temporary directory for processing
  const tempDir = join(tmpdir(), `audio-chunks-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  const inputPath = join(tempDir, `input.${extension}`);

  try {
    // Write buffer to temp file
    await writeFile(inputPath, audioBuffer);

    // Get audio duration
    const duration = await getAudioDuration(inputPath);
    logger.debug('Audio duration detected', {
      duration,
      durationMinutes: (duration / 60).toFixed(1),
    });

    // Calculate optimal chunk duration based on file size
    // Aim for chunks around 20MB
    const estimatedBitrate = (fileSize * 8) / duration; // bits per second
    const targetChunkBytes = TARGET_CHUNK_SIZE_MB * 1024 * 1024;
    const chunkDuration = Math.min(
      CHUNK_DURATION_SECONDS,
      Math.floor((targetChunkBytes * 8) / estimatedBitrate)
    );

    logger.debug('Chunk parameters calculated', {
      estimatedBitratekbps: (estimatedBitrate / 1000).toFixed(0),
      chunkDurationSeconds: chunkDuration,
      chunkDurationMinutes: (chunkDuration / 60).toFixed(1),
    });

    // Split the audio
    const chunkPaths = await splitWithFFmpeg(inputPath, tempDir, extension, chunkDuration);

    // Read all chunks into buffers
    const chunks = await Promise.all(
      chunkPaths.map(async (chunkPath, index) => {
        const buffer = await readFile(chunkPath);
        const chunkFilename = `${filename.replace(`.${extension}`, '')}_chunk${index + 1}.${extension}`;

        return {
          buffer,
          filename: chunkFilename,
          index,
          size: buffer.length,
        };
      })
    );

    logger.info('Audio chunking completed', {
      originalFilename: filename,
      originalSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
      totalChunks: chunks.length,
      chunkSizes: chunks.map(c => (c.size / (1024 * 1024)).toFixed(2) + ' MB'),
    });

    return {
      chunked: true,
      chunks,
      totalChunks: chunks.length,
      originalSize: fileSize,
      audioDurationSeconds: duration,
    };
  } finally {
    // Clean up temp files
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(tempDir);
      await Promise.all(
        files.map(f => unlink(join(tempDir, f)).catch(() => {}))
      );
      const { rmdir } = await import('fs/promises');
      await rmdir(tempDir).catch(() => {});

      logger.debug('Cleaned up temp files', { tempDir });
    } catch (cleanupError) {
      logger.warn('Failed to clean up temp files', {
        tempDir,
        error: cleanupError.message,
      });
    }
  }
}

/**
 * Transcribes a large audio file by chunking and merging results.
 * This is a convenience function that combines chunking with transcription.
 *
 * @param {Buffer} audioBuffer - The audio file data
 * @param {Object} options - Options (same as transcribeAudio)
 * @param {Function} transcribeFn - The transcription function to use for each chunk
 * @returns {Promise<Object>} Combined transcription result
 */
export async function transcribeLargeAudio(audioBuffer, options, transcribeFn) {
  const { filename = 'audio.mp3' } = options;
  const startTime = Date.now();

  // Split into chunks
  const { chunked, chunks, totalChunks, audioDurationSeconds } = await splitAudioIntoChunks(
    audioBuffer,
    { filename, mimeType: options.mimeType }
  );

  // If no chunking was needed, just transcribe normally
  if (!chunked) {
    return transcribeFn(audioBuffer, options);
  }

  logger.info('Transcribing chunked audio', {
    filename,
    totalChunks,
    audioDurationMinutes: audioDurationSeconds ? (audioDurationSeconds / 60).toFixed(1) : 'unknown',
  });

  // Transcribe each chunk
  const chunkResults = [];
  let totalCost = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    logger.debug(`Transcribing chunk ${i + 1}/${totalChunks}`, {
      chunkFilename: chunk.filename,
      chunkSizeMB: (chunk.size / (1024 * 1024)).toFixed(2),
    });

    const result = await transcribeFn(chunk.buffer, {
      ...options,
      filename: chunk.filename,
    });

    chunkResults.push({
      index: i,
      transcript: result.transcript,
      cost: result.estimatedCost,
    });

    totalCost += result.estimatedCost;
  }

  // Merge transcripts
  const mergedTranscript = chunkResults
    .sort((a, b) => a.index - b.index)
    .map(r => r.transcript)
    .join('\n\n');

  const processingDurationMs = Date.now() - startTime;

  logger.info('Large audio transcription completed', {
    filename,
    totalChunks,
    totalCost: totalCost.toFixed(4),
    processingDurationMs,
    transcriptLength: mergedTranscript.length,
  });

  return {
    transcript: mergedTranscript,
    audioDurationSeconds: audioDurationSeconds || null,
    audioDurationMinutes: audioDurationSeconds ? Math.round((audioDurationSeconds / 60) * 100) / 100 : null,
    processingDurationMs,
    estimatedCost: totalCost,
    formattedCost: `$${totalCost.toFixed(4)}`,
    model: 'whisper-1',
    responseFormat: options.responseFormat || 'text',
    filename,
    chunked: true,
    totalChunks,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  splitAudioIntoChunks,
  transcribeLargeAudio,
  isFFmpegAvailable,
  MAX_LARGE_FILE_SIZE_MB,
  MAX_LARGE_FILE_SIZE_BYTES,
  TARGET_CHUNK_SIZE_MB,
};
