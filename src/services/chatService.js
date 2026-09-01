// Chat Service - Orchestrates LLM calling, fallback resilience, cost deduction & logging

const groq = require('../lib/groq');
const prisma = require('../lib/prisma');
const { estimateCost } = require('../lib/cost');
const fallback = require('../lib/fallback');
const { DEFAULT_MODEL } = require('../constants/models');

/**
 * Executes a chat completion through the gateway proxy.
 *
 * @param {object} apiKey - Authenticated ApiKey record from database
 * @param {string} model - Requested model name
 * @param {Array<{role: string, content: string}>} messages - Chat message array
 * @returns {Promise<{ response: object, status?: number }>}
 */
async function processChatRequest(apiKey, model, messages) {
  const { budget, spent, id: apiKeyId } = apiKey;

  // 1. Budget Guard: Block request before calling provider if exhausted
  if (spent >= budget) {
    const err = new Error('Budget exceeded');
    err.statusCode = 429;
    throw err;
  }

  const targetModel = model || DEFAULT_MODEL;
  let completion;
  let usedFallback = false;

  // 2. Call Primary Provider with Fallback Resilience
  try {
    completion = await groq.chat.completions.create({
      model: targetModel,
      messages,
    });
  } catch (groqErr) {
    // Primary provider failed - invoke fallback mock without charging user budget
    completion = fallback.getFallbackResponse(messages);
    usedFallback = true;
  }

  // 3. Estimate Cost from Token Usage
  const usage = completion.usage;
  const cost = estimateCost(usage);

  // 4. Concurrency-Safe Budget Increment
  await prisma.apiKey.updateMany({
    where: {
      id: apiKeyId,
      spent: { lte: budget - cost },
    },
    data: {
      spent: { increment: cost },
    },
  });

  // 5. Persist Granular Usage Log
  await prisma.usageLog.create({
    data: {
      apiKeyId,
      model: completion.model,
      inputTokens: usage ? (usage.prompt_tokens || 0) : 0,
      outputTokens: usage ? (usage.completion_tokens || 0) : 0,
      totalTokens: usage ? (usage.total_tokens || 0) : 0,
      estimatedCost: cost,
    },
  });

  // 6. Format Return Response
  const choice = completion.choices[0];
  const response = {
    model: completion.model,
    message: choice.message,
    usage: completion.usage,
  };

  if (usedFallback) {
    response.fallback = true;
  }

  return response;
}

module.exports = {
  processChatRequest,
};
