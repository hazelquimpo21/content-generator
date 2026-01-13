/**
 * ============================================================================
 * STRUCTURED LOGGER MODULE
 * ============================================================================
 * Provides consistent, emoji-enhanced logging throughout the application.
 * Logs are structured JSON for easy parsing and analysis.
 *
 * Features:
 * - Color-coded console output with emojis
 * - Structured JSON format for log aggregation
 * - Auto-timestamps on all entries
 * - Context preservation (episode_id, stage, etc.)
 *
 * Usage:
 *   import logger from './lib/logger.js';
 *   logger.info('Stage completed', { episodeId, stage: 1, duration_ms: 1234 });
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Log level hierarchy (lower = more verbose)
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Emoji prefixes for each log level - makes terminal output scannable
const LOG_EMOJIS = {
  debug: '🔍',
  info: '💡',
  warn: '⚠️ ',
  error: '❌',
};

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Formats a timestamp in ISO format for consistency across logs
 * @returns {string} ISO timestamp
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Checks if a given log level should be output based on current LOG_LEVEL
 * @param {string} level - The level to check
 * @returns {boolean} True if this level should be logged
 */
function shouldLog(level) {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

/**
 * Gets color code for a log level
 * @param {string} level - Log level
 * @returns {string} ANSI color code
 */
function getLevelColor(level) {
  const colorMap = {
    debug: COLORS.dim,
    info: COLORS.cyan,
    warn: COLORS.yellow,
    error: COLORS.red,
  };
  return colorMap[level] || COLORS.reset;
}

/**
 * Formats metadata object for pretty console output
 * @param {Object} metadata - Metadata to format
 * @returns {string} Formatted string
 */
function formatMetadata(metadata) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return '';
  }

  const parts = [];

  // Prioritize important fields at the start
  const priorityFields = ['episodeId', 'episode_id', 'stage', 'duration_ms', 'cost_usd'];

  for (const field of priorityFields) {
    if (metadata[field] !== undefined) {
      parts.push(`${field}=${formatValue(metadata[field])}`);
    }
  }

  // Add remaining fields
  for (const [key, value] of Object.entries(metadata)) {
    if (!priorityFields.includes(key)) {
      parts.push(`${key}=${formatValue(value)}`);
    }
  }

  return parts.length > 0 ? `[${parts.join(', ')}]` : '';
}

/**
 * Formats a single value for display
 * @param {*} value - Value to format
 * @returns {string} Formatted value
 */
function formatValue(value) {
  if (typeof value === 'string') {
    // Truncate long strings
    return value.length > 50 ? `"${value.substring(0, 47)}..."` : `"${value}"`;
  }
  if (typeof value === 'number') {
    // Format numbers nicely
    return Number.isInteger(value) ? value.toString() : value.toFixed(4);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null || value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (typeof value === 'object') {
    return '{...}';
  }
  return String(value);
}

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

/**
 * Core logging function - formats and outputs log entries
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {string} message - Human-readable message
 * @param {Object} [metadata={}] - Structured metadata for context
 */
function log(level, message, metadata = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const timestamp = getTimestamp();
  const emoji = LOG_EMOJIS[level];
  const color = getLevelColor(level);
  const metaStr = formatMetadata(metadata);

  // Structured JSON for log aggregation (to stderr for production)
  const structuredLog = JSON.stringify({
    timestamp,
    level: level.toUpperCase(),
    service: 'podcast-pipeline',
    message,
    ...metadata,
  });

  // Pretty console output for development
  const timeStr = `${COLORS.dim}${timestamp.substring(11, 19)}${COLORS.reset}`;
  const levelStr = `${color}${level.toUpperCase().padEnd(5)}${COLORS.reset}`;
  const metaColored = metaStr ? ` ${COLORS.dim}${metaStr}${COLORS.reset}` : '';

  console.log(`${emoji} ${timeStr} ${levelStr} ${message}${metaColored}`);

  // In production, also output structured JSON to stderr
  if (process.env.NODE_ENV === 'production') {
    console.error(structuredLog);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

const logger = {
  /**
   * Debug level - detailed flow info for troubleshooting
   * @param {string} message - Log message
   * @param {Object} [metadata] - Additional context
   */
  debug(message, metadata = {}) {
    log('debug', message, metadata);
  },

  /**
   * Info level - key milestones and operations
   * @param {string} message - Log message
   * @param {Object} [metadata] - Additional context
   */
  info(message, metadata = {}) {
    log('info', message, metadata);
  },

  /**
   * Warn level - recoverable issues and retries
   * @param {string} message - Log message
   * @param {Object} [metadata] - Additional context
   */
  warn(message, metadata = {}) {
    log('warn', message, metadata);
  },

  /**
   * Error level - failures that need attention
   * @param {string} message - Log message
   * @param {Object} [metadata] - Additional context
   */
  error(message, metadata = {}) {
    log('error', message, metadata);
  },

  // =========================================================================
  // SPECIALIZED LOGGING METHODS
  // =========================================================================

  /**
   * Logs the start of a processing stage
   * @param {number} stage - Stage number (1-9)
   * @param {string} stageName - Human-readable stage name
   * @param {string} episodeId - Episode UUID
   */
  stageStart(stage, stageName, episodeId) {
    const stageEmojis = ['', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
    const emoji = stageEmojis[stage] || '📦';
    this.info(`${emoji} Starting Stage ${stage}: ${stageName}`, { episodeId, stage });
  },

  /**
   * Logs the completion of a processing stage
   * @param {number} stage - Stage number
   * @param {string} stageName - Human-readable stage name
   * @param {string} episodeId - Episode UUID
   * @param {number} durationMs - How long the stage took
   * @param {number} costUsd - Cost in USD
   */
  stageComplete(stage, stageName, episodeId, durationMs, costUsd) {
    this.info(`Stage ${stage} completed: ${stageName}`, {
      episodeId,
      stage,
      duration_ms: durationMs,
      cost_usd: costUsd,
    });
  },

  /**
   * Logs an AI API call
   * @param {string} provider - 'openai' or 'anthropic'
   * @param {string} model - Model identifier
   * @param {number} inputTokens - Tokens sent
   * @param {number} outputTokens - Tokens received
   * @param {number} durationMs - API call duration
   * @param {number} costUsd - Calculated cost
   */
  apiCall(provider, model, inputTokens, outputTokens, durationMs, costUsd) {
    const providerEmoji = provider === 'openai' ? '🤖' : '🧠';
    this.info(`${providerEmoji} AI API call completed`, {
      provider,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: durationMs,
      cost_usd: costUsd,
    });
  },

  /**
   * Logs a retry attempt
   * @param {string} operation - What's being retried
   * @param {number} attempt - Current attempt number
   * @param {number} maxAttempts - Maximum attempts allowed
   * @param {string} reason - Why retry is needed
   */
  retry(operation, attempt, maxAttempts, reason) {
    this.warn(`🔄 Retry ${attempt}/${maxAttempts}: ${operation}`, { reason });
  },

  /**
   * Logs a database query for debugging
   * @param {string} operation - Query operation (select, insert, update, delete)
   * @param {string} table - Table being queried
   * @param {Object} [metadata] - Additional query context
   */
  dbQuery(operation, table, metadata = {}) {
    this.debug(`📊 DB ${operation.toUpperCase()}: ${table}`, metadata);
  },

  /**
   * Logs successful database result
   * @param {string} operation - Query operation
   * @param {string} table - Table queried
   * @param {Object} [metadata] - Result metadata (count, duration, etc.)
   */
  dbResult(operation, table, metadata = {}) {
    this.debug(`📊 DB ${operation.toUpperCase()} completed: ${table}`, metadata);
  },

  /**
   * Logs database error with context
   * @param {string} operation - Failed operation
   * @param {string} table - Table involved
   * @param {Error|string} error - Error that occurred
   * @param {Object} [metadata] - Additional context
   */
  dbError(operation, table, error, metadata = {}) {
    this.error(`📊 DB ${operation.toUpperCase()} failed: ${table}`, {
      error: typeof error === 'string' ? error : error.message,
      ...metadata,
    });
  },

  /**
   * Logs an incoming HTTP request with details
   * @param {Object} req - Express request object
   */
  httpRequest(req) {
    const sanitizedBody = req.body ? this._sanitizeBody(req.body) : null;
    this.debug(`📥 ${req.method} ${req.path}`, {
      correlationId: req.correlationId,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      bodyKeys: sanitizedBody ? Object.keys(sanitizedBody) : undefined,
      contentLength: req.headers['content-length'],
    });
  },

  /**
   * Logs HTTP response with timing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {number} durationMs - Request duration in milliseconds
   */
  httpResponse(req, res, durationMs) {
    const statusEmoji = res.statusCode < 400 ? '✅' : res.statusCode < 500 ? '⚠️' : '❌';
    this.info(`${statusEmoji} ${req.method} ${req.path}`, {
      status: res.statusCode,
      duration_ms: durationMs,
      correlationId: req.correlationId,
      contentLength: res.get('Content-Length') || 0,
    });
  },

  /**
   * Logs validation errors with detailed context
   * @param {string} field - Field that failed validation
   * @param {string} reason - Why validation failed
   * @param {*} [value] - The invalid value (sanitized)
   */
  validationError(field, reason, value = undefined) {
    this.warn(`🚫 Validation failed: ${field}`, {
      reason,
      valueType: value !== undefined ? typeof value : undefined,
      valueLength: typeof value === 'string' ? value.length : undefined,
    });
  },

  /**
   * Logs when a requested route is not found (helpful for debugging)
   * @param {string} method - HTTP method
   * @param {string} path - Requested path
   * @param {string[]} [availableRoutes] - Suggested similar routes
   */
  routeNotFound(method, path, availableRoutes = []) {
    this.warn(`🔍 Route not found: ${method} ${path}`, {
      suggestedRoutes: availableRoutes.length > 0 ? availableRoutes : undefined,
    });
  },

  /**
   * Logs processing pipeline state changes
   * @param {string} episodeId - Episode UUID
   * @param {string} fromState - Previous state
   * @param {string} toState - New state
   * @param {Object} [metadata] - Additional context
   */
  stateChange(episodeId, fromState, toState, metadata = {}) {
    this.info(`🔄 State: ${fromState} → ${toState}`, {
      episodeId,
      ...metadata,
    });
  },

  /**
   * Logs prompt loading for AI calls
   * @param {string} stageName - Name of the stage prompt
   * @param {number} promptLength - Length of the loaded prompt
   */
  promptLoaded(stageName, promptLength) {
    this.debug(`📝 Prompt loaded: ${stageName}`, {
      promptLength,
      estimatedTokens: Math.ceil(promptLength / 4), // Rough estimate
    });
  },

  /**
   * Sanitizes request body for logging (removes sensitive/large data)
   * @param {Object} body - Request body
   * @returns {Object} Sanitized body summary
   * @private
   */
  _sanitizeBody(body) {
    const sanitized = {};
    for (const [key, value] of Object.entries(body)) {
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')) {
        sanitized[key] = '[REDACTED]';
      } else if (key === 'transcript' && typeof value === 'string') {
        sanitized[key] = `[${value.length} chars]`;
      } else if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = `[${value.length} chars]`;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = Array.isArray(value) ? `[${value.length} items]` : '{...}';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  },

  /**
   * Logs application startup banner
   * @param {number} port - Server port
   */
  startupBanner(port) {
    const banner = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🎙️  PODCAST CONTENT PIPELINE                               ║
║   ─────────────────────────────────────────────────────────   ║
║                                                               ║
║   Transform podcast transcripts into polished content         ║
║   through a sophisticated 9-stage AI pipeline                 ║
║                                                               ║
║   📍 Server running on port ${String(port).padEnd(4)}                           ║
║   📊 Log level: ${LOG_LEVEL.padEnd(6)}                                    ║
║   🌍 Environment: ${(process.env.NODE_ENV || 'development').padEnd(15)}                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;
    console.log(`${COLORS.cyan}${banner}${COLORS.reset}`);
  },
};

export default logger;
