# Page Specifications

## Overview

This application has 6 main pages, each with specific states and behaviors. All pages share the design system defined in DESIGN-SYSTEM.md.

---

## 1. Dashboard (Home)

**Route:** `/`  
**Purpose:** Entry point showing all episodes and their status

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Header                                                      │
│  [Logo] The Podcast Content Pipeline        [Settings] [Admin]│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Quick Stats                                        │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │    │
│  │  │ Total    │ │ This     │ │ Avg Cost │           │    │
│  │  │ Episodes │ │ Month    │ │ Per Ep   │           │    │
│  │  │   12     │ │   4      │ │  $1.35   │           │    │
│  │  └──────────┘ └──────────┘ └──────────┘           │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  All Episodes                          [+ New Episode]      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Episode Card                                       │    │
│  │  Understanding Anxiety in Modern Life              │    │
│  │  Created Jan 12, 2025 • Ready for Review           │    │
│  │                                                      │    │
│  │  [✓ Completed] Stage 9/9                           │    │
│  │  ████████████████████████████ 100%                 │    │
│  │                                                      │    │
│  │  [View] [Export] [Delete]                          │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Episode Card                                       │    │
│  │  Processing...                                      │    │
│  │  Created Jan 13, 2025 • Processing                 │    │
│  │                                                      │    │
│  │  [⟳ Processing] Stage 4/9                          │    │
│  │  ███████████░░░░░░░░░░░░░░░░ 44%                   │    │
│  │                                                      │    │
│  │  [View Progress]                                    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### States

**Empty State:**
```
┌────────────────────────────────────┐
│                                     │
│       [Large Icon]                  │
│                                     │
│   No episodes yet                   │
│   Create your first episode from    │
│   a podcast transcript              │
│                                     │
│   [+ Create First Episode]          │
│                                     │
└────────────────────────────────────┘
```

**Loading State:**
- Skeleton cards while fetching episodes
- Shimmer animation on placeholders

**Episode Card States:**
- `draft`: Grey badge, "Not started"
- `processing`: Blue spinner, "Processing - Stage X/9"
- `paused`: Amber badge, "Paused at Stage X"
- `completed`: Green badge, "Ready for Review"
- `error`: Red badge, "Error at Stage X"

### Components

**EpisodeCard.jsx** (~200 lines)
- Props: episode object, onView, onDelete
- Shows title (or "Untitled Episode")
- Status badge with color coding
- Progress bar (0-100%)
- Action buttons (view, delete)
- Click entire card to navigate

**QuickStats.jsx** (~150 lines)
- Three stat cards in row
- Fetches from admin API
- Updates in real-time

### User Actions

- Click "New Episode" → Navigate to `/new`
- Click episode card → Navigate to `/episode/:id` (either processing or review)
- Click "Settings" → Navigate to `/settings`
- Click "Admin" → Navigate to `/admin`
- Click "Delete" → Confirm modal → Delete episode

### Real-time Updates

```javascript
// Subscribe to episode updates
useEffect(() => {
  const channel = supabase
    .channel('dashboard-episodes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'episodes'
    }, (payload) => {
      // Update episode list
      updateEpisode(payload.new);
    })
    .subscribe();
    
  return () => supabase.removeChannel(channel);
}, []);
```

---

## 2. Settings (Evergreen Content)

**Route:** `/settings`  
**Purpose:** Manage therapist profile, podcast info, voice guidelines

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [← Back to Dashboard]                                       │
│                                                              │
│  Settings                                                    │
│  Manage your profile and content preferences                │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Therapist Profile                                   │   │
│  │                                                       │   │
│  │  Name *                                              │   │
│  │  [Dr. Emily Carter                         ]         │   │
│  │                                                       │   │
│  │  Credentials *                                       │   │
│  │  [PhD, LMFT                                ]         │   │
│  │                                                       │   │
│  │  Bio                                                 │   │
│  │  [Licensed therapist specializing in...     ]        │   │
│  │  [                                           ]        │   │
│  │  [                                           ]        │   │
│  │                                                       │   │
│  │  Website                                             │   │
│  │  [https://dremilycarter.com              ]           │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Podcast Information                                 │   │
│  │                                                       │   │
│  │  Podcast Name *                                      │   │
│  │  [The Mindful Therapist                   ]          │   │
│  │                                                       │   │
│  │  Tagline                                             │   │
│  │  [Real conversations about mental health  ]          │   │
│  │                                                       │   │
│  │  Target Audience                                     │   │
│  │  [Adults seeking practical mental health insights]   │   │
│  │                                                       │   │
│  │  Content Pillars (comma-separated)                   │   │
│  │  [anxiety, relationships, boundaries      ]          │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Voice & Tone Guidelines                             │   │
│  │                                                       │   │
│  │  Tone Descriptors (select multiple)                  │   │
│  │  [✓] Warm        [✓] Professional                    │   │
│  │  [✓] Accessible  [✓] Conversational                  │   │
│  │  [ ] Formal      [ ] Casual                          │   │
│  │                                                       │   │
│  │  Writing Style Notes                                 │   │
│  │  [Mix of short and medium sentences...    ]          │   │
│  │  [Avoid therapy jargon without explanation]          │   │
│  │                                                       │   │
│  │  Example Sentences in Your Voice                     │   │
│  │  [+ Add Example]                                     │   │
│  │  • "Anxiety doesn't announce itself politely..."     │   │
│  │  • "Here's what I notice in my practice..."          │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  [Cancel] [Save Changes]                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### States

**Loading State:**
- Skeleton forms while fetching data

**Validation Errors:**
- Red border on invalid fields
- Error message below field
- Disable save until valid

**Unsaved Changes:**
- Warning if navigating away with unsaved changes
- Highlight "Save Changes" button

**Saved Successfully:**
- Green toast notification
- "Saved successfully"

### Validation Rules

```javascript
// Required fields
- therapist_profile.name (not empty)
- therapist_profile.credentials (not empty)
- podcast_info.name (not empty)

// Optional fields
- All others can be empty

// URL validation
- website must be valid URL if provided
- social links must be valid URLs if provided
```

### Form Handling

```javascript
const [formData, setFormData] = useState(null);
const [hasChanges, setHasChanges] = useState(false);
const [errors, setErrors] = useState({});

const handleSave = async () => {
  // Validate
  const validationErrors = validateForm(formData);
  if (Object.keys(validationErrors).length > 0) {
    setErrors(validationErrors);
    return;
  }
  
  // Save
  const { error } = await supabase
    .from('evergreen_content')
    .update(formData)
    .eq('id', SINGLETON_ID);
    
  if (error) {
    toast.error('Failed to save');
  } else {
    toast.success('Saved successfully');
    setHasChanges(false);
  }
};
```

---

## 3. New Episode (Upload)

**Route:** `/new`
**Purpose:** Upload transcript and start processing

### Auto-Population Feature

When a user enters a transcript (minimum 200 characters), the system automatically
analyzes it using Claude 3.5 Haiku to extract metadata for auto-populating form fields.

**How it works:**
1. User pastes/uploads transcript
2. After 1.5s of no typing (debounced), analysis starts
3. Claude Haiku extracts: title, guest name, credentials, topics, summary
4. Fields are auto-populated (only empty fields, respects user edits)
5. Visual feedback shows which fields were auto-populated

**Cost & Performance:**
- Model: Claude 3.5 Haiku (fastest, most affordable Claude model)
- Cost: ~$0.001-0.003 per analysis
- Duration: ~2-3 seconds
- Minimum transcript: 200 characters

**UX Behavior:**
- "Generate Content" button is disabled while analysis is running
- Fields show brief highlight animation when auto-populated
- User edits are preserved (won't overwrite manual changes)
- Analysis status shown below transcript textarea

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [← Back to Dashboard]                                       │
│                                                              │
│  Create New Episode                                          │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Step 1: Upload Transcript                           │   │
│  │                                                       │   │
│  │  Paste or upload your podcast transcript            │   │
│  │                                                       │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │ [Paste transcript here...]                 │    │   │
│  │  │                                             │    │   │
│  │  │                                             │    │   │
│  │  │                                             │    │   │
│  │  │                                             │    │   │
│  │  │                                             │    │   │
│  │  │                                             │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  │                                                       │   │
│  │  Or [Upload File] (.txt, .doc, .docx)               │   │
│  │                                                       │   │
│  │  Character count: 12,543                             │   │
│  │  Estimated processing time: ~4 minutes               │   │
│  │  Estimated cost: ~$1.20                              │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Step 2: Episode Context (Optional) [▼ Expand]       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  [Cancel] [Start Processing]                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### States

**Initial State:**
- Empty textarea
- Upload button enabled
- Start Processing disabled

**With Transcript:**
- Character count displayed
- Show estimates (time, cost)
- Start Processing enabled if valid

**Expanded Context:**
```
┌─────────────────────────────────────────────────────┐
│  Step 2: Episode Context (Optional) [▲ Collapse]    │
│                                                      │
│  Guest Name (if not in transcript)                  │
│  [                                        ]          │
│                                                      │
│  Special Focus Areas                                │
│  [e.g., "Focus on practical tips"       ]           │
│                                                      │
│  Target Keywords                                    │
│  [anxiety, coping strategies             ]          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Validation Errors:**
- "Transcript is too short (minimum 500 characters)"
- "Transcript is too long (maximum 100,000 characters)"
- Red border on textarea

**Processing Started:**
- Navigate to Processing Screen (`/episode/:id/processing`)
- Show loading state during navigation

### File Upload

```javascript
const handleFileUpload = async (file) => {
  // Validate file type
  const validTypes = ['.txt', '.doc', '.docx'];
  if (!validTypes.some(t => file.name.endsWith(t))) {
    setError('Invalid file type');
    return;
  }
  
  // Validate file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    setError('File too large (max 10MB)');
    return;
  }
  
  // Read file
  const text = await readFileAsText(file);
  setTranscript(text);
};
```

### Cost/Time Estimation

```javascript
const estimateProcessing = (transcript) => {
  const charCount = transcript.length;
  const wordCount = transcript.split(/\s+/).length;
  const tokenEstimate = wordCount * 1.3; // ~1.3 tokens per word
  
  // Estimate cost (rough calculation)
  const inputTokens = tokenEstimate * 9; // Used 9 times
  const outputTokens = 10000; // ~10k output total
  const cost = calculateEstimatedCost(inputTokens, outputTokens);
  
  // Estimate time (based on API latency)
  const timeSeconds = 30 * 9; // ~30s per stage
  
  return {
    cost: `$${cost.toFixed(2)}`,
    time: `${Math.ceil(timeSeconds / 60)} minutes`
  };
};
```

---

## 4. Processing Screen

**Route:** `/episode/:id/processing`  
**Purpose:** Show real-time progress through 9 stages

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [← Back to Dashboard]                                       │
│                                                              │
│  Processing Episode                                          │
│  Started: 2:34 PM • Elapsed: 2m 34s                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Overall Progress                                    │   │
│  │  ██████████████░░░░░░░░░░░░░░░ 44% (4/9 stages)    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ✓ Stage 1: Transcript Analysis                      │   │
│  │    Completed in 12s • $0.0045                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ✓ Stage 2: Quote Extraction                         │   │
│  │    Completed in 18s • $0.0062                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ✓ Stage 3: Blog Outline - High Level               │   │
│  │    Completed in 8s • $0.0031                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ⟳ Stage 4: Paragraph-Level Outlines                │   │
│  │    Processing... 15s elapsed                         │   │
│  │    [Loading spinner]                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ⏸ Stage 5: Headlines & Copy Options                │   │
│  │    Waiting...                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ... (stages 6-9)                                           │
│                                                              │
│  [Pause Processing] [Cancel]                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Stage States

**Pending** (`pending`):
```
⏸ Stage X: Stage Name
  Waiting...
```

**Processing** (`processing`):
```
⟳ Stage X: Stage Name
  Processing... 15s elapsed
  [Animated spinner]
```

**Completed** (`completed`):
```
✓ Stage X: Stage Name
  Completed in 12s • $0.0045
```

**Failed** (`failed`):
```
⚠ Stage X: Stage Name
  Failed: Rate limit exceeded
  [Retry] [Skip] [View Error]
```

### Real-time Updates

```javascript
// Subscribe to stage updates for this episode
useEffect(() => {
  const channel = supabase
    .channel(`processing-${episodeId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'stage_outputs',
      filter: `episode_id=eq.${episodeId}`
    }, (payload) => {
      updateStageStatus(payload.new);
    })
    .subscribe();
    
  return () => supabase.removeChannel(channel);
}, [episodeId]);
```

### Processing Complete

When all stages complete:
```
┌────────────────────────────────────┐
│  ✓ All stages completed!           │
│                                     │
│  Your content is ready for review  │
│                                     │
│  Total time: 4m 23s                │
│  Total cost: $1.24                 │
│                                     │
│  [Review Content]                  │
└────────────────────────────────────┘
```

Auto-navigate to Review Hub after 3 seconds (with countdown).

---

## 5. Review Hub

**Route:** `/episode/:id`  
**Purpose:** View and edit all generated content

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [← Back to Dashboard]                                       │
│                                                              │
│  Understanding Anxiety in Modern Life                        │
│  Status: Ready for Review • Created Jan 12, 2025           │
│                                                              │
│  [Tab: Overview] [Analysis] [Outline] [Blog Post]          │
│  [Headlines] [Social] [Email]                               │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [Content for selected tab]                          │   │
│  │                                                       │   │
│  │  ...                                                  │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  [Export] [Mark Complete] [Delete]                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Tab: Overview

```
Episode Metadata
- Title: Understanding Anxiety in Modern Life
- Guest: Dr. Sarah Johnson, PhD
- Topics: anxiety, coping strategies, work-life balance
- Crux: [2-3 sentence summary]

Processing Summary
- Total time: 4m 23s
- Total cost: $1.24
- Completed: Jan 12, 2025 at 2:39 PM

Quick Actions
[Export All] [Regenerate Sections]
```

### Tab: Analysis & Quotes

```
Episode Basics
- Title: ...
- Date: ...
- Duration: ...
- Main Topics: [list]

Guest Information
- Name: Dr. Sarah Johnson
- Credentials: PhD, Clinical Psychologist
- Website: drsarahjohnson.com

Key Quotes (8)
┌──────────────────────────────────────────────┐
│ "Anxiety doesn't announce itself politely..."│
│ Speaker: Dr. Johnson                         │
│ Usage: pullquote                             │
│ [Edit] [Remove]                              │
└──────────────────────────────────────────────┘
```

### Tab: Blog Post

```
[Toolbar: Bold, Italic, Link, Heading, List]

[Markdown Editor]
# Understanding Anxiety in Modern Life

Anxiety doesn't announce itself politely...

[Word count: 742 / 750]

[Export as .md] [Export as .docx] [Copy to Clipboard]
[Regenerate Full Post]
```

### Tab: Headlines

```
Main Headlines (15 options)
┌──────────────────────────────────────────────┐
│ ☆ Understanding Anxiety in Modern Life      │
│ ★ Why Your Anxiety Feels So Overwhelming    │ ← Favorited
│ ☆ The Hidden Patterns of Workplace Anxiety  │
│ ...                                          │
└──────────────────────────────────────────────┘

[Generate More Headlines]
```

### Tab: Social

```
[Platform Selector: Instagram | Twitter | LinkedIn | Facebook]

Instagram Posts (3)

┌──────────────────────────────────────────────┐
│ Post 1 (Short)                               │
│                                              │
│ Anxiety doesn't announce itself politely... │
│                                              │
│ Character count: 142 / 2200                 │
│ [Edit] [Copy]                                │
└──────────────────────────────────────────────┘
```

### Tab: Email

```
Subject Lines (5 options)
○ Understanding Your Anxiety
● Why Anxiety Feels Overwhelming  ← Selected
○ New Episode: Anxiety at Work
...

Email Body
[Rich text editor]

[Preview] [Copy HTML] [Send Test Email]
```

---

## 6. Admin Dashboard

**Route:** `/admin`  
**Purpose:** Track costs, performance, errors

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [← Back to Dashboard]                                       │
│                                                              │
│  Admin Dashboard                                             │
│                                                              │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐ │
│  │ Total Cost      │ │ This Month      │ │ Avg Per Ep   │ │
│  │ $45.67          │ │ $12.45          │ │ $1.28        │ │
│  │ All time        │ │ 10 episodes     │ │ Last 30 days │ │
│  └─────────────────┘ └─────────────────┘ └──────────────┘ │
│                                                              │
│  Cost by Provider                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Bar chart]                                          │   │
│  │ OpenAI:    ████████████ $28.40                      │   │
│  │ Anthropic: ███████ $17.27                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Average Processing Time by Stage                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Stage 1: ███ 12s                                     │   │
│  │ Stage 2: ████ 18s                                    │   │
│  │ Stage 3: ██ 8s                                       │   │
│  │ ...                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Recent Errors (5)                                          │
│  [Table showing recent failures with retry options]         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

**These page specifications provide complete UI/UX guidance for implementation. All pages follow the design system and handle loading, error, and success states consistently.**
