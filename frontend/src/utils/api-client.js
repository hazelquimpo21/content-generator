/**
 * ============================================================================
 * API CLIENT
 * ============================================================================
 * Centralized API client for all backend requests.
 * Handles errors, loading states, and provides typed endpoints.
 *
 * Usage:
 *   import api from '@utils/api-client';
 *   const episodes = await api.episodes.list();
 * ============================================================================
 */

// Base URL - uses Vite proxy in development
const BASE_URL = '/api';

// ============================================================================
// HTTP HELPERS
// ============================================================================

/**
 * Makes a fetch request with standard configuration
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} Response data
 */
async function fetchAPI(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  try {
    const response = await fetch(url, config);

    // Parse response as JSON
    const data = await response.json().catch(() => null);

    // Handle HTTP errors
    if (!response.ok) {
      const error = new Error(data?.error?.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    // Network errors or JSON parse errors
    if (!error.status) {
      error.status = 0;
      error.message = 'Network error - please check your connection';
    }
    throw error;
  }
}

/**
 * GET request helper
 */
function get(endpoint, params = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value);
    }
  }
  const queryString = searchParams.toString();
  const url = queryString ? `${endpoint}?${queryString}` : endpoint;

  return fetchAPI(url, { method: 'GET' });
}

/**
 * POST request helper
 */
function post(endpoint, body) {
  return fetchAPI(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * PUT request helper
 */
function put(endpoint, body) {
  return fetchAPI(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * PATCH request helper
 */
function patch(endpoint, body) {
  return fetchAPI(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request helper
 */
function del(endpoint) {
  return fetchAPI(endpoint, { method: 'DELETE' });
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Episodes API
 */
const episodes = {
  /**
   * List all episodes
   * @param {Object} params - Query params (status, limit, offset)
   */
  list: (params = {}) => get('/episodes', params),

  /**
   * Get single episode by ID
   * @param {string} id - Episode UUID
   */
  get: (id) => get(`/episodes/${id}`),

  /**
   * Get episode with all stage outputs
   * @param {string} id - Episode UUID
   */
  getWithStages: (id) => get(`/episodes/${id}/stages`),

  /**
   * Create new episode
   * @param {Object} data - Episode data (transcript, episode_context)
   */
  create: (data) => post('/episodes', data),

  /**
   * Update episode
   * @param {string} id - Episode UUID
   * @param {Object} data - Fields to update
   */
  update: (id, data) => patch(`/episodes/${id}`, data),

  /**
   * Delete episode
   * @param {string} id - Episode UUID
   */
  delete: (id) => del(`/episodes/${id}`),

  /**
   * Start processing an episode
   * @param {string} id - Episode UUID
   * @param {Object} options - Processing options (startFromStage)
   */
  process: (id, options = {}) => post(`/episodes/${id}/process`, options),

  /**
   * Get processing status
   * @param {string} id - Episode UUID
   */
  status: (id) => get(`/episodes/${id}/status`),
};

/**
 * Stages API
 */
const stages = {
  /**
   * Get all stages for an episode
   * @param {string} episodeId - Episode UUID
   */
  list: (episodeId) => get('/stages', { episodeId }),

  /**
   * Get single stage output
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number (1-9)
   */
  get: (episodeId, stageNumber) => get(`/stages/${episodeId}/${stageNumber}`),

  /**
   * Update stage output (for manual edits)
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number
   * @param {Object} data - Updated output
   */
  update: (episodeId, stageNumber, data) =>
    put(`/stages/${episodeId}/${stageNumber}`, data),

  /**
   * Regenerate a stage
   * @param {string} episodeId - Episode UUID
   * @param {number} stageNumber - Stage number
   */
  regenerate: (episodeId, stageNumber) =>
    post(`/stages/${episodeId}/${stageNumber}/regenerate`),
};

/**
 * Evergreen Content API
 */
const evergreen = {
  /**
   * Get all evergreen content
   */
  get: () => get('/evergreen'),

  /**
   * Update evergreen content
   * @param {Object} data - Content sections to update
   */
  update: (data) => put('/evergreen', data),
};

/**
 * Admin API
 */
const admin = {
  /**
   * Get cost analytics
   * @param {Object} params - Query params (period, startDate, endDate)
   */
  costs: (params = {}) => get('/admin/costs', params),

  /**
   * Get performance metrics
   * @param {Object} params - Query params (limit)
   */
  performance: (params = {}) => get('/admin/performance', params),

  /**
   * Get recent errors
   * @param {Object} params - Query params (limit)
   */
  errors: (params = {}) => get('/admin/errors', params),

  /**
   * Get overall usage statistics
   */
  usage: () => get('/admin/usage'),
};

// ============================================================================
// EXPORT
// ============================================================================

const api = {
  episodes,
  stages,
  evergreen,
  admin,
  // Raw helpers for custom endpoints
  get,
  post,
  put,
  patch,
  delete: del,
};

export default api;
