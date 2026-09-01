// Fallback provider — used when the primary Groq provider fails.
//
// This is a simple local mock. It does not call any external API,
// so it always succeeds and costs nothing.
//
// A real fallback could call a second LLM provider here,
// but for this assignment a mock stub is intentional and sufficient.

function getFallbackResponse(messages) {
  const lastMessage = messages[messages.length - 1];
  return {
    model: 'fallback-mock',
    choices: [
      {
        message: {
          role: 'assistant',
          content: `[Fallback] Primary provider unavailable. You asked: "${lastMessage.content}"`,
        },
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

module.exports = { getFallbackResponse };
