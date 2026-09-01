# AI Log

### 1. Which AI tools/models were used, and for what?
- **Tools**: Cursor (Claude 3.7 Sonnet) and ChatGPT.
- **What I used them for**:
  - Setting up the basic Express boilerplate and initial Prisma schema.
  - Writing test cases in `tests/` using Node's built-in `node:test` runner.
  - Building the HTML/CSS layout for the frontend console.
  - Formatting curl commands and initial documentation drafts.

---

### 2. One place the AI was wrong or misleading, and how I caught it
- **The mistake**: When writing the error handling for Groq API calls, the AI wrapped the catch block and returned an HTTP 503 error directly to the user when Groq failed.
- **How I caught it**: While re-reading the assignment requirements, I noticed requirement #5 specifically asked for fallback behavior (if the primary provider fails, fall back to a mock or secondary model). A 503 error defeats the purpose of having a fallback.
- **How I fixed it**: I removed the 503 error response and plugged in `fallback.js` instead. When Groq fails, it now returns a 200 response with `fallback: true` and 0 tokens charged.

---

### 3. One place I overrode the AI's suggestion, and why
- **The suggestion**: The AI suggested adding Redis to track token usage and rate limits in memory.
- **Why I rejected it**: Adding Redis for a weekend take-home project would just add unnecessary setup (running another container, syncing Redis with PostgreSQL, etc.).
- **What I did instead**: I kept all state directly in PostgreSQL. To prevent race conditions on spend updates, I used a conditional database query (`UPDATE ApiKey SET spent = spent + cost WHERE spent <= budget - cost`). It's simple, reliable, and needs zero extra infrastructure.

---

### 4. How I stayed in control of code I didn't type by hand
- **Secrets**: I made sure `.env` was in `.gitignore` right away and verified that `GROQ_API_KEY` is only read server-side in `src/lib/groq.js`. The key is never returned in any API response or logs.
- **Budget Logic**: I manually walked through `chatService.js` to ensure the pre-flight check (`spent >= budget`) actually blocks before calling Groq, and that fallback responses are explicitly charged $0.
- **Testing**: I wrote and ran 29 automated unit tests covering edge cases like zero budget, negative budget, exact budget boundaries, missing keys, and invalid tokens.

---

### 5. Something I had to learn from scratch this weekend
- **Topic**: Mocking modules with Node's native test runner (`node:test`).
- **How I learned it**: In past projects, I usually used Jest with `jest.mock()`. Since this project uses Node's built-in test runner without heavy test frameworks, I had to understand how Node's `require.cache` works to inject mocks for Prisma and Groq before loading `app.js`. I tested it locally step-by-step until the test suite ran reliably.
