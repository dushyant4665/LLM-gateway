const express = require('express');
const requireApiKey = require('../middleware/requireApiKey');
const { getUsage } = require('../controllers/usage');

const router = express.Router();

// All usage routes require a valid gateway API key
router.get('/', requireApiKey, getUsage);

module.exports = router;
