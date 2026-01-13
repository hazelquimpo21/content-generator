/**
 * ============================================================================
 * ADMIN ROUTES
 * ============================================================================
 * API endpoints for admin dashboard, analytics, and system monitoring.
 * IMPORTANT: All routes require superadmin role (hazel@theclever.io).
 *
 * Routes:
 * GET /api/admin/costs       - Get cost analytics
 * GET /api/admin/performance - Get performance metrics
 * GET /api/admin/errors      - Get recent errors
 * GET /api/admin/usage       - Get API usage statistics
 *
 * Authorization:
 * - All routes require authentication
 * - All routes require superadmin role
 * - Non-superadmins will receive 403 Forbidden
 * ============================================================================
 */

import { Router } from 'express';
import { apiLogRepo, episodeRepo, stageRepo } from '../../lib/supabase-client.js';
import { requireAuth, requireSuperadmin } from '../middleware/auth-middleware.js';
import logger from '../../lib/logger.js';

const router = Router();

// ============================================================================
// MIDDLEWARE: Apply superadmin check to ALL admin routes
// ============================================================================

// All routes in this file require authentication AND superadmin role
router.use(requireAuth, requireSuperadmin);

// ============================================================================
// COST ANALYTICS
// ============================================================================

/**
 * GET /api/admin/costs
 * Get cost analytics for a time period
 *
 * Query params:
 * - period: 'day' | 'week' | 'month' (default: 'week')
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 */
router.get('/costs', async (req, res, next) => {
  try {
    const { period = 'week', startDate, endDate } = req.query;

    logger.info('📥 GET /api/admin/costs - Fetching cost analytics', {
      period,
      hasCustomDateRange: !!(startDate && endDate),
      startDate: startDate || 'auto',
      endDate: endDate || 'auto',
    });

    // Calculate date range based on period
    const now = new Date();
    let start, end;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = now;
      switch (period) {
        case 'day':
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'month':
          start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'week':
        default:
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
    }

    logger.debug('GET /api/admin/costs - Date range calculated', {
      start: start.toISOString(),
      end: end.toISOString(),
    });

    // Get usage logs for the period
    const usageLogs = await apiLogRepo.getByDateRange(start.toISOString(), end.toISOString());

    logger.debug('GET /api/admin/costs - Usage logs fetched', {
      logCount: usageLogs.length,
    });

    // Calculate totals
    const totalCost = usageLogs.reduce((sum, log) => sum + (log.cost_usd || 0), 0);
    const totalInputTokens = usageLogs.reduce((sum, log) => sum + (log.input_tokens || 0), 0);
    const totalOutputTokens = usageLogs.reduce((sum, log) => sum + (log.output_tokens || 0), 0);

    // Group by provider
    const byProvider = {};
    for (const log of usageLogs) {
      const provider = log.provider || 'unknown';
      if (!byProvider[provider]) {
        byProvider[provider] = {
          calls: 0,
          cost: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      byProvider[provider].calls++;
      byProvider[provider].cost += log.cost_usd || 0;
      byProvider[provider].inputTokens += log.input_tokens || 0;
      byProvider[provider].outputTokens += log.output_tokens || 0;
    }

    // Group by model
    const byModel = {};
    for (const log of usageLogs) {
      const model = log.model || 'unknown';
      if (!byModel[model]) {
        byModel[model] = {
          calls: 0,
          cost: 0,
        };
      }
      byModel[model].calls++;
      byModel[model].cost += log.cost_usd || 0;
    }

    // Group by stage
    const byStage = {};
    for (const log of usageLogs) {
      const stage = log.stage_number || 0;
      if (!byStage[stage]) {
        byStage[stage] = {
          calls: 0,
          cost: 0,
        };
      }
      byStage[stage].calls++;
      byStage[stage].cost += log.cost_usd || 0;
    }

    // Daily breakdown (using 'timestamp' column from api_usage_log table)
    const byDay = {};
    for (const log of usageLogs) {
      // Handle both 'timestamp' (correct) and 'created_at' (legacy) columns
      const timestampField = log.timestamp || log.created_at;
      if (timestampField) {
        const day = timestampField.split('T')[0];
        if (!byDay[day]) {
          byDay[day] = { cost: 0, calls: 0 };
        }
        byDay[day].cost += log.cost_usd || 0;
        byDay[day].calls++;
      }
    }

    logger.info('📤 GET /api/admin/costs - Success', {
      totalCost: totalCost.toFixed(4),
      totalCalls: usageLogs.length,
      providerCount: Object.keys(byProvider).length,
      modelCount: Object.keys(byModel).length,
    });

    res.json({
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        label: period,
      },
      totals: {
        cost: totalCost,
        calls: usageLogs.length,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        averageCostPerCall: usageLogs.length > 0 ? totalCost / usageLogs.length : 0,
      },
      byProvider,
      byModel,
      byStage,
      byDay,
    });
  } catch (error) {
    logger.error('❌ GET /api/admin/costs - Failed', {
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
      errorDetails: error.details,
      errorHint: error.hint,
      operation: error.operation,
      period: req.query.period,
      correlationId: req.correlationId,
      stack: error.stack,
    });
    next(error);
  }
});

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

/**
 * GET /api/admin/performance
 * Get processing performance metrics
 */
router.get('/performance', async (req, res, next) => {
  try {
    const { limit = 100 } = req.query;

    logger.info('📥 GET /api/admin/performance - Fetching performance metrics', {
      limit: parseInt(limit, 10),
    });

    // Get recent completed episodes
    const episodes = await episodeRepo.findAll({
      status: 'completed',
      limit: parseInt(limit, 10),
    });

    logger.debug('GET /api/admin/performance - Episodes fetched', {
      completedEpisodeCount: episodes.length,
    });

    if (episodes.length === 0) {
      logger.info('📤 GET /api/admin/performance - No completed episodes found');
      return res.json({
        message: 'No completed episodes yet',
        metrics: null,
      });
    }

    // Calculate averages
    const durations = episodes
      .filter(e => e.total_duration_seconds)
      .map(e => e.total_duration_seconds);

    const costs = episodes
      .filter(e => e.total_cost_usd)
      .map(e => e.total_cost_usd);

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const avgCost = costs.length > 0
      ? costs.reduce((a, b) => a + b, 0) / costs.length
      : 0;

    // Get stage timing data
    const stageMetrics = {};
    for (const episode of episodes.slice(0, 20)) {
      const stages = await stageRepo.findAllByEpisode(episode.id);
      for (const stage of stages) {
        if (stage.status === 'completed' && stage.duration_ms) {
          if (!stageMetrics[stage.stage_number]) {
            stageMetrics[stage.stage_number] = {
              name: stage.stage_name,
              durations: [],
              costs: [],
            };
          }
          stageMetrics[stage.stage_number].durations.push(stage.duration_ms);
          if (stage.cost_usd) {
            stageMetrics[stage.stage_number].costs.push(stage.cost_usd);
          }
        }
      }
    }

    // Calculate stage averages
    const stageAverages = {};
    for (const [stageNum, data] of Object.entries(stageMetrics)) {
      stageAverages[stageNum] = {
        name: data.name,
        avgDurationMs: data.durations.reduce((a, b) => a + b, 0) / data.durations.length,
        avgCost: data.costs.length > 0
          ? data.costs.reduce((a, b) => a + b, 0) / data.costs.length
          : 0,
        sampleSize: data.durations.length,
      };
    }

    logger.info('📤 GET /api/admin/performance - Success', {
      episodesAnalyzed: episodes.length,
      avgDurationSeconds: Math.round(avgDuration),
      avgCostUsd: avgCost.toFixed(4),
      stageMetricsCount: Object.keys(stageAverages).length,
    });

    res.json({
      episodesAnalyzed: episodes.length,
      overall: {
        avgDurationSeconds: Math.round(avgDuration),
        avgCostUsd: avgCost,
        minDuration: durations.length > 0 ? Math.min(...durations) : 0,
        maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
        minCost: costs.length > 0 ? Math.min(...costs) : 0,
        maxCost: costs.length > 0 ? Math.max(...costs) : 0,
      },
      byStage: stageAverages,
    });
  } catch (error) {
    logger.error('❌ GET /api/admin/performance - Failed', {
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
      errorDetails: error.details,
      errorHint: error.hint,
      operation: error.operation,
      limit: req.query.limit,
      correlationId: req.correlationId,
      stack: error.stack,
    });
    next(error);
  }
});

// ============================================================================
// ERROR TRACKING
// ============================================================================

/**
 * GET /api/admin/errors
 * Get recent processing errors
 */
router.get('/errors', async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;

    logger.info('📥 GET /api/admin/errors - Fetching recent errors', {
      limit: parseInt(limit, 10),
    });

    // Get episodes with errors
    const errorEpisodes = await episodeRepo.findAll({
      status: 'error',
      limit: parseInt(limit, 10),
    });

    // Get failed stages
    const failedStages = [];
    for (const episode of errorEpisodes.slice(0, 20)) {
      const stages = await stageRepo.findAllByEpisode(episode.id);
      const failed = stages.filter(s => s.status === 'failed');
      for (const stage of failed) {
        failedStages.push({
          episodeId: episode.id,
          episodeTitle: episode.episode_context?.title || 'Untitled',
          stageNumber: stage.stage_number,
          stageName: stage.stage_name,
          error: stage.error_message,
          errorDetails: stage.error_details,
          failedAt: stage.updated_at,
        });
      }
    }

    // Group errors by type
    const errorsByType = {};
    for (const error of failedStages) {
      const type = categorizeError(error.error || '');
      if (!errorsByType[type]) {
        errorsByType[type] = [];
      }
      errorsByType[type].push(error);
    }

    logger.info('📤 GET /api/admin/errors - Success', {
      totalErrors: failedStages.length,
      errorEpisodeCount: errorEpisodes.length,
      errorTypeCount: Object.keys(errorsByType).length,
    });

    res.json({
      totalErrors: failedStages.length,
      recentErrors: failedStages.slice(0, parseInt(limit, 10)),
      byType: Object.entries(errorsByType).map(([type, errors]) => ({
        type,
        count: errors.length,
        recent: errors.slice(0, 3),
      })),
      errorEpisodes: errorEpisodes.map(e => ({
        id: e.id,
        title: e.episode_context?.title || 'Untitled',
        error: e.error_message,
        failedAt: e.updated_at,
        currentStage: e.current_stage,
      })),
    });
  } catch (error) {
    logger.error('❌ GET /api/admin/errors - Failed', {
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
      errorDetails: error.details,
      errorHint: error.hint,
      operation: error.operation,
      limit: req.query.limit,
      correlationId: req.correlationId,
      stack: error.stack,
    });
    next(error);
  }
});

/**
 * GET /api/admin/usage
 * Get overall API usage statistics
 */
router.get('/usage', async (req, res, next) => {
  try {
    logger.info('📥 GET /api/admin/usage - Fetching usage statistics');

    // Get episode counts by status
    const allEpisodes = await episodeRepo.findAll({ limit: 1000 });

    logger.debug('GET /api/admin/usage - Episodes fetched', {
      totalEpisodes: allEpisodes.length,
    });

    const statusCounts = {
      pending: 0,
      processing: 0,
      completed: 0,
      error: 0,
    };

    for (const episode of allEpisodes) {
      if (statusCounts[episode.status] !== undefined) {
        statusCounts[episode.status]++;
      }
    }

    // Get total API usage
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const usageLogs = await apiLogRepo.getByDateRange(
      thirtyDaysAgo.toISOString(),
      new Date().toISOString()
    );

    const totalCost30Days = usageLogs.reduce((sum, log) => sum + (log.cost_usd || 0), 0);
    const totalCalls30Days = usageLogs.length;

    // Project monthly cost
    const daysTracked = Math.min(30, Math.ceil((Date.now() - thirtyDaysAgo.getTime()) / (24 * 60 * 60 * 1000)));
    const dailyAvgCost = daysTracked > 0 ? totalCost30Days / daysTracked : 0;
    const projectedMonthlyCost = dailyAvgCost * 30;

    logger.info('📤 GET /api/admin/usage - Success', {
      totalEpisodes: allEpisodes.length,
      completedEpisodes: statusCounts.completed,
      errorEpisodes: statusCounts.error,
      totalCalls30Days,
      totalCost30Days: totalCost30Days.toFixed(4),
      projectedMonthlyCost: projectedMonthlyCost.toFixed(2),
    });

    res.json({
      episodes: {
        total: allEpisodes.length,
        byStatus: statusCounts,
        successRate: allEpisodes.length > 0
          ? (statusCounts.completed / allEpisodes.length) * 100
          : 0,
      },
      apiUsage: {
        last30Days: {
          calls: totalCalls30Days,
          cost: totalCost30Days,
        },
        dailyAverage: {
          calls: Math.round(totalCalls30Days / Math.max(daysTracked, 1)),
          cost: dailyAvgCost,
        },
        projectedMonthlyCost,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('❌ GET /api/admin/usage - Failed', {
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
      errorDetails: error.details,
      errorHint: error.hint,
      operation: error.operation,
      correlationId: req.correlationId,
      stack: error.stack,
    });
    next(error);
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Categorizes an error message into a type
 * @param {string} errorMessage - The error message
 * @returns {string} Error category
 */
function categorizeError(errorMessage) {
  const message = errorMessage.toLowerCase();

  if (message.includes('rate limit') || message.includes('429')) {
    return 'rate_limit';
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  if (message.includes('api') || message.includes('500') || message.includes('502') || message.includes('503')) {
    return 'api_error';
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return 'validation';
  }
  if (message.includes('parse') || message.includes('json')) {
    return 'parsing';
  }
  if (message.includes('not found') || message.includes('404')) {
    return 'not_found';
  }

  return 'other';
}

export default router;
