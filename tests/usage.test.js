// Tests for GET /api/usage
// Prisma and Groq are mocked — no real DB or API key needed.

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
    aggregate: null,
  },
};
require.cache[require.resolve('../src/lib/prisma.js')] = {
  id: require.resolve('../src/lib/prisma.js'),
  filename: require.resolve('../src/lib/prisma.js'),
  loaded: true,
  exports: prismaMock,
};

// ─── Mock Groq ────────────────────────────────────────────────────────────────
const groqMock = { chat: { completions: { create: null } } };
require.cache[require.resolve('../src/lib/groq.js')] = {
  id: require.resolve('../src/lib/groq.js'),
  filename: require.resolve('../src/lib/groq.js'),
  loaded: true,
  exports: groqMock,
};

const app = require('../src/app');

const VALID_KEY = 'rk_live_usagetest';
const keyRecord = { id: 99, key: VALID_KEY, budget: 10, spent: 0 };

// ─── Auth tests ───────────────────────────────────────────────────────────────

test('GET /api/usage — rejects missing Authorization header', async () => {
  const res = await request(app).get('/api/usage');

  assert.equal(res.status, 401);
  assert.ok(res.body.error);
});

test('GET /api/usage — rejects invalid API key', async () => {
  prismaMock.apiKey.findUnique = async () => null;

  const res = await request(app)
    .get('/api/usage')
    .set('Authorization', 'Bearer rk_live_invalid');

  assert.equal(res.status, 401);
  assert.ok(res.body.error);
});

// ─── Usage aggregation tests ──────────────────────────────────────────────────

test('GET /api/usage — returns totals for the authenticated key', async () => {
  prismaMock.apiKey.findUnique = async () => keyRecord;
  prismaMock.usageLog.aggregate = async ({ where }) => {
    // Verify the query is scoped to this key's id
    assert.equal(where.apiKeyId, 99);
    return {
      _count: { id: 5 },
      _sum: { inputTokens: 1200, outputTokens: 500, totalTokens: 1700, estimatedCost: 0.0034 },
    };
  };

  const res = await request(app)
    .get('/api/usage')
    .set('Authorization', `Bearer ${VALID_KEY}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.totalRequests, 5);
  assert.equal(res.body.inputTokens, 1200);
  assert.equal(res.body.outputTokens, 500);
  assert.equal(res.body.totalTokens, 1700);
  assert.ok(Math.abs(res.body.totalEstimatedCost - 0.0034) < 1e-9);
});

test('GET /api/usage — empty history returns zero totals', async () => {
  prismaMock.apiKey.findUnique = async () => keyRecord;
  prismaMock.usageLog.aggregate = async () => ({
    _count: { id: 0 },
    _sum: { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCost: null },
  });

  const res = await request(app)
    .get('/api/usage')
    .set('Authorization', `Bearer ${VALID_KEY}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.totalRequests, 0);
  assert.equal(res.body.inputTokens, 0);
  assert.equal(res.body.outputTokens, 0);
  assert.equal(res.body.totalTokens, 0);
  assert.equal(res.body.totalEstimatedCost, 0);
});

test('GET /api/usage — does not expose another key\'s data', async () => {
  // Key A is the authenticated key (id: 99)
  // The aggregate mock verifies the WHERE clause only includes id: 99
  // If apiKeyId in the query were different, the assert inside aggregate would fail

  prismaMock.apiKey.findUnique = async () => keyRecord; // id: 99
  prismaMock.usageLog.aggregate = async ({ where }) => {
    assert.equal(where.apiKeyId, 99, 'query must be scoped to authenticated key id');
    return {
      _count: { id: 2 },
      _sum: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.0001 },
    };
  };

  const res = await request(app)
    .get('/api/usage')
    .set('Authorization', `Bearer ${VALID_KEY}`);

  assert.equal(res.status, 200);
  // Response contains only this key's data — we verified isolation in the mock above
  assert.equal(res.body.totalRequests, 2);
});
