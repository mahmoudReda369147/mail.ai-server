
const { GoogleGenAI, Type, GenerateContentResponse } = require("@google/genai");

// Helper to get a fresh client instance to ensure the latest API key is used
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Retry Logic ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry(operation, retries = 3, backoff = 1000) {
  try {
    return await operation();
  } catch (error) {
    // Extract error details safely
    const errorCode = error.status || error?.error?.code || error?.code;
    const errorMessage = error.message || error?.error?.message || '';
    
    // Check for Resource Exhausted (429) - specific message for user feedback
    const isQuotaExceeded = errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota') || errorCode === 429;
    
    if (isQuotaExceeded) {
        console.error("Gemini API Quota Exceeded. Please check your billing/plan at ai.google.dev");
        // We throw a custom error so the UI can handle it specifically
        throw new Error("QUOTA_EXHAUSTED");
    }

    // Check for Server Errors (500, 503) or Network issues
    const isRetryable = errorCode === 500 || errorCode === 503 || errorMessage.includes('fetch failed') || errorMessage.includes('NetworkError');

    if (retries > 0 && isRetryable) {
      const waitTime = backoff + Math.random() * 500;
      await delay(waitTime);
      return withRetry(operation, retries - 1, backoff * 2);
    }
    
    throw error;
  }
}

// --- Text & Reasoning ---

 const getSmartInboxAnalysis = async (emailBody, subject) => {
  // Use Gemini 3 Flash for high-speed analysis
  const model = "gemini-3-flash-preview"; 
  
  try {
    const ai = getAiClient();
    const response = await withRetry(() => ai.models.generateContent({
      model,
      contents: `Analyze this email. Subject: ${subject}. Body: ${emailBody}. 
      Return JSON with:
      - priorityScore (0-100 integer)
      - summary (max 15 words)
      - tags (array of strings)`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            priorityScore: { type: Type.INTEGER },
            summary: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      }
    }));
    return JSON.parse(response.text || "{}");
  } catch (e) {
    if (e.message === "QUOTA_EXHAUSTED") return { priorityScore: 50, summary: "Quota exceeded", tags: ["System"] };
    return { priorityScore: 50, summary: "Analysis unavailable", tags: [] };
  }
};

 const analyzeActionItems = async (emailBody  , currentSubject) => {
  const model = "gemini-3-flash-preview";
  const ai = getAiClient();

  try {
     // Get current date and time for Gemini to calculate relative dates
  const currentDate = new Date();
  const currentDateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentTimeStr = currentDate.toTimeString().split(' ')[0].slice(0, 5); // HH:MM
  const currentDayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' });

  const response = await withRetry(() => ai.models.generateContent({
      model,
      contents: `Today is ${currentDayOfWeek}, ${currentDateStr} at ${currentTimeStr}.

Extract tasks and meetings from the following email. When you find dates like "tomorrow", "next Tuesday", etc., convert them to actual YYYY-MM-DD format based on today's date.

Email Subject: "${currentSubject}"
Email Body: "${emailBody}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  deadline: { type: Type.STRING, nullable: true },
                  priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] }
                },
                required: ["description", "priority"]
              }
            },
            meeting: {
              type: Type.OBJECT,
              properties: {
                 title: { type: Type.STRING },
                 date: { type: Type.STRING, description: "Date in YYYY-MM-DD format, convert relative dates like 'tomorrow' or 'next Tuesday' to actual dates based on today's date" },
                 time: { type: Type.STRING, description: "Time in HH:MM 24-hour format" },
                 duration: { type: Type.STRING },
                 agenda: { type: Type.STRING }
              },
              nullable: true
            }
          }
        }
      }
    }));

    // Extract text from the response - prioritize parts array over response.text
    let jsonText = response.candidates?.[0]?.content?.parts?.[0]?.text || response.text;

    const result = JSON.parse(jsonText || "{}");

    return {
        tasks: result.tasks || [],
        meeting: result.meeting || null
    };
  } catch (e) {
    if (e.message === "QUOTA_EXHAUSTED") throw new Error("Please check your API quota.");
    throw e;
  }
};

const generateReply = async (email, instruction) => {
  // Use Gemini 3 Flash for creative writing
  const model = "gemini-3-flash-preview";
  const ai = getAiClient();

  const prompt = `You are a professional email writing assistant. Generate a well-structured, professional HTML email reply.

**Original Email Context:**
- From: ${email.sender}
- Email: ${email.senderEmail}
- Subject: ${email.subject}
- Date: ${email.timestamp}
- Original Message: ${email.body || email.preview || email.htmlBody}

**User Instructions:**
${instruction}

**Requirements:**
1. Write a complete, professional email reply in HTML format
2. Use proper email structure with greeting and closing
3. Match the tone to the original email (formal/casual)
4. Address all points mentioned in the user's instructions
5. Be concise but thorough
6. Use proper HTML formatting: <p> for paragraphs, <br> for line breaks, <strong> for emphasis
7. Include a professional email signature at the end
8. If the original email asks questions, answer them clearly
9. Maintain a friendly yet professional tone
10. Do not include subject line or email headers in the response

**Output Format:**
Return ONLY the HTML body content (no <html>, <head>, or <body> tags). Start directly with the greeting.`;

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model,
    contents: prompt,
  }));
  return response.text;
};

const generateAutoReply = async (emailData, userPrompt, replyTone, template = null) => {
  // Use Gemini 3 Flash for auto-reply generation
  const model = "gemini-3-flash-preview";
  const ai = getAiClient();

  // Map reply tone to specific instructions
  const toneInstructions = {
    Professional: "Use formal, professional language. Be respectful and businesslike. Use proper salutations and closings.",
    Friendly: "Use warm, friendly language while remaining professional. Be approachable and personable.",
    Concise: "Be brief and to the point. Keep the response short while addressing all key points.",
    Detailed: "Provide comprehensive, detailed responses. Be thorough and informative in your explanations."
  };

  const toneInstruction = toneInstructions[replyTone] || toneInstructions.Professional;

  // Build template section if template exists
  const templateSection = template
    ? `\n**Template to Follow:**
Use this template as a guide for structuring your response. You can adapt it to fit the specific email context, but maintain the general structure and key elements:
${template}
`
    : '';

  const prompt = `You are an automated email assistant. Generate a professional HTML email reply based on the context and user's custom instructions.

**Original Email Details:**
- From: ${emailData.from || 'Unknown'}
- Subject: ${emailData.subject || 'No Subject'}
- Date: ${emailData.date || new Date().toISOString()}
- Message: ${emailData.body || emailData.snippet || ''}

**User's Custom Instructions:**
${userPrompt}

**Reply Tone:** ${replyTone}
${toneInstruction}${templateSection}

**Requirements:**
1. Write a complete HTML email reply
2. Follow the ${replyTone} tone strictly
3. Address the user's custom instructions in your response${template ? '\n4. Use the provided template as a structural guide, adapting it to the specific email context' : ''}
${template ? '5' : '4'}. If the original email asks questions, provide appropriate answers based on the user's instructions
${template ? '6' : '5'}. Use proper HTML formatting: <p> for paragraphs, <br> for line breaks
${template ? '7' : '6'}. Include an appropriate greeting and closing
${template ? '8' : '7'}. Keep the response relevant to the original email
${template ? '9' : '8'}. Do not include subject line or email headers in the response
${template ? '10' : '9'}. Be helpful and constructive in your response

**Output Format:**
Return ONLY the HTML body content (no <html>, <head>, or <body> tags). Start directly with the greeting (e.g., "Dear...", "Hi...", "Hello...").`;

  const response = await withRetry(() => ai.models.generateContent({
    model,
    contents: prompt,
  }));

  return response.text;
};

const improveDraft = async (draft, instruction) => {
  const model = "gemini-3-flash-preview";
  const ai = getAiClient();

  const prompt = `You are a professional email editor and writing coach. Improve the following email draft based on the user's specific instructions.

**Original Draft:**
${draft}

**Improvement Instructions:**
${instruction}

**Your Task:**
1. Carefully read the original draft and the improvement instructions
2. Apply the requested improvements while maintaining the core message
3. Enhance clarity, professionalism, and tone
4. Fix any grammar, spelling, or punctuation errors
5. Improve sentence structure and flow
6. Keep the same HTML formatting style as the original
7. Maintain or improve the level of formality/casualness as appropriate
8. Ensure the message remains concise and impactful

**Output Format:**
Return ONLY the improved HTML email content. Do not include explanations, comments, or metadata. Start directly with the email content.`;

  const response = await withRetry(() => ai.models.generateContent({
    model,
    contents: prompt,
  }));
  return response.text;
};

const generateEmailDraft = async (prompt, senderName) => {
  const model = "gemini-3-flash-preview";
  const ai = getAiClient();

  const systemPrompt = `You are an expert email writing assistant. Create a professional, well-structured email draft based on the user's request.

**Sender Information:**
Name: ${senderName}

**User's Request:**
${prompt}

**Instructions:**
1. Write a complete, professional email in HTML format
2. Infer the purpose and tone from the user's request
3. Structure the email properly with:
   - Appropriate greeting (Dear/Hi/Hello based on formality)
   - Clear and organized body paragraphs
   - Professional closing
   - Signature line with sender's name
4. Use proper HTML formatting:
   - <p> tags for paragraphs
   - <br> for line breaks where needed
   - <strong> or <em> for emphasis when appropriate
   - <ul> and <li> for lists if needed
5. Match the tone to the context:
   - Formal for business/professional contexts
   - Friendly but professional for colleagues
   - Warm and casual for informal contexts
6. Be clear, concise, and purposeful
7. If requesting something, be polite and specific
8. If responding to a situation, be empathetic and solution-focused
9. Include all necessary details that can be inferred from the request
10. Ensure proper grammar, spelling, and punctuation

**Output Format:**
Return ONLY the HTML email body content (no <html>, <head>, or <body> tags). Start with the greeting and end with the signature.`;

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model,
    contents: systemPrompt,
  }));
  return response.text;
};

// --- Images ---

const generateImage = async (prompt, size) => {
  const model = "gemini-3-flash-image-preview";
  const ai = getAiClient();
  const response = await withRetry(() => ai.models.generateContent({
    model,
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: { imageSize: size, aspectRatio: "1:1" }
    }
  }));
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  return null;
};

const generateNanoLogo = async () => {
  const model = "gemini-2.5-flash-image";
  const prompt = "Minimalist glowing logo for 'Aireon' AI Mail app, neon colors, pure black background.";
  const ai = getAiClient();
  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model,
    contents: { parts: [{ text: prompt }] },
  }));
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  return null;
};

// --- Edit Images ---

/**
 * Edits an image using gemini-2.5-flash-image.
 * Takes a base64 encoded image or data URL and a text prompt.
 * Following the Google GenAI guidelines for image editing.
 */
const editImage = async (base64ImageData, prompt) => {
  const model = 'gemini-2.5-flash-image';
  const ai = getAiClient();
  
  // Extract base64 data and mime type if it's a data URI
  let data = base64ImageData;
  let mimeType = 'image/png';
  if (base64ImageData.startsWith('data:')) {
    const matches = base64ImageData.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      data = matches[2];
    }
  }

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            data: data,
            mimeType: mimeType,
          },
        },
        {
          text: prompt,
        },
      ],
    },
  }));

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    // Find the image part in the response, do not assume it is the first part.
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};

// --- Video ---

const generateVideo = async (prompt, aspectRatio) => {
  const model = 'veo-3.1-fast-generate-preview';
  const ai = getAiClient();
  
  let operation = await ai.models.generateVideos({
    model,
    prompt,
    config: { numberOfVideos: 1, resolution: '720p', aspectRatio }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  return `${videoUri}&key=${process.env.API_KEY}`;
};

const getLiveClient = () => getAiClient().live;

module.exports = {
  getSmartInboxAnalysis,
  analyzeActionItems,
  generateReply,
  generateAutoReply,
  improveDraft,
  generateEmailDraft,
  generateImage,
  generateNanoLogo,
  editImage,
  generateVideo,
  getLiveClient
};
