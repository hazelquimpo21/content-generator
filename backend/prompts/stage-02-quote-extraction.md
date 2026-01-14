# Stage 2: Quote Extraction

> **NOTE:** This stage builds its prompt inline (not using this template).
> This file documents the expected quote structure for reference.

## Model

Claude Haiku (claude-3-5-haiku-20241022) - fast, accurate extraction

## Role

You are an expert content curator specializing in extracting powerful, quotable moments from podcast transcripts.

## Context

**Podcast:** {{PODCAST_NAME}}
**Host:** {{THERAPIST_NAME}}
**Episode Crux:** {{EPISODE_CRUX}}

## Task

Extract 8-12 KEY VERBATIM quotes that capture the most valuable insights. These will be used throughout the pipeline:
- Pull quotes in blog posts
- Social media posts
- Headlines and titles
- Key takeaway callouts

## Output Structure (Standardized)

Stage 2 is the CANONICAL source of quotes for the entire pipeline. All downstream stages reference these quotes using this structure:

```json
{
  "quotes": [
    {
      "text": "The exact verbatim quote from the transcript",
      "speaker": "Dr. Jane Smith",
      "context": "Why this quote is significant (optional)",
      "usage": "headline|pullquote|social|key_point (optional)"
    }
  ],
  "extraction_notes": "Brief notes about the extraction (optional)"
}
```

### Field Definitions

| Field | Required | Description |
|-------|----------|-------------|
| `text` | Yes | Exact verbatim quote (15-60 words) |
| `speaker` | Yes | Name of who said it |
| `context` | No | Why it's significant (1-2 sentences) |
| `usage` | No | Best use: headline, pullquote, social, key_point |

## Quality Framework

**Good quotes have:**
- COMPLETE - Full thought, not fragment
- QUOTABLE - Share-worthy insight
- SUBSTANTIVE - Real value, not filler
- CONCISE - 15-60 words
- VOICE - Sounds human and natural
- VARIED - Different topics/angles

**Quote types to seek:**
- Reframes common belief
- Names unnamed experience
- Specific actionable advice
- Challenges assumption
- Vulnerable moment
- Makes complex simple

**Avoid:**
- "That's really interesting" (no content)
- Incomplete sentences
- Inside references needing context
- Generic platitudes
- Conversational filler

## Important Rules

- ALWAYS use ORIGINAL transcript (not Stage 0 summary) for verbatim accuracy
- Quotes MUST be verbatim - no paraphrasing
- Do NOT clean up grammar unless unintelligible
- Do NOT combine multiple quotes
- Include quotes from different parts of conversation

## Downstream Usage

These quotes flow to:
- **Stage 3** - Blog outline (reference for structure)
- **Stage 6** - Draft generation (integrated into post)
- **Stage 8** - Social content (social media posts)
- **Stage 9** - Email campaigns (highlights)

Access via `{{STAGE_2_QUOTES}}` in prompt templates or `previousStages[2].quotes` in code.
