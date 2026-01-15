/**
 * Brand DNA Synthesizer
 *
 * AI-powered synthesis of Brand DNA from completed brand discovery modules.
 * Uses Claude to generate archetypes, brand promise, voice characteristics,
 * and AI directives for content generation.
 *
 * @module services/brand-dna-synthesizer
 */

import logger from '../lib/logger.js';
import { determineArchetypes } from '../data/brand-archetypes.js';
import { getAudienceArchetypeById, generateAudienceDescription } from '../data/audience-archetypes.js';
import { getModalityById } from '../data/modalities.js';
import { getSpecialtyById, generateKeywordsFromSpecialties } from '../data/specialties.js';
import { generatePlatformAdaptations } from '../data/platforms.js';
import { getValueById } from '../data/values-deck.js';

// ============================================================================
// Brand DNA Synthesis
// ============================================================================

/**
 * Synthesize Brand DNA from completed brand discovery modules.
 * This is the main entry point for Brand DNA generation.
 *
 * @param {Object} modules - The modules object from brand_discovery
 * @param {Object} inferences - Confirmed inferences from source analysis
 * @returns {Promise<Object>} Synthesized Brand DNA
 */
async function synthesizeBrandDna(modules, inferences = {}) {
  const logContext = { operation: 'synthesizeBrandDna' };
  logger.info('Starting Brand DNA synthesis', logContext);

  try {
    // Extract data from completed modules
    const vibeData = modules.vibe?.data || {};
    const valuesData = modules.values?.data || {};
    const methodData = modules.method?.data || {};
    const audienceData = modules.audience?.data || {};
    const channelsData = modules.channels?.data || {};
    const sourcesData = modules.sources?.data || {};

    // 1. Determine brand archetypes
    const powerFiveValues = valuesData.power_five?.map((v) => v.value) || [];
    const archetypeResult = determineArchetypes(vibeData, powerFiveValues);

    // 2. Build brand promise
    const brandPromise = buildBrandPromise(audienceData, methodData, sourcesData, inferences);

    // 3. Build content pillars from values and specialties
    const contentPillars = buildContentPillars(valuesData, methodData, audienceData);

    // 4. Build voice characteristics from vibe and archetype
    const voiceCharacteristics = buildVoiceCharacteristics(vibeData, archetypeResult, valuesData);

    // 5. Build anti-patterns (what to avoid)
    const antiPatterns = buildAntiPatterns(archetypeResult, vibeData);

    // 6. Build AI directives for content generation
    const aiDirectives = buildAiDirectives(
      archetypeResult,
      voiceCharacteristics,
      channelsData,
      valuesData
    );

    // Assemble final Brand DNA
    const brandDna = {
      archetype: {
        primary_id: archetypeResult.primary?.id || null,
        primary_name: archetypeResult.primary?.name || null,
        secondary_id: archetypeResult.secondary?.id || null,
        secondary_name: archetypeResult.secondary?.name || null,
        blended_name: archetypeResult.blendedName,
        blended_description: generateBlendedDescription(archetypeResult),
      },
      brand_promise: brandPromise,
      content_pillars: contentPillars,
      voice_characteristics: voiceCharacteristics,
      anti_patterns: antiPatterns,
      ai_directives: aiDirectives,
      generated_at: new Date().toISOString(),
      source_modules: {
        vibe: modules.vibe?.status === 'complete',
        values: modules.values?.status === 'complete',
        method: modules.method?.status === 'complete',
        audience: modules.audience?.status === 'complete',
        channels: modules.channels?.status === 'complete',
        sources: modules.sources?.status === 'complete',
      },
    };

    logger.info('Brand DNA synthesis complete', {
      ...logContext,
      archetype: brandDna.archetype.blended_name,
      pillarsCount: contentPillars.length,
    });

    return brandDna;
  } catch (error) {
    logger.error('Brand DNA synthesis failed', { ...logContext, error: error.message });
    throw error;
  }
}

// ============================================================================
// Component Builders
// ============================================================================

/**
 * Build brand promise from audience, method, and source data.
 * Format: "I help [audience] who struggle with [pain] to [outcome] through [method]"
 *
 * @param {Object} audienceData - Audience module data
 * @param {Object} methodData - Method module data
 * @param {Object} sourcesData - Sources module data
 * @param {Object} inferences - Confirmed inferences
 * @returns {Object} Brand promise object
 */
function buildBrandPromise(audienceData, methodData, sourcesData, inferences) {
  // Determine audience description
  const selectedArchetypes = audienceData.archetypes || [];
  const audienceDescription = selectedArchetypes.length > 0
    ? generateAudienceFromArchetypes(selectedArchetypes)
    : inferences['audience.who_they_serve']?.value || 'people seeking growth and healing';

  // Determine pain points
  const painPoints = selectedArchetypes.length > 0
    ? getPainPointsFromArchetypes(selectedArchetypes)
    : ['feeling stuck', 'overwhelm', 'disconnection'];

  // Determine method description
  const modalities = methodData.modalities || [];
  const methodDescription = modalities.length > 0
    ? formatModalitiesForPromise(modalities)
    : inferences['method.modalities']?.value || 'compassionate, evidence-informed approaches';

  // Determine outcome
  const outcome = determineOutcome(audienceData, methodData);

  // Build the promise
  const filled = `I help ${audienceDescription} who struggle with ${painPoints[0]} to ${outcome} through ${methodDescription}.`;

  return {
    filled,
    parts: {
      audience: audienceDescription,
      pain_point: painPoints[0],
      outcome,
      method: methodDescription,
    },
    pain_points: painPoints.slice(0, 3),
  };
}

/**
 * Build content pillars from values and specialties.
 *
 * @param {Object} valuesData - Values module data
 * @param {Object} methodData - Method module data
 * @param {Object} audienceData - Audience module data
 * @returns {Array<Object>} Content pillars
 */
function buildContentPillars(valuesData, methodData, audienceData) {
  const pillars = [];

  // Pillar from primary value
  const powerFive = valuesData.power_five || [];
  if (powerFive.length > 0) {
    const primaryValue = getValueById(powerFive[0]?.value);
    if (primaryValue) {
      pillars.push({
        name: `${primaryValue.label} in Practice`,
        description: `Content exploring ${primaryValue.label.toLowerCase()} and how it shows up in daily life`,
        content_types: ['personal stories', 'reflections', 'quotes'],
        example_topics: [
          `What ${primaryValue.label.toLowerCase()} means to me`,
          `When ${primaryValue.label.toLowerCase()} feels hard`,
          `Small acts of ${primaryValue.label.toLowerCase()}`,
        ],
      });
    }
  }

  // Pillar from specialties
  const specialties = methodData.specialties || [];
  if (specialties.length > 0) {
    const topSpecialty = getSpecialtyById(specialties[0]);
    if (topSpecialty) {
      pillars.push({
        name: topSpecialty.name,
        description: `Educational and supportive content about ${topSpecialty.name.toLowerCase()}`,
        content_types: ['education', 'tips', 'myth-busting'],
        example_topics: [
          `Understanding ${topSpecialty.name.toLowerCase()}`,
          `Common misconceptions about ${topSpecialty.name.toLowerCase()}`,
          `Coping strategies for ${topSpecialty.name.toLowerCase()}`,
        ],
      });
    }
  }

  // Pillar from audience
  const archetypes = audienceData.archetypes || [];
  if (archetypes.length > 0) {
    const primaryArchetype = getAudienceArchetypeById(archetypes[0]?.id || archetypes[0]);
    if (primaryArchetype) {
      pillars.push({
        name: `For ${primaryArchetype.name.replace('The ', '')}s`,
        description: `Content specifically for those who identify as ${primaryArchetype.name}`,
        content_types: ['validation', 'practical guidance', 'stories'],
        example_topics: primaryArchetype.contentHooks.slice(0, 3),
      });
    }
  }

  // Professional insights pillar (default)
  pillars.push({
    name: 'Behind the Practice',
    description: 'Professional insights, lessons learned, and practitioner perspective',
    content_types: ['reflections', 'professional development', 'industry commentary'],
    example_topics: [
      'What I wish clients knew',
      'Lessons from my practice',
      'How I approach difficult sessions',
    ],
  });

  return pillars.slice(0, 4); // Max 4 pillars
}

/**
 * Build voice characteristics from vibe, archetype, and values.
 *
 * @param {Object} vibeData - Vibe module data
 * @param {Object} archetypeResult - Archetype determination result
 * @param {Object} valuesData - Values module data
 * @returns {Array<Object>} Voice characteristics
 */
function buildVoiceCharacteristics(vibeData, archetypeResult, valuesData) {
  const characteristics = [];

  // From primary archetype
  if (archetypeResult.primary) {
    archetypeResult.primary.voiceTraits.forEach((trait) => {
      characteristics.push({
        trait,
        description: `Core to your ${archetypeResult.primary.name} archetype`,
        do: getTraitGuidance(trait, 'do'),
        dont: getTraitGuidance(trait, 'dont'),
      });
    });
  }

  // From vibe sliders
  if (vibeData.clinical_relatable !== null && vibeData.clinical_relatable !== undefined) {
    if (vibeData.clinical_relatable > 60) {
      characteristics.push({
        trait: 'Relatable',
        description: 'You speak from lived experience, not just theory',
        do: 'Share personal stories, use "I" and "we", acknowledge struggle',
        dont: 'Sound like a textbook, use only clinical language, stay distant',
      });
    } else if (vibeData.clinical_relatable < 40) {
      characteristics.push({
        trait: 'Evidence-Based',
        description: 'You ground your content in research and expertise',
        do: 'Reference research, explain mechanisms, provide citations',
        dont: 'Make claims without backing, oversimplify complex topics',
      });
    }
  }

  // From primary value nuance
  const powerFive = valuesData.power_five || [];
  if (powerFive[0]?.nuance) {
    characteristics.push({
      trait: powerFive[0].nuance.label,
      description: `Your expression of ${powerFive[0].value}`,
      do: powerFive[0].nuance.content_style || 'Embody this in your content',
      dont: 'Contradict this core value expression',
    });
  }

  return characteristics.slice(0, 5); // Max 5 characteristics
}

/**
 * Build anti-patterns (what to avoid) based on archetype and vibe.
 *
 * @param {Object} archetypeResult - Archetype determination result
 * @param {Object} vibeData - Vibe module data
 * @returns {Array<Object>} Anti-patterns
 */
function buildAntiPatterns(archetypeResult, vibeData) {
  const antiPatterns = [];

  // Archetype-based anti-patterns
  const archetypeAntiPatterns = {
    sage: {
      pattern: 'Oversimplifying complex topics',
      why: 'Your audience expects nuance and depth',
      instead: 'Take time to explain the complexity',
    },
    healer: {
      pattern: 'Tough love or harsh delivery',
      why: 'Your warmth is your strength',
      instead: 'Maintain gentleness even with hard truths',
    },
    guide: {
      pattern: 'Positioning as the expert above',
      why: 'Your relatability comes from walking alongside',
      instead: 'Share your own struggles and journey',
    },
    challenger: {
      pattern: 'Being soft or wishy-washy',
      why: 'Your audience follows you for direct truth',
      instead: 'Say what others won\'t, clearly and boldly',
    },
    alchemist: {
      pattern: 'Dwelling in the negative without transformation',
      why: 'Your gift is seeing possibility in pain',
      instead: 'Always point toward growth and meaning',
    },
    anchor: {
      pattern: 'Abstract or theoretical content',
      why: 'Your audience needs practical, grounded tools',
      instead: 'Focus on actionable, step-by-step guidance',
    },
    liberator: {
      pattern: 'Accepting status quo or playing small',
      why: 'Your audience needs permission to challenge systems',
      instead: 'Name what\'s wrong and empower action',
    },
    weaver: {
      pattern: 'Individual-focused content that ignores community',
      why: 'Connection is your core message',
      instead: 'Use "we" language and build community',
    },
  };

  if (archetypeResult.primary?.id && archetypeAntiPatterns[archetypeResult.primary.id]) {
    antiPatterns.push(archetypeAntiPatterns[archetypeResult.primary.id]);
  }

  // Vibe-based anti-patterns
  if (vibeData.quiet_energetic > 70) {
    antiPatterns.push({
      pattern: 'Being too soft or passive',
      why: 'Your energy is part of your brand',
      instead: 'Bring your bold energy to every post',
    });
  } else if (vibeData.quiet_energetic < 30) {
    antiPatterns.push({
      pattern: 'Aggressive or provocative content',
      why: 'Your calm presence is your brand',
      instead: 'Maintain your soothing, gentle tone',
    });
  }

  // Universal anti-patterns
  antiPatterns.push({
    pattern: 'Generic, templated content',
    why: 'Your unique voice is what connects',
    instead: 'Write as yourself, not as a brand',
  });

  return antiPatterns.slice(0, 4);
}

/**
 * Build AI directives for content generation pipeline.
 *
 * @param {Object} archetypeResult - Archetype determination
 * @param {Array<Object>} voiceCharacteristics - Voice characteristics
 * @param {Object} channelsData - Channels module data
 * @param {Object} valuesData - Values module data
 * @returns {Object} AI directives
 */
function buildAiDirectives(archetypeResult, voiceCharacteristics, channelsData, valuesData) {
  const systemPromptAdditions = [];

  // Archetype-based directive
  if (archetypeResult.primary) {
    systemPromptAdditions.push(
      `Write in the voice of ${archetypeResult.blendedName}. ${archetypeResult.primary.contentStyle.tone}.`
    );
    systemPromptAdditions.push(
      `Strengths to emphasize: ${archetypeResult.primary.contentStyle.strengths.join(', ')}.`
    );
  }

  // Voice characteristics directive
  const voiceTraits = voiceCharacteristics.map((v) => v.trait).join(', ');
  if (voiceTraits) {
    systemPromptAdditions.push(`Voice traits: ${voiceTraits}.`);
  }

  // Values-based directive
  const powerFive = valuesData.power_five || [];
  if (powerFive.length > 0) {
    const valueNames = powerFive.slice(0, 3).map((v) => v.value).join(', ');
    systemPromptAdditions.push(`Core values to reflect: ${valueNames}.`);
  }

  // Build platform adaptations
  const platformAdaptations = channelsData.ranking
    ? generatePlatformAdaptations(channelsData.ranking)
    : {};

  // Determine temperature hint based on archetype
  const temperatureHint = archetypeResult.primary?.id === 'challenger' ? 0.8
    : archetypeResult.primary?.id === 'sage' ? 0.6
      : 0.7;

  return {
    system_prompt_additions: systemPromptAdditions,
    temperature_hint: temperatureHint,
    content_preferences: {
      look_for: archetypeResult.primary?.contentStyle.strengths || [],
      avoid: [],
      framing: archetypeResult.primary?.contentStyle.tone || 'Professional and warm',
    },
    platform_adaptations: platformAdaptations,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate blended description from archetype result.
 */
function generateBlendedDescription(archetypeResult) {
  if (!archetypeResult.primary) {
    return 'A unique voice combining multiple brand qualities.';
  }

  if (!archetypeResult.secondary) {
    return archetypeResult.primary.description;
  }

  return `You combine the ${archetypeResult.primary.tagline.toLowerCase()} of ${archetypeResult.primary.name} ` +
    `with the ${archetypeResult.secondary.tagline.toLowerCase()} of ${archetypeResult.secondary.name}.`;
}

/**
 * Generate audience description from selected archetypes.
 */
function generateAudienceFromArchetypes(archetypes) {
  if (archetypes.length === 0) return 'people seeking growth';

  const firstArchetype = getAudienceArchetypeById(archetypes[0]?.id || archetypes[0]);
  if (!firstArchetype) return 'people seeking growth';

  if (archetypes.length === 1) {
    return firstArchetype.name.replace('The ', '').toLowerCase() + 's';
  }

  const names = archetypes.slice(0, 2).map((a) => {
    const arch = getAudienceArchetypeById(a?.id || a);
    return arch ? arch.name.replace('The ', '').toLowerCase() + 's' : null;
  }).filter(Boolean);

  return names.join(' and ');
}

/**
 * Get pain points from selected audience archetypes.
 */
function getPainPointsFromArchetypes(archetypes) {
  const painPoints = [];

  archetypes.forEach((a) => {
    const archetype = getAudienceArchetypeById(a?.id || a);
    if (archetype) {
      painPoints.push(archetype.painPoint.toLowerCase());
    }
  });

  return painPoints.length > 0 ? painPoints : ['feeling stuck'];
}

/**
 * Format modalities for brand promise.
 */
function formatModalitiesForPromise(modalities) {
  if (modalities.length === 0) return 'thoughtful, personalized approaches';

  const modalityNames = modalities.slice(0, 2).map((id) => {
    const modality = getModalityById(id);
    return modality ? modality.name : null;
  }).filter(Boolean);

  if (modalityNames.length === 0) return 'thoughtful, personalized approaches';
  if (modalityNames.length === 1) return modalityNames[0];

  return modalityNames.join(' and ');
}

/**
 * Determine outcome based on audience and method.
 */
function determineOutcome(audienceData, methodData) {
  // Default outcomes based on common patterns
  const defaultOutcomes = [
    'find clarity and peace',
    'build sustainable wellbeing',
    'create meaningful change',
    'develop self-compassion',
    'break free from old patterns',
  ];

  // Could be enhanced with AI or more sophisticated logic
  return defaultOutcomes[Math.floor(Math.random() * defaultOutcomes.length)];
}

/**
 * Get guidance for a voice trait.
 */
function getTraitGuidance(trait, type) {
  const guidance = {
    'Evidence-informed': {
      do: 'Reference research and explain the science',
      dont: 'Make claims without support',
    },
    'Nuanced': {
      do: 'Acknowledge complexity and multiple perspectives',
      dont: 'Oversimplify or speak in absolutes',
    },
    'Educational': {
      do: 'Teach and explain clearly',
      dont: 'Assume knowledge or use unexplained jargon',
    },
    'Nurturing': {
      do: 'Use warm, accepting language',
      dont: 'Be harsh or judgmental',
    },
    'Direct': {
      do: 'Say what you mean clearly',
      dont: 'Hedge or be vague',
    },
    'Relatable': {
      do: 'Share personal experience',
      dont: 'Stay distant or theoretical',
    },
  };

  const traitGuidance = guidance[trait] || {
    do: `Embody ${trait.toLowerCase()} in your content`,
    dont: `Don't contradict ${trait.toLowerCase()}`,
  };

  return traitGuidance[type] || traitGuidance.do;
}

export {
  synthesizeBrandDna,
  buildBrandPromise,
  buildContentPillars,
  buildVoiceCharacteristics,
  buildAntiPatterns,
  buildAiDirectives,
};
