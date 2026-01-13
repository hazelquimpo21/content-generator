/**
 * ============================================================================
 * LOGGER MIDDLEWARE
 * ============================================================================
 * Logs incoming HTTP requests with timing information.
 * ============================================================================
 */

import logger from '../../lib/logger.js';

/**
 * Request logging middleware
 * Logs method, path, status code, and response time
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusEmoji = res.statusCode < 400 ? '✅' : res.statusCode < 500 ? '⚠️' : '❌';

    logger.info(`${statusEmoji} ${req.method} ${req.path}`, {
      status: res.statusCode,
      duration_ms: duration,
      contentLength: res.get('Content-Length') || 0,
    });
  });

  next();
}

export default requestLogger;
