/**
 * ============================================================================
 * RETRY LOGIC MODULE
 * ============================================================================
 * Provides robust retry mechanisms with exponential backoff for API calls
 * and other potentially flaky operations.
 *
 * Features:
 * - Exponential backoff with jitter
 * - Configurable retry conditions
 * - Timeout handling
 * - Detailed logging of retry attempts
 *
 * Usage:
 *   import { retryWithBackoff, withTimeout } from './lib/retry-logic.js';
 *
 *   const result = await retryWithBackoff(
 *     () => callAPI(),
 *     { maxRetries: 3, initialDelayMs: 1000 }
 *   );
 * ============================================================================
 */

import logger from './logger.js';
import { TimeoutError, isRetryable } from './errors.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  jitterFactor: 0.2, // 20% random jitter to prevent thundering herd
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Sleeps for the specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculates delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {Object} options - Backoff options
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt, options) {
  const { initialDelayMs, maxDelayMs, backoffFactor, jitterFactor } = options;

  // Base exponential delay
  const baseDelay = initialDelayMs * Math.pow(backoffFactor, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(baseDelay, maxDelayMs);

  // Add random jitter to prevent thundering herd
  const jitter = cappedDelay * jitterFactor * (Math.random() - 0.5) * 2;
  const finalDelay = Math.max(0, cappedDelay + jitter);

  return Math.floor(finalDelay);
}

/**
 * Determines if an error should trigger a retry
 * @param {Error} error - The error to check
 * @param {Function} [shouldRetryFn] - Custom retry condition function
 * @returns {boolean} True if should retry
 */
function shouldRetry(error, shouldRetryFn) {
  // If custom function provided, use it
  if (typeof shouldRetryFn === 'function') {
    return shouldRetryFn(error);
  }

  // Default: check error's retryable flag
  return isRetryable(error);
}

// ============================================================================
// MAIN RETRY FUNCTION
// ============================================================================

/**
 * Executes a function with retry logic and exponential backoff
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} [options] - Retry configuration
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.initialDelayMs=1000] - Initial delay between retries
 * @param {number} [options.maxDelayMs=30000] - Maximum delay cap
 * @param {number} [options.backoffFactor=2] - Multiplier for each retry
 * @param {number} [options.jitterFactor=0.2] - Random jitter percentage
 * @param {string} [options.operationName] - Name for logging
 * @param {Function} [options.shouldRetry] - Custom function to determine if error is retryable
 * @param {Function} [options.onRetry] - Callback before each retry
 * @returns {Promise<*>} Result of the function
 * @throws {Error} Last error after all retries exhausted
 *
 * @example
 * const result = await retryWithBackoff(
 *   () => fetch('https://api.example.com/data'),
 *   {
 *     maxRetries: 5,
 *     operationName: 'Fetch user data',
 *     onRetry: (attempt, error) => console.log(`Retry ${attempt}`)
 *   }
 * );
 */
export async function retryWithBackoff(fn, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const { maxRetries, operationName = 'Operation' } = config;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // First attempt (attempt 0) is not a retry
      if (attempt > 0) {
        const delay = calculateDelay(attempt - 1, config);

        logger.retry(operationName, attempt, maxRetries, lastError?.message || 'Unknown error');

        // Call onRetry callback if provided
        if (typeof config.onRetry === 'function') {
          config.onRetry(attempt, lastError, delay);
        }

        await sleep(delay);
      }

      // Execute the function
      const result = await fn();
      return result;

    } catch (error) {
      lastError = error;

      // Check if we should retry
      const canRetry = attempt < maxRetries && shouldRetry(error, config.shouldRetry);

      if (!canRetry) {
        // Log final failure
        logger.error(`${operationName} failed after ${attempt + 1} attempt(s)`, {
          error: error.message,
          attempts: attempt + 1,
          maxRetries: maxRetries + 1,
        });
        throw error;
      }

      // Will retry on next iteration
      logger.debug(`${operationName} failed, will retry`, {
        attempt: attempt + 1,
        error: error.message,
      });
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}

// ============================================================================
// TIMEOUT WRAPPER
// ============================================================================

/**
 * Wraps a promise with a timeout
 *
 * @param {Promise|Function} promiseOrFn - Promise or async function to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [operationName='Operation'] - Name for error message
 * @returns {Promise<*>} Result of the promise
 * @throws {TimeoutError} If operation exceeds timeout
 *
 * @example
 * const result = await withTimeout(
 *   fetch('https://api.example.com/slow-endpoint'),
 *   5000,
 *   'API fetch'
 * );
 */
export async function withTimeout(promiseOrFn, timeoutMs, operationName = 'Operation') {
  // Convert function to promise if needed
  const promise = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;

  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================================
// COMBINED RETRY WITH TIMEOUT
// ============================================================================

/**
 * Executes a function with both retry logic and per-attempt timeout
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Configuration options
 * @param {number} options.timeoutMs - Timeout per attempt
 * @param {number} [options.maxRetries] - Maximum retries
 * @param {string} [options.operationName] - Name for logging
 * @returns {Promise<*>} Result of the function
 *
 * @example
 * const result = await retryWithTimeout(
 *   () => callSlowAPI(),
 *   { timeoutMs: 30000, maxRetries: 3, operationName: 'API call' }
 * );
 */
export async function retryWithTimeout(fn, options = {}) {
  const { timeoutMs, operationName = 'Operation', ...retryOptions } = options;

  if (!timeoutMs) {
    // No timeout specified, just use regular retry
    return retryWithBackoff(fn, { ...retryOptions, operationName });
  }

  // Wrap the function with timeout for each attempt
  const wrappedFn = () => withTimeout(fn, timeoutMs, operationName);

  return retryWithBackoff(wrappedFn, {
    ...retryOptions,
    operationName,
    // TimeoutErrors are retryable by default
    shouldRetry: (error) => {
      if (error instanceof TimeoutError) return true;
      return isRetryable(error);
    },
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a retry configuration for API calls
 * Sensible defaults for external API rate limits
 *
 * @param {string} provider - API provider name for logging
 * @returns {Object} Retry configuration
 */
export function createAPIRetryConfig(provider) {
  return {
    maxRetries: 3,
    initialDelayMs: 2000,  // Start with 2 second delay
    maxDelayMs: 60000,     // Cap at 1 minute
    backoffFactor: 2,
    operationName: `${provider} API call`,
    shouldRetry: (error) => {
      // Always retry rate limits and server errors
      if (error.statusCode === 429) return true;  // Rate limit
      if (error.statusCode >= 500) return true;   // Server error
      return isRetryable(error);
    },
  };
}

/**
 * Creates a retry configuration for database operations
 *
 * @returns {Object} Retry configuration
 */
export function createDatabaseRetryConfig() {
  return {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffFactor: 2,
    operationName: 'Database operation',
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  retryWithBackoff,
  withTimeout,
  retryWithTimeout,
  createAPIRetryConfig,
  createDatabaseRetryConfig,
};
