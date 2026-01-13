/**
 * ============================================================================
 * EXPRESS API SERVER
 * ============================================================================
 * Main entry point for the backend API server.
 * Configures Express with all routes, middleware, and error handling.
 *
 * Usage:
 *   npm run dev     - Start with nodemon for development
 *   npm start       - Start for production
 *
 * Environment Variables:
 *   PORT            - Server port (default: 3001)
 *   NODE_ENV        - Environment (development/production)
 *   SUPABASE_URL    - Supabase project URL
 *   SUPABASE_KEY    - Supabase service role key
 *   OPENAI_API_KEY  - OpenAI API key
 *   ANTHROPIC_API_KEY - Anthropic API key
 * ============================================================================
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from 'dotenv';

// Load environment variables
config();

// Import our modules
import logger from '../lib/logger.js';
import { requestLogger, correlationId } from './middleware/logger-middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

// Import routes
import episodesRouter from './routes/episodes.js';
import stagesRouter from './routes/stages.js';
import evergreenRouter from './routes/evergreen.js';
import adminRouter from './routes/admin.js';

// ============================================================================
// APP CONFIGURATION
// ============================================================================

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// MIDDLEWARE SETUP
// ============================================================================

// Add correlation ID to all requests (for tracing)
app.use(correlationId);

// Security middleware
app.use(helmet({
  // Allow cross-origin requests for API
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration
app.use(cors({
  origin: NODE_ENV === 'production'
    ? process.env.FRONTEND_URL || 'http://localhost:5173'
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  credentials: true,
}));

// Compression for responses
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' })); // Large limit for transcripts
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// ============================================================================
// HEALTH CHECK & INFO ROUTES
// ============================================================================

/**
 * GET /health
 * Health check endpoint for monitoring
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
  });
});

/**
 * GET /
 * API info endpoint
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Podcast-to-Content Pipeline API',
    version: '1.0.0',
    description: 'Transform podcast transcripts into polished content',
    endpoints: {
      health: '/health',
      episodes: '/api/episodes',
      stages: '/api/stages',
      evergreen: '/api/evergreen',
      admin: '/api/admin',
    },
    documentation: 'See /docs for API documentation',
  });
});

// ============================================================================
// API ROUTES
// ============================================================================

// Mount route handlers
app.use('/api/episodes', episodesRouter);
app.use('/api/stages', stagesRouter);
app.use('/api/evergreen', evergreenRouter);
app.use('/api/admin', adminRouter);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ============================================================================
// SERVER STARTUP
// ============================================================================

/**
 * Validates that required environment variables are set
 * @returns {boolean} True if all required vars are present
 */
function validateEnvironment() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    return false;
  }

  return true;
}

/**
 * Starts the Express server
 */
async function startServer() {
  // Print startup banner
  logger.banner();

  // Validate environment
  if (!validateEnvironment()) {
    logger.error('Server startup aborted due to missing configuration');
    process.exit(1);
  }

  // Start listening
  app.listen(PORT, () => {
    logger.info(`🚀 Server started successfully`, {
      port: PORT,
      environment: NODE_ENV,
      pid: process.pid,
    });

    logger.info('📍 Available endpoints:', {
      health: `http://localhost:${PORT}/health`,
      api: `http://localhost:${PORT}/api`,
      episodes: `http://localhost:${PORT}/api/episodes`,
      stages: `http://localhost:${PORT}/api/stages`,
      evergreen: `http://localhost:${PORT}/api/evergreen`,
      admin: `http://localhost:${PORT}/api/admin`,
    });

    if (NODE_ENV === 'development') {
      logger.info('💡 Development mode - CORS is permissive');
    }
  });
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

/**
 * Handles graceful shutdown signals
 * @param {string} signal - The signal received
 */
function handleShutdown(signal) {
  logger.info(`\n🛑 Received ${signal}. Shutting down gracefully...`);

  // Give ongoing requests time to complete
  setTimeout(() => {
    logger.info('👋 Server stopped. Goodbye!');
    process.exit(0);
  }, 1000);
}

// Register shutdown handlers
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
  });
});

// ============================================================================
// START THE SERVER
// ============================================================================

startServer();

export default app;
