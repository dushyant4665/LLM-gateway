// Chat Controller - Handles HTTP requests for chat completion proxy

const { processChatRequest } = require('../services/chatService');

/**
 * POST /api/chat
 * Protected by requireApiKey middleware
 * Request body: { model?: string, messages: Array<{role: string, content: string}> }
 */
async function chat(req, res, next) {
  try {
    const { model, messages } = req.body;

    // Validate messages array
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' });
    }

    const isValid = messages.every(
      (m) => m && typeof m.role === 'string' && typeof m.content === 'string'
    );
    if (!isValid) {
      return res.status(400).json({ error: 'each message must have a role and content string' });
    }

    const result = await processChatRequest(req.apiKey, model, messages);
    return res.json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
}

module.exports = {
  chat,
};
