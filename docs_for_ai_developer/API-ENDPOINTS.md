# API Endpoints

## Base URL

```
Production: https://api.yourdomain.com
Development: http://localhost:3000/api
```

## Authentication

All protected routes require a valid JWT token from Supabase in the Authorization header:

```
Authorization: Bearer <access_token>
```

The token is obtained after successful magic link authentication via Supabase.

---

## Auth Endpoints

### POST `/api/auth/magic-link`

Send a magic link email to the provided email address.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Magic link sent! Check your email.",
  "email": "user@example.com"
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Validation error",
  "message": "Invalid email format",
  "field": "email"
}
```

---

### GET `/api/auth/me`

Get current authenticated user's information. **Requires authentication.**

**Response (200 OK):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "John",
    "role": "user",
    "isSuperadmin": false,
    "createdAt": "2025-01-12T14:30:00Z",
    "hasCompletedProfile": true,
    "episodeCount": 5
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "error": "Authentication required",
  "message": "Missing authorization token"
}
```

---

### POST `/api/auth/logout`

Sign out the current user. **Requires authentication.**

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### PUT `/api/auth/profile`

Update the current user's profile. **Requires authentication.**

**Request Body:**
```json
{
  "displayName": "New Display Name"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "profile": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "New Display Name",
    "role": "user"
  }
}
```

---

### GET `/api/auth/users`

List all users. **Requires superadmin role.**

**Query Parameters:**
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response (200 OK):**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "display_name": "John",
      "role": "user",
      "created_at": "2025-01-12T14:30:00Z",
      "last_login_at": "2025-01-13T10:00:00Z"
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

---

## User Settings

### GET `/api/settings`

Get current user's settings. **Requires authentication.**

**Response (200 OK):**
```json
{
  "settings": {
    "id": "uuid",
    "user_id": "uuid",
    "therapist_profile": {
      "name": "Dr. Jane Smith",
      "credentials": "PhD, LMFT"
    },
    "podcast_info": {
      "name": "My Podcast",
      "tagline": "Great conversations"
    },
    "voice_guidelines": {},
    "seo_defaults": {},
    "created_at": "2025-01-12T14:30:00Z",
    "updated_at": "2025-01-13T10:00:00Z"
  }
}
```

---

### PUT `/api/settings`

Update current user's settings. **Requires authentication.**

**Request Body:**
```json
{
  "therapist_profile": {
    "name": "Dr. Jane Smith",
    "credentials": "PhD, LMFT",
    "bio": "Licensed therapist..."
  },
  "podcast_info": {
    "name": "The Mindful Therapist",
    "tagline": "Real conversations about mental health"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "settings": {
    "id": "uuid",
    "therapist_profile": {...},
    "podcast_info": {...},
    "updated_at": "2025-01-13T15:00:00Z"
  }
}
```

---

## Episodes

### POST `/api/episodes/analyze-transcript`

Quick transcript analysis using Claude 3.5 Haiku for auto-populating episode fields.
This is a lightweight analysis (~2-3 seconds, ~$0.001-0.003) meant for the "New Episode" form.

**Request Body:**
```json
{
  "transcript": "Full transcript text... (min 200 characters)"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "metadata": {
    "suggested_title": "Understanding Anxiety in Modern Life",
    "guest_name": "Dr. Sarah Johnson",
    "guest_credentials": "PhD, Clinical Psychologist",
    "main_topics": ["anxiety", "coping strategies", "work-life balance"],
    "brief_summary": "Explores practical strategies for managing anxiety in the workplace.",
    "episode_type": "interview",
    "confidence": 0.85
  },
  "usage": {
    "model": "claude-3-5-haiku-20241022",
    "inputTokens": 3500,
    "outputTokens": 250,
    "totalTokens": 3750,
    "cost": 0.0018,
    "durationMs": 2340
  },
  "estimate": {
    "estimatedCost": 0.0018,
    "formattedCost": "$0.0018",
    "inputTokens": 3500,
    "outputTokens": 300,
    "model": "claude-3-5-haiku-20241022"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Validation failed",
  "details": {
    "transcript": "Must be at least 200 characters"
  }
}
```

---

### GET `/api/episodes`

List all episodes with optional filtering.

**Query Parameters:**
- `status` (optional): Filter by status (draft, processing, completed, error)
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response (200 OK):**
```json
{
  "episodes": [
    {
      "id": "uuid",
      "title": "Understanding Anxiety",
      "status": "completed",
      "current_stage": 9,
      "created_at": "2025-01-12T14:30:00Z",
      "updated_at": "2025-01-12T14:34:23Z",
      "total_cost_usd": "1.24",
      "total_duration_seconds": 263,
      "processing_started_at": "2025-01-12T14:30:05Z",
      "processing_completed_at": "2025-01-12T14:34:23Z"
    }
  ],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

**Error Response (500):**
```json
{
  "error": "Database query failed",
  "message": "Connection timeout"
}
```

---

### POST `/api/episodes`

Create a new episode.

**Request Body:**
```json
{
  "transcript": "Full transcript text...",
  "episode_context": {
    "guest_name": "Dr. Sarah Johnson",
    "target_keywords": ["anxiety", "coping"],
    "special_notes": "Focus on practical tips"
  }
}
```

**Validation:**
- `transcript` (required): 500-100,000 characters
- `episode_context` (optional): Object with optional fields

**Response (201 Created):**
```json
{
  "episode": {
    "id": "uuid",
    "title": null,
    "status": "draft",
    "current_stage": 0,
    "created_at": "2025-01-13T15:00:00Z",
    "transcript": "Full transcript text...",
    "episode_context": { }
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Validation failed",
  "details": {
    "transcript": "Must be at least 500 characters"
  }
}
```

---

### GET `/api/episodes/:id`

Get single episode with all stage outputs.

**Response (200 OK):**
```json
{
  "episode": {
    "id": "uuid",
    "title": "Understanding Anxiety",
    "status": "completed",
    "current_stage": 9,
    "created_at": "2025-01-12T14:30:00Z",
    "transcript": "Full transcript...",
    "episode_context": { },
    "total_cost_usd": "1.24",
    "total_duration_seconds": 263
  },
  "stages": [
    {
      "stage_number": 1,
      "stage_name": "Transcript Analysis",
      "status": "completed",
      "started_at": "2025-01-12T14:30:05Z",
      "completed_at": "2025-01-12T14:30:17Z",
      "duration_seconds": 12,
      "model_used": "gpt-5-mini",
      "provider": "openai",
      "input_tokens": 1500,
      "output_tokens": 300,
      "cost_usd": "0.0045",
      "output_data": {
        "episode_basics": { },
        "guest_info": { },
        "episode_crux": "..."
      },
      "output_text": null
    }
  ]
}
```

**Error Response (404):**
```json
{
  "error": "Episode not found",
  "episode_id": "uuid"
}
```

---

### PUT `/api/episodes/:id`

Update episode (e.g., title, status).

**Request Body:**
```json
{
  "title": "New Title",
  "status": "paused"
}
```

**Response (200 OK):**
```json
{
  "episode": {
    "id": "uuid",
    "title": "New Title",
    "status": "paused",
    "updated_at": "2025-01-13T15:30:00Z"
  }
}
```

---

### DELETE `/api/episodes/:id`

Delete episode and all associated data.

**Response (204 No Content)**

**Error Response (404):**
```json
{
  "error": "Episode not found"
}
```

---

### POST `/api/episodes/:id/process`

Start processing an episode through the 9-stage pipeline.

**Request Body (Optional):**
```json
{
  "start_from_stage": 1
}
```

**Response (202 Accepted):**
```json
{
  "episode_id": "uuid",
  "status": "processing",
  "message": "Processing started",
  "estimated_duration_seconds": 270,
  "estimated_cost_usd": "1.20"
}
```

**Processing Flow:**
1. Validate episode exists and is in valid state (draft or paused)
2. Update episode status to "processing"
3. Create stage_outputs records for all 9 stages (status: pending)
4. Trigger async processing (queue or immediate)
5. Return 202 Accepted

**Error Response (409 Conflict):**
```json
{
  "error": "Episode is already processing",
  "current_stage": 4
}
```

---

### POST `/api/episodes/:id/pause`

Pause processing after current stage completes.

**Response (200 OK):**
```json
{
  "episode_id": "uuid",
  "status": "paused",
  "current_stage": 4,
  "message": "Processing will pause after Stage 4 completes"
}
```

---

### POST `/api/episodes/:id/cancel`

Cancel processing immediately.

**Response (200 OK):**
```json
{
  "episode_id": "uuid",
  "status": "draft",
  "message": "Processing cancelled",
  "stages_completed": 3
}
```

---

## Stages

### GET `/api/stages/:id`

Get single stage output.

**Response (200 OK):**
```json
{
  "stage": {
    "id": "uuid",
    "episode_id": "uuid",
    "stage_number": 1,
    "stage_name": "Transcript Analysis",
    "status": "completed",
    "output_data": { },
    "output_text": null,
    "cost_usd": "0.0045",
    "duration_seconds": 12
  }
}
```

---

### PUT `/api/stages/:id`

Update stage output (for manual editing).

**Request Body:**
```json
{
  "output_data": {
    "episode_basics": {
      "title": "Edited Title"
    }
  }
}
```

**Response (200 OK):**
```json
{
  "stage": {
    "id": "uuid",
    "output_data": { },
    "updated_at": "2025-01-13T15:45:00Z"
  }
}
```

---

### POST `/api/stages/:id/regenerate`

Regenerate a specific stage.

**Response (202 Accepted):**
```json
{
  "stage_id": "uuid",
  "status": "processing",
  "message": "Stage regeneration started"
}
```

**Processing Flow:**
1. Mark stage as "processing"
2. Re-run AI analysis with same inputs
3. Update stage output
4. Mark as "completed"

---

## Evergreen Content

### GET `/api/evergreen`

Get evergreen content (therapist profile, podcast info, etc.).

**Response (200 OK):**
```json
{
  "evergreen": {
    "id": "uuid",
    "updated_at": "2025-01-10T10:00:00Z",
    "therapist_profile": {
      "name": "Dr. Emily Carter",
      "credentials": "PhD, LMFT",
      "bio": "...",
      "website": "https://dremilycarter.com"
    },
    "podcast_info": {
      "name": "The Mindful Therapist",
      "tagline": "Real conversations about mental health",
      "target_audience": "...",
      "content_pillars": ["anxiety", "relationships"]
    },
    "voice_guidelines": {
      "tone": ["warm", "professional"],
      "examples": ["..."]
    },
    "seo_defaults": {
      "meta_description_template": "...",
      "default_hashtags": ["#therapy"]
    }
  }
}
```

---

### PUT `/api/evergreen`

Update evergreen content.

**Request Body:**
```json
{
  "therapist_profile": {
    "name": "Dr. Emily Carter",
    "credentials": "PhD, LMFT"
  }
}
```

**Response (200 OK):**
```json
{
  "evergreen": { },
  "updated_at": "2025-01-13T16:00:00Z"
}
```

---

## Admin

### GET `/api/admin/costs`

Get cost analytics.

**Query Parameters:**
- `start_date` (optional): ISO date
- `end_date` (optional): ISO date
- `group_by` (optional): "day" | "week" | "month" | "provider"

**Response (200 OK):**
```json
{
  "total_cost_usd": "45.67",
  "cost_by_provider": {
    "openai": "28.40",
    "anthropic": "17.27"
  },
  "cost_by_date": [
    {
      "date": "2025-01-12",
      "cost_usd": "12.45",
      "episodes": 3
    }
  ],
  "total_tokens": 1245890,
  "total_api_calls": 127
}
```

---

### GET `/api/admin/performance`

Get performance metrics.

**Response (200 OK):**
```json
{
  "average_processing_time_seconds": 272,
  "average_cost_per_episode_usd": "1.28",
  "stage_performance": [
    {
      "stage_number": 1,
      "stage_name": "Transcript Analysis",
      "avg_duration_seconds": 12,
      "min_duration_seconds": 8,
      "max_duration_seconds": 18,
      "avg_cost_usd": "0.0045",
      "success_rate": 0.98
    }
  ],
  "total_episodes_processed": 35,
  "episodes_this_month": 10
}
```

---

### GET `/api/admin/errors`

Get recent errors.

**Query Parameters:**
- `limit` (optional): Number of results (default: 20)
- `since` (optional): ISO timestamp

**Response (200 OK):**
```json
{
  "errors": [
    {
      "id": "uuid",
      "timestamp": "2025-01-13T14:30:00Z",
      "episode_id": "uuid",
      "episode_title": "Understanding Anxiety",
      "stage_number": 4,
      "stage_name": "Paragraph-Level Outlines",
      "error_message": "Rate limit exceeded",
      "retry_count": 2,
      "status": "failed"
    }
  ],
  "total": 5
}
```

---

### POST `/api/admin/errors/:id/retry`

Retry a failed stage.

**Response (202 Accepted):**
```json
{
  "stage_id": "uuid",
  "status": "processing",
  "message": "Retry started"
}
```

---

## Error Responses

### Standard Error Format

All error responses follow this structure:

```json
{
  "error": "Short error type",
  "message": "Detailed human-readable message",
  "details": { },
  "timestamp": "2025-01-13T15:00:00Z",
  "request_id": "uuid"
}
```

### HTTP Status Codes

- `200 OK` - Successful GET/PUT/DELETE
- `201 Created` - Successful POST (resource created)
- `202 Accepted` - Async operation started
- `204 No Content` - Successful DELETE (no body)
- `400 Bad Request` - Validation error
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Resource state conflict (e.g., already processing)
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Temporary outage

---

## Rate Limiting

**Per IP:**
- 100 requests per minute
- 1000 requests per hour

**Headers in Response:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1673625600
```

**Rate Limit Error (429):**
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again in 30 seconds.",
  "retry_after": 30
}
```

---

## Webhooks (Future Enhancement)

For async operations, consider adding webhooks:

**POST `/api/webhooks/register`**

Register callback URL for episode completion:

```json
{
  "url": "https://yourapp.com/webhook",
  "events": ["episode.completed", "episode.failed"]
}
```

**Webhook Payload:**
```json
{
  "event": "episode.completed",
  "timestamp": "2025-01-13T15:00:00Z",
  "data": {
    "episode_id": "uuid",
    "status": "completed",
    "total_cost_usd": "1.24",
    "total_duration_seconds": 263
  }
}
```

---

## Request/Response Examples

### Complete Episode Processing Flow

**1. Create Episode**
```bash
POST /api/episodes
{
  "transcript": "Full transcript...",
  "episode_context": { }
}

→ 201 Created
{
  "episode": {
    "id": "abc-123",
    "status": "draft"
  }
}
```

**2. Start Processing**
```bash
POST /api/episodes/abc-123/process

→ 202 Accepted
{
  "episode_id": "abc-123",
  "status": "processing",
  "estimated_duration_seconds": 270
}
```

**3. Monitor Progress (Real-time via Supabase)**
```javascript
supabase
  .channel('stages')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'stage_outputs',
    filter: 'episode_id=eq.abc-123'
  }, (payload) => {
    console.log('Stage updated:', payload.new);
  })
  .subscribe();
```

**4. Get Final Result**
```bash
GET /api/episodes/abc-123

→ 200 OK
{
  "episode": {
    "id": "abc-123",
    "status": "completed",
    "title": "Understanding Anxiety"
  },
  "stages": [ ] // All 9 stages with outputs
}
```

---

## Implementation Notes

### Middleware Stack

```javascript
// Express app setup
const app = express();

// Middleware (in order)
app.use(express.json());
app.use(cors());
app.use(loggerMiddleware);
app.use(rateLimitMiddleware);
app.use(errorHandler);

// Routes
app.use('/api/episodes', episodesRouter);
app.use('/api/stages', stagesRouter);
app.use('/api/evergreen', evergreenRouter);
app.use('/api/admin', adminRouter);
```

### Error Handler Middleware

```javascript
// middleware/error-handler.js
function errorHandler(err, req, res, next) {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  if (err instanceof ValidationError) {
    return res.status(400).json({
      error: 'Validation failed',
      message: err.message,
      details: err.details
    });
  }
  
  if (err instanceof APIError) {
    return res.status(502).json({
      error: 'External API error',
      message: err.message,
      provider: err.provider
    });
  }
  
  // Default 500
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong'
  });
}
```

### Logger Middleware

```javascript
// middleware/logger-middleware.js
function loggerMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration
    });
  });
  
  next();
}
```

---

**This API provides a complete interface for managing podcast episodes, processing pipelines, and system administration.**
