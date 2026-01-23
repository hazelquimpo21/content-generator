/**
 * Brand Discovery Service
 *
 * Business logic for managing brand discovery data, module updates,
 * and completion tracking. Does not handle AI synthesis (see brand-dna-synthesizer.js).
 *
 * @module services/brand-discovery-service
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../lib/logger.js';

// Module weights for completion calculation (must sum to 100)
const MODULE_WEIGHTS = {
  profile: 20,   // NEW: Core business facts (madlibs)
  sources: 10,   // Reduced - now partially covered by profile import
  vibe: 20,      // Reduced from 25
  values: 20,    // Reduced from 25
  method: 15,
  audience: 10,
  channels: 5,   // Reduced - least critical
};

// Valid module IDs
const VALID_MODULES = Object.keys(MODULE_WEIGHTS);

// Module status enum
const MODULE_STATUS = {
  NOT_STARTED: 'not_started',
  PARTIAL: 'partial',
  COMPLETE: 'complete',
};

/**
 * Initialize Supabase client with service role for backend operations.
 *
 * @returns {Object} Supabase client
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  // Match the same env var names used in supabase-client.js and auth-middleware.js
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================================
// Core CRUD Operations
// ============================================================================

/**
 * Get brand discovery record for a user.
 * Creates one if it doesn't exist (auto-creation should handle this, but just in case).
 *
 * @param {string} userId - User's UUID
 * @returns {Promise<Object>} Brand discovery record
 * @throws {Error} If database operation fails
 */
async function getBrandDiscovery(userId) {
  const logContext = { userId, operation: 'getBrandDiscovery' };
  logger.debug('Fetching brand discovery', logContext);

  const supabase = getSupabaseClient();

  // Try to fetch existing record
  const { data, error } = await supabase
    .from('brand_discovery')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned (not an error for us)
    logger.error('Failed to fetch brand discovery', { ...logContext, error: error.message });
    throw new Error(`Database error: ${error.message}`);
  }

  // If no record exists, create one
  if (!data) {
    logger.info('Creating brand discovery record for user', logContext);
    return createBrandDiscovery(userId);
  }

  logger.debug('Brand discovery fetched successfully', { ...logContext, completion: data.overall_completion_percent });
  return data;
}

/**
 * Create a new brand discovery record for a user.
 *
 * @param {string} userId - User's UUID
 * @returns {Promise<Object>} Newly created brand discovery record
 * @throws {Error} If creation fails
 */
async function createBrandDiscovery(userId) {
  const logContext = { userId, operation: 'createBrandDiscovery' };
  logger.info('Creating new brand discovery record', logContext);

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('brand_discovery')
    .insert({ user_id: userId })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create brand discovery', { ...logContext, error: error.message });
    throw new Error(`Failed to create brand discovery: ${error.message}`);
  }

  logger.info('Brand discovery record created', logContext);
  return data;
}

/**
 * Reset brand discovery to initial state.
 * Useful for "start over" functionality.
 *
 * @param {string} userId - User's UUID
 * @returns {Promise<Object>} Reset brand discovery record
 */
async function resetBrandDiscovery(userId) {
  const logContext = { userId, operation: 'resetBrandDiscovery' };
  logger.info('Resetting brand discovery', logContext);

  const supabase = getSupabaseClient();

  // Get current record to save in history before reset
  const current = await getBrandDiscovery(userId);

  // Add reset to history
  const historyEntry = {
    timestamp: new Date().toISOString(),
    trigger: 'user_reset',
    modules_snapshot: current.modules,
    brand_dna_snapshot: current.brand_dna,
    notes: 'User initiated reset',
  };

  const newHistory = [...(current.history || []), historyEntry];

  // Reset to defaults
  const defaultModules = {
    sources: { status: MODULE_STATUS.NOT_STARTED, completed_at: null, data: null },
    vibe: { status: MODULE_STATUS.NOT_STARTED, completed_at: null, data: null },
    values: { status: MODULE_STATUS.NOT_STARTED, completed_at: null, data: null },
    method: { status: MODULE_STATUS.NOT_STARTED, completed_at: null, data: null },
    audience: { status: MODULE_STATUS.NOT_STARTED, completed_at: null, data: null },
    channels: { status: MODULE_STATUS.NOT_STARTED, completed_at: null, data: null },
  };

  const { data, error } = await supabase
    .from('brand_discovery')
    .update({
      modules: defaultModules,
      inferences: {},
      brand_dna: null,
      brand_dna_generated_at: null,
      overall_completion_percent: 0,
      history: newHistory,
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to reset brand discovery', { ...logContext, error: error.message });
    throw new Error(`Failed to reset: ${error.message}`);
  }

  logger.info('Brand discovery reset complete', logContext);
  return data;
}

// ============================================================================
// Module Update Operations
// ============================================================================

/**
 * Update a specific module's data and status.
 *
 * @param {string} userId - User's UUID
 * @param {string} moduleId - Module identifier (sources, vibe, values, method, audience, channels)
 * @param {Object} moduleData - Module-specific data
 * @param {string} status - Module status (not_started, partial, complete)
 * @returns {Promise<Object>} Updated brand discovery record
 * @throws {Error} If validation fails or update fails
 */
async function updateModule(userId, moduleId, moduleData, status) {
  const logContext = { userId, moduleId, status, operation: 'updateModule' };
  logger.debug('Updating module', logContext);

  // Validate module ID
  if (!VALID_MODULES.includes(moduleId)) {
    logger.warn('Invalid module ID', logContext);
    throw new Error(`Invalid module ID: ${moduleId}. Valid modules: ${VALID_MODULES.join(', ')}`);
  }

  // Validate status
  if (!Object.values(MODULE_STATUS).includes(status)) {
    logger.warn('Invalid module status', logContext);
    throw new Error(`Invalid status: ${status}. Valid statuses: ${Object.values(MODULE_STATUS).join(', ')}`);
  }

  const supabase = getSupabaseClient();

  // Get current record
  const current = await getBrandDiscovery(userId);

  // Build updated modules object
  const updatedModules = {
    ...current.modules,
    [moduleId]: {
      status,
      completed_at: status === MODULE_STATUS.COMPLETE ? new Date().toISOString() : null,
      data: moduleData,
    },
  };

  // Calculate new completion percentage
  const completionPercent = calculateCompletionPercent(updatedModules);

  // Update record
  const { data, error } = await supabase
    .from('brand_discovery')
    .update({
      modules: updatedModules,
      overall_completion_percent: completionPercent,
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update module', { ...logContext, error: error.message });
    throw new Error(`Failed to update module: ${error.message}`);
  }

  logger.info('Module updated successfully', { ...logContext, completionPercent });
  return data;
}

/**
 * Update only the data portion of a module (preserves status).
 * Useful for partial saves during user interaction.
 *
 * @param {string} userId - User's UUID
 * @param {string} moduleId - Module identifier
 * @param {Object} partialData - Partial data to merge
 * @returns {Promise<Object>} Updated brand discovery record
 */
async function updateModuleData(userId, moduleId, partialData) {
  const logContext = { userId, moduleId, operation: 'updateModuleData' };
  logger.debug('Updating module data', logContext);

  if (!VALID_MODULES.includes(moduleId)) {
    throw new Error(`Invalid module ID: ${moduleId}`);
  }

  const supabase = getSupabaseClient();
  const current = await getBrandDiscovery(userId);

  // Merge new data with existing
  const currentModuleData = current.modules[moduleId]?.data || {};
  const mergedData = { ...currentModuleData, ...partialData };

  // Determine new status based on data completeness
  const newStatus = determineModuleStatus(moduleId, mergedData);

  // Build updated modules
  const updatedModules = {
    ...current.modules,
    [moduleId]: {
      ...current.modules[moduleId],
      status: newStatus,
      completed_at: newStatus === MODULE_STATUS.COMPLETE ? new Date().toISOString() : current.modules[moduleId]?.completed_at,
      data: mergedData,
    },
  };

  const completionPercent = calculateCompletionPercent(updatedModules);

  const { data, error } = await supabase
    .from('brand_discovery')
    .update({
      modules: updatedModules,
      overall_completion_percent: completionPercent,
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update module data', { ...logContext, error: error.message });
    throw new Error(`Failed to update module data: ${error.message}`);
  }

  logger.debug('Module data updated', { ...logContext, newStatus, completionPercent });
  return data;
}

// ============================================================================
// Inference Operations
// ============================================================================

/**
 * Add or update an inference.
 *
 * @param {string} userId - User's UUID
 * @param {string} fieldPath - Dot-notation path (e.g., 'therapist_profile.name')
 * @param {Object} inferenceData - Inference details
 * @returns {Promise<Object>} Updated brand discovery record
 */
async function setInference(userId, fieldPath, inferenceData) {
  const logContext = { userId, fieldPath, operation: 'setInference' };
  logger.debug('Setting inference', logContext);

  const supabase = getSupabaseClient();
  const current = await getBrandDiscovery(userId);

  const updatedInferences = {
    ...current.inferences,
    [fieldPath]: {
      value: inferenceData.value,
      source: inferenceData.source || 'ai_analysis',
      confidence: inferenceData.confidence || 0.5,
      confirmed: null,
      rejected: null,
      created_at: new Date().toISOString(),
    },
  };

  const { data, error } = await supabase
    .from('brand_discovery')
    .update({ inferences: updatedInferences })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to set inference', { ...logContext, error: error.message });
    throw new Error(`Failed to set inference: ${error.message}`);
  }

  logger.debug('Inference set', logContext);
  return data;
}

/**
 * Confirm or reject an inference.
 *
 * @param {string} userId - User's UUID
 * @param {string} fieldPath - Dot-notation path
 * @param {boolean} confirmed - True to confirm, false to reject
 * @returns {Promise<Object>} Updated brand discovery record
 */
async function confirmInference(userId, fieldPath, confirmed) {
  const logContext = { userId, fieldPath, confirmed, operation: 'confirmInference' };
  logger.debug('Confirming/rejecting inference', logContext);

  const supabase = getSupabaseClient();
  const current = await getBrandDiscovery(userId);

  if (!current.inferences[fieldPath]) {
    throw new Error(`No inference found for path: ${fieldPath}`);
  }

  const updatedInferences = {
    ...current.inferences,
    [fieldPath]: {
      ...current.inferences[fieldPath],
      confirmed: confirmed ? new Date().toISOString() : null,
      rejected: !confirmed ? new Date().toISOString() : null,
    },
  };

  const { data, error } = await supabase
    .from('brand_discovery')
    .update({ inferences: updatedInferences })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to confirm inference', { ...logContext, error: error.message });
    throw new Error(`Failed to confirm inference: ${error.message}`);
  }

  logger.info('Inference confirmation updated', logContext);
  return data;
}

// ============================================================================
// Brand DNA Operations
// ============================================================================

/**
 * Update Brand DNA (called by synthesizer after generation).
 *
 * @param {string} userId - User's UUID
 * @param {Object} brandDna - Generated Brand DNA object
 * @param {string} trigger - What triggered this generation
 * @returns {Promise<Object>} Updated brand discovery record
 */
async function updateBrandDna(userId, brandDna, trigger = 'synthesis') {
  const logContext = { userId, trigger, operation: 'updateBrandDna' };
  logger.info('Updating Brand DNA', logContext);

  const supabase = getSupabaseClient();
  const current = await getBrandDiscovery(userId);

  // Add to history
  const historyEntry = {
    timestamp: new Date().toISOString(),
    trigger,
    modules_snapshot: current.modules,
    brand_dna_snapshot: brandDna,
    notes: `Brand DNA generated via ${trigger}`,
  };

  // Keep only last 10 history entries to prevent bloat
  const newHistory = [...(current.history || []), historyEntry].slice(-10);

  const { data, error } = await supabase
    .from('brand_discovery')
    .update({
      brand_dna: brandDna,
      brand_dna_generated_at: new Date().toISOString(),
      history: newHistory,
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update Brand DNA', { ...logContext, error: error.message });
    throw new Error(`Failed to update Brand DNA: ${error.message}`);
  }

  logger.info('Brand DNA updated successfully', logContext);
  return data;
}

/**
 * Check if Brand DNA should be regenerated based on module completion.
 *
 * @param {Object} modules - Current modules object
 * @returns {boolean} True if at least 2 modules are complete
 */
function shouldRegenerateBrandDna(modules) {
  const completeCount = Object.values(modules).filter(
    (m) => m.status === MODULE_STATUS.COMPLETE
  ).length;

  return completeCount >= 2;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate overall completion percentage from modules.
 *
 * @param {Object} modules - Modules object with status for each module
 * @returns {number} Completion percentage (0-100)
 */
function calculateCompletionPercent(modules) {
  let completedWeight = 0;

  Object.entries(MODULE_WEIGHTS).forEach(([moduleId, weight]) => {
    const status = modules[moduleId]?.status || MODULE_STATUS.NOT_STARTED;

    if (status === MODULE_STATUS.COMPLETE) {
      completedWeight += weight;
    } else if (status === MODULE_STATUS.PARTIAL) {
      completedWeight += weight * 0.5;
    }
  });

  return Math.round(completedWeight);
}

/**
 * Determine module status based on its data.
 * Module-specific logic for what constitutes partial vs complete.
 *
 * @param {string} moduleId - Module identifier
 * @param {Object} data - Module data
 * @returns {string} Module status
 */
function determineModuleStatus(moduleId, data) {
  if (!data || Object.keys(data).length === 0) {
    return MODULE_STATUS.NOT_STARTED;
  }

  switch (moduleId) {
    case 'vibe':
      // Complete if at least 4 of 6 sliders are set
      return countSetSliders(data) >= 4 ? MODULE_STATUS.COMPLETE : MODULE_STATUS.PARTIAL;

    case 'values':
      // Complete if power_five is set with AI nuances selected
      if (data.power_five?.length >= 5 && data.power_five.every((v) => v.nuance)) {
        return MODULE_STATUS.COMPLETE;
      }
      return data.selections ? MODULE_STATUS.PARTIAL : MODULE_STATUS.NOT_STARTED;

    case 'method':
      // Complete if at least one modality AND one specialty selected
      return (data.modalities?.length > 0 && data.specialties?.length > 0)
        ? MODULE_STATUS.COMPLETE
        : MODULE_STATUS.PARTIAL;

    case 'audience':
      // Complete if at least one archetype selected
      return data.archetypes?.length > 0 ? MODULE_STATUS.COMPLETE : MODULE_STATUS.PARTIAL;

    case 'channels':
      // Complete if at least 3 platforms ranked
      return data.ranking?.length >= 3 ? MODULE_STATUS.COMPLETE : MODULE_STATUS.PARTIAL;

    case 'sources':
      // Complete if content was analyzed and at least one inference confirmed
      return data.analyzed ? MODULE_STATUS.COMPLETE : MODULE_STATUS.PARTIAL;

    default:
      return MODULE_STATUS.PARTIAL;
  }
}

/**
 * Count how many vibe sliders are set (not null).
 *
 * @param {Object} vibeData - Vibe module data
 * @returns {number} Count of set sliders
 */
function countSetSliders(vibeData) {
  const sliderKeys = [
    'clinical_relatable',
    'quiet_energetic',
    'minimalist_eclectic',
    'scientific_holistic',
    'formal_playful',
    'expert_guide',
  ];

  return sliderKeys.filter((key) => vibeData[key] !== null && vibeData[key] !== undefined).length;
}

export {
  // Core CRUD
  getBrandDiscovery,
  createBrandDiscovery,
  resetBrandDiscovery,

  // Module operations
  updateModule,
  updateModuleData,

  // Inference operations
  setInference,
  confirmInference,

  // Brand DNA operations
  updateBrandDna,
  shouldRegenerateBrandDna,

  // Helpers
  calculateCompletionPercent,
  determineModuleStatus,

  // Constants
  MODULE_WEIGHTS,
  VALID_MODULES,
  MODULE_STATUS,
};
