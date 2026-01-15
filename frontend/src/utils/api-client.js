/**
 * ============================================================================
 * API CLIENT
 * ============================================================================
 * Centralized API client for all backend requests.
 * Handles authentication, errors, and provides typed endpoints.
 *
 * Authentication:
 * - Automatically includes auth token from Supabase session
 * - Handles 401 errors by redirecting to login
 *
 * Usage:
 *   import api from '@utils/api-client';
 *   const episodes = await api.episodes.list();
 * ============================================================================
 */

// Base URL - uses Vite proxy in development
const BASE_URL = '/api';

// ============================================================================
// AUTH TOKEN HELPERS
// ============================================================================

/**
 * Gets the current auth token from Supabase session in localStorage.
 * Supabase stores session data in localStorage with a key pattern.
 *
 * @returns {string|null} Access token or null if not authenticated
 */
function getAuthToken() {
  try {
    // Supabase stores the session in localStorage
    // The key format is: sb-{project-ref}-auth-token
    const keys = Object.keys(localStorage);
    const authKey = keys.find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));

    if (!authKey) {
      // No Supabase auth key found
      return null;
    }

    const sessionData = localStorage.getItem(authKey);
    if (!sessionData) {
      return null;
    }

    const session = JSON.parse(sessionData);
    return session?.access_token || null;
  } catch (error) {
    console.warn('api-client: Error reading auth token from storage', error);
    return null;
  }
}

/**
 * Handles authentication errors by redirecting to login.
 *
 * @param {number} status - HTTP status code
 */
function handleAuthError(status) {
  if (status === 401) {
    console.warn('api-client: Authentication required, redirecting to login');
    // Clear any stale session data
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    });
    // Redirect to login
    window.location.href = '/login';
  }
}

// ============================================================================
// HTTP HELPERS
// ============================================================================

/**
 * Makes a fetch request with standard configuration.
 * Automatically includes auth token if available.
 *
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} Response data
 */
async function fetchAPI(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const requestId = Math.random().toString(36).substring(7);

  // Build headers with auth token
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth token if available
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    headers,
    ...options,
  };

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  // Log outgoing request (hide token in logs)
  console.log(`[API:${requestId}] ${options.method || 'GET'} ${url}`, {
    authenticated: !!token,
    bodySize: config.body ? config.body.length : 0,
  });

  if (config.body && options.method !== 'GET') {
    try {
      const parsedBody = JSON.parse(config.body);
      console.log(`[API:${requestId}] Request body:`, parsedBody);
    } catch {
      console.log(`[API:${requestId}] Request body (raw):`, config.body);
    }
  }

  const startTime = performance.now();

  try {
    const response = await fetch(url, config);
    const duration = Math.round(performance.now() - startTime);

    console.log(`[API:${requestId}] Response: ${response.status} ${response.statusText} (${duration}ms)`);

    // Parse response as JSON
    const data = await response.json().catch(() => null);

    console.log(`[API:${requestId}] Response data:`, data);

    // Handle HTTP errors
    if (!response.ok) {
      // Enhanced error logging for troubleshooting
      console.error(`[API:${requestId}] HTTP Error:`, {
        status: response.status,
        statusText: response.statusText,
        errorType: data?.error,
        errorMessage: data?.message,
        correlationId: data?.correlationId,
        debug: data?.debug,
        fullErrorData: data,
      });

      // Log debug info if present (from development mode backend)
      if (data?.debug) {
        console.error(`[API:${requestId}] Debug info from server:`, data.debug);
      }

      // Handle auth errors
      handleAuthError(response.status);

      // Create error with all available info
      const errorMessage = data?.message || data?.error?.message || `HTTP ${response.status}`;
      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      error.correlationId = data?.correlationId;
      throw error;
    }

    return data;
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    console.error(`[API:${requestId}] Request failed (${duration}ms):`, {
      name: error.name,
      message: error.message,
      status: error.status,
      data: error.data,
    });

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
 * Auth API - for authentication-related endpoints
 */
const auth = {
  /**
   * Get current user info
   */
  me: () => get('/auth/me'),

  /**
   * Update user profile
   * @param {Object} data - Profile data to update
   */
  updateProfile: (data) => put('/auth/profile', data),

  /**
   * Logout (server-side session invalidation)
   */
  logout: () => post('/auth/logout'),
};

/**
 * Settings API - for user-specific settings
 */
const settings = {
  /**
   * Get current user's settings
   */
  get: () => get('/settings'),

  /**
   * Update current user's settings
   * @param {Object} data - Settings sections to update
   */
  update: (data) => put('/settings', data),
};

/**
 * Episodes API
 */
const episodes = {
  /**
   * List user's episodes
   * @param {Object} params - Query params (status, limit, offset, all)
   */
  list: (params = {}) => get('/episodes', params),

  /**
   * Quickly analyze a transcript to extract metadata for auto-populating fields.
   * Uses Claude 3.5 Haiku for fast (~2-3s), affordable (~$0.001-0.003) analysis.
   *
   * @param {string} transcript - The podcast transcript to analyze (min 200 chars)
   * @returns {Promise<Object>} - { metadata, usage, estimate }
   */
  analyzeTranscript: (transcript) => post('/episodes/analyze-transcript', { transcript }),

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
  list: (episodeId) => get(`/stages/episode/${episodeId}`),

  /**
   * Get single stage by ID
   * @param {string} stageId - Stage UUID
   */
  get: (stageId) => get(`/stages/${stageId}`),

  /**
   * Update stage output by stage ID (for manual edits)
   * @param {string} stageId - Stage UUID
   * @param {Object} data - Updated output (output_data, output_text)
   */
  update: (stageId, data) => put(`/stages/${stageId}`, data),

  /**
   * Regenerate a stage by stage ID
   * @param {string} stageId - Stage UUID
   */
  regenerate: (stageId) => post(`/stages/${stageId}/regenerate`),
};

/**
 * Evergreen Content API (system defaults - superadmin only for updates)
 */
const evergreen = {
  /**
   * Get all evergreen content (system defaults)
   */
  get: () => get('/evergreen'),

  /**
   * Update evergreen content (superadmin only)
   * @param {Object} data - Content sections to update
   */
  update: (data) => put('/evergreen', data),
};

/**
 * Admin API (superadmin only)
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

  /**
   * List all users (superadmin only)
   * @param {Object} params - Query params (limit, offset)
   */
  users: (params = {}) => get('/auth/users', params),
};

/**
 * Content Library API
 */
const library = {
  /**
   * List library items
   * @param {Object} params - Query params (content_type, platform, episode_id, favorite, search, limit, offset)
   */
  list: (params = {}) => get('/library', params),

  /**
   * Get library statistics
   */
  stats: () => get('/library/stats'),

  /**
   * Save content to library
   * @param {Object} data - Library item data (title, content_type, platform, content, metadata, episode_id, source_stage, tags)
   */
  create: (data) => post('/library', data),

  /**
   * Get single library item
   * @param {string} id - Library item UUID
   */
  get: (id) => get(`/library/${id}`),

  /**
   * Update library item
   * @param {string} id - Library item UUID
   * @param {Object} data - Fields to update (title, content, metadata, tags, platform)
   */
  update: (id, data) => put(`/library/${id}`, data),

  /**
   * Delete library item
   * @param {string} id - Library item UUID
   */
  delete: (id) => del(`/library/${id}`),

  /**
   * Toggle favorite status
   * @param {string} id - Library item UUID
   */
  toggleFavorite: (id) => post(`/library/${id}/favorite`),
};

/**
 * Content Calendar API
 */
const calendar = {
  /**
   * List calendar items
   * @param {Object} params - Query params (start_date, end_date, content_type, platform, status, limit, offset)
   */
  list: (params = {}) => get('/calendar', params),

  /**
   * Schedule content
   * @param {Object} data - Calendar item data (title, content_type, platform, scheduled_date, scheduled_time, full_content, status, episode_id, library_item_id, notes, metadata)
   */
  create: (data) => post('/calendar', data),

  /**
   * Get single calendar item
   * @param {string} id - Calendar item UUID
   */
  get: (id) => get(`/calendar/${id}`),

  /**
   * Update calendar item
   * @param {string} id - Calendar item UUID
   * @param {Object} data - Fields to update (title, scheduled_date, scheduled_time, full_content, platform, notes, metadata)
   */
  update: (id, data) => put(`/calendar/${id}`, data),

  /**
   * Delete calendar item
   * @param {string} id - Calendar item UUID
   */
  delete: (id) => del(`/calendar/${id}`),

  /**
   * Update calendar item status
   * @param {string} id - Calendar item UUID
   * @param {Object} data - Status update (status, publish_url)
   */
  updateStatus: (id, data) => patch(`/calendar/${id}/status`, data),
};

// ============================================================================
// EXPORT
// ============================================================================

const api = {
  auth,
  settings,
  episodes,
  stages,
  evergreen,
  admin,
  library,
  calendar,
  // Raw helpers for custom endpoints
  get,
  post,
  put,
  patch,
  delete: del,
};

export default api;
