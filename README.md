# RentOk LLM Gateway

A minimal LLM gateway that lets clients send chat requests using virtual API keys. Each key has a budget. The gateway proxies requests to Groq, tracks token usage and cost, and falls back to a mock provider if Groq is unavailable.

Built as a take-home assignment.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | PostgreSQL via Prisma ORM |
| Primary LLM | Groq |
| Fallback | Local mock |
| Containers | Docker + Docker Compose |

## Project Structure

```
rentok/
├── frontend/             # Developer console (UI)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── src/
│   ├── controllers/
│   │   ├── chat.js       # POST /api/chat — proxy + budget + logging
│   │   ├── keys.js       # POST /api/keys — create gateway key
│   │   └── usage.js      # GET /api/usage  — usage totals
│   ├── lib/
│   │   ├── cost.js       # token → USD cost calculation
│   │   ├── fallback.js   # mock fallback provider
│   │   ├── groq.js       # Groq client singleton
│   │   └── prisma.js     # Prisma client singleton
│   ├── middleware/
│   │   └── requireApiKey.js  # Bearer token auth
│   ├── routes/
│   │   ├── chat.js
│   │   ├── health.js
│   │   ├── keys.js
│   │   └── usage.js
│   └── app.js            # Express app setup
├── prisma/
│   └── schema.prisma     # ApiKey + UsageLog models
├── tests/
│   ├── chat.test.js
│   ├── keys.test.js
│   └── usage.test.js
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── server.js             # Entry point
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default: 3000) |
| `NODE_ENV` | `development` or `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `GROQ_API_KEY` | Your Groq API key — get one at https://console.groq.com |

**Never commit `.env`.** It is in `.gitignore`.

## Running Locally

### Option 1 — Docker Compose (easiest)

```bash
# Copy and edit env file
cp .env.example .env
# In .env, set DATABASE_URL host to "db" (the Docker Compose service name):
# DATABASE_URL="postgresql://postgres:password@db:5432/rentok_db"

# Start PostgreSQL + app together
docker-compose up --build
```

The API is available at `http://localhost:3000`.

> **Startup note:** `depends_on` waits for the Postgres container to start, not for it to be ready to accept connections. If the app crashes on first boot, Docker's `restart: always` will retry it automatically within a few seconds.

### Option 2 — Node directly

Requires a local PostgreSQL instance.

```bash
cp .env.example .env
# Set DATABASE_URL to your local Postgres in .env

npm install
npx prisma migrate dev
npm start
```

The gateway API and interactive dashboard are available at `http://localhost:3000`.

## API Reference

### GET /health

Health check. No auth required.

```bash
curl http://localhost:3000/health
```

```json
{ "status": "ok", "timestamp": "2026-09-01T10:00:00.000Z" }
```

---

### POST /api/keys

Creates a virtual gateway API key with a USD spending budget. The key is returned **once** and is not retrievable again.

```bash
curl -X POST http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -d '{"budget": 5}'
```

**Response 201:**
```json
{ "key": "rk_live_3f2a1b...", "budget": 5 }
```

| Field | Required | Description |
|-------|----------|-------------|
| `budget` | Yes | Maximum spend in USD, must be positive |

**Errors:** `400` if budget is missing, zero, negative, or non-numeric.

---

### POST /api/chat

Proxies a chat request to Groq. Requires a valid gateway key.

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer rk_live_3f2a1b..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-oss-20b",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'
```

**Response 200 (Groq succeeded):**
```json
{
  "model": "openai/gpt-oss-20b",
  "message": { "role": "assistant", "content": "Hi there!" },
  "usage": { "prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30 }
}
```

**Response 200 (fallback used):**
```json
{
  "model": "fallback-mock",
  "message": { "role": "assistant", "content": "[Fallback] Primary provider unavailable..." },
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 },
  "fallback": true
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `messages` | Yes | Non-empty array; each item needs `role` and `content` strings |
| `model` | No | Defaults to `openai/gpt-oss-20b` |

**Errors:**

| Status | Reason |
|--------|--------|
| 401 | Missing or invalid gateway key |
| 400 | Invalid messages |
| 429 | Budget exceeded — Groq is not called |

---

### GET /api/usage

Returns aggregated usage totals for the authenticated key only.

```bash
curl http://localhost:3000/api/usage \
  -H "Authorization: Bearer rk_live_3f2a1b..."
```

**Response 200:**
```json
{
  "totalRequests": 5,
  "inputTokens": 1200,
  "outputTokens": 500,
  "totalTokens": 1700,
  "totalEstimatedCost": 0.0034
}
```

---

## Request Flow

```
Client
  │
  ├─ POST /api/chat
  │     │
  │     ├─ requireApiKey middleware
  │     │     └─ reads Bearer token, looks up DB, attaches req.apiKey
  │     │
  │     ├─ budget check: if spent >= budget → 429 (Groq never called)
  │     │
  │     ├─ call Groq
  │     │     ├─ success → deduct cost, write UsageLog, respond
  │     │     └─ failure → call fallback mock
  │     │                       ├─ respond with fallback:true (0 cost)
  │     │                       └─ write UsageLog (0 tokens, 0 cost)
```

## Budget Behavior

- Each key has a `budget` (max USD) and `spent` (used so far).
- Budget is checked **before** calling Groq. If `spent >= budget`, the request is rejected with `429` and Groq is never called.
- After a successful Groq response, `spent` is incremented by the **estimated** cost.
- Fallback responses cost nothing — `spent` is not incremented.
- Cost is **estimated** from token usage (see `src/lib/cost.js`). This is not the exact provider bill:
  - Input: ~$0.59 / 1M tokens
  - Output: ~$0.79 / 1M tokens
- Rates are configurable in `src/lib/cost.js`.

**Concurrency note:** If two requests arrive at the exact same moment and both pass the budget check, both may call Groq. The database update prevents double-spending (only requests that fit within the remaining budget increment `spent`), but both Groq calls can still occur. This is a known limitation acceptable for this scale.

## Fallback Behavior

If Groq fails for any reason (network error, API error, timeout), the gateway returns a response from the local mock fallback instead of an error. The response includes `"fallback": true` so the caller knows the primary provider was unavailable.

No cost is charged on fallback responses.

## Running Tests

```bash
npm test
```

All tests use mocks — no real database or Groq key needed.

## Migrations

```bash
# First time or after schema changes
npx prisma migrate dev --name <description>

# In production / Docker
npx prisma migrate deploy
```
