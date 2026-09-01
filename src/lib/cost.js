// Cost estimation for Groq LLM usage.
//
// Pricing below is an approximation for budget tracking purposes.
// Actual rates depend on your Groq account and the model used.
// Update these constants if you switch models or pricing changes.
// All amounts are in USD.

const PROMPT_COST_PER_TOKEN = 0.59 / 1_000_000;     // $0.59 per 1M input tokens
const COMPLETION_COST_PER_TOKEN = 0.79 / 1_000_000; // $0.79 per 1M output tokens

/**
 * Estimate the cost of a Groq API call from the usage object returned
 * in the completion response.
 *
 * @param {object} usage - { prompt_tokens, completion_tokens }
 * @returns {number} estimated cost in USD (e.g. 0.000023)
 */
function estimateCost(usage) {
  // Guard: if usage is missing or malformed, treat cost as 0
  if (!usage || typeof usage !== 'object') return 0;

  const promptTokens = Number(usage.prompt_tokens) || 0;
  const completionTokens = Number(usage.completion_tokens) || 0;

  return (
    promptTokens * PROMPT_COST_PER_TOKEN +
    completionTokens * COMPLETION_COST_PER_TOKEN
  );
}

module.exports = { estimateCost };
