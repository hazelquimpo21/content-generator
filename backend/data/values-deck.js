/**
 * Values Deck for Brand Discovery
 *
 * 30 values organized into 3 categories for the card selection exercise.
 * Users swipe through these to identify which values resonate with their work.
 *
 * @module data/values-deck
 */

/**
 * The complete deck of 30 values for the Values module.
 * Each value has an id, label, description, and category.
 *
 * @type {Array<{id: string, label: string, description: string, category: string}>}
 */
const VALUES_DECK = [
  // ============================================================================
  // Core Values - Fundamental principles
  // ============================================================================
  {
    id: 'authenticity',
    label: 'Authenticity',
    description: 'Being genuine and true to yourself',
    category: 'core',
  },
  {
    id: 'integrity',
    label: 'Integrity',
    description: 'Doing the right thing, even when it\'s hard',
    category: 'core',
  },
  {
    id: 'honesty',
    label: 'Honesty',
    description: 'Speaking truth with compassion',
    category: 'core',
  },
  {
    id: 'freedom',
    label: 'Freedom',
    description: 'Autonomy and self-determination',
    category: 'core',
  },
  {
    id: 'justice',
    label: 'Justice',
    description: 'Fairness and equity for all',
    category: 'core',
  },
  {
    id: 'balance',
    label: 'Balance',
    description: 'Harmony between different life areas',
    category: 'core',
  },
  {
    id: 'simplicity',
    label: 'Simplicity',
    description: 'Clarity and minimizing complexity',
    category: 'core',
  },
  {
    id: 'peace',
    label: 'Peace',
    description: 'Inner calm and conflict resolution',
    category: 'core',
  },
  {
    id: 'autonomy',
    label: 'Autonomy',
    description: 'Self-governance and independence',
    category: 'core',
  },
  {
    id: 'groundedness',
    label: 'Groundedness',
    description: 'Being rooted and stable',
    category: 'core',
  },

  // ============================================================================
  // Growth Values - Development and transformation
  // ============================================================================
  {
    id: 'growth',
    label: 'Growth',
    description: 'Continuous learning and development',
    category: 'growth',
  },
  {
    id: 'courage',
    label: 'Courage',
    description: 'Facing fears and taking risks',
    category: 'growth',
  },
  {
    id: 'resilience',
    label: 'Resilience',
    description: 'Bouncing back from adversity',
    category: 'growth',
  },
  {
    id: 'curiosity',
    label: 'Curiosity',
    description: 'Wonder and desire to understand',
    category: 'growth',
  },
  {
    id: 'wisdom',
    label: 'Wisdom',
    description: 'Deep understanding and good judgment',
    category: 'growth',
  },
  {
    id: 'creativity',
    label: 'Creativity',
    description: 'Innovation and self-expression',
    category: 'growth',
  },
  {
    id: 'excellence',
    label: 'Excellence',
    description: 'Striving for high quality',
    category: 'growth',
  },
  {
    id: 'mastery',
    label: 'Mastery',
    description: 'Deep expertise and skill',
    category: 'growth',
  },
  {
    id: 'adventure',
    label: 'Adventure',
    description: 'Exploration and new experiences',
    category: 'growth',
  },
  {
    id: 'transformation',
    label: 'Transformation',
    description: 'Profound change and evolution',
    category: 'growth',
  },

  // ============================================================================
  // Relational Values - Connection and community
  // ============================================================================
  {
    id: 'connection',
    label: 'Connection',
    description: 'Deep bonds with others',
    category: 'relational',
  },
  {
    id: 'compassion',
    label: 'Compassion',
    description: 'Care for others\' suffering',
    category: 'relational',
  },
  {
    id: 'empathy',
    label: 'Empathy',
    description: 'Understanding others\' experiences',
    category: 'relational',
  },
  {
    id: 'community',
    label: 'Community',
    description: 'Belonging to something larger',
    category: 'relational',
  },
  {
    id: 'belonging',
    label: 'Belonging',
    description: 'Being accepted and included',
    category: 'relational',
  },
  {
    id: 'trust',
    label: 'Trust',
    description: 'Reliability and faith in others',
    category: 'relational',
  },
  {
    id: 'presence',
    label: 'Presence',
    description: 'Being fully here, now',
    category: 'relational',
  },
  {
    id: 'service',
    label: 'Service',
    description: 'Contributing to others\' wellbeing',
    category: 'relational',
  },
  {
    id: 'generosity',
    label: 'Generosity',
    description: 'Giving freely of yourself',
    category: 'relational',
  },
  {
    id: 'vulnerability',
    label: 'Vulnerability',
    description: 'Openness and emotional honesty',
    category: 'relational',
  },
];

/**
 * Map of value IDs to their archetype affinities.
 * Used when calculating archetype scores based on selected values.
 *
 * @type {Object<string, string[]>}
 */
const VALUE_ARCHETYPE_AFFINITY = {
  sage: ['wisdom', 'curiosity', 'mastery', 'excellence'],
  healer: ['compassion', 'empathy', 'presence', 'service'],
  guide: ['connection', 'authenticity', 'vulnerability', 'generosity'],
  challenger: ['courage', 'honesty', 'justice', 'freedom'],
  alchemist: ['transformation', 'creativity', 'growth', 'wisdom'],
  anchor: ['groundedness', 'balance', 'peace', 'simplicity'],
  liberator: ['freedom', 'justice', 'courage', 'autonomy'],
  weaver: ['connection', 'community', 'belonging', 'empathy'],
};

/**
 * Get a value by its ID.
 *
 * @param {string} id - The value ID
 * @returns {Object|undefined} The value object or undefined if not found
 */
function getValueById(id) {
  return VALUES_DECK.find((v) => v.id === id);
}

/**
 * Get all values in a category.
 *
 * @param {string} category - The category ('core', 'growth', 'relational')
 * @returns {Array} Values in that category
 */
function getValuesByCategory(category) {
  return VALUES_DECK.filter((v) => v.category === category);
}

/**
 * Get shuffled deck for card presentation.
 * Uses Fisher-Yates shuffle algorithm.
 *
 * @returns {Array} Shuffled copy of VALUES_DECK
 */
function getShuffledDeck() {
  const deck = [...VALUES_DECK];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export {
  VALUES_DECK,
  VALUE_ARCHETYPE_AFFINITY,
  getValueById,
  getValuesByCategory,
  getShuffledDeck,
};
