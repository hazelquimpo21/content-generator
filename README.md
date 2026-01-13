# Podcast-to-Content Pipeline

Transform podcast transcripts into polished blog posts, social media content, and email campaigns using a 10-stage AI pipeline.

```
   ╔═══════════════════════════════════════════════════════════════╗
   ║                                                               ║
   ║   🎙️  PODCAST TRANSCRIPT  ──►  📝 BLOG + 📱 SOCIAL + ✉️ EMAIL   ║
   ║                                                               ║
   ╚═══════════════════════════════════════════════════════════════╝
```

## Features

- **10-Stage AI Pipeline**: Systematic content generation from transcript preprocessing to final outputs
- **Multiple AI Models**: Claude Haiku (stage 0 preprocessing) + GPT-5 mini (stages 1-6) + Claude Sonnet (stages 7-9)
- **Real-time Progress**: Watch processing happen stage-by-stage
- **Content Review Hub**: View, edit, and copy all generated content
- **Cost Tracking**: Monitor API usage and costs per episode
- **Elegant UI**: Warm, accessible design with Lora + Inter typography

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js, Express.js |
| **Frontend** | React 18, Vite |
| **Database** | Supabase (PostgreSQL) |
| **AI** | OpenAI API, Anthropic API |
| **Styling** | CSS Modules, Custom Properties |

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier works)
- OpenAI API key
- Anthropic API key

### 1. Clone & Install

```bash
# Clone the repository
git clone <repository-url>
cd content-generator

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the migration script:

```bash
# Copy the contents of this file to Supabase SQL Editor:
cat supabase/migrations/001_initial_schema.sql
```

3. Get your credentials from Project Settings > API:
   - `Project URL` → SUPABASE_URL
   - `service_role secret` → SUPABASE_KEY

### 3. Configure Environment

```bash
# In the backend directory
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key

# AI APIs
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Server
PORT=3001
NODE_ENV=development
```

### 4. Start Development Servers

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev
```

Visit `http://localhost:5173` to see the app.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Dashboard │ │ Settings │ │NewEpisode│ │Processing│ │ReviewHub │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
└───────┼────────────┼────────────┼────────────┼────────────┼────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API LAYER (Express)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ Episodes │ │  Stages  │ │Evergreen │ │  Admin   │               │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘               │
└───────┼────────────┼────────────┼────────────┼─────────────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Episode Processor (10 Stages: 0-9)              │   │
│  │                                                              │   │
│  │  Stage 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9               │   │
│  │  (Haiku)│(GPT-5 mini)─────────────►│(Claude Sonnet)────────►│   │
│  └─────────────────────────────────────────────────────────────┘   │
└───────┬─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SUPABASE (PostgreSQL)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ Episodes │ │  Stages  │ │Evergreen │ │ API Logs │               │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### The 10-Stage Pipeline (0-9)

| Stage | Name | Model | Output |
|-------|------|-------|--------|
| 0 | Transcript Preprocessing | Claude Haiku | Compressed summary + quotes (for long transcripts) |
| 1 | Transcript Analysis | GPT-5 mini | Themes, structure, audiences |
| 2 | Quote Extraction | GPT-5 mini | Key quotes with context |
| 3 | Title Generation | GPT-5 mini | SEO-optimized titles |
| 4 | Summary Writing | GPT-5 mini | Short/medium/long summaries |
| 5 | Outline Creation | GPT-5 mini | Blog post structure |
| 6 | Blog Post Draft | GPT-5 mini | Full draft content |
| 7 | Blog Post Editing | Claude Sonnet | Polished final version |
| 8 | Social Content | Claude Sonnet | Platform-specific posts |
| 9 | Email Campaign | Claude Sonnet | Newsletter content |

> **Note:** Stage 0 is automatically skipped for short transcripts (< 8000 tokens).

### Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Transcript │────►│  Evergreen  │────►│   Context   │
│   (Input)   │     │  (Profile)  │     │  (Combined) │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌──────────────────────────┘
                    ▼
     ┌──────────────────────────────────────────────────┐
     │                 STAGE PIPELINE                   │
     │                                                  │
     │  [0] Preprocess ──► [1] Analyze ──► [2] Quotes  │
     │  ──► [3] Titles ──► [4] Summary ──► [5] Outline │
     │  ──► [6] Draft ──► [7] Edit ──► [8] Social     │
     │  ──► [9] Email                                  │
     │                                                  │
     └──────────────────────────────────────────────────┘
                    │
                    ▼
     ┌──────────────────────────────────────────────────┐
     │               GENERATED CONTENT                  │
     │  ┌────────┐  ┌─────────┐  ┌──────────────────┐  │
     │  │  Blog  │  │ Social  │  │  Email Campaign  │  │
     │  │  Post  │  │  Posts  │  │    (Newsletter)  │  │
     │  └────────┘  └─────────┘  └──────────────────┘  │
     └──────────────────────────────────────────────────┘
```

---

## Project Structure

```
content-generator/
├── backend/
│   ├── api/
│   │   ├── middleware/          # Error handling, logging
│   │   ├── routes/              # REST endpoints
│   │   │   ├── episodes.js      # CRUD + processing
│   │   │   ├── stages.js        # Stage viewing/regeneration
│   │   │   ├── evergreen.js     # Profile/podcast settings
│   │   │   └── admin.js         # Analytics
│   │   └── server.js            # Express app
│   │
│   ├── analyzers/               # 10 stage analyzer modules (0-9)
│   │   ├── stage-00-preprocess-transcript.js
│   │   ├── stage-01-analyze-transcript.js
│   │   ├── stage-02-extract-quotes.js
│   │   └── ... (stages 3-9)
│   │
│   ├── lib/                     # Shared utilities
│   │   ├── api-client-openai.js
│   │   ├── api-client-anthropic.js
│   │   ├── cost-calculator.js
│   │   ├── errors.js
│   │   ├── logger.js
│   │   ├── prompt-loader.js
│   │   ├── retry-logic.js
│   │   └── supabase-client.js
│   │
│   ├── orchestrator/            # Pipeline coordination
│   │   ├── episode-processor.js
│   │   └── stage-runner.js
│   │
│   ├── prompts/                 # AI prompt templates
│   │   ├── shared/
│   │   │   ├── never-use-list.md
│   │   │   └── quality-frameworks.md
│   │   └── stage-*.md           # Stage prompts
│   │
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── shared/          # Reusable UI components
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── Card.jsx
│   │   │   │   ├── Input.jsx
│   │   │   │   └── ...
│   │   │   └── layout/          # Layout components
│   │   │       ├── Layout.jsx
│   │   │       └── Sidebar.jsx
│   │   │
│   │   ├── pages/               # Route pages
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Settings.jsx
│   │   │   ├── NewEpisode.jsx
│   │   │   ├── ProcessingScreen.jsx
│   │   │   ├── ReviewHub.jsx
│   │   │   └── AdminDashboard.jsx
│   │   │
│   │   ├── styles/              # Global styles
│   │   │   ├── variables.css    # Design tokens
│   │   │   └── global.css       # Base styles
│   │   │
│   │   ├── utils/               # Utilities
│   │   │   └── api-client.js    # API wrapper
│   │   │
│   │   ├── App.jsx              # Root component
│   │   └── main.jsx             # Entry point
│   │
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
│
├── docs_for_ai_developer/       # Project documentation
│
└── README.md
```

---

## Database Schema

### Tables

#### `episodes`
Primary table for podcast episodes.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| transcript | TEXT | Full transcript |
| episode_context | JSONB | Title, guest info, etc. |
| status | TEXT | pending/processing/completed/error |
| current_stage | INTEGER | Current processing stage (0-9) |
| total_cost_usd | DECIMAL | Total API cost |
| error_message | TEXT | Error details if failed |

#### `stage_outputs`
Output from each pipeline stage.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| episode_id | UUID | Foreign key to episodes |
| stage_number | INTEGER | Stage number (0-9) |
| stage_name | TEXT | Human-readable name |
| status | TEXT | pending/processing/completed/failed |
| output_text | TEXT | Text output (blog posts) |
| output_data | JSONB | Structured output (quotes, titles) |
| cost_usd | DECIMAL | Stage API cost |

#### `evergreen_content`
Reusable profile and podcast information.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| therapist_profile | JSONB | Name, credentials, bio |
| podcast_info | JSONB | Name, tagline, audience |
| voice_guidelines | JSONB | Tone, style preferences |

#### `api_usage_log`
Cost tracking for all API calls.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| episode_id | UUID | Associated episode |
| stage_number | INTEGER | Associated stage |
| provider | TEXT | openai/anthropic |
| model | TEXT | Model used |
| input_tokens | INTEGER | Tokens sent |
| output_tokens | INTEGER | Tokens received |
| cost_usd | DECIMAL | Calculated cost |

---

## API Endpoints

### Episodes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/episodes` | List all episodes |
| GET | `/api/episodes/:id` | Get single episode |
| GET | `/api/episodes/:id/stages` | Get episode with all stage outputs |
| POST | `/api/episodes` | Create new episode |
| PATCH | `/api/episodes/:id` | Update episode |
| DELETE | `/api/episodes/:id` | Delete episode |
| POST | `/api/episodes/:id/process` | Start processing |
| GET | `/api/episodes/:id/status` | Get processing status |

### Stages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stages` | List stages for episode |
| GET | `/api/stages/:episodeId/:stageNumber` | Get stage output |
| PUT | `/api/stages/:episodeId/:stageNumber` | Update stage output |
| POST | `/api/stages/:episodeId/:stageNumber/regenerate` | Regenerate stage |

### Evergreen

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/evergreen` | Get all evergreen content |
| PUT | `/api/evergreen` | Update evergreen content |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/costs` | Get cost analytics |
| GET | `/api/admin/performance` | Get performance metrics |
| GET | `/api/admin/errors` | Get recent errors |
| GET | `/api/admin/usage` | Get usage statistics |

---

## Application States

### Episode States

```
                    ┌──────────┐
                    │  pending │ (Created, not started)
                    └────┬─────┘
                         │ POST /process
                         ▼
                    ┌──────────┐
                ┌──►│processing│◄──┐ (Running stages)
                │   └────┬─────┘   │
                │        │         │
       Stage    │        ▼         │ Stage
       Failed   │   ┌──────────┐   │ Complete
                │   │  Stage N │   │
                └───┤ 0→1→...→9├───┘
                    └────┬─────┘
                         │ All stages done
                         ▼
           ┌─────────────┴─────────────┐
           ▼                           ▼
      ┌──────────┐               ┌──────────┐
      │completed │               │  error   │
      └──────────┘               └──────────┘
```

### Stage States

```
pending ──► processing ──► completed
                │
                └──► failed (with error message)
```

---

## Design System

### Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary` | #C4704D | Terracotta accent |
| `--color-bg-primary` | #FAF6F1 | Main background |
| `--color-bg-secondary` | #F5EDE4 | Card backgrounds |
| `--color-text-primary` | #3D3229 | Main text |
| `--color-success` | #5D8A66 | Success states |
| `--color-error` | #B8524A | Error states |

### Typography

- **Headings**: Lora (serif) - elegant, professional
- **Body**: Inter (sans-serif) - clean, readable
- **Code**: SF Mono (monospace)

### Spacing Scale

```
--space-1: 4px   --space-6: 24px
--space-2: 8px   --space-8: 32px
--space-3: 12px  --space-10: 40px
--space-4: 16px  --space-12: 48px
```

---

## Development

### Scripts

#### Backend

```bash
npm run dev      # Start with hot reload (nodemon)
npm start        # Start production server
npm test         # Run tests
```

#### Frontend

```bash
npm run dev      # Start Vite dev server
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Logging

The backend uses structured logging with emojis:

```
💡 [INFO]  Server started on port 3001
🔍 [DEBUG] Loading episode abc-123
⚠️  [WARN]  Retry attempt 2/3
❌ [ERROR] API call failed: rate limited
```

### Error Handling

All errors are categorized with retry logic:

- **Retryable**: Rate limits (429), server errors (500-503)
- **Non-retryable**: Validation errors, not found, auth errors

---

## Cost Estimates

Typical costs per episode (based on ~10,000 word transcript):

| Stage | Model | Est. Cost |
|-------|-------|-----------|
| 0 | Claude Haiku | ~$0.02-0.05 (only for long transcripts) |
| 1-6 | GPT-5 mini | ~$0.03-0.08 |
| 7-9 | Claude Sonnet | ~$0.03-0.08 |
| **Total** | | **~$0.05-0.18** |

> **Note:** Stage 0 (preprocessing) is skipped for short transcripts, keeping costs low.

---

## Troubleshooting

### Common Issues

**Database connection failed**
- Verify SUPABASE_URL and SUPABASE_KEY in .env
- Check if your IP is allowed in Supabase settings

**API rate limits**
- The app includes exponential backoff retry logic
- Reduce concurrent processing if needed

**Processing stuck**
- Check backend logs for errors
- Verify API keys are valid and have credits

**Frontend not loading**
- Ensure backend is running on port 3001
- Check Vite proxy configuration

---

## Contributing

1. Follow the modular architecture (files < 400 lines)
2. Add structured logging for all operations
3. Include JSDoc comments for public functions
4. Write tests for new features

---

## License

MIT License - See LICENSE file for details.

---

Built with ❤️ for content creators and podcasters.
