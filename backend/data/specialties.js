/**
 * Specialties (Issues & Populations) for Brand Discovery
 *
 * Categorized lists of clinical specialties, life challenges, patterns, and populations.
 * Users select which areas they specialize in.
 *
 * @module data/specialties
 */

/**
 * Specialties organized by category.
 * Each category has a label and items with id, name, and optional subtypes.
 *
 * @type {Object<string, Object>}
 */
const SPECIALTIES = {
  // ============================================================================
  // Mental Health Conditions
  // ============================================================================
  mental_health: {
    label: 'Mental Health Conditions',
    items: [
      {
        id: 'anxiety',
        name: 'Anxiety',
        subtypes: ['generalized', 'social', 'panic', 'phobias', 'health_anxiety'],
      },
      { id: 'depression', name: 'Depression' },
      { id: 'trauma_ptsd', name: 'Trauma & PTSD' },
      { id: 'cptsd', name: 'Complex PTSD' },
      { id: 'ocd', name: 'OCD' },
      { id: 'adhd', name: 'ADHD' },
      { id: 'bipolar', name: 'Bipolar Disorder' },
      { id: 'eating_disorders', name: 'Eating Disorders' },
      { id: 'addiction', name: 'Addiction & Recovery' },
      { id: 'grief', name: 'Grief & Loss' },
      { id: 'dissociation', name: 'Dissociation' },
    ],
  },

  // ============================================================================
  // Life Challenges
  // ============================================================================
  life_challenges: {
    label: 'Life Challenges',
    items: [
      { id: 'relationships', name: 'Relationship Issues' },
      { id: 'divorce', name: 'Divorce & Separation' },
      { id: 'parenting', name: 'Parenting' },
      { id: 'infertility', name: 'Infertility & Perinatal' },
      { id: 'postpartum', name: 'Postpartum' },
      { id: 'career', name: 'Career & Work Issues' },
      { id: 'life_transitions', name: 'Life Transitions' },
      { id: 'identity', name: 'Identity & Self-Worth' },
      { id: 'spiritual', name: 'Spiritual/Existential' },
      { id: 'chronic_illness', name: 'Chronic Illness' },
    ],
  },

  // ============================================================================
  // Patterns & Growth Areas
  // ============================================================================
  patterns: {
    label: 'Patterns & Growth Areas',
    items: [
      { id: 'burnout', name: 'Burnout' },
      { id: 'perfectionism', name: 'Perfectionism' },
      { id: 'people_pleasing', name: 'People-Pleasing' },
      { id: 'boundaries', name: 'Boundary Setting' },
      { id: 'imposter_syndrome', name: 'Imposter Syndrome' },
      { id: 'procrastination', name: 'Procrastination' },
      { id: 'communication', name: 'Communication Skills' },
      { id: 'self_esteem', name: 'Self-Esteem' },
      { id: 'stress', name: 'Stress Management' },
      { id: 'anger', name: 'Anger Management' },
    ],
  },

  // ============================================================================
  // Populations
  // ============================================================================
  populations: {
    label: 'Populations',
    items: [
      { id: 'lgbtq', name: 'LGBTQ+' },
      { id: 'bipoc', name: 'BIPOC' },
      { id: 'women', name: 'Women\'s Issues' },
      { id: 'men', name: 'Men\'s Issues' },
      { id: 'teens', name: 'Teens/Adolescents' },
      { id: 'college', name: 'College Students' },
      { id: 'professionals', name: 'Professionals/Executives' },
      { id: 'creatives', name: 'Creatives/Artists' },
      { id: 'entrepreneurs', name: 'Entrepreneurs' },
      { id: 'healthcare_workers', name: 'Healthcare Workers' },
    ],
  },
};

/**
 * Get all specialties as a flat array.
 *
 * @returns {Array<{id: string, name: string, category: string, subtypes?: string[]}>}
 */
function getAllSpecialties() {
  const all = [];

  Object.entries(SPECIALTIES).forEach(([categoryId, category]) => {
    category.items.forEach((item) => {
      all.push({
        ...item,
        category: categoryId,
        categoryLabel: category.label,
      });
    });
  });

  return all;
}

/**
 * Get a specialty by its ID.
 *
 * @param {string} id - The specialty ID
 * @returns {Object|undefined} The specialty with category info or undefined
 */
function getSpecialtyById(id) {
  for (const [categoryId, category] of Object.entries(SPECIALTIES)) {
    const item = category.items.find((s) => s.id === id);
    if (item) {
      return {
        ...item,
        category: categoryId,
        categoryLabel: category.label,
      };
    }
  }
  return undefined;
}

/**
 * Get specialties by category.
 *
 * @param {string} categoryId - The category ID
 * @returns {Object|undefined} The category with items or undefined
 */
function getSpecialtiesByCategory(categoryId) {
  return SPECIALTIES[categoryId];
}

/**
 * Generate content keywords from selected specialties.
 * Useful for Brand DNA content pillar generation.
 *
 * @param {Array<string>} selectedIds - Array of selected specialty IDs
 * @returns {Array<string>} Keywords derived from specialties
 */
function generateKeywordsFromSpecialties(selectedIds) {
  const keywords = new Set();

  selectedIds.forEach((id) => {
    const specialty = getSpecialtyById(id);
    if (specialty) {
      // Add the specialty name as a keyword
      keywords.add(specialty.name.toLowerCase());

      // Add subtypes if present
      if (specialty.subtypes) {
        specialty.subtypes.forEach((subtype) => {
          keywords.add(subtype.replace(/_/g, ' '));
        });
      }
    }
  });

  return Array.from(keywords);
}

export {
  SPECIALTIES,
  getAllSpecialties,
  getSpecialtyById,
  getSpecialtiesByCategory,
  generateKeywordsFromSpecialties,
};
