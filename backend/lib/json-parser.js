/**
 * ============================================================================
 * ROBUST JSON PARSER FOR AI RESPONSES
 * ============================================================================
 * Provides utilities for parsing JSON from AI responses that may contain:
 * - Unescaped control characters (newlines, tabs, etc.)
 * - Markdown code blocks (```json ... ```)
 * - Extra text before/after the JSON
 * - Malformed escape sequences
 *
 * This module centralizes JSON parsing logic to ensure consistent handling
 * across all pipeline stages.
 *
 * Usage:
 *   import { parseAIJsonResponse, sanitizeJsonString } from './lib/json-parser.js';
 *   const data = parseAIJsonResponse(aiResponse.content);
 * ============================================================================
 */

import logger from './logger.js';
import { ValidationError } from './errors.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Analyzes a JSON parse error to provide detailed diagnostic information.
 * Helps identify exactly where and what character caused the parsing failure.
 *
 * @param {string} content - The JSON string that failed to parse
 * @param {Error} error - The JSON parse error
 * @returns {Object} Details about the error location and context
 */
function analyzeJsonParseError(content, error) {
  const result = {
    errorMessage: error.message,
    position: null,
    context: null,
    problematicChar: null,
    controlCharsFound: [],
  };

  // Try to extract position from error message (e.g., "at position 1234")
  const positionMatch = error.message.match(/position\s+(\d+)/i);
  if (positionMatch) {
    result.position = parseInt(positionMatch[1], 10);

    // Get context around the error position (30 chars before and after)
    const start = Math.max(0, result.position - 30);
    const end = Math.min(content.length, result.position + 30);
    result.context = content.substring(start, end);

    // Identify the problematic character at that position
    if (result.position < content.length) {
      const char = content[result.position];
      result.problematicChar = {
        char: char,
        charCode: char.charCodeAt(0),
        isControlChar: char.charCodeAt(0) >= 0 && char.charCodeAt(0) <= 31,
        displayCode: `0x${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
      };
    }
  }

  // Scan for all unusual control characters in the first 5000 chars
  // (excluding common whitespace: tab, newline, carriage return)
  for (let i = 0; i < Math.min(content.length, 5000); i++) {
    const charCode = content.charCodeAt(i);
    if (charCode >= 0 && charCode <= 31 && charCode !== 10 && charCode !== 13 && charCode !== 9) {
      result.controlCharsFound.push({
        position: i,
        charCode,
        displayCode: `0x${charCode.toString(16).padStart(2, '0')}`,
      });
    }
  }

  return result;
}

// ============================================================================
// SANITIZATION
// ============================================================================

/**
 * Sanitizes a JSON string by properly escaping control characters
 * that may appear within string values from AI responses.
 *
 * Common issues handled:
 * - Unescaped newlines (\n) within string values
 * - Unescaped tabs (\t) within string values
 * - Unescaped carriage returns (\r) within string values
 * - Other control characters (0x00-0x1F)
 * - Backslash followed by actual control character (not escape sequence)
 *
 * Edge cases handled:
 * - `\"` -> keeps as valid escaped quote
 * - `\\` -> keeps as valid escaped backslash
 * - `\` + actual newline char -> converts to proper `\n` escape sequence
 * - Raw control characters in strings -> escapes them properly
 *
 * @param {string} jsonStr - Raw JSON string potentially containing control characters
 * @returns {string} Sanitized JSON string with properly escaped control characters
 */
export function sanitizeJsonString(jsonStr) {
  logger.debug('🧹 Sanitizing JSON string for control characters', {
    originalLength: jsonStr.length,
  });

  // State machine approach: track whether we're inside a string value
  let result = '';
  let inString = false;
  let escapeNext = false;
  let controlCharsEscaped = 0;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    const charCode = char.charCodeAt(0);

    // -------------------------------------------------------------------------
    // HANDLE ESCAPED CHARACTERS
    // When escapeNext is true, the previous character was a backslash.
    // We need to check if this character is:
    // 1. A valid escape char (", \, /, b, f, n, r, t, u) -> keep as-is
    // 2. A control character -> convert to proper escape sequence
    // 3. Something else -> keep as-is (let JSON.parse handle any errors)
    // -------------------------------------------------------------------------
    if (escapeNext) {
      // Check if this is a control character that needs special handling
      // This handles edge cases where AI outputs backslash + actual newline
      // instead of backslash + letter 'n'
      if (charCode >= 0 && charCode <= 31) {
        // Control character after backslash - convert to proper JSON escape
        // The backslash was likely intended to escape this char
        logger.debug('🔧 Converting control char after backslash to escape sequence', {
          charCode,
          position: i,
        });
        switch (charCode) {
          case 9: // Tab -> \t
            result += 't';
            break;
          case 10: // Newline (LF) -> \n
            result += 'n';
            break;
          case 13: // Carriage return (CR) -> \r
            result += 'r';
            break;
          case 8: // Backspace -> \b
            result += 'b';
            break;
          case 12: // Form feed -> \f
            result += 'f';
            break;
          default:
            // For other control chars, use unicode escape
            // Need to remove the backslash we added and use full \uXXXX
            result = result.slice(0, -1); // Remove the backslash
            result += '\\u' + charCode.toString(16).padStart(4, '0');
        }
        controlCharsEscaped++;
      } else {
        // Normal escaped character (valid escape sequence) - keep as is
        result += char;
      }
      escapeNext = false;
      continue;
    }

    // -------------------------------------------------------------------------
    // HANDLE BACKSLASH IN STRING
    // Mark the next character as escaped
    // -------------------------------------------------------------------------
    if (char === '\\' && inString) {
      result += char;
      escapeNext = true;
      continue;
    }

    // -------------------------------------------------------------------------
    // HANDLE QUOTES
    // Toggle string state on unescaped quotes
    // -------------------------------------------------------------------------
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    // -------------------------------------------------------------------------
    // HANDLE CONTROL CHARACTERS IN STRINGS
    // Any control character (0x00-0x1F) inside a string must be escaped
    // -------------------------------------------------------------------------
    if (inString && charCode >= 0 && charCode <= 31) {
      // Control character inside string - must be escaped
      switch (charCode) {
        case 9: // Tab
          result += '\\t';
          break;
        case 10: // Newline (LF)
          result += '\\n';
          break;
        case 13: // Carriage return (CR)
          result += '\\r';
          break;
        case 8: // Backspace
          result += '\\b';
          break;
        case 12: // Form feed
          result += '\\f';
          break;
        default:
          // Other control chars - use unicode escape
          result += '\\u' + charCode.toString(16).padStart(4, '0');
      }
      controlCharsEscaped++;
      logger.debug('🔧 Escaped control character in JSON string', {
        charCode,
        position: i,
      });
    } else {
      result += char;
    }
  }

  // Log sanitization summary if changes were made
  if (controlCharsEscaped > 0) {
    logger.info('✅ JSON string sanitized', {
      originalLength: jsonStr.length,
      sanitizedLength: result.length,
      controlCharsEscaped,
    });
  }

  return result;
}

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parses JSON from an AI response with robust error handling.
 * Tries multiple strategies to extract valid JSON from the response.
 *
 * Parsing strategy (in order):
 * 1. Direct JSON.parse on raw content
 * 2. JSON.parse on sanitized content (escapes control chars)
 * 3. Extract from ```json code block and parse
 * 4. Extract from ```json code block, sanitize, and parse
 * 5. Extract object pattern ({...}) and parse
 * 6. Extract object pattern, sanitize, and parse
 *
 * @param {string} content - Raw response content from AI
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.context] - Context for logging (e.g., 'stage-8', 'email')
 * @returns {Object} Parsed JSON object
 * @throws {ValidationError} If no valid JSON can be extracted after all attempts
 */
export function parseAIJsonResponse(content, options = {}) {
  const context = options.context || 'json-parser';

  logger.debug(`🔍 [${context}] Attempting to extract JSON from AI response`, {
    contentLength: content.length,
  });

  // -------------------------------------------------------------------------
  // STRATEGY 1: Direct parse on raw content
  // -------------------------------------------------------------------------
  try {
    return JSON.parse(content);
  } catch (directError) {
    logger.debug(`⚠️ [${context}] Strategy 1 failed: Direct parse`, {
      error: directError.message,
    });
  }

  // -------------------------------------------------------------------------
  // STRATEGY 2: Parse sanitized content
  // -------------------------------------------------------------------------
  try {
    const sanitized = sanitizeJsonString(content);
    return JSON.parse(sanitized);
  } catch (sanitizedError) {
    logger.debug(`⚠️ [${context}] Strategy 2 failed: Sanitized parse`, {
      error: sanitizedError.message,
    });
  }

  // -------------------------------------------------------------------------
  // STRATEGY 3 & 4: Extract from code block
  // -------------------------------------------------------------------------
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    const codeBlockContent = jsonMatch[1].trim();

    // Strategy 3: Direct parse of code block
    try {
      return JSON.parse(codeBlockContent);
    } catch (codeBlockError) {
      logger.debug(`⚠️ [${context}] Strategy 3 failed: Code block direct parse`, {
        error: codeBlockError.message,
      });

      // Strategy 4: Sanitized code block
      try {
        const sanitizedCodeBlock = sanitizeJsonString(codeBlockContent);
        return JSON.parse(sanitizedCodeBlock);
      } catch (sanitizedCodeBlockError) {
        const errorAnalysis = analyzeJsonParseError(codeBlockContent, sanitizedCodeBlockError);
        logger.warn(`⚠️ [${context}] Strategy 4 failed: Sanitized code block parse`, {
          error: sanitizedCodeBlockError.message,
          position: errorAnalysis.position,
          problematicChar: errorAnalysis.problematicChar,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // STRATEGY 5 & 6: Extract JSON object pattern
  // -------------------------------------------------------------------------
  const objectMatch = content.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const objectContent = objectMatch[0];

    // Strategy 5: Direct parse of object pattern
    try {
      return JSON.parse(objectContent);
    } catch (objectError) {
      logger.debug(`⚠️ [${context}] Strategy 5 failed: Object pattern direct parse`, {
        error: objectError.message,
      });

      // Strategy 6: Sanitized object pattern
      try {
        const sanitizedObject = sanitizeJsonString(objectContent);
        return JSON.parse(sanitizedObject);
      } catch (sanitizedObjectError) {
        const errorAnalysis = analyzeJsonParseError(objectContent, sanitizedObjectError);
        logger.error(`❌ [${context}] Strategy 6 failed: All parsing strategies exhausted`, {
          error: sanitizedObjectError.message,
          position: errorAnalysis.position,
          context: errorAnalysis.context,
          problematicChar: errorAnalysis.problematicChar,
          controlCharsFound: errorAnalysis.controlCharsFound.slice(0, 5),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // ALL STRATEGIES FAILED
  // -------------------------------------------------------------------------
  logger.error(`❌ [${context}] All JSON extraction strategies failed`, {
    contentLength: content.length,
    contentPreview: content.substring(0, 300),
    hasCodeBlock: !!jsonMatch,
    hasObjectPattern: !!objectMatch,
  });

  throw new ValidationError(
    'response',
    `Could not extract valid JSON from AI response - all 6 parsing strategies failed`
  );
}

/**
 * Simple JSON parser that tries direct parse, then code block extraction.
 * Use this for simpler cases where control characters are unlikely.
 *
 * @param {string} content - Raw response content
 * @returns {Object} Parsed JSON object
 * @throws {Error} If parsing fails
 */
export function parseJsonCodeBlock(content) {
  // Try to extract JSON from code block first
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);

  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }

  // Fall back to direct parsing
  return JSON.parse(content);
}

export default {
  parseAIJsonResponse,
  parseJsonCodeBlock,
  sanitizeJsonString,
};
