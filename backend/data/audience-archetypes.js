/**
 * Audience Archetypes for Brand Discovery
 *
 * 12 audience archetypes representing common client types for therapists/coaches.
 * Users select archetypes that match who they serve.
 *
 * @module data/audience-archetypes
 */

/**
 * The 12 audience archetypes with full definitions.
 * Each archetype includes pain points, desires, content hooks, and demographic hints.
 *
 * @type {Array<Object>}
 */
const AUDIENCE_ARCHETYPES = [
  // ============================================================================
  // The Cycle Breaker
  // ============================================================================
  {
    id: 'cycle_breaker',
    name: 'The Cycle Breaker',
    description:
      'Working through generational patterns. Wants to do it differently than their ' +
      'parents. Often the "first" in their family to seek therapy.',
    painPoint: 'I don\'t want to repeat what was done to me',
    desire: 'Break the chain, do it differently for my kids',
    contentHooks: [
      'generational trauma',
      'reparenting',
      'breaking patterns',
      'family systems',
    ],
    demographicsHint: 'Often 25-45, becoming parents or recently parented',
    nuances: [
      { id: 'new_parent', label: 'New Parent', description: 'Just had a child and terrified of repeating patterns' },
      { id: 'estranged', label: 'Estranged', description: 'Cut off from family, rebuilding from scratch' },
      { id: 'reconciling', label: 'Reconciling', description: 'Trying to maintain relationship while setting boundaries' },
    ],
  },

  // ============================================================================
  // The Overwhelmed High-Achiever
  // ============================================================================
  {
    id: 'overwhelmed_achiever',
    name: 'The Overwhelmed High-Achiever',
    description:
      'Successful on paper, drowning inside. Perfectionist who feels guilty for ' +
      'struggling when life "looks good."',
    painPoint: 'I should be grateful but I\'m exhausted',
    desire: 'Permission to not be fine, sustainable success',
    contentHooks: [
      'burnout',
      'perfectionism',
      'high-functioning anxiety',
      'imposter syndrome',
    ],
    demographicsHint: 'Often professionals, entrepreneurs, healthcare workers',
    nuances: [
      { id: 'startup_founder', label: 'Startup Founder', description: 'Building something, burning out in the process' },
      { id: 'corporate_exec', label: 'Corporate Executive', description: 'Climbed the ladder, questioning if it was worth it' },
      { id: 'healthcare_worker', label: 'Healthcare Worker', description: 'Caring for everyone else, running on empty' },
    ],
  },

  // ============================================================================
  // The Late-Diagnosed
  // ============================================================================
  {
    id: 'late_diagnosed',
    name: 'The Late-Diagnosed',
    description:
      'Recently discovered ADHD/autism/etc. Reframing their entire life story. ' +
      'Grieving and relieved simultaneously.',
    painPoint: 'My whole life makes sense now but I\'m grieving the years I lost',
    desire: 'Reframe their story, find their people',
    contentHooks: [
      'ADHD',
      'autism',
      'neurodivergence',
      'late diagnosis',
      'unmasking',
    ],
    demographicsHint: 'Often 30+, many are women/AFAB discovering in adulthood',
    nuances: [
      { id: 'adhd_adult', label: 'ADHD Adult', description: 'Finally understanding why they\'ve always struggled' },
      { id: 'autistic_unmasking', label: 'Autistic Unmasking', description: 'Learning to drop the mask they didn\'t know they wore' },
      { id: 'gifted_burned_out', label: 'Gifted Burned Out', description: 'Was "gifted", now exhausted and confused' },
    ],
  },

  // ============================================================================
  // The People-Pleaser in Recovery
  // ============================================================================
  {
    id: 'people_pleaser',
    name: 'The People-Pleaser in Recovery',
    description:
      'Learning boundaries for the first time. Terrified of being "selfish." ' +
      'Unlearning fawn responses.',
    painPoint: 'I don\'t know who I am without taking care of everyone else',
    desire: 'Find themselves, learn to say no',
    contentHooks: [
      'boundaries',
      'fawn response',
      'codependency',
      'self-abandonment',
    ],
    demographicsHint: 'Often raised in chaotic/enmeshed families',
    nuances: [
      { id: 'recovering_fawn', label: 'Recovering Fawn', description: 'Just realized their "niceness" was survival' },
      { id: 'boundary_beginner', label: 'Boundary Beginner', description: 'Setting their first boundaries, terrified' },
      { id: 'codependency_aware', label: 'Codependency Aware', description: 'Recognizing patterns in all their relationships' },
    ],
  },

  // ============================================================================
  // The Burnt-Out Caregiver
  // ============================================================================
  {
    id: 'burnt_out_caregiver',
    name: 'The Burnt-Out Caregiver',
    description:
      'Healthcare worker, parent, sandwich generation. Gives to everyone but themselves.',
    painPoint: 'I have nothing left to give',
    desire: 'Sustainable caregiving, permission to rest',
    contentHooks: [
      'compassion fatigue',
      'caregiver burnout',
      'sandwich generation',
      'self-care guilt',
    ],
    demographicsHint: 'Often nurses, therapists, teachers, parents of young kids or aging parents',
    nuances: [
      { id: 'sandwich_generation', label: 'Sandwich Generation', description: 'Caring for kids AND aging parents' },
      { id: 'helping_professional', label: 'Helping Professional', description: 'Therapist/nurse/teacher with nothing left' },
      { id: 'primary_caregiver', label: 'Primary Caregiver', description: 'Partner with chronic illness, carrying it all' },
    ],
  },

  // ============================================================================
  // The Quarter-Life Questioner
  // ============================================================================
  {
    id: 'quarter_life',
    name: 'The Quarter-Life Questioner',
    description:
      '25-35, "is this it?" energy. Did everything "right" and still feels lost.',
    painPoint: 'I followed the script and I\'m still unfulfilled',
    desire: 'Authentic direction, permission to pivot',
    contentHooks: [
      'quarter-life crisis',
      'career change',
      'purpose',
      'authenticity',
    ],
    demographicsHint: 'Often college-educated, facing first major life disillusionment',
    nuances: [
      { id: 'golden_handcuffs', label: 'Golden Handcuffs', description: 'Good salary, soul-crushing job' },
      { id: 'comparison_spiral', label: 'Comparison Spiral', description: 'Everyone on Instagram seems to have it figured out' },
      { id: 'passion_seeker', label: 'Passion Seeker', description: 'Desperately trying to find "their thing"' },
    ],
  },

  // ============================================================================
  // The Empty Nester Reinventing
  // ============================================================================
  {
    id: 'empty_nester',
    name: 'The Empty Nester Reinventing',
    description:
      'Kids launched, now what? Identity was wrapped up in parenting.',
    painPoint: 'I don\'t know who I am outside of being a parent',
    desire: 'Reclaim identity, find purpose in next chapter',
    contentHooks: [
      'empty nest',
      'midlife',
      'identity',
      'reinvention',
      'marriage after kids',
    ],
    demographicsHint: 'Often 45-60, may also be navigating relationship changes',
    nuances: [
      { id: 'marriage_stranger', label: 'Marriage Stranger', description: 'Doesn\'t recognize their partner anymore' },
      { id: 'career_reboot', label: 'Career Reboot', description: 'Ready to do something completely different' },
      { id: 'freedom_fear', label: 'Freedom Fear', description: 'Has the freedom, doesn\'t know what to do with it' },
    ],
  },

  // ============================================================================
  // The Relationship Pattern Repeater
  // ============================================================================
  {
    id: 'pattern_repeater',
    name: 'The Relationship Pattern Repeater',
    description:
      'Same dynamics, different partners. Keeps attracting the same problems.',
    painPoint: 'Why do I keep choosing this?',
    desire: 'Break the pattern, healthy relationship',
    contentHooks: [
      'attachment styles',
      'relationship patterns',
      'dating',
      'partner selection',
    ],
    demographicsHint: 'Often post-breakup or mid-relationship crisis',
    nuances: [
      { id: 'anxious_attached', label: 'Anxious Attached', description: 'Always worried about being abandoned' },
      { id: 'avoidant_awakening', label: 'Avoidant Awakening', description: 'Realizing they push everyone away' },
      { id: 'narcissist_magnet', label: 'Narcissist Magnet', description: 'Keeps finding narcissistic partners' },
    ],
  },

  // ============================================================================
  // The High-Functioning Anxious
  // ============================================================================
  {
    id: 'high_functioning_anxious',
    name: 'The High-Functioning Anxious',
    description:
      'Looks fine on the outside, white-knuckling everything internally.',
    painPoint: 'No one knows how hard I\'m working to seem okay',
    desire: 'Actually be okay, not just look okay',
    contentHooks: [
      'high-functioning anxiety',
      'hidden anxiety',
      'nervous system',
      'somatic',
    ],
    demographicsHint: 'Often successful, "has it together" externally',
    nuances: [
      { id: 'secret_anxious', label: 'Secret Anxious', description: 'No one would ever guess they\'re struggling' },
      { id: 'body_keeper', label: 'Body Keeper', description: 'Anxiety lives in their body, not their thoughts' },
      { id: 'control_seeker', label: 'Control Seeker', description: 'Managing anxiety through intense control' },
    ],
  },

  // ============================================================================
  // The Spiritual Seeker
  // ============================================================================
  {
    id: 'spiritual_seeker',
    name: 'The Spiritual Seeker',
    description:
      'Meaning-hungry, exploring beyond traditional frameworks.',
    painPoint: 'There has to be more than this',
    desire: 'Deeper connection, meaning, transcendence',
    contentHooks: [
      'spirituality',
      'meaning',
      'purpose',
      'existential',
      'soul',
    ],
    demographicsHint: 'May be post-religious or integrating spirituality with therapy',
    nuances: [
      { id: 'deconstructing', label: 'Deconstructing', description: 'Leaving religion, finding their own path' },
      { id: 'meaning_crisis', label: 'Meaning Crisis', description: 'Existential void, searching for purpose' },
      { id: 'integration_seeker', label: 'Integration Seeker', description: 'Wants to blend psychology and spirituality' },
    ],
  },

  // ============================================================================
  // The Career Pivoter
  // ============================================================================
  {
    id: 'career_pivoter',
    name: 'The Career Pivoter',
    description:
      'Successful at something they hate. Ready to make a change but scared.',
    painPoint: 'I\'m successful at something that\'s killing my soul',
    desire: 'Aligned work, purpose-driven career',
    contentHooks: [
      'career change',
      'purpose',
      'values alignment',
      'golden handcuffs',
    ],
    demographicsHint: 'Often mid-career, financially comfortable but unfulfilled',
    nuances: [
      { id: 'lawyer_leaving', label: 'Lawyer Leaving', description: 'High-paying profession, desperate to escape' },
      { id: 'corporate_refugee', label: 'Corporate Refugee', description: 'Done with corporate, wants meaning' },
      { id: 'passion_pragmatist', label: 'Passion Pragmatist', description: 'Wants purpose but also needs to pay bills' },
    ],
  },

  // ============================================================================
  // The Identity Excavator
  // ============================================================================
  {
    id: 'identity_excavator',
    name: 'The Identity Excavator',
    description:
      'Post-divorce, post-loss, post-transition. Rebuilding from scratch.',
    painPoint: 'I don\'t know who I am anymore',
    desire: 'Rebuild self, find new identity',
    contentHooks: [
      'identity',
      'divorce recovery',
      'grief',
      'starting over',
      'who am I',
    ],
    demographicsHint: 'Going through or recently through major life transition',
    nuances: [
      { id: 'post_divorce', label: 'Post-Divorce', description: 'Marriage ended, who are they now?' },
      { id: 'grief_transformed', label: 'Grief Transformed', description: 'Major loss, identity shattered' },
      { id: 'reinvention_required', label: 'Reinvention Required', description: 'Life as they knew it is gone, rebuilding' },
    ],
  },
];

/**
 * Get an archetype by its ID.
 *
 * @param {string} id - The archetype ID
 * @returns {Object|undefined} The archetype object or undefined if not found
 */
function getAudienceArchetypeById(id) {
  return AUDIENCE_ARCHETYPES.find((a) => a.id === id);
}

/**
 * Get content hooks for selected archetypes (for Brand DNA).
 *
 * @param {Array<string>} selectedIds - Array of selected archetype IDs
 * @returns {Array<string>} Unique content hooks from selected archetypes
 */
function getContentHooksForArchetypes(selectedIds) {
  const hooks = new Set();

  selectedIds.forEach((id) => {
    const archetype = getAudienceArchetypeById(id);
    if (archetype) {
      archetype.contentHooks.forEach((hook) => hooks.add(hook));
    }
  });

  return Array.from(hooks);
}

/**
 * Generate audience description for Brand DNA based on selected archetypes.
 *
 * @param {Array<string>} selectedIds - Array of selected archetype IDs
 * @returns {string} Combined audience description
 */
function generateAudienceDescription(selectedIds) {
  const archetypes = selectedIds
    .map((id) => getAudienceArchetypeById(id))
    .filter(Boolean);

  if (archetypes.length === 0) {
    return 'General audience seeking mental health support';
  }

  if (archetypes.length === 1) {
    return archetypes[0].description;
  }

  // Combine pain points for multi-archetype description
  const painPoints = archetypes.map((a) => a.painPoint.toLowerCase()).slice(0, 3);
  const names = archetypes.map((a) => a.name.replace('The ', '')).slice(0, 3);

  return `People who identify as ${names.join(', ')}: those who feel "${painPoints.join('," "')}"`;
}

export {
  AUDIENCE_ARCHETYPES,
  getAudienceArchetypeById,
  getContentHooksForArchetypes,
  generateAudienceDescription,
};
