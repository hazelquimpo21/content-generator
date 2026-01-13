/**
 * ============================================================================
 * CUSTOM ERROR CLASSES
 * ============================================================================
 * Provides specific error types for different failure scenarios.
 * Each error includes a 'retryable' flag to help with retry logic.
 *
 * Error Types:
 * - APIError: External API failures (OpenAI, Anthropic)
 * - ValidationError: Invalid input or response data
 * - DatabaseError: Supabase/PostgreSQL failures
 * - TimeoutError: Operation took too long
 * - ProcessingError: Pipeline processing failures
 * - AuthenticationError: Missing or invalid authentication
 * - AuthorizationError: Insufficient permissions
 *
 * Usage:
 *   import { APIError, ValidationError, AuthenticationError } from './lib/errors.js';
 *   throw new APIError('openai', 429, 'Rate limit exceeded');
 *   throw new AuthenticationError('Invalid token');
 * ============================================================================
 */

// ============================================================================
// BASE ERROR CLASS
// ============================================================================

/**
 * Base error class that all custom errors extend
 * Provides common functionality like serialization
 */
class BaseError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace in V8 environments (Node.js, Chrome)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts error to a JSON-serializable object
   * Useful for logging and API responses
   * @returns {Object} Serialized error
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      retryable: this.retryable || false,
    };
  }
}

// ============================================================================
// API ERROR
// ============================================================================

/**
 * Error thrown when an external AI API call fails
 *
 * @example
 * throw new APIError('openai', 429, 'Rate limit exceeded');
 * throw new APIError('anthropic', 500, 'Internal server error');
 */
export class APIError extends BaseError {
  /**
   * @param {string} provider - API provider ('openai' | 'anthropic')
   * @param {number} statusCode - HTTP status code from the API
   * @param {string} message - Human-readable error message
   * @param {Object} [details] - Additional error details from the API
   */
  constructor(provider, statusCode, message, details = null) {
    super(message);
    this.provider = provider;
    this.statusCode = statusCode;
    this.details = details;

    // Certain status codes indicate transient errors that can be retried
    // 429: Rate limit (wait and retry)
    // 500: Internal server error (might work on retry)
    // 502: Bad gateway (usually temporary)
    // 503: Service unavailable (wait and retry)
    this.retryable = [429, 500, 502, 503].includes(statusCode);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      provider: this.provider,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

// ============================================================================
// VALIDATION ERROR
// ============================================================================

/**
 * Error thrown when input or response data fails validation
 * These errors should NOT be retried as the data itself is invalid
 *
 * @example
 * throw new ValidationError('transcript', 'Must be at least 500 characters');
 * throw new ValidationError('stage_1_output', 'Missing required field: episode_crux');
 */
export class ValidationError extends BaseError {
  /**
   * @param {string} field - The field or data that failed validation
   * @param {string} reason - Why validation failed
   * @param {*} [value] - The invalid value (be careful with PII)
   */
  constructor(field, reason, value = undefined) {
    super(`Validation failed for '${field}': ${reason}`);
    this.field = field;
    this.reason = reason;
    this.value = value;

    // Validation errors are never retryable - the data needs to change
    this.retryable = false;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      field: this.field,
      reason: this.reason,
      // Only include value if it's a simple type (avoid logging sensitive data)
      value: typeof this.value === 'string' || typeof this.value === 'number'
        ? this.value
        : undefined,
    };
  }
}

// ============================================================================
// DATABASE ERROR
// ============================================================================

/**
 * Error thrown when a database operation fails
 *
 * @example
 * throw new DatabaseError('insert', 'Failed to create episode');
 * throw new DatabaseError('select', 'Episode not found', { episodeId });
 */
export class DatabaseError extends BaseError {
  /**
   * @param {string} operation - Database operation that failed (select, insert, update, delete)
   * @param {string} message - Human-readable error message
   * @param {Object} [context] - Additional context (table name, IDs, etc.)
   */
  constructor(operation, message, context = {}) {
    super(message);
    this.operation = operation;
    this.context = context;

    // Database errors are usually retryable (connection issues, timeouts)
    // Except for constraint violations which aren't included here
    this.retryable = true;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      operation: this.operation,
      context: this.context,
    };
  }
}

// ============================================================================
// TIMEOUT ERROR
// ============================================================================

/**
 * Error thrown when an operation exceeds its time limit
 *
 * @example
 * throw new TimeoutError('OpenAI API call', 30000);
 * throw new TimeoutError('Stage 6 processing', 120000);
 */
export class TimeoutError extends BaseError {
  /**
   * @param {string} operation - What operation timed out
   * @param {number} timeoutMs - The timeout limit that was exceeded
   */
  constructor(operation, timeoutMs) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.operation = operation;
    this.timeoutMs = timeoutMs;

    // Timeouts are usually retryable (network issues, high load)
    this.retryable = true;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      operation: this.operation,
      timeoutMs: this.timeoutMs,
    };
  }
}

// ============================================================================
// PROCESSING ERROR
// ============================================================================

/**
 * Error thrown during episode processing pipeline
 *
 * @example
 * throw new ProcessingError(3, 'Blog Outline', 'Failed to generate outline', episodeId);
 */
export class ProcessingError extends BaseError {
  /**
   * @param {number} stage - Stage number (1-9) where error occurred
   * @param {string} stageName - Human-readable stage name
   * @param {string} message - What went wrong
   * @param {string} [episodeId] - Episode being processed
   * @param {Error} [cause] - Underlying error that caused this
   */
  constructor(stage, stageName, message, episodeId = null, cause = null) {
    super(`Stage ${stage} (${stageName}) failed: ${message}`);
    this.stage = stage;
    this.stageName = stageName;
    this.episodeId = episodeId;
    this.cause = cause;

    // Retryability depends on the underlying cause
    this.retryable = cause ? (cause.retryable || false) : true;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      stage: this.stage,
      stageName: this.stageName,
      episodeId: this.episodeId,
      cause: this.cause ? this.cause.toJSON?.() || this.cause.message : null,
    };
  }
}

// ============================================================================
// AUTHENTICATION ERROR
// ============================================================================

/**
 * Error thrown when authentication fails or is missing.
 * Used when a user's identity cannot be verified.
 *
 * @example
 * throw new AuthenticationError('No authentication token provided');
 * throw new AuthenticationError('Invalid or expired token');
 * throw new AuthenticationError('User session has expired');
 */
export class AuthenticationError extends BaseError {
  /**
   * @param {string} reason - Why authentication failed
   * @param {Object} [details] - Additional details (avoid including sensitive data)
   */
  constructor(reason, details = null) {
    super(`Authentication failed: ${reason}`);
    this.reason = reason;
    this.details = details;

    // Authentication errors should NOT be retried with same credentials
    this.retryable = false;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      reason: this.reason,
      // Only include details if they're safe to expose
      details: this.details,
    };
  }
}

// ============================================================================
// AUTHORIZATION ERROR
// ============================================================================

/**
 * Error thrown when a user lacks permission to perform an action.
 * Used when authentication succeeds but access is denied.
 *
 * @example
 * throw new AuthorizationError('admin', 'Only superadmins can access this resource');
 * throw new AuthorizationError('episode', 'You do not have permission to view this episode');
 */
export class AuthorizationError extends BaseError {
  /**
   * @param {string} resource - Resource or action that was denied
   * @param {string} reason - Why authorization failed
   * @param {string} [requiredRole] - Role required for access (optional)
   */
  constructor(resource, reason, requiredRole = null) {
    super(`Authorization denied for '${resource}': ${reason}`);
    this.resource = resource;
    this.reason = reason;
    this.requiredRole = requiredRole;

    // Authorization errors should NOT be retried with same credentials
    this.retryable = false;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      resource: this.resource,
      reason: this.reason,
      requiredRole: this.requiredRole,
    };
  }
}

// ============================================================================
// NOT FOUND ERROR
// ============================================================================

/**
 * Error thrown when a requested resource doesn't exist
 *
 * @example
 * throw new NotFoundError('episode', episodeId);
 * throw new NotFoundError('stage_output', stageId);
 */
export class NotFoundError extends BaseError {
  /**
   * @param {string} resource - Type of resource not found
   * @param {string} identifier - ID or identifier of the missing resource
   */
  constructor(resource, identifier) {
    super(`${resource} not found: ${identifier}`);
    this.resource = resource;
    this.identifier = identifier;

    // Not found errors shouldn't be retried - the resource doesn't exist
    this.retryable = false;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      resource: this.resource,
      identifier: this.identifier,
    };
  }
}

// ============================================================================
// ERROR UTILITIES
// ============================================================================

/**
 * Wraps an unknown error into a typed error for consistent handling
 * @param {*} error - Any error or thrown value
 * @param {string} [context] - Context about where error occurred
 * @returns {BaseError} A typed error instance
 */
export function wrapError(error, context = 'Unknown operation') {
  // Already a custom error - return as-is
  if (error instanceof BaseError) {
    return error;
  }

  // Standard Error - wrap in ProcessingError
  if (error instanceof Error) {
    const wrapped = new ProcessingError(0, context, error.message);
    wrapped.cause = error;
    wrapped.stack = error.stack;
    return wrapped;
  }

  // String or other value - create generic error
  return new ProcessingError(0, context, String(error));
}

/**
 * Checks if an error is retryable
 * @param {*} error - Error to check
 * @returns {boolean} True if the error can be retried
 */
export function isRetryable(error) {
  if (error instanceof BaseError) {
    return error.retryable;
  }
  // Unknown errors - default to not retryable for safety
  return false;
}

export default {
  APIError,
  ValidationError,
  DatabaseError,
  TimeoutError,
  ProcessingError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  wrapError,
  isRetryable,
};
