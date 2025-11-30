const Groq = require("groq-sdk");

// Initialize Groq client with your API key
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Send a chat request to Groq
 * @param {Array} history - Chat history in [{ role, content }] format
 * @param {string} currentMessage - The new user message
 * @returns {Promise<string>} - Model response
 */
const sendGroqMessage = async function (systemPrompet,history = [], currentMessage = "") {
  try {
    const safeHistory = Array.isArray(history) ? history : [];

    const messages = [
      { role: "system", content: systemPrompet },
      ...safeHistory,
      { role: "user", content: currentMessage }
    ];

    const response = await groq.chat.completions.create({
      // model: "llama-3.1-8b-instant",
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Groq API Error:", error);
    return "Error: Unable to get response from AI.";
  }
};

module.exports = sendGroqMessage;

// Example usage
(async () => {
  const history = [
    { role: "user", content: "Hello!" },
    { role: "assistant", content: "Hello! It's nice to meet you. Is there something I can help you with or would you like to chat?" },
  ];
  
  const reply = await sendGroqMessage("You are a helpful assistant and your name is ahmed",history, "what is your name")
  console.log("AI:", reply);
})();
