/**
 * ============================================================================
 * BLOG CONTENT COMPILER
 * ============================================================================
 * Assembles all previous stage outputs into a clear, structured context
 * document for Stage 6 (Draft Generation).
 *
 * Philosophy:
 * -----------
 * This module follows the "single responsibility" principle:
 * - It ONLY prepares and organizes context
 * - It does NOT call any AI APIs
 * - It does NOT write content
 *
 * The compiler transforms fragmented JSON outputs from Stages 1-5 into a
 * cohesive, human-readable document that gives the AI everything it needs
 * to write a complete 750-word blog post.
 *
 * Why This Exists:
 * ----------------
 * Stage 6 was failing with "blog post too short" because:
 * 1. Previous outputs were passed as raw JSON blobs
 * 2. The AI couldn't see the "big picture" of what to write
 * 3. Quote placement and section structure were unclear
 *
 * Usage:
 *   import { compileBlogContext } from './lib/blog-content-compiler.js';
 *   const compiled = compileBlogContext(previousStages, evergreen);
 *   // Use compiled.fullContext in the Stage 6 prompt
 * ============================================================================
 */

import logger from './logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Target word counts for the blog post
export const TARGET_TOTAL_WORDS = 750;
const WORD_COUNT_TOLERANCE = 50; // +/- 50 words is acceptable

// Section word count defaults if not specified
const DEFAULT_HOOK_WORDS = 75;
const DEFAULT_CONTEXT_WORDS = 125;
const DEFAULT_SECTION_WORDS = 150;
const DEFAULT_TAKEAWAY_WORDS = 75;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Safely extracts a value from nested objects
 * @param {Object} obj - Object to extract from
 * @param {string} path - Dot-notation path (e.g., 'episode_basics.title')
 * @param {*} defaultValue - Default if not found
 * @returns {*} Extracted value or default
 */
function safeGet(obj, path, defaultValue = null) {
  if (!obj) return defaultValue;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return defaultValue;
    current = current[part];
  }

  return current ?? defaultValue;
}

/**
 * Formats an array of items into a bulleted list
 * @param {Array} items - Items to format
 * @param {string} prefix - Prefix for each item (default: '- ')
 * @returns {string} Formatted list
 */
function formatBulletList(items, prefix = '- ') {
  if (!Array.isArray(items) || items.length === 0) return '(none provided)';
  return items.map(item => `${prefix}${item}`).join('\n');
}

/**
 * Truncates text to a maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// QUOTE COMPILATION
// ============================================================================

/**
 * Compiles quotes into a structured format with placement suggestions
 *
 * @param {Object} stage2Output - Stage 2 quote extraction output
 * @param {Object} stage4Output - Stage 4 paragraph outlines (for placement hints)
 * @returns {string} Formatted quotes section for the prompt
 */
function compileQuotes(stage2Output, stage4Output) {
  const quotes = stage2Output?.quotes || [];

  if (quotes.length === 0) {
    logger.warn('📝 No quotes available for blog post compilation');
    return `
## AVAILABLE QUOTES

No quotes were extracted from the transcript. Focus on paraphrasing key insights
from the outline instead.
`;
  }

  // Group quotes by suggested usage
  const groupedQuotes = {
    headline: [],
    pullquote: [],
    social: [],
    key_point: [],
    unspecified: [],
  };

  quotes.forEach((quote, index) => {
    const usage = quote.usage || 'unspecified';
    const group = groupedQuotes[usage] || groupedQuotes.unspecified;
    group.push({ ...quote, originalIndex: index + 1 });
  });

  // Build the quotes section
  let quotesSection = `
## AVAILABLE QUOTES (${quotes.length} total)

Use these VERBATIM quotes throughout your blog post. Integrate them naturally
as blockquotes or inline attributions. Aim to use 2-4 quotes total.

`;

  // Best quotes for the blog post (pullquotes and key_points)
  const blogQuotes = [...groupedQuotes.pullquote, ...groupedQuotes.key_point];
  if (blogQuotes.length > 0) {
    quotesSection += `### Best Quotes for the Blog Post\n\n`;
    blogQuotes.forEach(q => {
      quotesSection += `**Quote ${q.originalIndex}** (${q.usage || 'key insight'}):\n`;
      quotesSection += `> "${q.text}"\n`;
      quotesSection += `> — ${q.speaker}\n`;
      if (q.context) {
        quotesSection += `\n*Why it matters:* ${q.context}\n`;
      }
      quotesSection += '\n';
    });
  }

  // Headline-worthy quotes (for opening or emphasis)
  if (groupedQuotes.headline.length > 0) {
    quotesSection += `### Headline-Worthy Quotes (great for opening or bold statements)\n\n`;
    groupedQuotes.headline.forEach(q => {
      quotesSection += `> "${truncate(q.text, 150)}"\n`;
      quotesSection += `> — ${q.speaker}\n\n`;
    });
  }

  // All other quotes
  const otherQuotes = [...groupedQuotes.social, ...groupedQuotes.unspecified];
  if (otherQuotes.length > 0) {
    quotesSection += `### Additional Quotes\n\n`;
    otherQuotes.forEach(q => {
      quotesSection += `> "${truncate(q.text, 150)}"\n`;
      quotesSection += `> — ${q.speaker}\n\n`;
    });
  }

  return quotesSection;
}

// ============================================================================
// OUTLINE COMPILATION
// ============================================================================

/**
 * Compiles the blog outline into a clear structure with word count targets
 *
 * @param {Object} stage3Output - Stage 3 high-level outline
 * @param {Object} stage4Output - Stage 4 paragraph-level outlines
 * @returns {string} Formatted outline section
 */
function compileOutline(stage3Output, stage4Output) {
  const postStructure = stage3Output?.post_structure;
  const sectionDetails = stage4Output?.section_details || [];
  // NOTE: We no longer use narrative_summary from Stage 3.
  // Stage 1's episode_crux is the canonical "big picture" summary and is
  // already included in the compileEpisodeContext() function above.
  // This avoids duplicate summarization across stages.

  if (!postStructure) {
    logger.warn('📝 No blog outline available for compilation');
    return `
## BLOG STRUCTURE

No outline was provided. Create a 750-word blog post with:
- A compelling hook (75-100 words)
- 3-4 main sections (150-200 words each)
- A thoughtful takeaway (75-100 words)
`;
  }

  let outlineSection = `
## BLOG STRUCTURE (TARGET: ~${TARGET_TOTAL_WORDS} WORDS)

Follow this structure EXACTLY. Hit the word counts for each section.

`;

  // Hook/Opening
  const hookType = postStructure.hook_type || 'engaging opening';
  outlineSection += `### 1. OPENING HOOK (${DEFAULT_HOOK_WORDS}-100 words)
**Approach:** ${hookType}
**Strategy:** ${postStructure.hook || 'Start with something that immediately grabs attention'}

Write an opening that:
- Does NOT start with a rhetorical question
- Avoids "In today's world..." or "Have you ever..."
- Immediately draws the reader in

`;

  // Main Sections
  const sections = postStructure.sections || [];
  sections.forEach((section, idx) => {
    const sectionNum = idx + 1;
    const targetWords = section.word_count_target || DEFAULT_SECTION_WORDS;

    outlineSection += `### ${sectionNum + 1}. ${section.section_title?.toUpperCase() || `SECTION ${sectionNum}`} (~${targetWords} words)
**Purpose:** ${section.purpose || 'Develop this section of the argument'}

`;

    // Add paragraph details if available
    const paragraphDetails = sectionDetails.find(
      s => s.section_number === sectionNum || s.section_title === section.section_title
    );

    if (paragraphDetails?.paragraphs) {
      outlineSection += `**Paragraph breakdown:**\n`;
      paragraphDetails.paragraphs.forEach((p, pIdx) => {
        outlineSection += `  ${pIdx + 1}. ${p.main_point}\n`;
        if (p.supporting_elements?.length > 0) {
          outlineSection += `     Include: ${p.supporting_elements.slice(0, 2).join(', ')}\n`;
        }
      });
      outlineSection += '\n';
    }
  });

  // Takeaway/Closing
  outlineSection += `### CLOSING TAKEAWAY (~${DEFAULT_TAKEAWAY_WORDS}-100 words)
**Approach:** ${postStructure.cta || 'End with a meaningful insight or gentle call to reflection'}

Write a closing that:
- Synthesizes the main insight (don't just summarize)
- Gives the reader one clear thing to think about or try
- Does NOT hard-sell or use aggressive CTAs

`;

  // Word count summary
  const totalTarget = sections.reduce((sum, s) => sum + (s.word_count_target || DEFAULT_SECTION_WORDS), 0)
    + DEFAULT_HOOK_WORDS + DEFAULT_TAKEAWAY_WORDS;

  outlineSection += `---
**TOTAL TARGET:** ${totalTarget} words (acceptable range: ${totalTarget - WORD_COUNT_TOLERANCE} to ${totalTarget + WORD_COUNT_TOLERANCE})

`;

  return outlineSection;
}

// ============================================================================
// HEADLINES COMPILATION
// ============================================================================

/**
 * Compiles headlines into a selection for the AI to choose from
 *
 * @param {Object} stage5Output - Stage 5 headlines output
 * @returns {string} Formatted headlines section
 */
function compileHeadlines(stage5Output) {
  const headlines = stage5Output?.headlines || [];
  const subheadings = stage5Output?.subheadings || [];

  if (headlines.length === 0) {
    return `
## TITLE OPTIONS

Choose a compelling title for your blog post (40-70 characters).
`;
  }

  let headlinesSection = `
## TITLE OPTIONS

Choose ONE of these headlines as your blog post title (or create a variation):

`;

  // Show top 5 headlines
  const topHeadlines = headlines.slice(0, 5);
  topHeadlines.forEach((h, idx) => {
    headlinesSection += `${idx + 1}. "${h}"\n`;
  });

  // Subheadings for sections
  if (subheadings.length > 0) {
    headlinesSection += `
### Available Subheadings for Sections

Use these as H2 headings within your post:
`;
    subheadings.slice(0, 6).forEach(sh => {
      headlinesSection += `- ${sh}\n`;
    });
  }

  return headlinesSection;
}

// ============================================================================
// EPISODE CONTEXT COMPILATION
// ============================================================================

/**
 * Compiles episode context and analysis into a summary
 *
 * @param {Object} stage1Output - Stage 1 transcript analysis
 * @param {Object} evergreen - Evergreen content (podcast info, therapist profile)
 * @returns {string} Formatted episode context
 */
function compileEpisodeContext(stage1Output, evergreen) {
  const episodeBasics = stage1Output?.episode_basics || {};
  const guestInfo = stage1Output?.guest_info;
  const episodeCrux = stage1Output?.episode_crux || '';

  // Podcast and host info
  const podcastName = evergreen?.podcast_info?.name || 'the podcast';
  const hostName = evergreen?.therapist_profile?.name || 'the host';
  const credentials = evergreen?.therapist_profile?.credentials || '';
  const targetAudience = evergreen?.podcast_info?.target_audience || 'general audience';

  let contextSection = `
## EPISODE CONTEXT

**Podcast:** ${podcastName}
**Host:** ${hostName}${credentials ? `, ${credentials}` : ''}
**Target Audience:** ${targetAudience}

`;

  // Episode details
  if (episodeBasics.title) {
    contextSection += `**Episode Title:** ${episodeBasics.title}\n`;
  }

  // Main topics
  const topics = episodeBasics.main_topics || [];
  if (topics.length > 0) {
    contextSection += `**Main Topics:**\n${formatBulletList(topics)}\n\n`;
  }

  // Guest info
  if (guestInfo) {
    contextSection += `**Guest:** ${guestInfo.name}`;
    if (guestInfo.credentials) contextSection += `, ${guestInfo.credentials}`;
    contextSection += '\n';
    if (guestInfo.expertise) {
      contextSection += `**Guest Expertise:** ${guestInfo.expertise}\n`;
    }
    contextSection += '\n';
  }

  // Episode crux (THE MOST IMPORTANT PART)
  if (episodeCrux) {
    contextSection += `### THE CORE MESSAGE (Build your entire post around this!)

${episodeCrux}

This is the KEY INSIGHT your blog post must communicate. Every section should
support and develop this central message.

`;
  }

  return contextSection;
}

// ============================================================================
// MAIN COMPILER FUNCTION
// ============================================================================

/**
 * Compiles all previous stage outputs into a comprehensive context document
 * for Stage 6 (Draft Generation).
 *
 * This is the main entry point for the blog content compiler.
 *
 * @param {Object} previousStages - All previous stage outputs (keyed by stage number)
 * @param {Object} evergreen - Evergreen content (therapist profile, podcast info, voice guidelines)
 * @param {Object} [options={}] - Compilation options
 * @param {boolean} [options.includeTranscript=false] - Include original transcript
 * @param {string} [options.transcript] - Original transcript text (if includeTranscript is true)
 * @returns {Object} Compiled context object
 *   - fullContext: Complete context document (string)
 *   - summary: Brief summary for logging
 *   - wordCountTarget: Target word count
 *   - quoteCount: Number of available quotes
 *   - sectionCount: Number of sections in outline
 *
 * @example
 * const compiled = compileBlogContext(previousStages, evergreen);
 * // Use compiled.fullContext in Stage 6 prompt
 */
export function compileBlogContext(previousStages, evergreen, options = {}) {
  const { includeTranscript = false, transcript = '' } = options;

  logger.debug('📚 Compiling blog context from previous stages', {
    stagesAvailable: Object.keys(previousStages).map(Number),
    hasEvergreen: !!evergreen,
    includeTranscript,
  });

  // Extract stage outputs
  const stage1Output = previousStages[1] || {};
  const stage2Output = previousStages[2] || {};
  const stage3Output = previousStages[3] || {};
  const stage4Output = previousStages[4] || {};
  const stage5Output = previousStages[5] || {};

  // Compile each section
  const episodeContext = compileEpisodeContext(stage1Output, evergreen);
  const quotesSection = compileQuotes(stage2Output, stage4Output);
  const outlineSection = compileOutline(stage3Output, stage4Output);
  const headlinesSection = compileHeadlines(stage5Output);

  // Voice guidelines
  const voiceGuidelines = evergreen?.voice_guidelines || {};
  const voiceSection = Object.keys(voiceGuidelines).length > 0 ? `
## VOICE GUIDELINES

**Tone:** ${voiceGuidelines.tone?.join(', ') || 'warm, professional, conversational'}
**Perspective:** ${voiceGuidelines.perspective || 'first-person (I/we)'}
**Style:** ${voiceGuidelines.sentence_style || 'Mix of short and medium sentences'}

${voiceGuidelines.avoid?.length > 0 ? `**Avoid:**\n${formatBulletList(voiceGuidelines.avoid)}` : ''}
` : '';

  // Assemble the full context document
  const fullContext = `
# BLOG POST WRITING BRIEF
${'='.repeat(60)}

This document contains everything you need to write a ${TARGET_TOTAL_WORDS}-word blog post.
Follow the structure exactly and hit the word count targets.

${episodeContext}
${voiceSection}
${outlineSection}
${headlinesSection}
${quotesSection}
${includeTranscript && transcript ? `
## REFERENCE: ORIGINAL TRANSCRIPT

<transcript>
${transcript}
</transcript>
` : ''}

${'='.repeat(60)}
# END OF BRIEF - NOW WRITE THE BLOG POST
${'='.repeat(60)}
`;

  // Calculate summary stats
  const quoteCount = stage2Output?.quotes?.length || 0;
  const sectionCount = stage3Output?.post_structure?.sections?.length || 0;
  const hasEpisodeCrux = !!stage1Output?.episode_crux;
  // NOTE: We no longer track hasNarrativeSummary since Stage 3 no longer
  // produces it. Stage 1's episode_crux is the canonical "big picture" summary.

  logger.info('📚 Blog context compiled successfully', {
    contextLength: fullContext.length,
    quoteCount,
    sectionCount,
    hasEpisodeCrux,
    hasVoiceGuidelines: Object.keys(voiceGuidelines).length > 0,
  });

  return {
    fullContext,
    summary: {
      episodeTitle: stage1Output?.episode_basics?.title || 'Untitled',
      quoteCount,
      sectionCount,
      hasEpisodeCrux,
      contextLength: fullContext.length,
    },
    wordCountTarget: TARGET_TOTAL_WORDS,
    quoteCount,
    sectionCount,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  compileBlogContext,
  TARGET_TOTAL_WORDS,
  WORD_COUNT_TOLERANCE,
};
