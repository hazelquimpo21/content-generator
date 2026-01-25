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
  0: 'Transcript Preprocessing',  // Uses Claude Haiku (200K context) for long transcripts
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

/**
 * Stage 8 sub-stage names for platform-specific social content
 */
const STAGE_8_SUBSTAGE_NAMES = {
  instagram: 'Social Content (Instagram)',
  twitter: 'Social Content (Twitter/X)',
  linkedin: 'Social Content (LinkedIn)',
  facebook: 'Social Content (Facebook)',
};

/**
 * Valid sub-stages for Stage 8
 */
const STAGE_8_SUBSTAGES = ['instagram', 'twitter', 'linkedin', 'facebook'];

// ============================================================================
// EPISODE REPOSITORY
// ============================================================================

export const episodeRepo = {
  /**
   * Creates a new episode record
   * @param {Object} data - Episode data
   * @param {string} data.transcript - Full podcast transcript
   * @param {Object} [data.episode_context] - Optional context/hints
   * @param {string} [data.user_id] - Owner user ID for multi-user support
   * @returns {Promise<Object>} Created episode
   */
  async create(data) {
    logger.dbQuery('insert', 'episodes', {
      transcriptLength: data.transcript?.length,
      hasContext: !!data.episode_context && Object.keys(data.episode_context).length > 0,
      hasUserId: !!data.user_id,
      sourceType: data.source_type || 'transcript',
      hasAudioMetadata: !!data.audio_metadata,
    });

    // Build insert object - only include user_id if provided
    const insertData = {
      transcript: data.transcript,
      episode_context: data.episode_context || {},
      status: 'draft',
      current_stage: 0,
    };

    // Add user_id for multi-user support (optional for backwards compatibility)
    if (data.user_id) {
      insertData.user_id = data.user_id;
    }

    // Add audio source fields if provided
    if (data.source_type) {
      insertData.source_type = data.source_type;
    }
    if (data.audio_metadata) {
      insertData.audio_metadata = data.audio_metadata;
    }

    const { data: episode, error } = await db
      .from('episodes')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.dbError('insert', 'episodes', error);
      throw new DatabaseError('insert', `Failed to create episode: ${error.message}`);
    }

    logger.dbResult('insert', 'episodes', {
      episodeId: episode.id,
      userId: episode.user_id,
      sourceType: episode.source_type,
    });
    logger.info('Episode created', {
      episodeId: episode.id,
      userId: episode.user_id,
      sourceType: episode.source_type,
    });
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
   * @param {string} [options.userId] - Filter by owner user ID (for multi-user support)
   * @param {number} [options.limit=50] - Max results
   * @param {number} [options.offset=0] - Pagination offset
   * @returns {Promise<{episodes: Array, total: number}>}
   */
  async list({ status, userId, limit = 50, offset = 0 } = {}) {
    logger.dbQuery('select', 'episodes', {
      status,
      userId,
      limit,
      offset,
    });

    let query = db
      .from('episodes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Filter by user_id for multi-user support
    // This allows users to see only their own episodes
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: episodes, error, count } = await query;

    if (error) {
      logger.error('Failed to list episodes', {
        error: error.message,
        userId,
        status,
      });
      throw new DatabaseError('select', `Failed to list episodes: ${error.message}`);
    }

    logger.dbResult('select', 'episodes', {
      count: episodes?.length || 0,
      total: count || 0,
      userId,
    });

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
   * Creates stage output records for all 10 stages (0-9, pending status)
   *
   * Pipeline Architecture:
   * ----------------------
   * - Stage 0: Transcript Preprocessing (Claude Haiku, 200K context)
   *            Automatically skipped for short transcripts (<8000 tokens)
   * - Stages 1-6: Analysis and Drafting (GPT-5 mini)
   *            Core content analysis and blog post drafting
   * - Stages 7-9: Refinement and Distribution (Claude Sonnet)
   *            Polish, social content, and email campaign generation
   *
   * Database Requirements:
   * ----------------------
   * IMPORTANT: The stage_outputs table must have the constraint:
   *   CHECK (stage_number >= 0 AND stage_number <= 9)
   *
   * If you see errors like "new row for relation 'stage_outputs' violates check
   * constraint", the database constraint needs to be updated to allow stage 0.
   * Run migration: 003_fix_stage_outputs_constraint.sql
   *
   * @param {string} episodeId - Episode UUID
   * @returns {Promise<Array>} Created stage records (10 stages)
   * @throws {DatabaseError} If insert fails (check constraint, foreign key, etc.)
   *
   * @example
   * const stages = await stageRepo.createAllStages('episode-uuid');
   * // stages = [{stage_number: 0, status: 'pending', ...}, ...]
   */
  async createAllStages(episodeId) {
    // Stage 8 is now split into 4 platform-specific sub-stages
    // Total records: 10 (stages 0-7, 9) + 4 (stage 8 platforms) = 13
    const totalRecords = 13;

    // Check if stages already exist for this episode (idempotent operation)
    const { data: existingStages, error: checkError } = await db
      .from('stage_outputs')
      .select('id, stage_number, sub_stage')
      .eq('episode_id', episodeId)
      .limit(1);

    if (checkError) {
      logger.dbError('select', 'stage_outputs', checkError, {
        episodeId,
        operation: 'checkExistingStages',
      });
      throw new DatabaseError('select', `Failed to check existing stages: ${checkError.message}`);
    }

    // If stages already exist, return them instead of trying to create duplicates
    if (existingStages && existingStages.length > 0) {
      logger.info('📋 Stages already exist, skipping creation', { episodeId });
      const { data: allStages, error: fetchError } = await db
        .from('stage_outputs')
        .select('*')
        .eq('episode_id', episodeId)
        .order('stage_number', { ascending: true });

      if (fetchError) {
        throw new DatabaseError('select', `Failed to fetch existing stages: ${fetchError.message}`);
      }
      return allStages;
    }

    // Log the batch insert operation with full context for debugging
    logger.dbQuery('insert', 'stage_outputs (batch)', {
      episodeId,
      stageCount: totalRecords,
      stageRange: '0-9 (with 4 Stage 8 sub-stages)',
      operation: 'createAllStages',
    });

    const stages = [];

    // Build stage records for stages 0-7 and 9
    for (let stageNum = 0; stageNum <= 9; stageNum++) {
      let model, provider;

      if (stageNum === 0) {
        // Stage 0: Preprocessing uses Claude Haiku (200K context window)
        model = 'claude-3-5-haiku-20241022';
        provider = 'anthropic';
      } else if (stageNum <= 6) {
        // Stages 1-6: GPT-5 mini for analysis and drafting
        model = 'gpt-5-mini';
        provider = 'openai';
      } else {
        // Stages 7-9: Claude Sonnet for refinement and distribution
        model = 'claude-sonnet-4-20250514';
        provider = 'anthropic';
      }

      // Stage 8 is special - create 4 platform-specific sub-stages instead of 1
      if (stageNum === 8) {
        for (const platform of STAGE_8_SUBSTAGES) {
          stages.push({
            episode_id: episodeId,
            stage_number: 8,
            sub_stage: platform,
            stage_name: STAGE_8_SUBSTAGE_NAMES[platform],
            status: 'pending',
            model_used: model,
            provider: provider,
          });
        }
      } else {
        stages.push({
          episode_id: episodeId,
          stage_number: stageNum,
          sub_stage: null,
          stage_name: STAGE_NAMES[stageNum],
          status: 'pending',
          model_used: model,
          provider: provider,
        });
      }
    }

    // Log the stages we're about to insert for debugging constraint issues
    logger.debug('Preparing to insert stage records', {
      episodeId,
      stageNumbers: stages.map(s => s.stage_number),
      subStages: stages.map(s => s.sub_stage).filter(Boolean),
      stageNames: stages.map(s => s.stage_name),
    });

    const { data, error } = await db
      .from('stage_outputs')
      .insert(stages)
      .select();

    if (error) {
      // Provide detailed error logging for debugging
      // Common errors:
      // - CHECK constraint violation: stage_number out of allowed range (0-9)
      // - Foreign key violation: episode_id doesn't exist
      // - Unique constraint violation: stages already exist for this episode
      logger.dbError('insert', 'stage_outputs', error, {
        episodeId,
        stageCount: stages.length,
        stageRange: '0-9',
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
      });

      // Check for specific constraint violation error and provide helpful message
      if (error.message?.includes('violates check constraint') ||
          error.message?.includes('violates c') ||
          error.code === '23514') {
        logger.error('CHECK constraint violation detected', {
          episodeId,
          hint: 'The stage_outputs table constraint may only allow stage_number 1-9. ' +
                'Run migration 003_fix_stage_outputs_constraint.sql to allow stage 0.',
          stageNumbers: stages.map(s => s.stage_number),
        });
        throw new DatabaseError(
          'insert',
          `Failed to create stages: Database constraint violation. ` +
          `The stage_outputs table may not allow stage 0. ` +
          `Run migration 003_fix_stage_outputs_constraint.sql to fix. ` +
          `Original error: ${error.message}`
        );
      }

      throw new DatabaseError('insert', `Failed to create stages: ${error.message}`);
    }

    // Log successful creation with metrics
    logger.dbResult('insert', 'stage_outputs', {
      episodeId,
      count: data.length,
      stagesCreated: data.map(s => s.stage_number),
    });
    logger.info('📋 Created all 10 stage records (0-9)', {
      episodeId,
      stageCount: data.length,
    });

    return data;
  },

  /**
   * Finds a specific stage output by episode ID, stage number, and optional sub-stage
   *
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number (0-9)
   * @param {string|null} [subStage=null] - Sub-stage for Stage 8 (instagram, twitter, linkedin, facebook)
   * @returns {Promise<Object>} Stage record with all fields
   * @throws {NotFoundError} If stage record doesn't exist for the given episode/stage/subStage
   *
   * @example
   * // Regular stage
   * const stage = await stageRepo.findByEpisodeAndStage('uuid', 0);
   *
   * // Stage 8 with sub-stage
   * const stage = await stageRepo.findByEpisodeAndStage('uuid', 8, 'instagram');
   */
  async findByEpisodeAndStage(episodeId, stageNumber, subStage = null) {
    const stageName = subStage
      ? STAGE_8_SUBSTAGE_NAMES[subStage] || `Stage ${stageNumber} (${subStage})`
      : STAGE_NAMES[stageNumber];

    logger.debug('Finding stage output', {
      episodeId,
      stageNumber,
      subStage,
      stageName,
    });

    let query = db
      .from('stage_outputs')
      .select('*')
      .eq('episode_id', episodeId)
      .eq('stage_number', stageNumber);

    // Handle sub_stage filtering
    if (subStage) {
      query = query.eq('sub_stage', subStage);
    } else if (stageNumber !== 8) {
      // For non-Stage 8, sub_stage should be null
      query = query.is('sub_stage', null);
    }
    // Note: If stageNumber is 8 and no subStage is provided, this will fail
    // because Stage 8 always requires a subStage

    const { data: stage, error } = await query.single();

    if (error || !stage) {
      logger.debug('Stage output not found', {
        episodeId,
        stageNumber,
        subStage,
        stageName,
        error: error?.message,
      });
      const stageIdentifier = subStage
        ? `${episodeId}:${stageNumber}:${subStage}`
        : `${episodeId}:${stageNumber}`;
      throw new NotFoundError('stage_output', stageIdentifier);
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
   * Updates stage by episode ID, stage number, and optional sub-stage
   *
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number (0-9)
   * @param {Object} updates - Fields to update
   * @param {string|null} [subStage=null] - Sub-stage for Stage 8 (instagram, twitter, linkedin, facebook)
   * @returns {Promise<Object>} Updated stage
   * @throws {DatabaseError} If update fails or stage record doesn't exist
   *
   * Common failure scenarios:
   * - Stage record doesn't exist (stages weren't created before processing)
   * - Multiple rows match (data integrity issue)
   * - Database connection error
   */
  async updateByEpisodeAndStage(episodeId, stageNumber, updates, subStage = null) {
    const stageName = subStage
      ? STAGE_8_SUBSTAGE_NAMES[subStage] || `Stage ${stageNumber} (${subStage})`
      : STAGE_NAMES[stageNumber];

    logger.debug('Updating stage by episode and stage number', {
      episodeId,
      stageNumber,
      subStage,
      stageName,
      updateFields: Object.keys(updates),
    });

    let query = db
      .from('stage_outputs')
      .update(updates)
      .eq('episode_id', episodeId)
      .eq('stage_number', stageNumber);

    // Handle sub_stage filtering
    if (subStage) {
      query = query.eq('sub_stage', subStage);
    } else if (stageNumber !== 8) {
      // For non-Stage 8, sub_stage should be null
      query = query.is('sub_stage', null);
    }

    const { data: stage, error } = await query.select().single();

    if (error) {
      // Provide detailed error logging for debugging
      logger.error('Failed to update stage record', {
        episodeId,
        stageNumber,
        subStage,
        stageName,
        updateFields: Object.keys(updates),
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
      });

      // Check for specific error conditions and provide helpful messages
      if (error.code === 'PGRST116' || error.message.includes('single row')) {
        throw new DatabaseError(
          'update',
          `Failed to update stage ${stageNumber} (${stageName}): ` +
          `Stage record not found. Ensure stage records are created before processing. ` +
          `This usually happens when start_from_stage > 0 on a fresh episode.`
        );
      }

      throw new DatabaseError('update', `Failed to update stage: ${error.message}`);
    }

    if (!stage) {
      logger.error('Stage update returned no data', {
        episodeId,
        stageNumber,
        subStage,
        stageName,
      });
      throw new DatabaseError(
        'update',
        `Stage ${stageNumber} (${stageName}) not found for episode ${episodeId}`
      );
    }

    logger.debug('Stage updated successfully', {
      episodeId,
      stageNumber,
      subStage,
      stageName,
      newStatus: stage.status,
    });

    return stage;
  },

  /**
   * Marks a stage as processing (state transition: pending -> processing)
   *
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number (0-9)
   * @param {string|null} [subStage=null] - Sub-stage for Stage 8 (instagram, twitter, linkedin, facebook)
   * @returns {Promise<Object>} Updated stage record
   * @throws {DatabaseError} If stage record doesn't exist or update fails
   *
   * Prerequisites:
   * - Stage records must exist (created via createAllStages)
   * - Stage should be in 'pending' status
   */
  async markProcessing(episodeId, stageNumber, subStage = null) {
    const stageName = subStage
      ? STAGE_8_SUBSTAGE_NAMES[subStage] || `Stage ${stageNumber} (${subStage})`
      : STAGE_NAMES[stageNumber];

    // Log the state transition for debugging and monitoring
    logger.stateChange(episodeId, 'pending', 'processing', {
      stage: stageNumber,
      subStage,
      stageName,
    });

    try {
      const result = await this.updateByEpisodeAndStage(episodeId, stageNumber, {
        status: 'processing',
        started_at: new Date().toISOString(),
      }, subStage);
      return result;
    } catch (error) {
      // Add context about which stage failed to transition
      logger.error('Failed to mark stage as processing', {
        episodeId,
        stageNumber,
        subStage,
        stageName,
        error: error.message,
      });
      throw error;
    }
  },

  /**
   * Marks a stage as completed with results (state transition: processing -> completed)
   *
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number (0-9)
   * @param {Object} result - Stage results from the analyzer
   * @param {Object|null} result.output_data - Structured JSON output (for stages 0-5)
   * @param {string|null} result.output_text - Text/markdown output (for stages 6-9)
   * @param {number} result.input_tokens - Number of input tokens used
   * @param {number} result.output_tokens - Number of output tokens generated
   * @param {number} result.cost_usd - API cost in USD
   * @param {string|null} [subStage=null] - Sub-stage for Stage 8 (instagram, twitter, linkedin, facebook)
   * @returns {Promise<Object>} Updated stage record
   * @throws {DatabaseError} If stage record doesn't exist or update fails
   */
  async markCompleted(episodeId, stageNumber, result, subStage = null) {
    const completedAt = new Date().toISOString();
    const stageName = subStage
      ? STAGE_8_SUBSTAGE_NAMES[subStage] || `Stage ${stageNumber} (${subStage})`
      : STAGE_NAMES[stageNumber];

    // Fetch the stage to calculate duration from started_at
    const stage = await this.findByEpisodeAndStage(episodeId, stageNumber, subStage);

    // Calculate processing duration in seconds
    const durationSeconds = stage.started_at
      ? Math.floor((new Date(completedAt) - new Date(stage.started_at)) / 1000)
      : 0;

    // Log the state transition with performance metrics
    logger.stateChange(episodeId, 'processing', 'completed', {
      stage: stageNumber,
      subStage,
      stageName,
      durationSeconds,
      costUsd: result.cost_usd,
      inputTokens: result.input_tokens,
      outputTokens: result.output_tokens,
    });

    try {
      const updatedStage = await this.updateByEpisodeAndStage(episodeId, stageNumber, {
        status: 'completed',
        completed_at: completedAt,
        duration_seconds: durationSeconds,
        output_data: result.output_data || null,
        output_text: result.output_text || null,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        cost_usd: result.cost_usd,
      }, subStage);

      logger.debug('Stage marked as completed', {
        episodeId,
        stageNumber,
        subStage,
        stageName,
        durationSeconds,
        hasOutputData: !!result.output_data,
        hasOutputText: !!result.output_text,
      });

      return updatedStage;
    } catch (error) {
      logger.error('Failed to mark stage as completed', {
        episodeId,
        stageNumber,
        subStage,
        stageName,
        error: error.message,
      });
      throw error;
    }
  },

  /**
   * Marks a stage as failed with error details (state transition: processing -> failed)
   *
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number (0-9)
   * @param {string} errorMessage - Human-readable error message
   * @param {Object|null} [errorDetails] - Full error details for debugging (JSON)
   * @param {string|null} [subStage=null] - Sub-stage for Stage 8 (instagram, twitter, linkedin, facebook)
   * @returns {Promise<Object>} Updated stage record
   * @throws {DatabaseError} If stage record doesn't exist or update fails
   *
   * Error details should include:
   * - Error type/name
   * - Stack trace (if available)
   * - API response details (if applicable)
   * - Any context that would help debugging
   */
  async markFailed(episodeId, stageNumber, errorMessage, errorDetails = null, subStage = null) {
    const stageName = subStage
      ? STAGE_8_SUBSTAGE_NAMES[subStage] || `Stage ${stageNumber} (${subStage})`
      : STAGE_NAMES[stageNumber];

    // Fetch current stage to get retry count
    const stage = await this.findByEpisodeAndStage(episodeId, stageNumber, subStage);
    const newRetryCount = (stage.retry_count || 0) + 1;

    // Log the state transition with error context
    logger.stateChange(episodeId, 'processing', 'failed', {
      stage: stageNumber,
      subStage,
      stageName,
      error: errorMessage,
      retryCount: newRetryCount,
    });

    // Log additional error details at error level for monitoring
    logger.error('Stage failed', {
      episodeId,
      stageNumber,
      subStage,
      stageName,
      errorMessage,
      retryCount: newRetryCount,
      hasErrorDetails: !!errorDetails,
    });

    try {
      const updatedStage = await this.updateByEpisodeAndStage(episodeId, stageNumber, {
        status: 'failed',
        error_message: errorMessage,
        error_details: errorDetails,
        retry_count: newRetryCount,
      }, subStage);
      return updatedStage;
    } catch (dbError) {
      // Log if we can't even record the failure
      logger.error('Failed to mark stage as failed (database error)', {
        episodeId,
        stageNumber,
        subStage,
        stageName,
        originalError: errorMessage,
        dbError: dbError.message,
      });
      throw dbError;
    }
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

  /**
   * Resets all stage outputs for an episode back to pending state.
   * Used for reprocessing an episode with an existing transcript.
   *
   * This clears all output data, costs, and durations while preserving
   * the stage records themselves.
   *
   * @param {string} episodeId - Episode UUID
   * @returns {Promise<Array>} Updated stage records
   * @throws {DatabaseError} If reset fails
   */
  async resetAllStages(episodeId) {
    logger.info('🔄 Resetting all stages for reprocessing', { episodeId });

    const resetData = {
      status: 'pending',
      output_data: null,
      output_text: null,
      cost_usd: null,
      duration_seconds: null,
      error_message: null,
      retry_count: 0,
      started_at: null,
      completed_at: null,
    };

    const { data: stages, error } = await db
      .from('stage_outputs')
      .update(resetData)
      .eq('episode_id', episodeId)
      .select();

    if (error) {
      logger.dbError('update', 'stage_outputs (reset)', error, {
        episodeId,
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw new DatabaseError('update', `Failed to reset stages: ${error.message}`);
    }

    logger.info('✅ All stages reset to pending', {
      episodeId,
      stageCount: stages?.length || 0,
    });

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
    logger.dbQuery('select', 'api_usage_log', {
      operation: 'getByDateRange',
      startDate,
      endDate,
    });

    // Note: api_usage_log table uses 'timestamp' column, not 'created_at'
    const { data, error } = await db
      .from('api_usage_log')
      .select('*')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate)
      .order('timestamp', { ascending: false });

    if (error) {
      logger.dbError('select', 'api_usage_log', error, {
        operation: 'getByDateRange',
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
        startDate,
        endDate,
      });
      throw new DatabaseError('select', `Failed to get usage logs: ${error.message}`);
    }

    logger.dbResult('select', 'api_usage_log', {
      operation: 'getByDateRange',
      rowCount: data?.length || 0,
      startDate,
      endDate,
    });

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
  STAGE_8_SUBSTAGE_NAMES,
  STAGE_8_SUBSTAGES,
};
