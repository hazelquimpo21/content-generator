/**
 * ============================================================================
 * LOGGER MIDDLEWARE
 * ============================================================================
 * Logs incoming HTTP requests with timing information and debugging details.
 *
 * Features:
 * - Correlation ID tracking for request tracing
 * - Detailed request logging (method, path, query, body summary)
 * - Response timing and status logging
 * - Parameter extraction logging for debugging
 * ============================================================================
 */

import logger from '../../lib/logger.js';
import { randomUUID } from 'crypto';

/**
 * Correlation ID middleware
 * Adds a unique ID to each request for tracing across logs
 */
export function correlationId(req, res, next) {
  const id = req.headers['x-correlation-id'] || randomUUID();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
}

/**
 * Request logging middleware
 * Logs method, path, status code, and response time
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Log incoming request details (debug level for verbose info)
  logger.httpRequest(req);

  // Log URL params if present (helpful for debugging route matching)
  if (Object.keys(req.params).length > 0) {
    logger.debug(`📎 Route params extracted`, {
      params: req.params,
      path: req.path,
      correlationId: req.correlationId,
    });
  }

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.httpResponse(req, res, duration);

    // Additional logging for slow requests (> 5 seconds)
    if (duration > 5000) {
      logger.warn(`🐢 Slow request detected`, {
        method: req.method,
        path: req.path,
        duration_ms: duration,
        correlationId: req.correlationId,
      });
    }

    // Log error responses with more context
    if (res.statusCode >= 400) {
      logger.debug(`📋 Error response details`, {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        params: Object.keys(req.params).length > 0 ? req.params : undefined,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        correlationId: req.correlationId,
      });
    }
  });

  next();
}

export default requestLogger;
