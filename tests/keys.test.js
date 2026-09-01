// Tests for POST /api/keys and the requireApiKey middleware.
// Prisma is mocked so no real database is needed to run these tests.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

// --- Mock Prisma before any app code loads ---
// We replace the module in the require cache so src/lib/prisma.js
// returns our mock instead of a real PrismaClient.
const prismaMock = {
  apiKey: {
    create: null,     // set per test
    findUnique: null, // set per test
  },
};
require.cache[require.resolve('../src/lib/prisma.js')] = {
  id: require.resolve('../src/lib/prisma.js'),
  filename: require.resolve('../src/lib/prisma.js'),
  loaded: true,
  exports: prismaMock,
};

// --- Mock Groq before any app code loads ---
// src/app.js now imports src/routes/chat.js which imports src/lib/groq.js.
// The Groq SDK throws at construction time if GROQ_API_KEY is missing,
// so we stub the module here to prevent that crash in the keys test file.
const groqMock = {
  chat: { completions: { create: null } },
};
require.cache[require.resolve('../src/lib/groq.js')] = {
  id: require.resolve('../src/lib/groq.js'),
  filename: require.resolve('../src/lib/groq.js'),
  loaded: true,
  exports: groqMock,
};

const app = require('../src/app');

// ─── POST /api/keys ───────────────────────────────────────────────────────────

test('POST /api/keys — creates a key and returns it', async () => {
  prismaMock.apiKey.create = async ({ data }) => ({
    id: 1,
    key: data.key,
    budget: data.budget,
    spent: 0,
    createdAt: new Date(),
  });

  const res = await request(app)
    .post('/api/keys')
    .send({ budget: 10 });

  assert.equal(res.status, 201);
  assert.ok(res.body.key.startsWith('rk_live_'), 'key should start with rk_live_');
  assert.equal(res.body.budget, 10);
  // Internal fields must NOT be exposed
  assert.equal(res.body.id, undefined);
  assert.equal(res.body.spent, undefined);
});

test('POST /api/keys — rejects missing budget', async () => {
  const res = await request(app)
    .post('/api/keys')
    .send({});

  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /api/keys — rejects zero budget', async () => {
  const res = await request(app)
    .post('/api/keys')
    .send({ budget: 0 });

  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /api/keys — rejects negative budget', async () => {
  const res = await request(app)
    .post('/api/keys')
    .send({ budget: -5 });

  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /api/keys — rejects non-numeric budget', async () => {
  const res = await request(app)
    .post('/api/keys')
    .send({ budget: 'abc' });

  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

// ─── requireApiKey middleware ─────────────────────────────────────────────────
// We test the middleware via the GET /health route — it does NOT use
// requireApiKey — so we need a protected route to test against.
// The easiest way is to hit POST /api/keys with a protected-style setup,
// but since createKey doesn't use requireApiKey we add a tiny test route
// directly on the app for this test file only.

const requireApiKey = require('../src/middleware/requireApiKey');
app.get('/test-protected', requireApiKey, (req, res) => {
  res.json({ ok: true, keyId: req.apiKey.id });
});

test('requireApiKey — rejects request with no Authorization header', async () => {
  const res = await request(app).get('/test-protected');

  assert.equal(res.status, 401);
  assert.ok(res.body.error);
});

test('requireApiKey — rejects request with invalid key', async () => {
  prismaMock.apiKey.findUnique = async () => null; // key not found

  const res = await request(app)
    .get('/test-protected')
    .set('Authorization', 'Bearer rk_live_doesnotexist');

  assert.equal(res.status, 401);
  assert.ok(res.body.error);
});

test('requireApiKey — allows request with valid key', async () => {
  prismaMock.apiKey.findUnique = async () => ({
    id: 42,
    key: 'rk_live_validkey',
    budget: 10,
    spent: 0,
    createdAt: new Date(),
  });

  const res = await request(app)
    .get('/test-protected')
    .set('Authorization', 'Bearer rk_live_validkey');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.keyId, 42);
});
