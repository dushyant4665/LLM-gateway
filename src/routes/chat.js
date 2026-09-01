const express = require('express');
const requireApiKey = require('../middleware/requireApiKey');
const { chat } = require('../controllers/chat');

const router = express.Router();

// All chat routes require a valid gateway API key
router.post('/', requireApiKey, chat);

module.exports = router;
