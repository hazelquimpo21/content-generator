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

    res.json({
      success: true,
      data: brandDiscovery,
    });
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

    res.json({
      success: true,
      message: 'Brand discovery reset successfully',
      data: brandDiscovery,
    });
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

    res.json({
      success: true,
      data: brandDiscovery,
    });
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

    res.json({
      success: true,
      data: brandDiscovery,
    });
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

    res.json({
      success: true,
      data: updated,
    });
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

    res.json({
      success: true,
      data: {
        values: VALUES_DECK,
        shuffled_values: getShuffledDeck(),
        brand_archetypes: BRAND_ARCHETYPES,
        audience_archetypes: AUDIENCE_ARCHETYPES,
        modalities: MODALITIES,
        specialties: SPECIALTIES,
        platforms: PLATFORMS,
        default_platform_order: DEFAULT_PLATFORM_ORDER,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch reference data', { ...logContext, error: error.message });
    res.status(500).json({ error: 'Failed to fetch reference data', details: error.message });
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
