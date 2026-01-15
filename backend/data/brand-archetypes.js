/**
 * Brand Archetypes for Brand Discovery
 *
 * 8 brand archetypes that represent different therapist/coach brand personalities.
 * Each archetype includes vibe correlations for matching against user's slider positions.
 *
 * @module data/brand-archetypes
 */

import { VALUE_ARCHETYPE_AFFINITY } from './values-deck.js';

/**
 * The 8 brand archetypes with full definitions.
 * Each archetype has correlation ranges for matching against Vibe slider values.
 *
 * Vibe sliders (0-100 scale):
 * - clinical_relatable: 0=Clinical/Academic, 100=Relatable/Lived Experience
 * - quiet_energetic: 0=Quiet/Soothing, 100=High-Energy/Challenger
 * - minimalist_eclectic: 0=Minimalist, 100=Eclectic/Rich
 * - scientific_holistic: 0=Scientific/Evidence-Based, 100=Holistic/Intuitive
 * - formal_playful: 0=Formal/Professional, 100=Playful/Casual
 * - expert_guide: 0=Expert/Authority, 100=Guide/Fellow Traveler
 *
 * @type {Array<Object>}
 */
const BRAND_ARCHETYPES = [
  // ============================================================================
  // The Sage
  // ============================================================================
  {
    id: 'sage',
    name: 'The Sage',
    tagline: 'Wisdom through understanding',
    description:
      'You lead with knowledge and research. Your content educates and illuminates, ' +
      'helping people understand the "why" behind their experiences. You\'re the trusted ' +
      'expert who makes complex things accessible.',
    vibeCorrelation: {
      clinical_relatable: [0, 40], // Leans clinical
      quiet_energetic: [20, 60], // More thoughtful than loud
      scientific_holistic: [0, 40], // Leans scientific
    },
    contentStyle: {
      strengths: [
        'Deep dives',
        'Research summaries',
        'Nuanced explanations',
        'Myth-busting with evidence',
      ],
      tone: 'Thoughtful, measured, authoritative but accessible',
      exampleHooks: [
        'Here\'s what the research actually says about...',
        'The psychology behind why you...',
        'Most people misunderstand this about...',
      ],
    },
    voiceTraits: ['Evidence-informed', 'Nuanced', 'Educational', 'Thorough'],
  },

  // ============================================================================
  // The Healer
  // ============================================================================
  {
    id: 'healer',
    name: 'The Healer',
    tagline: 'Holding space for transformation',
    description:
      'You lead with compassion and nurturing presence. Your content creates safety ' +
      'and validation, helping people feel seen and held. You\'re the warm embrace ' +
      'that makes healing possible.',
    vibeCorrelation: {
      clinical_relatable: [50, 100], // Leans relatable
      quiet_energetic: [0, 40], // Quiet, soothing
      scientific_holistic: [40, 80], // Middle to holistic
    },
    contentStyle: {
      strengths: [
        'Validation',
        'Gentle invitations',
        'Creating safety',
        'Normalization',
      ],
      tone: 'Warm, soft, nurturing, unconditionally accepting',
      exampleHooks: [
        'It makes sense that you feel...',
        'You\'re not broken, you\'re...',
        'A gentle reminder that...',
      ],
    },
    voiceTraits: ['Nurturing', 'Validating', 'Soft', 'Unconditional'],
  },

  // ============================================================================
  // The Guide
  // ============================================================================
  {
    id: 'guide',
    name: 'The Guide',
    tagline: 'Walking alongside you',
    description:
      'You lead as a fellow traveler who\'s been there. Your content shares the ' +
      'journey, not from above but from beside. You\'re the relatable peer who ' +
      'makes people feel less alone.',
    vibeCorrelation: {
      clinical_relatable: [60, 100], // Very relatable
      quiet_energetic: [30, 70], // Balanced energy
      expert_guide: [60, 100], // Guide over expert
    },
    contentStyle: {
      strengths: [
        'Personal stories',
        'Shared struggles',
        'Practical wisdom',
        'Peer support',
      ],
      tone: 'Relatable, personal, "been there" energy, conversational',
      exampleHooks: [
        'Here\'s what I wish someone had told me...',
        'I used to struggle with this too...',
        'Something I learned the hard way...',
      ],
    },
    voiceTraits: ['Relatable', 'Personal', 'Humble', 'Companionate'],
  },

  // ============================================================================
  // The Challenger
  // ============================================================================
  {
    id: 'challenger',
    name: 'The Challenger',
    tagline: 'Disrupting what doesn\'t serve you',
    description:
      'You lead with truth-telling and provocation. Your content calls out what\'s ' +
      'not working and challenges conventional wisdom. You\'re the voice that gives ' +
      'people permission to question everything.',
    vibeCorrelation: {
      quiet_energetic: [60, 100], // High energy
      clinical_relatable: [30, 70], // Can be either
      formal_playful: [40, 80], // Some edge
    },
    contentStyle: {
      strengths: [
        'Hot takes',
        'Myth-busting',
        'Calling out BS',
        'Counter-narratives',
      ],
      tone: 'Direct, provocative, unapologetic, permission-giving',
      exampleHooks: [
        'Unpopular opinion:',
        'We need to talk about...',
        'Stop telling yourself that...',
        'The lie we\'ve all been sold about...',
      ],
    },
    voiceTraits: ['Direct', 'Provocative', 'Bold', 'Truth-telling'],
  },

  // ============================================================================
  // The Alchemist
  // ============================================================================
  {
    id: 'alchemist',
    name: 'The Alchemist',
    tagline: 'Transforming pain into power',
    description:
      'You lead with vision of what\'s possible. Your content sees the gold in the ' +
      'shadow, the growth in the struggle. You\'re the one who helps people reimagine ' +
      'their story.',
    vibeCorrelation: {
      scientific_holistic: [50, 100], // Leans holistic
      clinical_relatable: [40, 80], // Middle ground
      quiet_energetic: [40, 80], // Can vary
    },
    contentStyle: {
      strengths: [
        'Reframing',
        'Finding meaning',
        'Possibility thinking',
        'Integration work',
      ],
      tone: 'Visionary, hopeful, transformative, seeing potential',
      exampleHooks: [
        'What if this struggle is actually...',
        'The gift hidden in your...',
        'Imagine if you could...',
      ],
    },
    voiceTraits: ['Visionary', 'Hopeful', 'Integrative', 'Possibility-focused'],
  },

  // ============================================================================
  // The Anchor
  // ============================================================================
  {
    id: 'anchor',
    name: 'The Anchor',
    tagline: 'Grounded stability in the storm',
    description:
      'You lead with steadiness and practical wisdom. Your content provides solid ' +
      'ground and actionable tools. You\'re the calm in the chaos that people can ' +
      'depend on.',
    vibeCorrelation: {
      quiet_energetic: [0, 40], // Calm, steady
      clinical_relatable: [30, 60], // Balanced
      scientific_holistic: [20, 60], // Leans practical
    },
    contentStyle: {
      strengths: [
        'Practical tools',
        'Step-by-step guidance',
        'Grounding techniques',
        'Reliability',
      ],
      tone: 'Calm, steady, reassuring, practical',
      exampleHooks: [
        'Here\'s a simple tool you can use today...',
        'When everything feels chaotic, start here...',
        'Three things you can do right now...',
      ],
    },
    voiceTraits: ['Steady', 'Practical', 'Grounding', 'Reliable'],
  },

  // ============================================================================
  // The Liberator
  // ============================================================================
  {
    id: 'liberator',
    name: 'The Liberator',
    tagline: 'Breaking chains, building freedom',
    description:
      'You lead with a vision of liberation and justice. Your content challenges ' +
      'systems and empowers people to break free from what constrains them. You\'re ' +
      'the voice for those finding their own.',
    vibeCorrelation: {
      quiet_energetic: [50, 100], // Higher energy
      scientific_holistic: [40, 100], // Can vary
      clinical_relatable: [50, 100], // More relatable
    },
    contentStyle: {
      strengths: [
        'Systemic critique',
        'Empowerment',
        'Challenging norms',
        'Advocacy',
      ],
      tone: 'Empowering, justice-oriented, systemic, liberating',
      exampleHooks: [
        'You were never meant to...',
        'The system wasn\'t built for...',
        'It\'s time to stop accepting...',
      ],
    },
    voiceTraits: ['Empowering', 'Justice-minded', 'Liberating', 'Systemic'],
  },

  // ============================================================================
  // The Weaver
  // ============================================================================
  {
    id: 'weaver',
    name: 'The Weaver',
    tagline: 'Connection as medicine',
    description:
      'You lead with community and connection. Your content brings people together ' +
      'and emphasizes the relational nature of healing. You\'re the one who reminds us ' +
      'we\'re not meant to do this alone.',
    vibeCorrelation: {
      clinical_relatable: [50, 100], // Relatable
      quiet_energetic: [30, 70], // Balanced
      expert_guide: [50, 100], // Guide energy
    },
    contentStyle: {
      strengths: [
        'Community building',
        'Relational wisdom',
        '"We" language',
        'Interdependence',
      ],
      tone: 'Inclusive, connecting, community-focused, interdependent',
      exampleHooks: [
        'We\'re all navigating...',
        'You\'re not the only one who...',
        'Together, we can...',
      ],
    },
    voiceTraits: ['Connecting', 'Inclusive', 'Community-focused', 'Relational'],
  },
];

/**
 * Get an archetype by its ID.
 *
 * @param {string} id - The archetype ID
 * @returns {Object|undefined} The archetype object or undefined if not found
 */
function getArchetypeById(id) {
  return BRAND_ARCHETYPES.find((a) => a.id === id);
}

/**
 * Calculate archetype scores based on vibe slider values.
 * Returns archetypes sorted by match score (highest first).
 *
 * @param {Object} vibeSliders - Object with slider values (0-100 or null)
 * @returns {Array<{archetype: Object, score: number}>} Sorted array of archetypes with scores
 */
function calculateArchetypeScores(vibeSliders) {
  const scores = BRAND_ARCHETYPES.map((archetype) => {
    let score = 0;
    let matchCount = 0;

    // Score each slider against archetype's correlation ranges
    for (const [slider, range] of Object.entries(archetype.vibeCorrelation)) {
      const value = vibeSliders[slider];

      // Skip if slider not set
      if (value === null || value === undefined) {
        continue;
      }

      matchCount++;
      const [min, max] = range;

      if (value >= min && value <= max) {
        // Perfect match within range
        score += 100;
      } else {
        // Partial credit based on distance from range
        const distance = value < min ? min - value : value - max;
        score += Math.max(0, 100 - distance * 2);
      }
    }

    // Normalize score by match count
    const normalizedScore = matchCount > 0 ? score / matchCount : 0;

    return {
      archetype,
      score: normalizedScore,
    };
  });

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  return scores;
}

/**
 * Determine primary and secondary archetypes based on vibe sliders and values.
 *
 * @param {Object} vibeSliders - Object with slider values (0-100 or null)
 * @param {Array<string>} powerFiveValues - Array of value IDs in ranked order
 * @returns {{primary: Object, secondary: Object|null, blendedName: string}}
 */
function determineArchetypes(vibeSliders, powerFiveValues = []) {
  // Get base scores from vibe sliders
  const scores = calculateArchetypeScores(vibeSliders);

  // Boost scores based on value alignment
  scores.forEach(({ archetype }) => {
    const affinityValues = VALUE_ARCHETYPE_AFFINITY[archetype.id] || [];
    let valueBoost = 0;

    powerFiveValues.forEach((valueId) => {
      if (affinityValues.includes(valueId)) {
        valueBoost += 15;
      }
    });

    // Cap value boost at 45 points
    archetype.valueBoost = Math.min(valueBoost, 45);
  });

  // Recalculate with value boost
  scores.forEach((item) => {
    item.totalScore = item.score + (item.archetype.valueBoost || 0);
  });

  // Sort by total score
  scores.sort((a, b) => b.totalScore - a.totalScore);

  const primary = scores[0]?.archetype || null;
  const secondary = scores[1]?.totalScore > 60 ? scores[1]?.archetype : null;

  // Generate blended name if there's a secondary
  let blendedName = primary?.name || 'Unknown';
  if (secondary) {
    // Create a creative blend name
    const blends = {
      'sage_healer': 'The Wise Healer',
      'sage_guide': 'The Scholarly Guide',
      'sage_challenger': 'The Evidence-Based Provocateur',
      'healer_guide': 'The Nurturing Companion',
      'healer_weaver': 'The Community Healer',
      'guide_challenger': 'The Relatable Disruptor',
      'guide_weaver': 'The Connected Guide',
      'challenger_liberator': 'The Radical Truth-Teller',
      'anchor_sage': 'The Grounded Expert',
      'anchor_healer': 'The Steady Nurturer',
      'alchemist_healer': 'The Transformative Healer',
      'alchemist_challenger': 'The Visionary Disruptor',
    };

    const key = `${primary.id}_${secondary.id}`;
    const reverseKey = `${secondary.id}_${primary.id}`;
    blendedName = blends[key] || blends[reverseKey] || `The ${primary.name.replace('The ', '')} ${secondary.name.replace('The ', '')}`;
  }

  return {
    primary,
    secondary,
    blendedName,
  };
}

export {
  BRAND_ARCHETYPES,
  getArchetypeById,
  calculateArchetypeScores,
  determineArchetypes,
};
