const Groq = require('groq-sdk');

// Single shared Groq client instance.
// GROQ_API_KEY is read from the environment — never hardcoded.
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = groq;
