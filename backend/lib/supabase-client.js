/**
 * ============================================================================
 * SUPABASE CLIENT MODULE
 * ============================================================================
 * Provides database access and helper methods for the Podcast Content Pipeline.
 *
 * Features:
 * - Singleton Supabase client
 * - Type-safe repository methods for each table
 * - Real-time subscription helpers
 * - Centralized error handling
 *
 * Usage:
 *   import { db, episodeRepo, stageRepo } from './lib/supabase-client.js';
 *   const episode = await episodeRepo.findById('uuid');
 * ============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import logger from './logger.js';
import { DatabaseError, NotFoundError } from './errors.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
// Accept SUPABASE_SERVICE_KEY or SUPABASE_KEY as fallback
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

// Validate required environment variables
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  logger.error('Missing Supabase configuration', {
    hasUrl: !!SUPABASE_URL,
    hasKey: !!SUPABASE_SERVICE_KEY,
  });
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_KEY) must be set in environment');
}

// ============================================================================
// SUPABASE CLIENT (SINGLETON)
// ============================================================================

/**
 * Supabase client instance with service role for backend operations
 * Uses service role key for full database access (no RLS restrictions)
 */
export const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// ============================================================================
// STAGE NAME MAPPING
// ============================================================================

const STAGE_NAMES = {
  1: 'Transcript Analysis',
  2: 'Quote Extraction',
  3: 'Blog Outline - High Level',
  4: 'Paragraph-Level Outlines',
  5: 'Headlines & Copy Options',
  6: 'Draft Generation',
  7: 'Refinement Pass',
  8: 'Social Content',
  9: 'Email Campaign',
};

// ============================================================================
// EPISODE REPOSITORY
// ============================================================================

export const episodeRepo = {
  /**
   * Creates a new episode record
   * @param {Object} data - Episode data
   * @param {string} data.transcript - Full podcast transcript
   * @param {Object} [data.episode_context] - Optional context/hints
   * @returns {Promise<Object>} Created episode
   */
  async create(data) {
    logger.dbQuery('insert', 'episodes', {
      transcriptLength: data.transcript?.length,
      hasContext: !!data.episode_context && Object.keys(data.episode_context).length > 0,
    });

    const { data: episode, error } = await db
      .from('episodes')
      .insert({
        transcript: data.transcript,
        episode_context: data.episode_context || {},
        status: 'draft',
        current_stage: 0,
      })
      .select()
      .single();

    if (error) {
      logger.dbError('insert', 'episodes', error);
      throw new DatabaseError('insert', `Failed to create episode: ${error.message}`);
    }

    logger.dbResult('insert', 'episodes', { episodeId: episode.id });
    logger.info('Episode created', { episodeId: episode.id });
    return episode;
  },

  /**
   * Finds an episode by ID
   * @param {string} id - Episode UUID
   * @returns {Promise<Object>} Episode record
   * @throws {NotFoundError} If episode doesn't exist
   */
  async findById(id) {
    logger.dbQuery('select', 'episodes', { id });

    const { data: episode, error } = await db
      .from('episodes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !episode) {
      logger.dbError('select', 'episodes', error || 'Not found', { id });
      throw new NotFoundError('episode', id);
    }

    logger.dbResult('select', 'episodes', { id, status: episode.status });
    return episode;
  },

  /**
   * Finds an episode with all its stage outputs
   * @param {string} id - Episode UUID
   * @returns {Promise<Object>} Episode with stages array
   */
  async findByIdWithStages(id) {
    logger.dbQuery('select', 'episodes + stage_outputs', { episodeId: id });

    const { data: episode, error } = await db
      .from('episodes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !episode) {
      logger.dbError('select', 'episodes', error || 'Not found', { id });
      throw new NotFoundError('episode', id);
    }

    const { data: stages, error: stagesError } = await db
      .from('stage_outputs')
      .select('*')
      .eq('episode_id', id)
      .order('stage_number', { ascending: true });

    if (stagesError) {
      logger.dbError('select', 'stage_outputs', stagesError, { episodeId: id });
    }

    const stageCount = stages?.length || 0;
    const completedCount = stages?.filter(s => s.status === 'completed').length || 0;
    logger.dbResult('select', 'episodes + stage_outputs', {
      episodeId: id,
      stageCount,
      completedCount,
      status: episode.status,
    });

    return { ...episode, stages: stages || [] };
  },

  /**
   * Lists episodes with optional filtering
   * @param {Object} options - Query options
   * @param {string} [options.status] - Filter by status
   * @param {number} [options.limit=50] - Max results
   * @param {number} [options.offset=0] - Pagination offset
   * @returns {Promise<{episodes: Array, total: number}>}
   */
  async list({ status, limit = 50, offset = 0 } = {}) {
    let query = db
      .from('episodes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: episodes, error, count } = await query;

    if (error) {
      logger.error('Failed to list episodes', { error: error.message });
      throw new DatabaseError('select', `Failed to list episodes: ${error.message}`);
    }

    return { episodes: episodes || [], total: count || 0 };
  },

  /**
   * Updates an episode record
   * @param {string} id - Episode UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated episode
   */
  async update(id, updates) {
    const { data: episode, error } = await db
      .from('episodes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update episode', { episodeId: id, error: error.message });
      throw new DatabaseError('update', `Failed to update episode: ${error.message}`, { id });
    }

    if (!episode) {
      throw new NotFoundError('episode', id);
    }

    return episode;
  },

  /**
   * Deletes an episode and all related records (cascade)
   * @param {string} id - Episode UUID
   */
  async delete(id) {
    const { error } = await db
      .from('episodes')
      .delete()
      .eq('id', id);

    if (error) {
      throw new DatabaseError('delete', `Failed to delete episode: ${error.message}`, { id });
    }

    logger.info('Episode deleted', { episodeId: id });
  },

  /**
   * Updates episode status and optionally current stage
   * @param {string} id - Episode UUID
   * @param {string} status - New status
   * @param {number} [currentStage] - Current stage number
   */
  async updateStatus(id, status, currentStage = undefined) {
    const updates = { status };
    if (currentStage !== undefined) {
      updates.current_stage = currentStage;
    }
    if (status === 'processing' && !updates.processing_started_at) {
      updates.processing_started_at = new Date().toISOString();
    }
    if (status === 'completed') {
      updates.processing_completed_at = new Date().toISOString();
    }

    return this.update(id, updates);
  },

  /**
   * Adds cost and duration to episode totals
   * @param {string} id - Episode UUID
   * @param {number} costUsd - Cost to add
   * @param {number} durationSeconds - Duration to add
   */
  async addCostAndDuration(id, costUsd, durationSeconds) {
    const episode = await this.findById(id);

    const newCost = parseFloat(episode.total_cost_usd || 0) + costUsd;
    const newDuration = (episode.total_duration_seconds || 0) + durationSeconds;

    return this.update(id, {
      total_cost_usd: newCost,
      total_duration_seconds: newDuration,
    });
  },

  /**
   * Alias for list() - finds all episodes matching criteria
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of episodes
   */
  async findAll(options = {}) {
    const result = await this.list(options);
    return result.episodes;
  },
};

// ============================================================================
// STAGE OUTPUT REPOSITORY
// ============================================================================

export const stageRepo = {
  /**
   * Creates stage output records for all 9 stages (pending status)
   * @param {string} episodeId - Episode UUID
   * @returns {Promise<Array>} Created stage records
   */
  async createAllStages(episodeId) {
    logger.dbQuery('insert', 'stage_outputs (batch)', { episodeId, stageCount: 9 });

    const stages = [];

    for (let stageNum = 1; stageNum <= 9; stageNum++) {
      stages.push({
        episode_id: episodeId,
        stage_number: stageNum,
        stage_name: STAGE_NAMES[stageNum],
        status: 'pending',
        model_used: stageNum <= 6 ? 'gpt-4o-mini' : 'claude-sonnet-4-20250514',
        provider: stageNum <= 6 ? 'openai' : 'anthropic',
      });
    }

    const { data, error } = await db
      .from('stage_outputs')
      .insert(stages)
      .select();

    if (error) {
      logger.dbError('insert', 'stage_outputs', error, { episodeId });
      throw new DatabaseError('insert', `Failed to create stages: ${error.message}`);
    }

    logger.dbResult('insert', 'stage_outputs', { episodeId, count: data.length });
    logger.info('📋 Created all 9 stage records', { episodeId });
    return data;
  },

  /**
   * Finds a specific stage output
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number (1-9)
   * @returns {Promise<Object>} Stage record
   */
  async findByEpisodeAndStage(episodeId, stageNumber) {
    const { data: stage, error } = await db
      .from('stage_outputs')
      .select('*')
      .eq('episode_id', episodeId)
      .eq('stage_number', stageNumber)
      .single();

    if (error || !stage) {
      throw new NotFoundError('stage_output', `${episodeId}:${stageNumber}`);
    }

    return stage;
  },

  /**
   * Updates a stage output
   * @param {string} id - Stage output UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated stage
   */
  async update(id, updates) {
    const { data: stage, error } = await db
      .from('stage_outputs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new DatabaseError('update', `Failed to update stage: ${error.message}`, { id });
    }

    return stage;
  },

  /**
   * Updates stage by episode ID and stage number
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number (1-9)
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated stage
   */
  async updateByEpisodeAndStage(episodeId, stageNumber, updates) {
    const { data: stage, error } = await db
      .from('stage_outputs')
      .update(updates)
      .eq('episode_id', episodeId)
      .eq('stage_number', stageNumber)
      .select()
      .single();

    if (error) {
      throw new DatabaseError('update', `Failed to update stage: ${error.message}`);
    }

    return stage;
  },

  /**
   * Marks a stage as processing
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number (1-9)
   */
  async markProcessing(episodeId, stageNumber) {
    logger.stateChange(episodeId, 'pending', 'processing', {
      stage: stageNumber,
      stageName: STAGE_NAMES[stageNumber],
    });

    return this.updateByEpisodeAndStage(episodeId, stageNumber, {
      status: 'processing',
      started_at: new Date().toISOString(),
    });
  },

  /**
   * Marks a stage as completed with results
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number (1-9)
   * @param {Object} result - Stage results
   */
  async markCompleted(episodeId, stageNumber, result) {
    const completedAt = new Date().toISOString();
    const stage = await this.findByEpisodeAndStage(episodeId, stageNumber);

    const durationSeconds = stage.started_at
      ? Math.floor((new Date(completedAt) - new Date(stage.started_at)) / 1000)
      : 0;

    logger.stateChange(episodeId, 'processing', 'completed', {
      stage: stageNumber,
      stageName: STAGE_NAMES[stageNumber],
      durationSeconds,
      costUsd: result.cost_usd,
      inputTokens: result.input_tokens,
      outputTokens: result.output_tokens,
    });

    return this.updateByEpisodeAndStage(episodeId, stageNumber, {
      status: 'completed',
      completed_at: completedAt,
      duration_seconds: durationSeconds,
      output_data: result.output_data || null,
      output_text: result.output_text || null,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      cost_usd: result.cost_usd,
    });
  },

  /**
   * Marks a stage as failed with error details
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number (1-9)
   * @param {string} errorMessage - Error message
   * @param {Object} [errorDetails] - Full error details
   */
  async markFailed(episodeId, stageNumber, errorMessage, errorDetails = null) {
    const stage = await this.findByEpisodeAndStage(episodeId, stageNumber);

    logger.stateChange(episodeId, 'processing', 'failed', {
      stage: stageNumber,
      stageName: STAGE_NAMES[stageNumber],
      error: errorMessage,
      retryCount: (stage.retry_count || 0) + 1,
    });

    return this.updateByEpisodeAndStage(episodeId, stageNumber, {
      status: 'failed',
      error_message: errorMessage,
      error_details: errorDetails,
      retry_count: (stage.retry_count || 0) + 1,
    });
  },

  /**
   * Gets all stages for an episode
   * @param {string} episodeId - Episode UUID
   * @returns {Promise<Array>} Stage records ordered by stage number
   */
  async findAllByEpisode(episodeId) {
    logger.dbQuery('select', 'stage_outputs', { episodeId });

    const { data: stages, error } = await db
      .from('stage_outputs')
      .select('*')
      .eq('episode_id', episodeId)
      .order('stage_number', { ascending: true });

    if (error) {
      logger.dbError('select', 'stage_outputs', error, { episodeId });
      throw new DatabaseError('select', `Failed to fetch stages: ${error.message}`);
    }

    const stageCount = stages?.length || 0;
    const statusSummary = stages?.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {}) || {};

    logger.dbResult('select', 'stage_outputs', { episodeId, stageCount, statusSummary });
    return stages || [];
  },
};

// ============================================================================
// EVERGREEN CONTENT REPOSITORY
// ============================================================================

const EVERGREEN_SINGLETON_ID = '00000000-0000-0000-0000-000000000000';

export const evergreenRepo = {
  /**
   * Gets the evergreen content (singleton)
   * @returns {Promise<Object>} Evergreen content record
   */
  async get() {
    logger.dbQuery('select', 'evergreen_content', { id: EVERGREEN_SINGLETON_ID });

    const { data, error } = await db
      .from('evergreen_content')
      .select('*')
      .eq('id', EVERGREEN_SINGLETON_ID)
      .single();

    if (error) {
      logger.dbError('select', 'evergreen_content', error, {
        id: EVERGREEN_SINGLETON_ID,
        errorCode: error.code,
        errorDetails: error.details,
      });
      logger.warn('Evergreen content fetch failed, using defaults', {
        errorCode: error.code,
        errorMessage: error.message,
      });
      return {
        therapist_profile: {},
        podcast_info: {},
        voice_guidelines: {},
        seo_defaults: {},
      };
    }

    if (!data) {
      logger.warn('Evergreen content not found (no data returned), using defaults', {
        id: EVERGREEN_SINGLETON_ID,
      });
      return {
        therapist_profile: {},
        podcast_info: {},
        voice_guidelines: {},
        seo_defaults: {},
      };
    }

    logger.dbResult('select', 'evergreen_content', {
      id: EVERGREEN_SINGLETON_ID,
      hasTherapistProfile: !!data.therapist_profile && Object.keys(data.therapist_profile).length > 0,
      hasPodcastInfo: !!data.podcast_info && Object.keys(data.podcast_info).length > 0,
      hasVoiceGuidelines: !!data.voice_guidelines && Object.keys(data.voice_guidelines).length > 0,
    });

    return data;
  },

  /**
   * Updates the evergreen content
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated record
   */
  async update(updates) {
    const sectionsToUpdate = Object.keys(updates);
    logger.dbQuery('update', 'evergreen_content', {
      id: EVERGREEN_SINGLETON_ID,
      sectionsToUpdate,
      updatePayloadSize: JSON.stringify(updates).length,
    });

    logger.debug('Evergreen update payload details', {
      therapistProfileFields: updates.therapist_profile ? Object.keys(updates.therapist_profile) : [],
      podcastInfoFields: updates.podcast_info ? Object.keys(updates.podcast_info) : [],
      voiceGuidelinesFields: updates.voice_guidelines ? Object.keys(updates.voice_guidelines) : [],
      seoDefaultsFields: updates.seo_defaults ? Object.keys(updates.seo_defaults) : [],
    });

    const { data, error } = await db
      .from('evergreen_content')
      .update(updates)
      .eq('id', EVERGREEN_SINGLETON_ID)
      .select()
      .single();

    if (error) {
      logger.dbError('update', 'evergreen_content', error, {
        id: EVERGREEN_SINGLETON_ID,
        sectionsToUpdate,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
      });
      throw new DatabaseError('update', `Failed to update evergreen content: ${error.message}`);
    }

    if (!data) {
      logger.error('Evergreen update returned no data - record may not exist', {
        id: EVERGREEN_SINGLETON_ID,
        sectionsToUpdate,
      });
      throw new DatabaseError('update', 'Evergreen content update returned no data - singleton record may be missing');
    }

    logger.dbResult('update', 'evergreen_content', {
      id: EVERGREEN_SINGLETON_ID,
      sectionsUpdated: sectionsToUpdate,
      updatedAt: data.updated_at,
    });

    logger.info('Evergreen content updated successfully', {
      sectionsUpdated: sectionsToUpdate,
      updatedAt: data.updated_at,
    });

    return data;
  },
};

// ============================================================================
// API USAGE LOG REPOSITORY
// ============================================================================

export const apiLogRepo = {
  /**
   * Logs an API call
   * @param {Object} data - API usage data
   * @returns {Promise<Object>} Created log entry
   */
  async create(data) {
    const { data: log, error } = await db
      .from('api_usage_log')
      .insert({
        provider: data.provider,
        model: data.model,
        endpoint: data.endpoint || '/chat/completions',
        input_tokens: data.input_tokens,
        output_tokens: data.output_tokens,
        cost_usd: data.cost_usd,
        episode_id: data.episode_id || null,
        stage_number: data.stage_number || null,
        response_time_ms: data.response_time_ms || null,
        success: data.success ?? true,
        error_message: data.error_message || null,
      })
      .select()
      .single();

    if (error) {
      // Don't throw - logging shouldn't break the app
      logger.warn('Failed to log API usage', { error: error.message });
      return null;
    }

    return log;
  },

  /**
   * Gets cost summary for a date range
   * @param {Date} startDate - Start of range
   * @param {Date} endDate - End of range
   * @returns {Promise<Object>} Cost summary
   */
  async getCostSummary(startDate, endDate) {
    const { data, error } = await db
      .from('api_usage_log')
      .select('provider, cost_usd, input_tokens, output_tokens')
      .gte('timestamp', startDate.toISOString())
      .lt('timestamp', endDate.toISOString());

    if (error) {
      throw new DatabaseError('select', `Failed to get cost summary: ${error.message}`);
    }

    // Aggregate the results
    const summary = {
      total_cost_usd: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cost_by_provider: { openai: 0, anthropic: 0 },
      api_calls: data?.length || 0,
    };

    for (const row of data || []) {
      summary.total_cost_usd += parseFloat(row.cost_usd) || 0;
      summary.total_input_tokens += row.input_tokens || 0;
      summary.total_output_tokens += row.output_tokens || 0;
      summary.cost_by_provider[row.provider] += parseFloat(row.cost_usd) || 0;
    }

    return summary;
  },

  /**
   * Gets recent errors
   * @param {number} [limit=20] - Max results
   * @returns {Promise<Array>} Error log entries
   */
  async getRecentErrors(limit = 20) {
    const { data, error } = await db
      .from('api_usage_log')
      .select('*')
      .eq('success', false)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError('select', `Failed to get error logs: ${error.message}`);
    }

    return data || [];
  },

  /**
   * Gets API usage logs for a date range
   * @param {string} startDate - ISO date string
   * @param {string} endDate - ISO date string
   * @returns {Promise<Array>} Usage log entries
   */
  async getByDateRange(startDate, endDate) {
    const { data, error } = await db
      .from('api_usage_log')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error) {
      throw new DatabaseError('select', `Failed to get usage logs: ${error.message}`);
    }

    return data || [];
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  db,
  episodeRepo,
  stageRepo,
  evergreenRepo,
  apiLogRepo,
  STAGE_NAMES,
};
