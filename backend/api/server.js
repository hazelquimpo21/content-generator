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

// Load environment variables FIRST (before any other imports that need them)
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// Import our modules
import logger from '../lib/logger.js';
import { requestLogger, correlationId } from './middleware/logger-middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

// Import routes
import authRouter from './routes/auth.js';
import settingsRouter from './routes/settings.js';
import episodesRouter from './routes/episodes.js';
import stagesRouter from './routes/stages.js';
import evergreenRouter from './routes/evergreen.js';
import adminRouter from './routes/admin.js';
import libraryRouter from './routes/library.js';
import calendarRouter from './routes/calendar.js';
import topicsRouter from './routes/topics.js';
import pillarsRouter from './routes/pillars.js';
import brandDiscoveryRouter from './routes/brand-discovery.js';
import transcriptionRouter from './routes/transcription.js';
import podcastsRouter from './routes/podcasts.js';

// ============================================================================
// APP CONFIGURATION
// ============================================================================

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// MIDDLEWARE SETUP
// ============================================================================

// Debug: Log all incoming requests immediately (before any other middleware)
app.use((req, res, next) => {
  console.log(`[DEBUG] Incoming request: ${req.method} ${req.url} Content-Type: ${req.headers['content-type']} Content-Length: ${req.headers['content-length']}`);

  // Add error handlers to catch socket issues
  req.on('error', (err) => {
    console.error('[DEBUG] Request stream error:', err.message);
  });
  res.on('error', (err) => {
    console.error('[DEBUG] Response stream error:', err.message);
  });
  req.socket?.on('error', (err) => {
    console.error('[DEBUG] Socket error:', err.message);
  });

  next();
});

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
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
      auth: '/api/auth',
      settings: '/api/settings',
      episodes: '/api/episodes',
      stages: '/api/stages',
      evergreen: '/api/evergreen',
      admin: '/api/admin',
      library: '/api/library',
      calendar: '/api/calendar',
      topics: '/api/topics',
      pillars: '/api/pillars',
      brandDiscovery: '/api/brand-discovery',
      transcription: '/api/transcription',
      podcasts: '/api/podcasts',
    },
    documentation: 'See /docs for API documentation',
  });
});

// ============================================================================
// API ROUTES
// ============================================================================

// Mount route handlers
// Auth routes (no authentication required for magic link)
app.use('/api/auth', authRouter);

// User-scoped settings (requires authentication)
app.use('/api/settings', settingsRouter);

// Episode and content routes
app.use('/api/episodes', episodesRouter);
app.use('/api/stages', stagesRouter);

// Legacy evergreen content (system defaults, superadmin only for updates)
app.use('/api/evergreen', evergreenRouter);

// Admin routes (superadmin only)
app.use('/api/admin', adminRouter);

// Content Library and Calendar routes (user-scoped)
app.use('/api/library', libraryRouter);
app.use('/api/calendar', calendarRouter);

// Topics and Pillars routes (user-scoped content organization)
app.use('/api/topics', topicsRouter);
app.use('/api/pillars', pillarsRouter);

// Brand Discovery routes (user-scoped onboarding)
app.use('/api/brand-discovery', brandDiscoveryRouter);

// Audio transcription routes (Whisper API)
app.use('/api/transcription', transcriptionRouter);

// Podcast RSS feed routes (import, sync, transcribe from feed)
app.use('/api/podcasts', podcastsRouter);

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
  logger.startupBanner(PORT);

  // Validate environment
  if (!validateEnvironment()) {
    logger.error('Server startup aborted due to missing configuration');
    process.exit(1);
  }

  // Start listening
  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server started successfully`, {
      port: PORT,
      environment: NODE_ENV,
      pid: process.pid,
    });

    logger.info('📍 Available endpoints:', {
      health: `http://localhost:${PORT}/health`,
      api: `http://localhost:${PORT}/api`,
      auth: `http://localhost:${PORT}/api/auth`,
      settings: `http://localhost:${PORT}/api/settings`,
      episodes: `http://localhost:${PORT}/api/episodes`,
      stages: `http://localhost:${PORT}/api/stages`,
      evergreen: `http://localhost:${PORT}/api/evergreen`,
      admin: `http://localhost:${PORT}/api/admin`,
      library: `http://localhost:${PORT}/api/library`,
      calendar: `http://localhost:${PORT}/api/calendar`,
      topics: `http://localhost:${PORT}/api/topics`,
      pillars: `http://localhost:${PORT}/api/pillars`,
      transcription: `http://localhost:${PORT}/api/transcription`,
      podcasts: `http://localhost:${PORT}/api/podcasts`,
    });

    if (NODE_ENV === 'development') {
      logger.info('💡 Development mode - CORS is permissive');
    }
  });

  // Set longer timeout for large file uploads and transcriptions
  // 15 minutes to handle long transcriptions (large audio files can take 5-10+ minutes)
  server.timeout = 900000; // 15 minutes
  server.headersTimeout = 910000; // Should be larger than timeout
  server.keepAliveTimeout = 905000;

  // Debug: Add server-level error handlers
  server.on('error', (err) => {
    console.error('[DEBUG] Server error:', err.message, err.code);
  });

  server.on('clientError', (err, socket) => {
    console.error('[DEBUG] Client error:', err.message, err.code);
    // Don't destroy socket immediately - let it drain
    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
  });

  // Log when connections are established
  server.on('connection', (socket) => {
    console.log('[DEBUG] New connection from:', socket.remoteAddress);
    socket.on('error', (err) => {
      console.error('[DEBUG] Connection socket error:', err.message, err.code);
    });
    socket.on('close', (hadError) => {
      if (hadError) {
        console.error('[DEBUG] Connection closed with error');
      }
    });
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
