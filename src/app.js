// Express Application Setup

const express = require('express');
const path = require('path');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Standard CORS Middleware (allows decoupled frontend development)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// JSON Body Parser
app.use(express.json());

// Serve Frontend Static Console (Unified deployment mode)
app.use(express.static(path.join(__dirname, '../frontend')));

// API & Health Routes
app.use(routes);

// Centralized Error Handler (must be last)
app.use(errorHandler);

module.exports = app;
