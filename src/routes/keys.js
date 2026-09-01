const express = require('express');
const { createKey } = require('../controllers/keys');

const router = express.Router();

router.post('/', createKey);

module.exports = router;
