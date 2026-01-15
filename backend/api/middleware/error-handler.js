/**
 * ============================================================================
 * ERROR HANDLER MIDDLEWARE
 * ============================================================================
 * Centralized error handling for Express routes.
 * Converts various error types to appropriate HTTP responses.
 * Includes detailed logging for debugging.
 * ============================================================================
 */

import logger from '../../lib/logger.js';
import {
  APIError,
  ValidationError,
  DatabaseError,
  NotFoundError,
  ProcessingError,
  AuthenticationError,
  AuthorizationError,
} from '../../lib/errors.js';

/**
 * Known API routes for suggesting alternatives when route not found
 */
const KNOWN_ROUTES = [
  // Authentication routes
  'POST /api/auth/magic-link',
  'GET /api/auth/me',
  'POST /api/auth/logout',
  'PUT /api/auth/profile',
  'GET /api/auth/users',
  // User settings routes
  'GET /api/settings',
  'PUT /api/settings',
  // Episode routes
  'GET /api/episodes',
  'POST /api/episodes',
  'GET /api/episodes/:id',
  'GET /api/episodes/:id/stages',
  'GET /api/episodes/:id/status',
  'POST /api/episodes/:id/process',
  'POST /api/episodes/:id/pause',
  // Stage routes
  'GET /api/stages/:id',
  'PUT /api/stages/:id',
  'POST /api/stages/:id/regenerate',
  'GET /api/stages/episode/:episodeId',
  // Evergreen content routes (system defaults)
  'GET /api/evergreen',
  'PUT /api/evergreen',
  // Admin routes (superadmin only)
  'GET /api/admin/costs',
  'GET /api/admin/performance',
  'GET /api/admin/errors',
  'GET /api/admin/usage',
  // Health check
  'GET /health',
];

/**
 * Find similar routes to the requested path
 * @param {string} method - HTTP method
 * @param {string} path - Requested path
 * @returns {string[]} Similar routes
 */
function findSimilarRoutes(method, path) {
  const pathParts = path.split('/').filter(Boolean);
  const suggestions = [];

  for (const route of KNOWN_ROUTES) {
    const [routeMethod, routePath] = route.split(' ');
    const routeParts = routePath.split('/').filter(Boolean);

    // Check if method matches or if path structure is similar
    if (routeMethod === method) {
      // Check path similarity
      let matches = 0;
      for (let i = 0; i < Math.min(pathParts.length, routeParts.length); i++) {
        if (routeParts[i].startsWith(':') || pathParts[i] === routeParts[i]) {
          matches++;
        }
      }
      if (matches >= routeParts.length - 1) {
        suggestions.push(route);
      }
    }
  }

  return suggestions.slice(0, 3);
}

/**
 * Express error handling middleware
 * Must have 4 parameters to be recognized as error middleware
 */
export function errorHandler(err, req, res, next) {
  // Log the error with detailed context
  logger.error('Request error', {
    error: err.message,
    name: err.name,
    path: req.path,
    method: req.method,
    params: Object.keys(req.params).length > 0 ? req.params : undefined,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    correlationId: req.correlationId,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Handle specific error types

  // Authentication errors (401 Unauthorized)
  if (err instanceof AuthenticationError) {
    logger.warn('Authentication failed', {
      reason: err.reason,
      path: req.path,
      method: req.method,
      correlationId: req.correlationId,
    });
    return res.status(401).json({
      error: 'Authentication Required',
      message: err.message,
      reason: err.reason,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  }

  // Authorization errors (403 Forbidden)
  if (err instanceof AuthorizationError) {
    logger.warn('Authorization denied', {
      resource: err.resource,
      reason: err.reason,
      requiredRole: err.requiredRole,
      userId: req.user?.id,
      userRole: req.user?.role,
      path: req.path,
      method: req.method,
      correlationId: req.correlationId,
    });
    return res.status(403).json({
      error: 'Access Denied',
      message: err.message,
      resource: err.resource,
      requiredRole: err.requiredRole,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  }

  if (err instanceof ValidationError) {
    logger.validationError(err.field, err.message);
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      field: err.field,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  }

  if (err instanceof NotFoundError) {
    logger.debug('Resource not found', {
      resource: err.resource,
      resourceId: err.id,
      path: req.path,
    });
    return res.status(404).json({
      error: 'Not Found',
      message: err.message,
      resource: err.resource,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  }

  if (err instanceof APIError) {
    logger.error('External API failure', {
      provider: err.provider,
      statusCode: err.statusCode,
      retryable: err.retryable,
    });
    return res.status(502).json({
      error: 'External API Error',
      message: err.message,
      provider: err.provider,
      retryable: err.retryable,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  }

  if (err instanceof DatabaseError) {
    // Enhanced logging for database errors
    logger.dbError(err.operation || 'unknown', 'unknown', err, {
      originalMessage: err.message,
      operation: err.operation,
      context: err.context,
      path: req.path,
      method: req.method,
      query: req.query,
      correlationId: req.correlationId,
    });

    // Build response with optional debug info in development
    const response = {
      error: 'Database Error',
      message: 'A database error occurred. Please try again.',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    };

    // Include detailed error info in development mode for troubleshooting
    if (process.env.NODE_ENV === 'development') {
      response.debug = {
        operation: err.operation,
        originalMessage: err.message,
        context: err.context,
        hint: 'Check server logs for full stack trace and database error details',
      };
    }

    return res.status(503).json(response);
  }

  if (err instanceof ProcessingError) {
    logger.error('Pipeline processing error', {
      episodeId: err.episodeId,
      stage: err.stage,
      stageName: err.stageName,
    });
    return res.status(500).json({
      error: 'Processing Error',
      message: err.message,
      stage: err.stage,
      stageName: err.stageName,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  }

  // Handle JSON parsing errors
  if (err.type === 'entity.parse.failed') {
    logger.warn('Invalid JSON in request body', { path: req.path });
    return res.status(400).json({
      error: 'Invalid JSON',
      message: 'Request body contains invalid JSON',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  }

  // Default 500 error
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development'
      ? err.message
      : 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId,
  });
}

/**
 * 404 handler for unknown routes
 * Includes suggestions for similar valid routes
 */
export function notFoundHandler(req, res) {
  const suggestions = findSimilarRoutes(req.method, req.path);

  // Log with suggestions for debugging
  logger.routeNotFound(req.method, req.path, suggestions);

  const response = {
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId,
  };

  // Include suggestions in development mode
  if (process.env.NODE_ENV === 'development' && suggestions.length > 0) {
    response.suggestions = suggestions;
    response.hint = 'Did you mean one of these routes?';
  }

  res.status(404).json(response);
}

export default { errorHandler, notFoundHandler };
