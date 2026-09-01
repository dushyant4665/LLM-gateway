// Tests for POST /api/chat including budget enforcement, usage logging, and fallback.
// Prisma, Groq, and the fallback module are all mocked — no real services needed.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
const prismaMock = {
  apiKey: {
    findUnique: null,
    updateMany: null,
  },
  usageLog: {
    create: null,
  },
};
require.cache[require.resolve('../src/lib/prisma.js')] = {
  id: require.resolve('../src/lib/prisma.js'),
  filename: require.resolve('../src/lib/prisma.js'),
  loaded: true,
  exports: prismaMock,
};

// ─── Mock Groq ────────────────────────────────────────────────────────────────
const groqMock = {
  chat: { completions: { create: null } },
};
require.cache[require.resolve('../src/lib/groq.js')] = {
  id: require.resolve('../src/lib/groq.js'),
  filename: require.resolve('../src/lib/groq.js'),
  loaded: true,
  exports: groqMock,
};

// ─── Mock Fallback ────────────────────────────────────────────────────────────
// We mock the fallback module so we can control and spy on its behavior.
const fallbackMock = { getFallbackResponse: null };
require.cache[require.resolve('../src/lib/fallback.js')] = {
  id: require.resolve('../src/lib/fallback.js'),
  filename: require.resolve('../src/lib/fallback.js'),
  loaded: true,
  exports: fallbackMock,
};

const app = require('../src/app');
const { estimateCost } = require('../src/lib/cost');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_KEY = 'rk_live_testkey';

function keyWithBudget(budget = 10, spent = 0) {
  return { id: 1, key: VALID_KEY, budget, spent };
}

function makeGroqResponse(promptTokens = 10, completionTokens = 20) {
  return {
    model: 'openai/gpt-oss-20b',
    choices: [{ message: { role: 'assistant', content: 'Hello! How can I help?' } }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

function makeFallbackResponse(messages) {
  const last = messages[messages.length - 1];
  return {
    model: 'fallback-mock',
    choices: [{ message: { role: 'assistant', content: `[Fallback] You asked: "${last.content}"` } }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

const noopUpdate = async () => ({ count: 1 });
const noopLogCreate = async () => ({});

// ─── Auth tests ───────────────────────────────────────────────────────────────

test('POST /api/chat — rejects missing Authorization header', async () => {
  const res = await request(app)
    .post('/api/chat')
    .send({ messages: [{ role: 'user', content: 'hi' }] });

  assert.equal(res.status, 401);
  assert.ok(res.body.error);
});

test('POST /api/chat — rejects invalid API key', async () => {
  prismaMock.apiKey.findUnique = async () => null;

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', 'Bearer rk_live_invalid')
    .send({ messages: [{ role: 'user', content: 'hi' }] });

  assert.equal(res.status, 401);
  assert.ok(res.body.error);
});

// ─── Validation tests ─────────────────────────────────────────────────────────

test('POST /api/chat — rejects missing messages', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget();

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({});

  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /api/chat — rejects empty messages array', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget();

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({ messages: [] });

  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /api/chat — rejects malformed message (missing content)', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget();

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({ messages: [{ role: 'user' }] });

  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

// ─── Budget enforcement tests ─────────────────────────────────────────────────

test('POST /api/chat — rejects request when budget is fully spent', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget(5, 5);
  let groqCalled = false;
  groqMock.chat.completions.create = async () => { groqCalled = true; return makeGroqResponse(); };
  fallbackMock.getFallbackResponse = () => { groqCalled = true; return makeFallbackResponse([]); };

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({ messages: [{ role: 'user', content: 'Hello' }] });

  assert.equal(res.status, 429);
  assert.equal(res.body.error, 'Budget exceeded');
  assert.equal(groqCalled, false, 'Neither Groq nor fallback should be called when budget is exceeded');
});

test('POST /api/chat — rejects request when spent exceeds budget', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget(5, 6);

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({ messages: [{ role: 'user', content: 'Hello' }] });

  assert.equal(res.status, 429);
  assert.equal(res.body.error, 'Budget exceeded');
});

test('POST /api/chat — budget boundary: exactly at limit is rejected', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget(1.0, 1.0);

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({ messages: [{ role: 'user', content: 'Hello' }] });

  assert.equal(res.status, 429);
});

// ─── Success tests ────────────────────────────────────────────────────────────

test('POST /api/chat — returns Groq response on success', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget();
  prismaMock.apiKey.updateMany = noopUpdate;
  prismaMock.usageLog.create = noopLogCreate;
  groqMock.chat.completions.create = async () => makeGroqResponse();

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({ messages: [{ role: 'user', content: 'Hello' }] });

  assert.equal(res.status, 200);
  assert.equal(res.body.model, 'openai/gpt-oss-20b');
  assert.equal(res.body.message.role, 'assistant');
  assert.ok(res.body.usage);
  assert.equal(res.body.fallback, undefined, 'fallback flag must not be set on success');
  assert.equal(JSON.stringify(res.body).includes('GROQ_API_KEY'), false);
});

test('POST /api/chat — calls updateMany to deduct cost after success', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget(10, 0);
  prismaMock.usageLog.create = noopLogCreate;

  let updateArgs = null;
  prismaMock.apiKey.updateMany = async (args) => { updateArgs = args; return { count: 1 }; };
  groqMock.chat.completions.create = async () => makeGroqResponse(10, 20);

  await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({ messages: [{ role: 'user', content: 'Hello' }] });

  assert.ok(updateArgs, 'updateMany should have been called');
  assert.ok(updateArgs.data.spent.increment > 0);
  assert.equal(updateArgs.where.id, 1);
});

// ─── Cost calculation tests ───────────────────────────────────────────────────

test('cost is calculated correctly from token usage', () => {
  const expected = 10 * (0.59 / 1_000_000) + 20 * (0.79 / 1_000_000);
  const actual = estimateCost({ prompt_tokens: 10, completion_tokens: 20 });
  assert.ok(Math.abs(actual - expected) < 1e-12, `expected ${expected} but got ${actual}`);
});

test('estimateCost returns 0 for missing usage', () => {
  assert.equal(estimateCost(null), 0);
  assert.equal(estimateCost(undefined), 0);
  assert.equal(estimateCost({}), 0);
});

// ─── UsageLog tests ───────────────────────────────────────────────────────────

test('POST /api/chat — successful request creates a UsageLog', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget(10, 0);
  prismaMock.apiKey.updateMany = noopUpdate;
  let logData = null;
  prismaMock.usageLog.create = async (args) => { logData = args.data; return {}; };
  groqMock.chat.completions.create = async () => makeGroqResponse(15, 25);

  await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({ messages: [{ role: 'user', content: 'Hello' }] });

  assert.ok(logData, 'usageLog.create should have been called');
  assert.equal(logData.inputTokens, 15);
  assert.equal(logData.outputTokens, 25);
  assert.equal(logData.totalTokens, 40);
  const expectedCost = estimateCost({ prompt_tokens: 15, completion_tokens: 25 });
  assert.ok(Math.abs(logData.estimatedCost - expectedCost) < 1e-12);
});

// ─── Fallback tests ───────────────────────────────────────────────────────────

test('POST /api/chat — uses fallback when Groq fails', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget(10, 0);
  prismaMock.apiKey.updateMany = noopUpdate;
  prismaMock.usageLog.create = noopLogCreate;

  groqMock.chat.completions.create = async () => { throw new Error('Groq down'); };
  fallbackMock.getFallbackResponse = (msgs) => makeFallbackResponse(msgs);

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({ messages: [{ role: 'user', content: 'Hello' }] });

  assert.equal(res.status, 200);
  assert.equal(res.body.model, 'fallback-mock');
  assert.equal(res.body.fallback, true, 'fallback flag must be true');
});

test('POST /api/chat — fallback response is not charged to the key', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget(10, 0);
  prismaMock.usageLog.create = noopLogCreate;

  let incrementedAmount = null;
  prismaMock.apiKey.updateMany = async (args) => {
    incrementedAmount = args.data.spent.increment;
    return { count: 1 };
  };

  groqMock.chat.completions.create = async () => { throw new Error('Groq down'); };
  fallbackMock.getFallbackResponse = (msgs) => makeFallbackResponse(msgs);

  await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({ messages: [{ role: 'user', content: 'Hello' }] });

  // Fallback returns 0 tokens — cost should be 0
  assert.equal(incrementedAmount, 0, 'No cost should be charged when fallback is used');
});

test('POST /api/chat — budget exceeded blocks both Groq and fallback', async () => {
  prismaMock.apiKey.findUnique = async () => keyWithBudget(1, 1);
  let fallbackCalled = false;
  fallbackMock.getFallbackResponse = () => { fallbackCalled = true; return makeFallbackResponse([]); };
  groqMock.chat.completions.create = async () => { throw new Error('should not reach'); };

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${VALID_KEY}`)
    .send({ messages: [{ role: 'user', content: 'Hello' }] });

  assert.equal(res.status, 429);
  assert.equal(fallbackCalled, false, 'Fallback must not be called when budget is exceeded');
});
