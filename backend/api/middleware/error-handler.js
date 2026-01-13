/**
 * ============================================================================
 * ERROR HANDLER MIDDLEWARE
 * ============================================================================
 * Centralized error handling for Express routes.
 * Converts various error types to appropriate HTTP responses.
 * ============================================================================
 */

import logger from '../../lib/logger.js';
import {
  APIError,
  ValidationError,
  DatabaseError,
  NotFoundError,
  ProcessingError,
} from '../../lib/errors.js';

/**
 * Express error handling middleware
 * Must have 4 parameters to be recognized as error middleware
 */
export function errorHandler(err, req, res, next) {
  // Log the error
  logger.error('Request error', {
    error: err.message,
    name: err.name,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Handle specific error types
  if (err instanceof ValidationError) {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      field: err.field,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({
      error: 'Not Found',
      message: err.message,
      resource: err.resource,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof APIError) {
    return res.status(502).json({
      error: 'External API Error',
      message: err.message,
      provider: err.provider,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof DatabaseError) {
    return res.status(503).json({
      error: 'Database Error',
      message: 'A database error occurred. Please try again.',
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof ProcessingError) {
    return res.status(500).json({
      error: 'Processing Error',
      message: err.message,
      stage: err.stage,
      stageName: err.stageName,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle JSON parsing errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON',
      message: 'Request body contains invalid JSON',
      timestamp: new Date().toISOString(),
    });
  }

  // Default 500 error
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development'
      ? err.message
      : 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  });
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  });
}

export default { errorHandler, notFoundHandler };
