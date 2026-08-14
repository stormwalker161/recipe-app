import { GoogleGenAI } from '@google/genai';
import { CATEGORIES } from '../store/useRecipeStore';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
// gemini-2.5-flash is restricted for newly-created API keys ahead of its Oct
// 2026 retirement. gemini-1.5-flash and gemini-2.0-flash are fully shut down
// (not just new-user-restricted), so gemini-3.6-flash is the current GA model.
const MODEL = 'gemini-3.6-flash';
const MAX_PAGE_TEXT_LENGTH = 12000;

const SYSTEM_PROMPT = `You are a recipe-parsing assistant. Always respond with STRICT JSON only -- no markdown, no code fences, no commentary -- matching exactly this shape:

{
  "title": string,
  "category": one of "Breakfast", "Lunch", "Dinner", "Snacks", "Dessert",
  "prepTime": string (e.g. "25 min"),
  "ingredients": string[],
  "instructions": string[]
}

Rules:
- Use your best judgement to fill in every field, even if the source text is messy, incomplete, or handwritten with errors.
- "category" must be exactly one of the five values listed above.
- "ingredients" and "instructions" must be arrays of short strings, one item per entry.
- Do not include any keys other than the five listed above.`;

let cachedClient = null;

function getClient() {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'Missing Gemini API key. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file and restart the dev server.'
    );
  }

  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  return cachedClient;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Most recipe sites don't send Access-Control-Allow-Origin headers, so a
// direct fetch() from the browser (web build) gets blocked by CORS before we
// even see a status code. r.jina.ai is a free "reader" proxy that fetches the
// page server-side, renders JS if needed, and returns clean text -- and it
// echoes back an Access-Control-Allow-Origin header for any origin, so it
// works from the browser too. Native (iOS/Android) isn't subject to CORS, so
// we try the direct fetch first there and only fall back if it fails.
const READER_PROXY_URL = 'https://r.jina.ai/';

async function fetchDirect(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`The website returned an error (status ${response.status}).`);
  }

  const html = await response.text();
  const text = stripHtml(html);

  if (!text) {
    throw new Error('Could not find any readable text on that page.');
  }

  return text;
}

async function fetchViaReaderProxy(url) {
  const response = await fetch(`${READER_PROXY_URL}${url}`);

  if (!response.ok) {
    throw new Error(`The reader service returned an error (status ${response.status}).`);
  }

  const text = (await response.text()).trim();

  if (!text) {
    throw new Error('Could not find any readable text on that page.');
  }

  return text;
}

async function fetchPageText(url) {
  let lastError;

  try {
    const text = await fetchDirect(url);
    return text.slice(0, MAX_PAGE_TEXT_LENGTH);
  } catch (error) {
    lastError = error;
  }

  try {
    const text = await fetchViaReaderProxy(url);
    return text.slice(0, MAX_PAGE_TEXT_LENGTH);
  } catch (error) {
    throw new Error(
      `Could not read that page. It may be blocking automated access, or the link may be incorrect. (${lastError.message})`
    );
  }
}

function extractJson(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new Error('The AI response was not valid JSON.');
  }
}

function normalizeRecipe(raw) {
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.map(String).map((item) => item.trim()).filter(Boolean)
    : [];

  const instructions = Array.isArray(raw.instructions)
    ? raw.instructions.map(String).map((item) => item.trim()).filter(Boolean)
    : [];

  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Untitled Recipe',
    category: CATEGORIES.includes(raw.category) ? raw.category : CATEGORIES[0],
    prepTime: typeof raw.prepTime === 'string' ? raw.prepTime.trim() : '',
    ingredients,
    instructions,
  };
}

// RECITATION fires when Gemini's output would too closely match a known
// published recipe (e.g. a well-known cookbook/website recipe photographed
// or scanned) -- it's a citation filter, separate from safetySettings, and
// cannot be disabled via config. The only real fix is to retry with an
// explicit "paraphrase, don't quote" instruction and a higher temperature,
// which gives the model room to reword instead of reproduce verbatim.
const RECITATION_RETRY_SUFFIX = `

Important: Some earlier attempts to answer were blocked because the wording matched a well-known published recipe too closely. Rephrase every ingredient and instruction in your own words instead of quoting the source verbatim -- keep exact quantities, temperatures, and times unchanged, but reword the surrounding language.`;

async function requestGeminiOnce(contents, { temperature, systemInstruction }) {
  const ai = getClient();

  return ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      temperature,
      // gemini-3.6-flash is a "thinking" model that can burn its entire
      // output budget on internal reasoning before ever writing the final
      // JSON answer, which surfaces as an empty response.text with no
      // error. Recipe extraction doesn't need deep reasoning, so keep
      // thinking minimal to leave the budget for the actual answer.
      thinkingConfig: { thinkingLevel: 'LOW' },
    },
  });
}

async function callGemini(contents) {
  const attempts = [
    { temperature: 0.2, systemInstruction: SYSTEM_PROMPT },
    { temperature: 0.6, systemInstruction: SYSTEM_PROMPT },
    { temperature: 0.9, systemInstruction: SYSTEM_PROMPT + RECITATION_RETRY_SUFFIX },
  ];

  let lastReason = 'no candidates returned';

  for (const attempt of attempts) {
    let response;
    try {
      response = await requestGeminiOnce(contents, attempt);
    } catch (error) {
      throw new Error(`Could not reach Gemini. Check your connection. (${error.message})`);
    }

    const content = response?.text;
    if (content) {
      return normalizeRecipe(extractJson(content));
    }

    const candidate = response?.candidates?.[0];
    const partKinds = (candidate?.content?.parts ?? []).map((part) => Object.keys(part).join('+'));
    lastReason =
      response?.promptFeedback?.blockReason ||
      candidate?.finishReason ||
      (partKinds.length ? `unexpected parts: ${partKinds.join(', ')}` : 'no candidates returned');

    // Other failure reasons (SAFETY, MAX_TOKENS, etc.) won't be fixed by
    // retrying the same input, so fail fast instead of wasting attempts.
    if (lastReason !== 'RECITATION') {
      break;
    }
  }

  throw new Error(`Gemini did not return any content (${lastReason}). Please try again.`);
}

/**
 * Takes either a raw block of recipe text or a URL to a recipe page and asks
 * Gemini to extract a structured recipe object matching our store's shape.
 *
 * URLs are fetched and stripped down to plain text client-side first, since
 * Gemini's generateContent call has no ability to browse the web itself.
 */
export async function parseRecipeFromText(input) {
  const trimmedInput = input.trim();
  const isUrl = /^https?:\/\//i.test(trimmedInput);

  const sourceText = isUrl ? await fetchPageText(trimmedInput) : trimmedInput;

  if (!sourceText) {
    throw new Error('Please paste some recipe text or a valid URL.');
  }

  const promptText = isUrl
    ? `Extract the recipe from the following webpage text (scraped from ${trimmedInput}):\n\n${sourceText}`
    : `Extract the recipe from the following text:\n\n${sourceText}`;

  return callGemini(promptText);
}

/**
 * Takes one or more base64-encoded photos of a (possibly handwritten)
 * recipe and asks Gemini's vision-capable model to transcribe and structure
 * it. Multiple photos are treated as sequential pages of the same recipe
 * (e.g. ingredients on one page, instructions on the next) and combined into
 * a single extracted recipe in one request.
 *
 * Accepts either a single { base64, mimeType } object or an array of them.
 */
export async function parseRecipeFromImage(images) {
  const photos = (Array.isArray(images) ? images : [images]).filter((photo) => photo?.base64);

  if (!photos.length) {
    throw new Error('No photo data was captured. Please try again.');
  }

  const introText =
    photos.length > 1
      ? `These ${photos.length} photos are sequential pages of the same handwritten (or printed) recipe, in the order given. Read them carefully, including messy handwriting, and combine everything into a single extracted recipe.`
      : 'This photo contains a handwritten (or printed) recipe. Read it carefully, including messy handwriting, and extract the recipe.';

  return callGemini([
    { text: introText },
    ...photos.map((photo) => ({
      inlineData: {
        data: photo.base64,
        mimeType: photo.mimeType || 'image/jpeg',
      },
    })),
  ]);
}

/**
 * Takes a base64-encoded PDF document and asks Gemini (which accepts PDF
 * input natively) to extract the recipe from it.
 */
export async function parseRecipeFromPdf(base64Pdf) {
  if (!base64Pdf) {
    throw new Error('No PDF data was read. Please try again.');
  }

  return callGemini([
    {
      text: 'This PDF document contains a recipe. Read through it, including any tables or multi-column layouts, and extract the recipe.',
    },
    {
      inlineData: {
        data: base64Pdf,
        mimeType: 'application/pdf',
      },
    },
  ]);
}
