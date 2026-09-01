// Central API Route Aggregator

const express = require('express');
const healthRouter = require('./health');
const keysRouter = require('./keys');
const chatRouter = require('./chat');
const usageRouter = require('./usage');

const router = express.Router();

// Mount API routes under standard paths
router.use('/health', healthRouter);
router.use('/api/keys', keysRouter);
router.use('/api/chat', chatRouter);
router.use('/api/usage', usageRouter);

module.exports = router;
