/**
 * Word Banks for Profile Enrichment (Madlibs)
 *
 * Pre-defined options for the Madlibs profile builder.
 * Users can select from these options or enter custom values.
 *
 * @module data/word-banks
 */

// ============================================================================
// REVENUE TYPES
// ============================================================================

/**
 * Revenue stream types common for therapists and coaches.
 * Used in the "Your Business Model" section.
 *
 * @type {Array<Object>}
 */
const REVENUE_TYPES = [
  {
    id: 'therapy_1on1',
    label: '1:1 therapy sessions',
    category: 'direct_service',
    description: 'Individual therapy with clients',
  },
  {
    id: 'coaching_1on1',
    label: '1:1 coaching sessions',
    category: 'direct_service',
    description: 'Individual coaching with clients',
  },
  {
    id: 'group_therapy',
    label: 'Group therapy/programs',
    category: 'group',
    description: 'Therapeutic groups or intensive programs',
  },
  {
    id: 'group_coaching',
    label: 'Group coaching programs',
    category: 'group',
    description: 'Coaching cohorts or group programs',
  },
  {
    id: 'online_courses',
    label: 'Online courses',
    category: 'digital',
    description: 'Self-paced digital courses',
  },
  {
    id: 'workshops',
    label: 'Workshops/retreats',
    category: 'events',
    description: 'Live workshops, intensives, or retreats',
  },
  {
    id: 'speaking',
    label: 'Speaking engagements',
    category: 'events',
    description: 'Keynotes, conferences, corporate talks',
  },
  {
    id: 'supervision',
    label: 'Supervision/consultation',
    category: 'professional',
    description: 'Clinical supervision or peer consultation',
  },
  {
    id: 'consulting',
    label: 'Consulting',
    category: 'professional',
    description: 'Organizational or business consulting',
  },
  {
    id: 'books',
    label: 'Book sales',
    category: 'digital',
    description: 'Published books or ebooks',
  },
  {
    id: 'membership',
    label: 'Membership/community',
    category: 'recurring',
    description: 'Paid membership community or subscription',
  },
  {
    id: 'affiliate',
    label: 'Affiliate partnerships',
    category: 'passive',
    description: 'Affiliate income from recommendations',
  },
  {
    id: 'sponsorships',
    label: 'Sponsorships',
    category: 'passive',
    description: 'Podcast or content sponsorships',
  },
  {
    id: 'assessments',
    label: 'Assessments/evaluations',
    category: 'direct_service',
    description: 'Psychological assessments or evaluations',
  },
  {
    id: 'training',
    label: 'Professional training',
    category: 'professional',
    description: 'Training other therapists/coaches',
  },
];

// ============================================================================
// CLIENT TYPES
// ============================================================================

/**
 * Common client types/demographics for therapists and coaches.
 * Used in the "Your Clients" section.
 *
 * @type {Array<Object>}
 */
const CLIENT_TYPES = [
  // Professional/Achievement-oriented
  {
    id: 'high_achievers',
    label: 'High-achievers',
    category: 'professional',
    description: 'Successful people who push themselves hard',
  },
  {
    id: 'entrepreneurs',
    label: 'Entrepreneurs',
    category: 'professional',
    description: 'Business owners and founders',
  },
  {
    id: 'executives',
    label: 'Executives/leaders',
    category: 'professional',
    description: 'C-suite, managers, and organizational leaders',
  },
  {
    id: 'healthcare_workers',
    label: 'Healthcare workers',
    category: 'professional',
    description: 'Doctors, nurses, therapists, caregivers',
  },
  {
    id: 'creatives',
    label: 'Creatives/artists',
    category: 'professional',
    description: 'Artists, writers, designers, musicians',
  },
  {
    id: 'tech_professionals',
    label: 'Tech professionals',
    category: 'professional',
    description: 'Engineers, developers, tech workers',
  },
  {
    id: 'lawyers',
    label: 'Lawyers/legal professionals',
    category: 'professional',
    description: 'Attorneys and legal professionals',
  },
  {
    id: 'educators',
    label: 'Educators/teachers',
    category: 'professional',
    description: 'Teachers, professors, educational leaders',
  },

  // Life stage
  {
    id: 'parents',
    label: 'Parents',
    category: 'life_stage',
    description: 'Moms and dads navigating parenthood',
  },
  {
    id: 'new_moms',
    label: 'New moms',
    category: 'life_stage',
    description: 'Pregnant women and new mothers',
  },
  {
    id: 'new_dads',
    label: 'New dads',
    category: 'life_stage',
    description: 'New and expecting fathers',
  },
  {
    id: 'couples',
    label: 'Couples',
    category: 'relationship',
    description: 'Partners working on their relationship',
  },
  {
    id: 'young_adults',
    label: 'Young adults (18-25)',
    category: 'life_stage',
    description: 'College-age and early career',
  },
  {
    id: 'millennials',
    label: 'Millennials (26-40)',
    category: 'life_stage',
    description: 'Mid-career adults navigating life transitions',
  },
  {
    id: 'midlife',
    label: 'Midlife adults (40-55)',
    category: 'life_stage',
    description: 'People navigating midlife transitions',
  },
  {
    id: 'empty_nesters',
    label: 'Empty nesters',
    category: 'life_stage',
    description: 'Parents whose children have left home',
  },
  {
    id: 'retirees',
    label: 'Retirees/seniors',
    category: 'life_stage',
    description: 'People navigating retirement and aging',
  },
  {
    id: 'students',
    label: 'Students',
    category: 'life_stage',
    description: 'High school or college students',
  },

  // General
  {
    id: 'women',
    label: 'Women',
    category: 'demographic',
    description: 'Women-focused practice',
  },
  {
    id: 'men',
    label: 'Men',
    category: 'demographic',
    description: 'Men-focused practice',
  },
  {
    id: 'professionals_in_transition',
    label: 'Professionals in transition',
    category: 'professional',
    description: 'Career changers and those at crossroads',
  },
  {
    id: 'people_in_recovery',
    label: 'People in recovery',
    category: 'clinical',
    description: 'Those recovering from addiction or trauma',
  },
];

// ============================================================================
// SUBCULTURES/COMMUNITIES
// ============================================================================

/**
 * Subcultures and communities that clients may be part of.
 * Used in the "Your Clients" section for cultural context.
 *
 * @type {Array<Object>}
 */
const SUBCULTURES = [
  // Identity
  {
    id: 'lgbtq',
    label: 'LGBTQ+ community',
    category: 'identity',
    description: 'Lesbian, gay, bisexual, transgender, queer individuals',
  },
  {
    id: 'neurodivergent',
    label: 'Neurodivergent individuals',
    category: 'identity',
    description: 'ADHD, autism, and other neurodivergent people',
  },
  {
    id: 'bipoc',
    label: 'BIPOC communities',
    category: 'identity',
    description: 'Black, Indigenous, and People of Color',
  },
  {
    id: 'immigrant',
    label: 'Immigrant families',
    category: 'identity',
    description: 'First and second generation immigrants',
  },

  // Faith & Spirituality
  {
    id: 'faith_based',
    label: 'Faith-based communities',
    category: 'spiritual',
    description: 'Religious or spiritually-oriented individuals',
  },
  {
    id: 'spiritual_seekers',
    label: 'Spiritual seekers',
    category: 'spiritual',
    description: 'Those exploring spirituality outside traditional religion',
  },
  {
    id: 'deconstructing',
    label: 'Faith deconstructors',
    category: 'spiritual',
    description: 'People leaving or questioning religious backgrounds',
  },

  // Health & Wellness
  {
    id: 'recovery',
    label: 'Recovery/sobriety community',
    category: 'health',
    description: 'People in addiction recovery (AA, NA, etc.)',
  },
  {
    id: 'chronic_illness',
    label: 'Chronic illness community',
    category: 'health',
    description: 'People managing chronic health conditions',
  },
  {
    id: 'disability',
    label: 'Disability community',
    category: 'health',
    description: 'People with physical or cognitive disabilities',
  },
  {
    id: 'eating_disorder_recovery',
    label: 'Eating disorder recovery',
    category: 'health',
    description: 'People recovering from eating disorders',
  },
  {
    id: 'body_positive',
    label: 'Body positive/HAES',
    category: 'health',
    description: 'Health at Every Size and body acceptance community',
  },

  // Professional/Industry
  {
    id: 'tech_industry',
    label: 'Tech industry',
    category: 'industry',
    description: 'Silicon Valley, startups, tech culture',
  },
  {
    id: 'startup_culture',
    label: 'Startup culture',
    category: 'industry',
    description: 'Founders, early employees, startup ecosystem',
  },
  {
    id: 'academic',
    label: 'Academic/research',
    category: 'industry',
    description: 'Professors, researchers, PhD students',
  },
  {
    id: 'creative_industry',
    label: 'Creative industry',
    category: 'industry',
    description: 'Entertainment, arts, design professionals',
  },
  {
    id: 'finance',
    label: 'Finance/Wall Street',
    category: 'industry',
    description: 'Finance, banking, investment professionals',
  },

  // Military & Service
  {
    id: 'military',
    label: 'Military/veterans',
    category: 'service',
    description: 'Active duty, veterans, and military families',
  },
  {
    id: 'first_responders',
    label: 'First responders',
    category: 'service',
    description: 'Police, firefighters, EMTs, 911 dispatchers',
  },

  // Lifestyle
  {
    id: 'minimalist',
    label: 'Minimalist/simple living',
    category: 'lifestyle',
    description: 'Those pursuing minimalism and intentional living',
  },
  {
    id: 'digital_nomads',
    label: 'Digital nomads',
    category: 'lifestyle',
    description: 'Remote workers who travel and work globally',
  },
  {
    id: 'expats',
    label: 'Expats/third culture',
    category: 'lifestyle',
    description: 'People living abroad or between cultures',
  },
];

// ============================================================================
// CLIENT PROBLEMS
// ============================================================================

/**
 * Common problems/challenges clients seek help with.
 * Aligned with audience archetypes for consistency.
 * Used in the "Your Clients" section.
 *
 * @type {Array<Object>}
 */
const CLIENT_PROBLEMS = [
  // Patterns & Behaviors
  {
    id: 'breaking_patterns',
    label: 'Breaking generational/family patterns',
    category: 'patterns',
    archetypeId: 'cycle_breaker',
    description: 'Ending cycles of dysfunction passed down through families',
  },
  {
    id: 'perfectionism',
    label: 'Overcoming perfectionism',
    category: 'patterns',
    archetypeId: 'overwhelmed_achiever',
    description: 'Letting go of impossible standards',
  },
  {
    id: 'people_pleasing',
    label: 'Recovering from people-pleasing',
    category: 'patterns',
    archetypeId: 'people_pleaser',
    description: 'Learning to prioritize their own needs',
  },
  {
    id: 'relationship_patterns',
    label: 'Breaking relationship patterns',
    category: 'patterns',
    archetypeId: 'pattern_repeater',
    description: 'Stopping the cycle of unhealthy relationships',
  },

  // Mental Health
  {
    id: 'anxiety',
    label: 'Managing anxiety',
    category: 'mental_health',
    archetypeId: 'high_functioning_anxious',
    description: 'Finding relief from persistent worry and fear',
  },
  {
    id: 'burnout',
    label: 'Recovering from burnout',
    category: 'mental_health',
    archetypeId: 'burnt_out_caregiver',
    description: 'Healing from exhaustion and finding sustainable rhythms',
  },
  {
    id: 'depression',
    label: 'Navigating depression',
    category: 'mental_health',
    description: 'Finding hope and energy again',
  },
  {
    id: 'trauma',
    label: 'Processing trauma',
    category: 'mental_health',
    description: 'Healing from past traumatic experiences',
  },
  {
    id: 'grief',
    label: 'Healing from grief/loss',
    category: 'mental_health',
    description: 'Processing loss and finding meaning after death or major loss',
  },

  // Life Transitions
  {
    id: 'identity',
    label: 'Finding their identity',
    category: 'transition',
    archetypeId: 'identity_excavator',
    description: 'Rebuilding sense of self after major changes',
  },
  {
    id: 'purpose',
    label: 'Finding purpose and meaning',
    category: 'transition',
    archetypeId: 'quarter_life',
    description: 'Discovering what truly matters to them',
  },
  {
    id: 'career_change',
    label: 'Making a career change',
    category: 'transition',
    archetypeId: 'career_pivoter',
    description: 'Transitioning to more fulfilling work',
  },
  {
    id: 'life_transition',
    label: 'Navigating major life transitions',
    category: 'transition',
    archetypeId: 'empty_nester',
    description: 'Adjusting to new life chapters',
  },
  {
    id: 'neurodivergent_discovery',
    label: 'Processing late diagnosis (ADHD/autism)',
    category: 'transition',
    archetypeId: 'late_diagnosed',
    description: 'Reframing their story after discovering neurodivergence',
  },

  // Relationships
  {
    id: 'boundaries',
    label: 'Setting healthy boundaries',
    category: 'relationships',
    description: 'Learning to say no and protect their energy',
  },
  {
    id: 'communication',
    label: 'Improving communication',
    category: 'relationships',
    description: 'Learning to express needs and listen better',
  },
  {
    id: 'intimacy',
    label: 'Building intimacy and connection',
    category: 'relationships',
    description: 'Deepening relationships and feeling closer',
  },
  {
    id: 'attachment',
    label: 'Healing attachment wounds',
    category: 'relationships',
    description: 'Developing secure attachment patterns',
  },

  // Personal Growth
  {
    id: 'self_worth',
    label: 'Building self-worth',
    category: 'growth',
    description: 'Learning to value and trust themselves',
  },
  {
    id: 'confidence',
    label: 'Building confidence',
    category: 'growth',
    description: 'Developing self-assurance and courage',
  },
  {
    id: 'spiritual_growth',
    label: 'Deepening spiritual connection',
    category: 'growth',
    archetypeId: 'spiritual_seeker',
    description: 'Finding meaning and transcendence',
  },
  {
    id: 'authenticity',
    label: 'Living more authentically',
    category: 'growth',
    description: 'Showing up as their true self',
  },
];

// ============================================================================
// LOCATION OPTIONS
// ============================================================================

/**
 * Service scope options for geographic reach.
 *
 * @type {Array<Object>}
 */
const SERVICE_SCOPES = [
  {
    id: 'local',
    label: 'Local only',
    description: 'Serve clients in my city/metro area',
  },
  {
    id: 'state',
    label: 'Within my state',
    description: 'Licensed/available within my state',
  },
  {
    id: 'multi_state',
    label: 'Multiple states',
    description: 'Licensed in multiple states',
  },
  {
    id: 'nationwide',
    label: 'Nationwide',
    description: 'Available to clients across the country',
  },
  {
    id: 'international',
    label: 'Internationally',
    description: 'Work with clients globally',
  },
];

/**
 * Common US states (for location selection).
 *
 * @type {Array<Object>}
 */
const US_STATES = [
  { id: 'AL', label: 'Alabama' },
  { id: 'AK', label: 'Alaska' },
  { id: 'AZ', label: 'Arizona' },
  { id: 'AR', label: 'Arkansas' },
  { id: 'CA', label: 'California' },
  { id: 'CO', label: 'Colorado' },
  { id: 'CT', label: 'Connecticut' },
  { id: 'DE', label: 'Delaware' },
  { id: 'FL', label: 'Florida' },
  { id: 'GA', label: 'Georgia' },
  { id: 'HI', label: 'Hawaii' },
  { id: 'ID', label: 'Idaho' },
  { id: 'IL', label: 'Illinois' },
  { id: 'IN', label: 'Indiana' },
  { id: 'IA', label: 'Iowa' },
  { id: 'KS', label: 'Kansas' },
  { id: 'KY', label: 'Kentucky' },
  { id: 'LA', label: 'Louisiana' },
  { id: 'ME', label: 'Maine' },
  { id: 'MD', label: 'Maryland' },
  { id: 'MA', label: 'Massachusetts' },
  { id: 'MI', label: 'Michigan' },
  { id: 'MN', label: 'Minnesota' },
  { id: 'MS', label: 'Mississippi' },
  { id: 'MO', label: 'Missouri' },
  { id: 'MT', label: 'Montana' },
  { id: 'NE', label: 'Nebraska' },
  { id: 'NV', label: 'Nevada' },
  { id: 'NH', label: 'New Hampshire' },
  { id: 'NJ', label: 'New Jersey' },
  { id: 'NM', label: 'New Mexico' },
  { id: 'NY', label: 'New York' },
  { id: 'NC', label: 'North Carolina' },
  { id: 'ND', label: 'North Dakota' },
  { id: 'OH', label: 'Ohio' },
  { id: 'OK', label: 'Oklahoma' },
  { id: 'OR', label: 'Oregon' },
  { id: 'PA', label: 'Pennsylvania' },
  { id: 'RI', label: 'Rhode Island' },
  { id: 'SC', label: 'South Carolina' },
  { id: 'SD', label: 'South Dakota' },
  { id: 'TN', label: 'Tennessee' },
  { id: 'TX', label: 'Texas' },
  { id: 'UT', label: 'Utah' },
  { id: 'VT', label: 'Vermont' },
  { id: 'VA', label: 'Virginia' },
  { id: 'WA', label: 'Washington' },
  { id: 'WV', label: 'West Virginia' },
  { id: 'WI', label: 'Wisconsin' },
  { id: 'WY', label: 'Wyoming' },
  { id: 'DC', label: 'Washington, D.C.' },
];

// ============================================================================
// PROPERTIES CHECKLIST
// ============================================================================

/**
 * Properties users can indicate they have for import/enrichment.
 *
 * @type {Array<Object>}
 */
const PROPERTIES_OPTIONS = [
  {
    id: 'website',
    label: 'Practice/Business Website',
    description: 'A website with your bio, services, or about page',
    icon: 'globe',
    importType: 'website',
  },
  {
    id: 'podcast',
    label: 'Podcast',
    description: 'A podcast you host or co-host',
    icon: 'mic',
    importType: 'podcast_rss',
  },
  {
    id: 'newsletter',
    label: 'Newsletter/Substack',
    description: 'An email newsletter or Substack publication',
    icon: 'mail',
    importType: 'newsletter',
  },
  {
    id: 'bio',
    label: 'Existing bio or about page text',
    description: 'Text you can paste from your existing bio',
    icon: 'file-text',
    importType: 'bio_text',
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get word bank items by category.
 *
 * @param {Array<Object>} bank - The word bank array
 * @param {string} category - Category to filter by
 * @returns {Array<Object>} Filtered items
 */
function getByCategory(bank, category) {
  return bank.filter((item) => item.category === category);
}

/**
 * Get a word bank item by ID.
 *
 * @param {Array<Object>} bank - The word bank array
 * @param {string} id - Item ID
 * @returns {Object|undefined} The item or undefined
 */
function getById(bank, id) {
  return bank.find((item) => item.id === id);
}

/**
 * Get all unique categories from a word bank.
 *
 * @param {Array<Object>} bank - The word bank array
 * @returns {Array<string>} Unique categories
 */
function getCategories(bank) {
  return [...new Set(bank.map((item) => item.category))];
}

/**
 * Convert word bank items to label array (for simple display).
 *
 * @param {Array<Object>} items - Word bank items
 * @returns {Array<string>} Array of labels
 */
function toLabels(items) {
  return items.map((item) => item.label);
}

/**
 * Get all word banks as a single object (for API response).
 *
 * @returns {Object} All word banks
 */
function getAllWordBanks() {
  return {
    revenueTypes: REVENUE_TYPES,
    clientTypes: CLIENT_TYPES,
    subcultures: SUBCULTURES,
    clientProblems: CLIENT_PROBLEMS,
    serviceScopes: SERVICE_SCOPES,
    usStates: US_STATES,
    propertiesOptions: PROPERTIES_OPTIONS,
  };
}

export {
  REVENUE_TYPES,
  CLIENT_TYPES,
  SUBCULTURES,
  CLIENT_PROBLEMS,
  SERVICE_SCOPES,
  US_STATES,
  PROPERTIES_OPTIONS,
  getByCategory,
  getById,
  getCategories,
  toLabels,
  getAllWordBanks,
};
