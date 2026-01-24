# Dual Blog Article Refactor - Implementation Guide

This document outlines the changes made to the analyzer pipeline and the additional work needed to fully implement the dual blog article feature.

## Summary of Changes

The pipeline has been refactored to produce **TWO blog articles** per episode:
1. **Episode Recap** - Promotes/summarizes the podcast episode
2. **Topic Article** - Standalone piece on a topic from the episode

New building blocks have been added:
- **5 "They Ask, You Answer" Q&As** - Questions the audience is already asking, with answers based on episode content
- **6 Blog Post Ideas** - Potential standalone article topics extracted from the episode

---

## Stage Changes

### Stage 2: Content Building Blocks (Refactored)

**New Output Structure:**
```javascript
{
  quotes: [...],        // 8-12 verbatim quotes (existing)
  tips: [...],          // 3-5 actionable tips (existing)
  qa_pairs: [           // NEW: 5 "They Ask, You Answer" Q&As
    {
      question: "Why do I keep picking the same type of partner?",
      answer: "3-5 sentence answer based on episode content"
    }
  ],
  blog_ideas: [         // NEW: 6 blog post topic ideas
    {
      title: "Working Title",
      angle: "One sentence explaining the hook",
      why_it_resonates: "Why the audience would care",
      searchability: "high|medium|low"
    }
  ]
}
```

### Stage 3: Blog Selection & Dual Planning (Refactored)

**New Output Structure:**
```javascript
{
  selected_blog_idea: {
    title: "The chosen blog idea title",
    reasoning: "Why this idea was selected",
    original_index: 2  // Index in Stage 2 blog_ideas array
  },
  episode_recap_outline: {
    working_title: "Episode Recap Title",
    hook: { approach: "...", hook_type: "tension|insight|story|..." },
    what_episode_covers: "Narrative overview",
    key_insights: [
      { insight: "...", quote_to_use: "..." }
    ],
    why_listen: "...",
    cta_approach: "..."
  },
  topic_article_outline: {
    working_title: "Topic Article Title",
    hook: { approach: "...", hook_type: "problem|counterintuitive|..." },
    context: "What to establish",
    sections: [
      {
        section_title: "...",
        purpose: "...",
        word_count_target: 150,
        quotes_or_tips_to_use: ["..."]
      }
    ],
    takeaway: "..."
  }
}
```

### Stage 6: Dual Blog Draft Generation (Refactored)

**New Output Structure:**
```javascript
{
  output_data: {
    episode_recap: {
      word_count: 750,
      char_count: 4500,
      structure: { h1Count: 1, h2Count: 4, ... },
      ai_patterns_detected: []
    },
    topic_article: {
      word_count: 750,
      char_count: 4500,
      structure: { h1Count: 1, h2Count: 3, ... },
      ai_patterns_detected: []
    },
    selected_blog_idea: { title: "...", reasoning: "..." }
  },
  output_text: {
    episode_recap: "# Full markdown article 1...",
    topic_article: "# Full markdown article 2..."
  }
}
```

---

## Frontend Changes Needed

### 1. Review Hub - Blog Tab Updates

**Current State:** Shows single blog post
**New State:** Must show two blog posts with tabs or accordion

```jsx
// ReviewHub.jsx or BlogTab.jsx
// Add tab navigation for two articles

const BlogContentSection = ({ stageOutput }) => {
  const [activeArticle, setActiveArticle] = useState('episode_recap');

  return (
    <div>
      <TabNav>
        <Tab
          active={activeArticle === 'episode_recap'}
          onClick={() => setActiveArticle('episode_recap')}
        >
          Episode Recap
        </Tab>
        <Tab
          active={activeArticle === 'topic_article'}
          onClick={() => setActiveArticle('topic_article')}
        >
          Topic Article
        </Tab>
      </TabNav>

      <ArticleContent>
        {activeArticle === 'episode_recap' && (
          <MarkdownRenderer content={stageOutput.output_text.episode_recap} />
        )}
        {activeArticle === 'topic_article' && (
          <MarkdownRenderer content={stageOutput.output_text.topic_article} />
        )}
      </ArticleContent>

      <ArticleStats>
        {activeArticle === 'episode_recap' && (
          <span>{stageOutput.output_data.episode_recap.word_count} words</span>
        )}
        {activeArticle === 'topic_article' && (
          <span>{stageOutput.output_data.topic_article.word_count} words</span>
        )}
      </ArticleStats>
    </div>
  );
};
```

### 2. Review Hub - New Q&A Section

**Add new tab or section for Q&As:**

```jsx
// QASection.jsx
const QASection = ({ qaPairs }) => {
  return (
    <div className="qa-section">
      <h2>They Ask, You Answer</h2>
      <p className="section-description">
        Common questions your audience is asking (useful for FAQ pages, social content, or blog topics)
      </p>

      {qaPairs.map((qa, index) => (
        <div key={index} className="qa-pair">
          <div className="question">
            <strong>Q:</strong> {qa.question}
          </div>
          <div className="answer">
            <strong>A:</strong> {qa.answer}
          </div>
          <CopyButton text={`Q: ${qa.question}\n\nA: ${qa.answer}`} />
        </div>
      ))}
    </div>
  );
};
```

### 3. Review Hub - Blog Ideas Section

**Add section to display the 6 blog ideas and which was selected:**

```jsx
// BlogIdeasSection.jsx
const BlogIdeasSection = ({ blogIdeas, selectedIdea }) => {
  return (
    <div className="blog-ideas-section">
      <h2>Blog Post Ideas</h2>
      <p className="section-description">
        6 potential article topics from this episode
      </p>

      {blogIdeas.map((idea, index) => (
        <div
          key={index}
          className={`blog-idea ${selectedIdea?.original_index === index ? 'selected' : ''}`}
        >
          {selectedIdea?.original_index === index && (
            <span className="selected-badge">Selected for Topic Article</span>
          )}
          <h3>{idea.title}</h3>
          <p className="angle">{idea.angle}</p>
          <p className="resonance">{idea.why_it_resonates}</p>
          {idea.searchability && (
            <span className={`searchability ${idea.searchability}`}>
              Searchability: {idea.searchability}
            </span>
          )}
        </div>
      ))}

      {selectedIdea && (
        <div className="selection-reasoning">
          <strong>Why this idea was selected:</strong>
          <p>{selectedIdea.reasoning}</p>
        </div>
      )}
    </div>
  );
};
```

### 4. Updated Tab Structure for Review Hub

```jsx
// ReviewHub.jsx
const TABS = [
  { id: 'summary', label: 'Summary', stage: 1 },
  { id: 'quotes', label: 'Quotes & Tips', stage: 2 },
  { id: 'qa', label: 'Q&A', stage: 2 },           // NEW
  { id: 'blog-ideas', label: 'Blog Ideas', stage: 2 },  // NEW
  { id: 'blog', label: 'Blog Posts', stage: 6 },  // Updated (plural)
  { id: 'social', label: 'Social', stage: 8 },
  { id: 'email', label: 'Email', stage: 9 },
];
```

### 5. Copy/Export Updates

Update copy functionality to handle both articles:

```jsx
// CopyButtons for blog section
<div className="copy-actions">
  <CopyButton
    label="Copy Episode Recap"
    text={stageOutput.output_text.episode_recap}
  />
  <CopyButton
    label="Copy Topic Article"
    text={stageOutput.output_text.topic_article}
  />
  <CopyButton
    label="Copy Both Articles"
    text={`EPISODE RECAP\n\n${stageOutput.output_text.episode_recap}\n\n---\n\nTOPIC ARTICLE\n\n${stageOutput.output_text.topic_article}`}
  />
</div>
```

---

## Database Schema Changes

### Option A: No Schema Changes (Recommended)

The current `stage_outputs` table can handle the new structure because `output_data` and `output_text` are JSONB columns. The new nested structure will be stored as JSON.

**Current Schema:**
```sql
CREATE TABLE stage_outputs (
  id UUID PRIMARY KEY,
  episode_id UUID REFERENCES episodes(id),
  stage_number INTEGER,
  stage_name TEXT,
  status TEXT,
  output_text TEXT,      -- Can store JSON string for object
  output_data JSONB,     -- Already handles nested objects
  cost_usd DECIMAL
);
```

**For Stage 6, `output_text` will now be:**
```json
{
  "episode_recap": "# Full markdown...",
  "topic_article": "# Full markdown..."
}
```

**For Stage 2, `output_data` will now include:**
```json
{
  "quotes": [...],
  "tips": [...],
  "qa_pairs": [...],
  "blog_ideas": [...]
}
```

### Option B: New Columns (If Preferred)

If you want explicit columns for the new data:

```sql
-- Add to stage_outputs or create new table
ALTER TABLE stage_outputs ADD COLUMN qa_pairs JSONB;
ALTER TABLE stage_outputs ADD COLUMN blog_ideas JSONB;

-- Or create separate table for articles
CREATE TABLE episode_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES episodes(id),
  article_type TEXT CHECK (article_type IN ('episode_recap', 'topic_article')),
  title TEXT,
  content TEXT,
  word_count INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API Response Changes

### GET /api/stages/:episodeId/2

**Before:**
```json
{
  "output_data": {
    "quotes": [...],
    "tips": [...]
  }
}
```

**After:**
```json
{
  "output_data": {
    "quotes": [...],
    "tips": [...],
    "qa_pairs": [...],
    "blog_ideas": [...]
  }
}
```

### GET /api/stages/:episodeId/6

**Before:**
```json
{
  "output_text": "# Single blog post markdown...",
  "output_data": {
    "word_count": 750,
    "structure": {...}
  }
}
```

**After:**
```json
{
  "output_text": {
    "episode_recap": "# Episode recap markdown...",
    "topic_article": "# Topic article markdown..."
  },
  "output_data": {
    "episode_recap": {
      "word_count": 750,
      "structure": {...}
    },
    "topic_article": {
      "word_count": 750,
      "structure": {...}
    },
    "selected_blog_idea": {
      "title": "...",
      "reasoning": "..."
    }
  }
}
```

---

## Migration Notes

1. **Backward Compatibility**: Old episodes with single blog posts will have `output_text` as a string. New episodes will have it as an object. Frontend should handle both:

```jsx
const getEpisodeRecap = (stageOutput) => {
  if (typeof stageOutput.output_text === 'string') {
    // Legacy format
    return stageOutput.output_text;
  }
  // New format
  return stageOutput.output_text?.episode_recap || '';
};
```

2. **Processing existing episodes**: Existing episodes won't have Q&As or blog ideas. Handle gracefully:

```jsx
const qaPairs = stage2Output?.qa_pairs || [];
const blogIdeas = stage2Output?.blog_ideas || [];
```

---

## Testing Checklist

### Backend Pipeline
- [ ] Stage 2 returns qa_pairs (exactly 5) and blog_ideas (exactly 6)
- [ ] Stage 2 quotes and tips still work as expected
- [ ] Stage 3 selects a blog idea from the 6 options
- [ ] Stage 3 creates episode_recap_outline with working_title, hook, key_insights
- [ ] Stage 3 creates topic_article_outline with working_title, hook, sections
- [ ] Stage 6 generates two separate articles (episode_recap and topic_article)
- [ ] Stage 6 output_text is an object, not a string
- [ ] Word counts accurate for both articles (~750 each)

### Frontend Display
- [ ] QuotesTab shows all 4 pills: Quotes, Tips, Q&A, Blog Ideas
- [ ] Q&A section shows expandable question/answer pairs
- [ ] Q&A copy buttons work (copy question, answer, or both)
- [ ] Blog Ideas show searchability badges (high/medium/low)
- [ ] BlogTab shows article toggle for dual-article format
- [ ] Article toggle shows word counts
- [ ] Episode Recap article displays correctly
- [ ] Topic Article displays with "Based on:" context
- [ ] Copy/Save/Schedule buttons work for active article

### Backward Compatibility
- [ ] Old episodes with string output_text display as single blog post
- [ ] Old episodes without qa_pairs don't break QuotesTab
- [ ] Old episodes without blog_ideas don't break QuotesTab
- [ ] Old episodes with legacy outline format still display

### Error Handling
- [ ] Missing stage data shows helpful EmptyState message
- [ ] Console logs help debug data flow issues
- [ ] No crashes when switching between old and new episodes

---

## Files Changed

### Prompts
- `backend/prompts/stage-01-episode-summary.md` - More human tone
- `backend/prompts/stage-02-quotes-and-tips.md` - Added Q&As and blog ideas
- `backend/prompts/stage-03-blog-outline.md` - Dual article planning
- `backend/prompts/stage-06-draft-generation.md` - Dual article generation

### Analyzers
- `backend/analyzers/stage-02-extract-quotes.js` - New schema for Q&As and blog ideas
- `backend/analyzers/stage-03-outline-high-level.js` - Blog selection and dual outlines
- `backend/analyzers/stage-06-draft-blog-post.js` - Generates two articles

### Frontend (IMPLEMENTED)
- `frontend/src/pages/ReviewHub.jsx` - Updated with:
  - QuotesTab now displays Q&A pairs and Blog Ideas via pill navigation
  - BlogTab now supports dual article toggle (Episode Recap / Topic Article)
  - Backward compatibility for legacy single-article episodes
  - Proper error handling and logging throughout
- `frontend/src/pages/ReviewHub.module.css` - New styles for:
  - Q&A section with expandable answers
  - Blog Ideas grid with searchability badges
  - Article toggle for dual blog display
  - Responsive layouts for mobile

---

## Downstream Impact Fixes (Gotchas)

The dual-article refactor required updates to several downstream systems that expected the old single-article format.

### Stage 7: Dual Article Refinement

**File:** `backend/analyzers/stage-07-refine-with-claude.js`

**Problem:** Line 62 expected `previousStages[6]?.output_text` to be a string, but now receives an object.

**Solution:**
- Added `isDualArticleFormat()` detection helper
- Refines BOTH articles separately when dual format detected
- Returns `output_text` as object: `{ episode_recap, topic_article }`
- Maintains backward compatibility for legacy single-article episodes

```javascript
// Detection helper
const isDual = output && typeof output === 'object' &&
  (output.episode_recap || output.topic_article);

// Returns object for new episodes, string for legacy
output_text: isDual ? { episode_recap, topic_article } : singleArticle
```

### Stage 8: Social Content with Dual Articles

**File:** `backend/analyzers/stage-08-social-platform.js`

**Problem:** Line 136 expected `previousStages[7]?.output_text` to be a string.

**Solution:**
- Detects dual-article format vs legacy
- Uses Episode Recap as PRIMARY source (promotes the episode for social)
- Includes Topic Article as additional context for content variety
- Added Q&A pairs to template variables for social inspiration

```javascript
// For social posts that promote the episode, Episode Recap is primary
primaryContent = stage7Output.episode_recap || stage7Output.topic_article || '';
secondaryContent = stage7Output.topic_article || null;
```

### Prompt Loader Variable Substitution

**File:** `backend/lib/prompt-loader.js`

**Problem:** Lines 360-361 used `previousStages[6]?.output_text || ''` which returned `[object Object]` for dual articles.

**Solution:**
- Added `formatBlogOutput()` helper to serialize dual-article objects
- Added `getArticleContent()` helper to extract individual articles
- New template variables for specific article access:
  - `STAGE_6_OUTPUT` - Full formatted output (both articles)
  - `STAGE_6_EPISODE_RECAP` - Episode Recap only
  - `STAGE_6_TOPIC_ARTICLE` - Topic Article only
  - `STAGE_7_OUTPUT`, `STAGE_7_EPISODE_RECAP`, `STAGE_7_TOPIC_ARTICLE` - Same for Stage 7
- Added `STAGE_2_QA_PAIRS` and `STAGE_2_BLOG_IDEAS` for new Stage 2 outputs

### Cost Calculator Estimates

**File:** `backend/lib/cost-calculator.js`

**Updated token estimates for dual-article generation:**

| Stage | Old Output Tokens | New Output Tokens | Change |
|-------|-------------------|-------------------|--------|
| 2     | 800               | 1200              | +50% (Q&As + blog ideas) |
| 3     | 400               | 600               | +50% (dual outlines) |
| 6     | 1500              | 3000              | +100% (two articles) |
| 7     | 1200              | 2400              | +100% (refine both) |

### Blog Content Compiler

**File:** `backend/lib/blog-content-compiler.js`

**Problem:** `compileOutline()` expected `stage3Output.post_structure` (legacy format).

**Solution:**
- Detects dual-article format vs legacy
- Added `compileDualOutlines()` for new format
- Renamed original logic to `compileLegacyOutline()`
- Includes selected blog idea context in the prompt

```javascript
// Check for dual-article format (new)
if (stage3Output?.episode_recap_outline || stage3Output?.topic_article_outline) {
  return compileDualOutlines(stage3Output, sectionDetails);
}
// Legacy single-article format
return compileLegacyOutline(postStructure, sectionDetails);
```

### ProcessingScreen Phase Labels

**File:** `frontend/src/pages/ProcessingScreen.jsx`

**Updated stage descriptions:**
- Stage 2: "Content Building Blocks" → "Quotes, tips, Q&As, and blog ideas"
- Stage 3: "Dual Article Planning" → "Selecting blog idea and creating outlines"
- Stage 6: "Dual Article Draft" → "Writing Episode Recap + Topic Article"
- Stage 7: "Article Refinement" → "Polishing both articles"
- Phase 2 description: "Planning two articles: Episode Recap + Topic Article"
- Phase 3 description: "Drafting and refining both blog articles"

---

## No Database Changes Required

The current `stage_outputs` table uses JSONB columns for `output_data` and `output_text`, which handle the new nested object structures without schema changes.

**Stage 6 `output_text` now stores:**
```json
{
  "episode_recap": "# Full markdown article 1...",
  "topic_article": "# Full markdown article 2..."
}
```

**Stage 2 `output_data` now includes:**
```json
{
  "quotes": [...],
  "tips": [...],
  "qa_pairs": [...],
  "blog_ideas": [...]
}
```

---

## Key Backward Compatibility Patterns

Always use these patterns when accessing dual-article data:

```javascript
// Detecting format
const isDualFormat = output && typeof output === 'object' &&
  (output.episode_recap || output.topic_article);

// Getting content safely
const content = isDualFormat
  ? output.episode_recap
  : (typeof output === 'string' ? output : '');

// Handling new Stage 2 fields
const qaPairs = stage2Output?.qa_pairs || [];
const blogIdeas = stage2Output?.blog_ideas || [];

// Handling new Stage 3 fields
const recapOutline = stage3Output?.episode_recap_outline;
const topicOutline = stage3Output?.topic_article_outline;
const selectedIdea = stage3Output?.selected_blog_idea;
```
