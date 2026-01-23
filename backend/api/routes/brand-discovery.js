/**
 * Brand Discovery API Routes
 *
 * Endpoints for managing brand discovery data, module updates,
 * inference confirmation, and Brand DNA synthesis.
 *
 * @module api/routes/brand-discovery
 */

import express from 'express';
import logger from '../../lib/logger.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import * as brandDiscoveryService from '../../services/brand-discovery-service.js';
import * as brandDnaSynthesizer from '../../services/brand-dna-synthesizer.js';

// Import reference data for frontend
import { VALUES_DECK, getShuffledDeck } from '../../data/values-deck.js';
import { BRAND_ARCHETYPES } from '../../data/brand-archetypes.js';
import { AUDIENCE_ARCHETYPES } from '../../data/audience-archetypes.js';
import { MODALITIES } from '../../data/modalities.js';
import { SPECIALTIES } from '../../data/specialties.js';
import { PLATFORMS, DEFAULT_PLATFORM_ORDER } from '../../data/platforms.js';
import { getAllWordBanks, PROPERTIES_OPTIONS } from '../../data/word-banks.js';

// Import scraper service
import * as scraperService from '../../services/scraper-service.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// ============================================================================
// GET /api/brand-discovery
// Get current user's brand discovery record
// ============================================================================

router.get('/', async (req, res) => {
  const logContext = { userId: req.user.id, operation: 'GET /brand-discovery' };

  try {
    logger.debug('Fetching brand discovery', logContext);

    const brandDiscovery = await brandDiscoveryService.getBrandDiscovery(req.user.id);

    res.json({ brandDiscovery });
  } catch (error) {
    logger.error('Failed to fetch brand discovery', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to fetch brand discovery', details: error.message });
  }
});

// ============================================================================
// DELETE /api/brand-discovery/reset
// Reset brand discovery to initial state
// ============================================================================

router.delete('/reset', async (req, res) => {
  const logContext = { userId: req.user.id, operation: 'DELETE /brand-discovery/reset' };

  try {
    logger.info('Resetting brand discovery', logContext);

    const brandDiscovery = await brandDiscoveryService.resetBrandDiscovery(req.user.id);

    res.json({ brandDiscovery, message: 'Brand discovery reset successfully' });
  } catch (error) {
    logger.error('Failed to reset brand discovery', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to reset brand discovery', details: error.message });
  }
});

// ============================================================================
// PATCH /api/brand-discovery/modules/:moduleId
// Update a specific module's data and status
// ============================================================================

router.patch('/modules/:moduleId', async (req, res) => {
  const { moduleId } = req.params;
  const { data, status } = req.body;
  const logContext = { userId: req.user.id, moduleId, operation: 'PATCH /modules/:moduleId' };

  try {
    logger.debug('Updating module', { ...logContext, status });

    // Validate request body
    if (data === undefined && status === undefined) {
      return res.status(400).json({
        error: 'Bad request',
        details: 'Request must include "data" and/or "status"',
      });
    }

    let brandDiscovery;

    if (status) {
      // Full module update with status
      brandDiscovery = await brandDiscoveryService.updateModule(
        req.user.id,
        moduleId,
        data || {},
        status
      );
    } else {
      // Partial data update (status auto-determined)
      brandDiscovery = await brandDiscoveryService.updateModuleData(
        req.user.id,
        moduleId,
        data
      );
    }

    // Check if Brand DNA should be regenerated
    if (brandDiscoveryService.shouldRegenerateBrandDna(brandDiscovery.modules)) {
      logger.info('Triggering Brand DNA synthesis', logContext);

      const brandDna = await brandDnaSynthesizer.synthesizeBrandDna(
        brandDiscovery.modules,
        brandDiscovery.inferences
      );

      brandDiscovery = await brandDiscoveryService.updateBrandDna(
        req.user.id,
        brandDna,
        'module_update'
      );
    }

    res.json({ brandDiscovery });
  } catch (error) {
    logger.error('Failed to update module', { ...logContext, error: error.message });

    // Handle specific error types
    if (error.message.includes('Invalid module ID')) {
      return res.status(400).json({ error: 'Invalid module ID', details: error.message });
    }
    if (error.message.includes('Invalid status')) {
      return res.status(400).json({ error: 'Invalid status', details: error.message });
    }

    res.status(500).json({ error: 'Failed to update module', details: error.message });
  }
});

// ============================================================================
// POST /api/brand-discovery/sources/analyze
// Analyze pasted content and generate inferences
// ============================================================================

router.post('/sources/analyze', async (req, res) => {
  const { content } = req.body;
  const logContext = { userId: req.user.id, operation: 'POST /sources/analyze' };

  try {
    logger.info('Analyzing source content', { ...logContext, contentLength: content?.length });

    // Validate content
    if (!content || typeof content !== 'string' || content.trim().length < 50) {
      return res.status(400).json({
        error: 'Invalid content',
        details: 'Please provide at least 50 characters of content to analyze',
      });
    }

    // For now, return mock analysis (AI integration to be added)
    // In production, this would call Claude to analyze the content
    const analysis = await analyzeSourceContent(content);

    // Store inferences
    for (const [fieldPath, inference] of Object.entries(analysis.inferences)) {
      await brandDiscoveryService.setInference(req.user.id, fieldPath, inference);
    }

    // Update sources module with analysis results
    await brandDiscoveryService.updateModuleData(req.user.id, 'sources', {
      content_preview: content.substring(0, 500),
      analyzed: true,
      analyzed_at: new Date().toISOString(),
      extracted_data: analysis.extracted_data,
    });

    res.json({
      success: true,
      data: {
        extracted_data: analysis.extracted_data,
        inferences: analysis.inferences,
      },
    });
  } catch (error) {
    logger.error('Failed to analyze source content', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to analyze content', details: error.message });
  }
});

// ============================================================================
// POST /api/brand-discovery/inferences/confirm
// Confirm or reject an inference
// ============================================================================

router.post('/inferences/confirm', async (req, res) => {
  const { field_path, confirmed } = req.body;
  const logContext = { userId: req.user.id, fieldPath: field_path, operation: 'POST /inferences/confirm' };

  try {
    logger.debug('Confirming inference', { ...logContext, confirmed });

    if (!field_path || typeof confirmed !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'Request must include "field_path" (string) and "confirmed" (boolean)',
      });
    }

    const brandDiscovery = await brandDiscoveryService.confirmInference(
      req.user.id,
      field_path,
      confirmed
    );

    res.json({ brandDiscovery });
  } catch (error) {
    logger.error('Failed to confirm inference', { ...logContext, error: error.message });

    if (error.message.includes('No inference found')) {
      return res.status(404).json({ error: 'Inference not found', details: error.message });
    }

    res.status(500).json({ error: 'Failed to confirm inference', details: error.message });
  }
});

// ============================================================================
// POST /api/brand-discovery/brand-dna/regenerate
// Force regenerate Brand DNA
// ============================================================================

router.post('/brand-dna/regenerate', async (req, res) => {
  const logContext = { userId: req.user.id, operation: 'POST /brand-dna/regenerate' };

  try {
    logger.info('Regenerating Brand DNA', logContext);

    const brandDiscovery = await brandDiscoveryService.getBrandDiscovery(req.user.id);

    // Check if enough modules are complete
    if (!brandDiscoveryService.shouldRegenerateBrandDna(brandDiscovery.modules)) {
      return res.status(400).json({
        error: 'Not enough modules complete',
        details: 'At least 2 modules must be complete to generate Brand DNA',
      });
    }

    // Synthesize Brand DNA
    const brandDna = await brandDnaSynthesizer.synthesizeBrandDna(
      brandDiscovery.modules,
      brandDiscovery.inferences
    );

    // Update record
    const updated = await brandDiscoveryService.updateBrandDna(
      req.user.id,
      brandDna,
      'manual_regenerate'
    );

    res.json({ brandDiscovery: updated });
  } catch (error) {
    logger.error('Failed to regenerate Brand DNA', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to regenerate Brand DNA', details: error.message });
  }
});

// ============================================================================
// GET /api/brand-discovery/history
// Get Brand DNA version history
// ============================================================================

router.get('/history', async (req, res) => {
  const { limit = 10, offset = 0 } = req.query;
  const logContext = { userId: req.user.id, operation: 'GET /history' };

  try {
    logger.debug('Fetching history', { ...logContext, limit, offset });

    const brandDiscovery = await brandDiscoveryService.getBrandDiscovery(req.user.id);
    const history = brandDiscovery.history || [];

    // Apply pagination
    const paginatedHistory = history.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      success: true,
      data: {
        history: paginatedHistory,
        total: history.length,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch history', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

// ============================================================================
// POST /api/brand-discovery/values/generate-nuances
// Generate AI "Why" options for a value (mock for now)
// ============================================================================

router.post('/values/generate-nuances', async (req, res) => {
  const { value } = req.body;
  const logContext = { userId: req.user.id, value, operation: 'POST /values/generate-nuances' };

  try {
    logger.debug('Generating value nuances', logContext);

    if (!value || typeof value !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'Request must include "value" (string)',
      });
    }

    // For now, return mock nuances (AI integration to be added)
    const nuances = await generateValueNuances(value);

    res.json({
      success: true,
      data: {
        value,
        nuances,
      },
    });
  } catch (error) {
    logger.error('Failed to generate nuances', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to generate nuances', details: error.message });
  }
});

// ============================================================================
// GET /api/brand-discovery/reference-data
// Get all reference data for frontend (values, archetypes, etc.)
// ============================================================================

router.get('/reference-data', async (req, res) => {
  const logContext = { userId: req.user.id, operation: 'GET /reference-data' };

  try {
    logger.debug('Fetching reference data', logContext);

    // Map to camelCase property names expected by frontend
    res.json({
      valuesDeck: VALUES_DECK,
      shuffledValues: getShuffledDeck(),
      brandArchetypes: BRAND_ARCHETYPES,
      audienceArchetypes: AUDIENCE_ARCHETYPES,
      modalities: MODALITIES,
      specialties: SPECIALTIES,
      platforms: PLATFORMS,
      defaultPlatformOrder: DEFAULT_PLATFORM_ORDER,
      // Profile enrichment word banks
      wordBanks: getAllWordBanks(),
      propertiesOptions: PROPERTIES_OPTIONS,
    });
  } catch (error) {
    logger.error('Failed to fetch reference data', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to fetch reference data', details: error.message });
  }
});

// ============================================================================
// PROFILE ENRICHMENT ENDPOINTS
// ============================================================================

// ============================================================================
// POST /api/brand-discovery/enrichment/scrape
// Start a scrape job for website, podcast RSS, or bio text
// ============================================================================

router.post('/enrichment/scrape', async (req, res) => {
  const { type, url, text } = req.body;
  const logContext = { userId: req.user.id, type, operation: 'POST /enrichment/scrape' };

  try {
    logger.info('Starting scrape job', logContext);

    // Validate request
    const validTypes = ['website', 'podcast_rss', 'bio_text'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid type',
        details: `Type must be one of: ${validTypes.join(', ')}`,
      });
    }

    if ((type === 'website' || type === 'podcast_rss') && !url) {
      return res.status(400).json({
        error: 'URL required',
        details: `URL is required for type "${type}"`,
      });
    }

    if (type === 'bio_text' && (!text || text.trim().length < 50)) {
      return res.status(400).json({
        error: 'Text required',
        details: 'Please provide at least 50 characters of text',
      });
    }

    // Create scrape job
    const job = await scraperService.createScrapeJob(req.user.id, {
      type,
      url: url || null,
      text: text || null,
    });

    // Start processing asynchronously
    scraperService.processScrapeJob(job.id).catch((err) => {
      logger.error('Background scrape job failed', { jobId: job.id, error: err.message });
    });

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        type: job.job_type,
      },
    });
  } catch (error) {
    logger.error('Failed to start scrape job', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to start scrape job', details: error.message });
  }
});

// ============================================================================
// GET /api/brand-discovery/enrichment/scrape/:jobId
// Check status of a scrape job
// ============================================================================

router.get('/enrichment/scrape/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const logContext = { userId: req.user.id, jobId, operation: 'GET /enrichment/scrape/:jobId' };

  try {
    logger.debug('Checking scrape job status', logContext);

    const job = await scraperService.getScrapeJob(req.user.id, jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        type: job.job_type,
        targetUrl: job.target_url,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        extractedData: job.extracted_data,
        error: job.error_message,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch scrape job', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to fetch scrape job', details: error.message });
  }
});

// ============================================================================
// GET /api/brand-discovery/enrichment/jobs
// Get all scrape jobs for the current user
// ============================================================================

router.get('/enrichment/jobs', async (req, res) => {
  const { limit = 10 } = req.query;
  const logContext = { userId: req.user.id, operation: 'GET /enrichment/jobs' };

  try {
    logger.debug('Fetching scrape jobs', logContext);

    const jobs = await scraperService.getUserScrapeJobs(req.user.id, Number(limit));

    res.json({
      success: true,
      jobs: jobs.map((job) => ({
        id: job.id,
        status: job.status,
        type: job.job_type,
        targetUrl: job.target_url,
        createdAt: job.created_at,
        completedAt: job.completed_at,
        hasExtractedData: !!job.extracted_data,
        error: job.error_message,
      })),
    });
  } catch (error) {
    logger.error('Failed to fetch scrape jobs', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to fetch scrape jobs', details: error.message });
  }
});

// ============================================================================
// POST /api/brand-discovery/enrichment/apply
// Apply extracted data from a scrape job to the profile module
// ============================================================================

router.post('/enrichment/apply', async (req, res) => {
  const { jobId, selectedFields } = req.body;
  const logContext = { userId: req.user.id, jobId, operation: 'POST /enrichment/apply' };

  try {
    logger.info('Applying enrichment data', logContext);

    // Get the scrape job
    const job = await scraperService.getScrapeJob(req.user.id, jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed' || !job.extracted_data) {
      return res.status(400).json({
        error: 'Job not ready',
        details: 'Scrape job must be completed with extracted data',
      });
    }

    // Get current profile module data
    const brandDiscovery = await brandDiscoveryService.getBrandDiscovery(req.user.id);
    const currentProfileData = brandDiscovery.modules?.profile?.data || {};

    // Merge selected fields from extracted data
    const extractedData = job.extracted_data;
    const mergedData = { ...currentProfileData };

    // Apply selected fields (or all if not specified)
    const fieldsToApply = selectedFields || Object.keys(extractedData);

    for (const field of fieldsToApply) {
      if (extractedData[field]?.value !== undefined) {
        // Use the extracted value
        mergedData[field] = extractedData[field].value;

        // Also create an inference for tracking
        await brandDiscoveryService.setInference(req.user.id, `profile.${field}`, {
          value: extractedData[field].value,
          source: 'scrape_job',
          source_job_id: jobId,
          confidence: extractedData[field].confidence || 0.7,
        });
      }
    }

    // Update the profile module
    const updated = await brandDiscoveryService.updateModuleData(
      req.user.id,
      'profile',
      mergedData
    );

    res.json({
      success: true,
      brandDiscovery: updated,
      appliedFields: fieldsToApply,
    });
  } catch (error) {
    logger.error('Failed to apply enrichment data', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to apply enrichment data', details: error.message });
  }
});

// ============================================================================
// GET /api/brand-discovery/word-banks
// Get word banks for profile enrichment (convenience endpoint)
// ============================================================================

router.get('/word-banks', async (req, res) => {
  const logContext = { userId: req.user.id, operation: 'GET /word-banks' };

  try {
    logger.debug('Fetching word banks', logContext);
    res.json(getAllWordBanks());
  } catch (error) {
    logger.error('Failed to fetch word banks', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to fetch word banks', details: error.message });
  }
});

// ============================================================================
// Helper Functions (to be replaced with AI integration)
// ============================================================================

/**
 * Analyze source content and generate inferences.
 * TODO: Replace with Claude API call.
 *
 * @param {string} content - Pasted content to analyze
 * @returns {Promise<Object>} Analysis result with extracted data and inferences
 */
async function analyzeSourceContent(content) {
  // Mock implementation - extract basic patterns from content
  const lowerContent = content.toLowerCase();

  // Try to extract name (look for common patterns)
  const nameMatch = content.match(/(?:Dr\.|Dr)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  const name = nameMatch ? nameMatch[0] : null;

  // Try to extract credentials
  const credentialPatterns = ['PhD', 'PsyD', 'LMFT', 'LCSW', 'LPC', 'LMHC', 'PCC', 'MCC'];
  const credentials = credentialPatterns.filter((c) => content.includes(c)).join(', ');

  // Detect tone indicators
  const clinicalWords = ['research', 'evidence', 'clinical', 'therapeutic', 'treatment', 'diagnosis'];
  const relatableWords = ['journey', 'story', 'struggled', 'personal', 'real', 'authentic'];
  const clinicalCount = clinicalWords.filter((w) => lowerContent.includes(w)).length;
  const relatableCount = relatableWords.filter((w) => lowerContent.includes(w)).length;
  const clinicalRelatable = Math.round(50 + (relatableCount - clinicalCount) * 10);

  return {
    extracted_data: {
      possible_name: name,
      possible_credentials: credentials || null,
      content_length: content.length,
      analyzed_at: new Date().toISOString(),
    },
    inferences: {
      'therapist_profile.name': name ? {
        value: name,
        source: 'source_analysis',
        confidence: 0.7,
      } : null,
      'therapist_profile.credentials': credentials ? {
        value: credentials,
        source: 'source_analysis',
        confidence: 0.8,
      } : null,
      'vibe.clinical_relatable': {
        value: Math.max(0, Math.min(100, clinicalRelatable)),
        source: 'source_analysis',
        confidence: 0.5,
      },
    },
  };
}

/**
 * Generate nuance options for a value.
 * TODO: Replace with Claude API call.
 *
 * @param {string} valueId - The value ID
 * @returns {Promise<Array>} Nuance options
 */
async function generateValueNuances(valueId) {
  // Mock nuances for common values
  const nuanceMap = {
    authenticity: [
      {
        id: 'radical_transparency',
        label: 'Radical Transparency',
        description: 'Sharing your own struggles, behind-the-scenes, "here\'s what I got wrong"',
        content_style: 'Personal stories, admitting mistakes, showing the messy middle',
      },
      {
        id: 'permission_to_be_messy',
        label: 'Permission to Be Messy',
        description: 'Normalizing imperfection, anti-hustle, "you don\'t have to have it figured out"',
        content_style: 'Validating struggle, challenging perfectionism, "good enough" messaging',
      },
      {
        id: 'congruence_over_performance',
        label: 'Congruence Over Performance',
        description: 'Calling out performative wellness, critique toxic positivity',
        content_style: 'Myth-busting, challenging trends, "what we don\'t talk about"',
      },
    ],
    courage: [
      {
        id: 'speaking_unpopular_truths',
        label: 'Speaking Unpopular Truths',
        description: 'Saying what others won\'t, challenging the status quo',
        content_style: 'Hot takes, "unpopular opinion", counter-narrative',
      },
      {
        id: 'vulnerability_as_strength',
        label: 'Vulnerability as Strength',
        description: 'Showing up scared and doing it anyway',
        content_style: 'Personal stories of fear, "here\'s what terrified me"',
      },
      {
        id: 'advocating_for_change',
        label: 'Advocating for Change',
        description: 'Standing up against systemic issues',
        content_style: 'Advocacy content, systemic critique, calls to action',
      },
    ],
    // Default nuances for other values
    default: [
      {
        id: 'personal_expression',
        label: 'Personal Expression',
        description: 'How this value shows up in your daily work',
        content_style: 'Personal stories and reflections',
      },
      {
        id: 'teaching_others',
        label: 'Teaching Others',
        description: 'Helping clients embody this value',
        content_style: 'Educational content and practical tips',
      },
      {
        id: 'challenging_norms',
        label: 'Challenging Norms',
        description: 'Using this value to question assumptions',
        content_style: 'Thought-provoking questions and counter-narratives',
      },
    ],
  };

  return nuanceMap[valueId] || nuanceMap.default;
}

export default router;
