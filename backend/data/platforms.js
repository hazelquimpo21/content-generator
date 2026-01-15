/**
 * Social Platforms for Brand Discovery
 *
 * Platform definitions for the Channels module.
 * Users rank platforms by priority for their content distribution.
 *
 * @module data/platforms
 */

/**
 * All available platforms with their characteristics.
 * Each platform includes vibe, content types, and character limits.
 *
 * @type {Array<Object>}
 */
const PLATFORMS = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'linkedin', // For frontend icon mapping
    vibe: 'Professional/Authoritative',
    description: 'Long-form thought leadership, professional credibility',
    contentTypes: ['articles', 'carousels', 'text posts'],
    characterLimits: {
      post: 3000,
      article: null, // No limit
    },
    bestFor: ['B2B', 'executives', 'professionals', 'thought leadership'],
    color: '#0A66C2', // LinkedIn brand color
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'instagram',
    vibe: 'Visual/Aesthetic',
    description: 'Carousel education, reels, aesthetic quotes',
    contentTypes: ['carousels', 'reels', 'stories', 'single image'],
    characterLimits: {
      caption: 2200,
      bio: 150,
    },
    bestFor: ['visual content', 'younger audience', 'lifestyle', 'personal brand'],
    color: '#E4405F', // Instagram brand color
  },
  {
    id: 'twitter',
    name: 'Twitter/X',
    icon: 'twitter',
    vibe: 'Punchy/Conversational',
    description: 'Hot takes, threads, quick insights',
    contentTypes: ['tweets', 'threads'],
    characterLimits: {
      tweet: 280,
      threadTweet: 280,
    },
    bestFor: ['hot takes', 'quick insights', 'conversation', 'news commentary'],
    color: '#1DA1F2', // Twitter brand color
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    vibe: 'Community/Personal',
    description: 'Longer posts, community engagement, groups',
    contentTypes: ['posts', 'lives', 'groups'],
    characterLimits: {
      post: 63206,
    },
    bestFor: ['community building', 'groups', 'older demographics', 'local'],
    color: '#1877F2', // Facebook brand color
  },
  {
    id: 'email',
    name: 'Email Newsletter',
    icon: 'mail',
    vibe: 'Intimate/Nurturing',
    description: 'Deep dives, personal stories, exclusive content',
    contentTypes: ['newsletter', 'sequences'],
    characterLimits: null, // No character limits
    bestFor: ['deep connection', 'long-form', 'exclusive content', 'nurturing'],
    color: '#D4A574', // Amber/email color
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: 'tiktok',
    vibe: 'Casual/Authentic',
    description: 'Short-form video, trends, raw authenticity',
    contentTypes: ['short video'],
    characterLimits: {
      caption: 2200,
    },
    bestFor: ['younger audience', 'video', 'trends', 'authentic/raw content'],
    color: '#000000', // TikTok brand color
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: 'threads',
    vibe: 'Conversational/Casual',
    description: 'Text-based social, casual conversation',
    contentTypes: ['posts'],
    characterLimits: {
      post: 500,
    },
    bestFor: ['casual conversation', 'text-based', 'community'],
    color: '#000000', // Threads brand color
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: 'youtube',
    vibe: 'Educational/Evergreen',
    description: 'Long-form video, searchable content',
    contentTypes: ['long video', 'shorts'],
    characterLimits: {
      title: 100,
      description: 5000,
    },
    bestFor: ['evergreen content', 'SEO', 'education', 'tutorials'],
    color: '#FF0000', // YouTube brand color
  },
];

/**
 * Default platform order (initial ranking before user customization).
 * Based on most common priorities for therapists/coaches.
 *
 * @type {Array<string>}
 */
const DEFAULT_PLATFORM_ORDER = [
  'instagram',
  'linkedin',
  'email',
  'facebook',
  'twitter',
  'youtube',
  'tiktok',
  'threads',
];

/**
 * Get a platform by its ID.
 *
 * @param {string} id - The platform ID
 * @returns {Object|undefined} The platform object or undefined if not found
 */
function getPlatformById(id) {
  return PLATFORMS.find((p) => p.id === id);
}

/**
 * Get platforms sorted by default order.
 *
 * @returns {Array<Object>} Platforms in default order
 */
function getPlatformsInDefaultOrder() {
  return DEFAULT_PLATFORM_ORDER.map((id) => getPlatformById(id)).filter(Boolean);
}

/**
 * Validate a platform ranking array.
 * Ensures all provided IDs are valid platforms.
 *
 * @param {Array<string>} ranking - Array of platform IDs
 * @returns {{valid: boolean, invalidIds: Array<string>}}
 */
function validatePlatformRanking(ranking) {
  const validIds = PLATFORMS.map((p) => p.id);
  const invalidIds = ranking.filter((id) => !validIds.includes(id));

  return {
    valid: invalidIds.length === 0,
    invalidIds,
  };
}

/**
 * Generate platform-specific content guidelines for Brand DNA.
 *
 * @param {Array<{platform: string, rank: number}>} priorities - Ranked platforms
 * @returns {Object<string, Object>} Platform adaptations for AI directives
 */
function generatePlatformAdaptations(priorities) {
  const adaptations = {};

  priorities.forEach(({ platform: platformId, rank }) => {
    const platform = getPlatformById(platformId);
    if (!platform) return;

    adaptations[platformId] = {
      priority: rank,
      vibe: platform.vibe,
      contentTypes: platform.contentTypes,
      characterLimits: platform.characterLimits,
      toneShift: generateToneShift(platform),
      emphasis: platform.bestFor.slice(0, 2).join(', '),
    };
  });

  return adaptations;
}

/**
 * Generate tone shift guidance for a platform.
 * Internal helper for generatePlatformAdaptations.
 *
 * @param {Object} platform - Platform object
 * @returns {string} Tone shift guidance
 */
function generateToneShift(platform) {
  const shifts = {
    linkedin: 'More professional and authoritative, emphasize expertise and credibility',
    instagram: 'More visual and personal, focus on emotional connection and aesthetics',
    twitter: 'More punchy and direct, embrace hot takes and concise insights',
    facebook: 'More conversational and community-focused, encourage engagement',
    email: 'More intimate and nurturing, as if writing to a close friend',
    tiktok: 'More casual and authentic, embrace imperfection and trends',
    threads: 'More conversational and casual, focus on discussion',
    youtube: 'More educational and thorough, optimize for search and long-form',
  };

  return shifts[platform.id] || 'Adapt tone to platform norms';
}

export {
  PLATFORMS,
  DEFAULT_PLATFORM_ORDER,
  getPlatformById,
  getPlatformsInDefaultOrder,
  validatePlatformRanking,
  generatePlatformAdaptations,
};
