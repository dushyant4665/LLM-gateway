# AI-LOG.md

## 1. Which AI tools/models were used, and for what?

- **AI Tools**: Claude 3.7 Sonnet & Gemini 2.5 Flash via Antigravity / Cursor IDE.
- **Used For**:
  - Scaffolding the initial Express application boilerplate and Prisma database schema.
  - Generating test suites using Node.js native test runner (`node:test`) and `supertest` with `require.cache` mocking.
  - Designing the lightweight developer console UI (`frontend/`).
  - Drafting system documentation and cURL usage examples.

---

## 2. One place the AI was wrong or misleading, and how I caught it

- **The Issue**: When generating the fallback resilience logic, the AI initially wrapped the Groq error catch-block and returned an HTTP `503 Service Unavailable` response with an error payload explaining that Groq failed.
- **How I Caught It**: I reviewed Core Requirement #5 in the assignment specification: *"When the primary provider errors or times out, do something sensible: retry, fall back to a second provider or a local/mock model... your policy — defend it"*. Returning a 503 defeats the purpose of an automated fallback proxy.
- **Correction**: I overrode the AI and replaced the error throw with `fallback.getFallbackResponse(messages)` returning an HTTP 200 response with `fallback: true` and 0 billable tokens, ensuring client resilience.

---

## 3. One place I overrode the AI's suggestion, and why

- **The Suggestion**: The AI suggested using Redis for sliding-window token budgeting and maintaining atomic Lua counters for balance deduction.
- **Why I Overrode It**: Introducing Redis would add unnecessary infrastructure complexity (running another daemon, managing distributed state, handling Redis-to-Postgres synchronization) for a minimal gateway.
- **Human Decision**: I chose to enforce single-source-of-truth budgeting directly in PostgreSQL using a conditional atomic update:
  ```sql
  UPDATE "ApiKey" SET spent = spent + cost WHERE id = $id AND spent <= (budget - cost)
  ```
  This eliminates distributed state inconsistencies while strictly honoring the budget cap.

---

## 4. How I stayed in control of code I didn't type by hand

- **Secrets & Credentials**: Checked `.gitignore` to ensure `.env` is never committed. Verified that only `process.env.GROQ_API_KEY` is referenced server-side in `src/lib/groq.js` and never forwarded in client responses.
- **Budget & Guard Logic**: Stepped through `src/controllers/chat.js` and `src/services/chatService.js` line-by-line to verify:
  1. The pre-flight `spent >= budget` check rejects before calling Groq.
  2. Fallback responses are strictly mapped to `cost: 0` so users are never charged for degraded service.
  3. `updateMany` conditional filtering strictly prevents overspending.
- **Automated Unit Verification**: Ran a suite of 29 isolated unit tests covering every boundary condition (zero budget, negative budget, exact budget boundaries, missing keys, and invalid tokens).

---

## 5. Something I had to learn from scratch this weekend

- **Topic**: Safe module cache interception with Node.js native `node:test` runner.
- **How I got up to speed**: In previous projects I relied on Jest's `jest.mock()`. Since this project utilizes zero-dependency Node.js native testing (`node:test`), I researched how Node's `require.cache` resolves modules and implemented manual dependency injection stubs for Prisma and Groq before loading `src/app.js`. This resulted in instantaneous, sub-second test runs without heavy external test frameworks.
