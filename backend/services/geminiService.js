const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Schema enforces structured JSON output from Gemini
const profileSchema = {
  type: Type.OBJECT,
  properties: {
    personal: {
      type: Type.OBJECT,
      properties: {
        firstName: { type: Type.STRING },
        lastName: { type: Type.STRING },
        email: { type: Type.STRING },
        phone: { type: Type.STRING },
        city: { type: Type.STRING },
        state: { type: Type.STRING },
        country: { type: Type.STRING },
        zipCode: { type: Type.STRING },
      },
      required: ['firstName', 'lastName', 'email'],
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          institution: { type: Type.STRING },
          degree: { type: Type.STRING },
          fieldOfStudy: { type: Type.STRING },
          startYear: { type: Type.STRING },
          endYear: { type: Type.STRING },
          gpa: { type: Type.STRING },
        },
        required: ['institution', 'degree'],
      },
    },
    experience: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          company: { type: Type.STRING },
          role: { type: Type.STRING },
          startDate: { type: Type.STRING },
          endDate: { type: Type.STRING },
          isCurrent: { type: Type.BOOLEAN },
          bulletPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['company', 'role'],
      },
    },
    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    links: {
      type: Type.OBJECT,
      properties: {
        linkedin: { type: Type.STRING },
        github: { type: Type.STRING },
        portfolio: { type: Type.STRING },
      },
    },
  },
  required: ['personal', 'education', 'experience', 'skills', 'links'],
};

const SYSTEM_PROMPT = `You are an expert resume parser. Extract structured data from resume text as JSON.

Rules:
- Extract ONLY information explicitly present. Never invent data.
- Empty string "" for missing strings, [] for missing arrays, false for missing booleans.
- Preserve original date formats (e.g., "Jan 2022", "2022-01").
- Each experience bullet point = separate string.
- Current job (e.g., "Present", no end date): isCurrent=true, endDate="Present".
- First word = firstName, rest = lastName.`;

/** Extract structured profile from raw resume text via Gemini 2.5 Flash */
async function extractProfile(rawText) {
  console.log(`[GEMINI] Parsing ${rawText.length} chars`);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Parse the following resume text into structured JSON:\n\n---\n${rawText}\n---`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: profileSchema,
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text);
    console.log(`[GEMINI] Extracted: ${parsed.personal?.firstName} ${parsed.personal?.lastName}`);
    return parsed;
  } catch (err) {
    console.error('[GEMINI]', err.message);

    const msg = (err.message || '').toLowerCase();
    if (msg.includes('api key') || msg.includes('403')) throw new Error('Gemini API key issue.');
    if (msg.includes('quota') || msg.includes('429')) throw new Error('Gemini rate limit. Try again shortly.');
    if (msg.includes('timeout')) throw new Error('Gemini timed out. Try a shorter resume.');
    throw new Error('Gemini could not parse this resume. Please try again.');
  }
}

module.exports = { extractProfile };
