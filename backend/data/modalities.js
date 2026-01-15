/**
 * Modalities (Therapy/Coaching Approaches) for Brand Discovery
 *
 * Categorized lists of therapeutic modalities and coaching approaches.
 * Users select which approaches they use in their practice.
 *
 * @module data/modalities
 */

/**
 * Modalities organized by category.
 * Each category has a label and items with id and display name.
 *
 * @type {Object<string, Object>}
 */
const MODALITIES = {
  // ============================================================================
  // Cognitive & Behavioral
  // ============================================================================
  clinical_cognitive: {
    label: 'Cognitive & Behavioral',
    therapistFocused: true,
    coachFocused: false,
    items: [
      { id: 'cbt', name: 'CBT (Cognitive Behavioral Therapy)' },
      { id: 'dbt', name: 'DBT (Dialectical Behavior Therapy)' },
      { id: 'act', name: 'ACT (Acceptance & Commitment Therapy)' },
      { id: 'rebt', name: 'REBT (Rational Emotive Behavior Therapy)' },
      { id: 'cbt_i', name: 'CBT-I (for Insomnia)' },
    ],
  },

  // ============================================================================
  // Trauma-Focused
  // ============================================================================
  clinical_trauma: {
    label: 'Trauma-Focused',
    therapistFocused: true,
    coachFocused: false,
    items: [
      { id: 'emdr', name: 'EMDR' },
      { id: 'se', name: 'Somatic Experiencing' },
      { id: 'ifs', name: 'IFS (Internal Family Systems)' },
      { id: 'brainspotting', name: 'Brainspotting' },
      { id: 'cpt', name: 'CPT (Cognitive Processing Therapy)' },
      { id: 'pe', name: 'Prolonged Exposure' },
    ],
  },

  // ============================================================================
  // Relational & Couples
  // ============================================================================
  clinical_relational: {
    label: 'Relational & Couples',
    therapistFocused: true,
    coachFocused: false,
    items: [
      { id: 'eft', name: 'EFT (Emotionally Focused Therapy)' },
      { id: 'gottman', name: 'Gottman Method' },
      { id: 'attachment', name: 'Attachment-Based Therapy' },
      { id: 'psychodynamic', name: 'Psychodynamic' },
      { id: 'relational', name: 'Relational Therapy' },
    ],
  },

  // ============================================================================
  // Humanistic & Existential
  // ============================================================================
  clinical_humanistic: {
    label: 'Humanistic & Existential',
    therapistFocused: true,
    coachFocused: false,
    items: [
      { id: 'person_centered', name: 'Person-Centered' },
      { id: 'gestalt', name: 'Gestalt' },
      { id: 'existential', name: 'Existential' },
      { id: 'narrative', name: 'Narrative Therapy' },
      { id: 'solution_focused', name: 'Solution-Focused Brief Therapy' },
    ],
  },

  // ============================================================================
  // Specialized Therapies
  // ============================================================================
  clinical_specialized: {
    label: 'Specialized Therapies',
    therapistFocused: true,
    coachFocused: false,
    items: [
      { id: 'play_therapy', name: 'Play Therapy' },
      { id: 'art_therapy', name: 'Art Therapy' },
      { id: 'sandtray', name: 'Sandtray Therapy' },
      { id: 'emdr_kids', name: 'EMDR for Children' },
      { id: 'tfcbt', name: 'TF-CBT (Trauma-Focused CBT)' },
    ],
  },

  // ============================================================================
  // Coaching Approaches
  // ============================================================================
  coaching_core: {
    label: 'Coaching Approaches',
    therapistFocused: false,
    coachFocused: true,
    items: [
      { id: 'icf', name: 'ICF-Style Coaching' },
      { id: 'coactive', name: 'Co-Active Coaching' },
      { id: 'ontological', name: 'Ontological Coaching' },
      { id: 'positive_psych', name: 'Positive Psychology Coaching' },
      { id: 'nlp', name: 'NLP (Neuro-Linguistic Programming)' },
    ],
  },

  // ============================================================================
  // Specialized Coaching
  // ============================================================================
  coaching_specialized: {
    label: 'Specialized Coaching',
    therapistFocused: false,
    coachFocused: true,
    items: [
      { id: 'executive', name: 'Executive Coaching' },
      { id: 'leadership', name: 'Leadership Coaching' },
      { id: 'career', name: 'Career Coaching' },
      { id: 'life', name: 'Life Coaching' },
      { id: 'health_wellness', name: 'Health & Wellness Coaching' },
      { id: 'relationship_coaching', name: 'Relationship Coaching' },
    ],
  },

  // ============================================================================
  // Body-Based Approaches
  // ============================================================================
  somatic: {
    label: 'Body-Based Approaches',
    therapistFocused: true,
    coachFocused: true,
    items: [
      { id: 'somatic', name: 'Somatic Therapy/Coaching' },
      { id: 'breathwork', name: 'Breathwork' },
      { id: 'yoga_therapy', name: 'Yoga Therapy' },
      { id: 'tre', name: 'TRE (Trauma Release Exercises)' },
      { id: 'polyvagal', name: 'Polyvagal-Informed' },
      { id: 'sensorimotor', name: 'Sensorimotor Psychotherapy' },
    ],
  },

  // ============================================================================
  // Mindfulness-Based
  // ============================================================================
  mindfulness: {
    label: 'Mindfulness-Based',
    therapistFocused: true,
    coachFocused: true,
    items: [
      { id: 'mbsr', name: 'MBSR (Mindfulness-Based Stress Reduction)' },
      { id: 'mbct', name: 'MBCT (Mindfulness-Based Cognitive Therapy)' },
      { id: 'mindfulness', name: 'Mindfulness Integration' },
      { id: 'meditation', name: 'Meditation Teaching' },
    ],
  },
};

/**
 * Get all modalities as a flat array.
 *
 * @returns {Array<{id: string, name: string, category: string}>}
 */
function getAllModalities() {
  const all = [];

  Object.entries(MODALITIES).forEach(([categoryId, category]) => {
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
 * Get a modality by its ID.
 *
 * @param {string} id - The modality ID
 * @returns {Object|undefined} The modality with category info or undefined
 */
function getModalityById(id) {
  for (const [categoryId, category] of Object.entries(MODALITIES)) {
    const item = category.items.find((m) => m.id === id);
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
 * Get modalities by category.
 *
 * @param {string} categoryId - The category ID
 * @returns {Object|undefined} The category with items or undefined
 */
function getModalitiesByCategory(categoryId) {
  return MODALITIES[categoryId];
}

/**
 * Get categories filtered by audience type (therapist vs coach).
 *
 * @param {string} audienceType - 'therapist', 'coach', or 'both'
 * @returns {Object} Filtered categories
 */
function getCategoriesForAudience(audienceType = 'both') {
  const filtered = {};

  Object.entries(MODALITIES).forEach(([id, category]) => {
    if (audienceType === 'both') {
      filtered[id] = category;
    } else if (audienceType === 'therapist' && category.therapistFocused) {
      filtered[id] = category;
    } else if (audienceType === 'coach' && category.coachFocused) {
      filtered[id] = category;
    }
  });

  return filtered;
}

export {
  MODALITIES,
  getAllModalities,
  getModalityById,
  getModalitiesByCategory,
  getCategoriesForAudience,
};
