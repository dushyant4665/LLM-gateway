# DECISIONS.md

## 1. What was built (in 3–4 sentences)

A minimal, production-ready LLM Gateway built with Node.js, Express, PostgreSQL, and Prisma. It sits between client applications and LLM providers (Groq), issuing isolated virtual API keys with hard USD spending caps. The service proxies chat requests, logs granular token usage and cost per request, enforces budgets to reject over-limit traffic with HTTP 429, and gracefully falls back to a mock provider if the primary provider experiences downtime.

---

## 2. Moving Parts & Request Lifecycle

```
[Client / UI]
     │
     │  1. HTTP POST /api/chat (Bearer rk_live_...)
     ▼
[Gateway: Auth & Middleware]
     │
     │  2. Look up key in PostgreSQL
     │  3. Pre-flight check: Is (spent >= budget)?
     │     ├── YES ──► Reject with 429 "Budget exceeded"
     │     └── NO  ──► Proceed
     ▼
[Gateway: Provider Execution]
     │
     │  4. Send non-streaming chat request to Groq API
     │     ├── SUCCESS ──► Returns tokens & completion
     │     └── FAILURE ──► Catch error & invoke local fallback mock ($0 cost)
     ▼
[Gateway: Spend Deduction & Logging]
     │
     │  5. Calculate USD cost = (in_tokens * rate_in) + (out_tokens * rate_out)
     │  6. Atomic DB increment on ApiKey.spent (spent <= budget - cost)
     │  7. Persist UsageLog row (tokens, cost, model, timestamp)
     ▼
[Client Response]
     │
     └── 8. Return JSON payload: { model, message, usage, fallback?: true }
```

---

## 3. Key Decisions & Tradeoffs

### Decision 1: Non-Streaming vs. Streaming
- **Options Considered**: Server-Sent Events (SSE) streaming vs. standard non-streaming JSON responses.
- **Choice**: Non-streaming JSON.
- **Tradeoff Accepted**: Users wait for the full response before reading the first token (higher perceived Time-To-First-Token). However, non-streaming gives exact token counts in the provider's completion metadata, enabling atomic billing and cost calculation without complex chunk-reassembly heuristics.

### Decision 2: Layered Architecture (Routes → Controllers → Services → Data/Lib)
- **Options Considered**: Flat script/router files vs. 3-tier enterprise architecture.
- **Choice**: Clean separation: Controllers manage HTTP transport, Services encapsulate business rules (budget checks, LLM proxying, fallback), and Lib/Prisma handles low-level I/O.
- **Tradeoff Accepted**: Slightly more boilerplate files for a small project, but ensures testability, unit mocking, and future provider extensibility.

### Decision 3: Local Mock Fallback vs. Secondary Paid Provider
- **Options Considered**: Adding OpenAI/Anthropic SDKs as secondary failover vs. a zero-cost local mock handler.
- **Choice**: Local mock provider.
- **Tradeoff Accepted**: Fallback does not provide AI-generated text during outages, but it guarantees 100% gateway uptime, costs $0 to the user's budget, and demonstrates the circuit-breaker fallback pattern without adding third-party API dependencies.

### Decision 4: PostgreSQL + Prisma vs. Redis / In-Memory
- **Options Considered**: In-memory Redis store vs. PostgreSQL with Prisma.
- **Choice**: PostgreSQL with Prisma.
- **Tradeoff Accepted**: Slightly higher latency on DB reads than Redis, but provides relational integrity between keys and usage logs, strong persistence, ACID guarantees for budget updates, and typed schemas.

---

## 4. First-Principles: Why Enforce Budgets at the Gateway?

Trusting client applications to enforce their own budgets is a critical security vulnerability:
1. **Malicious or Compromised Clients**: Any client with network access could modify client-side limits, ignore token counters, or flood the LLM provider, resulting in massive unexpected bills.
2. **Provider Key Leakage**: Direct client calls require distributing raw provider credentials. A gateway keeps master provider keys securely on the server while issuing revocable, rate-capped virtual keys.
3. **Decentralized Multi-Tenant Accounting**: When 50 different microservices or team members use LLMs, centralizing accounting at the gateway enables unified audit logs, cost alerting, and centralized policy enforcement without updating downstream client code.

---

## 5. Concurrency: Two Requests Hitting a Near-Exhausted Key

### What happens?
1. **Pre-flight Check**: Both requests arrive simultaneously and inspect `spent < budget` from the initially loaded key state. Both pass into the provider execution.
2. **Post-response Atomic Update**: When updating `spent`, the gateway executes a conditional atomic database query:
   ```sql
   UPDATE "ApiKey"
   SET spent = spent + $cost
   WHERE id = $keyId AND spent <= (budget - $cost)
   ```
3. **Outcome**: The database ensures that only the request that still fits within the budget increments `spent`. The database will never record a spent amount greater than the budget. However, both Groq API calls were initiated upstream.
4. **Production Alternative**: In high-throughput production, we would use a pre-allocation reservation pattern (e.g. reserving an estimated budget slice atomically before calling the LLM and reconciling after completion).

---

## 6. Fallback Policy

- **Policy**: Catch any primary provider error (network timeout, rate limit, invalid model, 5xx server error), log the incident, invoke `getFallbackResponse()`, return a formatted assistant message with `fallback: true`, and charge **$0** (0 tokens) to the user's budget.
- **Rationale**: Downstream applications using this gateway should never receive an unhandled 500 error from upstream provider hiccups unless the gateway itself is completely unreachable.

---

## 7. What was Deliberately NOT Built (and Why)

- **JWT / Complex User Auth**: Virtual API keys serve as both identity and auth. Full user/password authentication is unnecessary scope.
- **Redis Caching Layer**: At this scale, direct DB queries with unique indices on `key` execute in sub-millisecond time.
- **Streaming Handlers**: Avoids partial token accounting edge-cases.
- **Auto-Retry Storms**: Immediate fallback prevents cascading retry storms when the upstream provider is rate-limiting.

---

## 8. The Decision I'm Least Confident About

**Post-request budget deduction instead of pre-request budget reservation.**
- *Arguments For*: Non-streaming models only disclose exact token consumption after generation completes. Deducting post-request ensures accurate dollar charges without guessing max tokens.
- *Arguments Against*: Under high concurrency with near-zero balance, multiple requests can execute simultaneously before the first one records its spend, temporarily exceeding the intended budget cap at the provider level.

---

## 9. Where It Breaks & What I'd Do With One More Week

### Where it breaks:
- Extreme concurrent bursts on a near-empty key can incur minor unbilled upstream costs before the DB lock resolves.
- Single provider rate limits: If Groq hits organizational rate limits, all traffic falls back to the mock instead of routing to an alternative live model.

### With one more week:
1. **Budget Reservation Pipeline**: Pre-deduct estimated maximum cost before proxying, then refund remaining change after completion.
2. **Multi-Provider Router**: Add Anthropic / OpenAI live secondary providers with automatic health pinging and load balancing.
3. **Redis Sliding-Window Rate Limiting**: Add per-minute RPM (Requests Per Minute) limits alongside USD caps.
4. **Structured JSON Telemetry**: Replace console output with `pino` structured logger and OpenTelemetry tracing.
