import { CATEGORIES } from '../store/useRecipeStore';
import { supabase } from './supabase';

// All Gemini calls go through a Cloudflare Worker proxy instead of Google's
// API directly. The real API key lives only as a secret on that Worker --
// it is never bundled into this app's JS, so it can't leak via view-source,
// GitHub secret scanning, or APK decompiling (unlike a raw EXPO_PUBLIC_ key).
const PROXY_BASE_URL =
  process.env.EXPO_PUBLIC_GEMINI_PROXY_URL || 'https://gemini-proxy.stormwalker161.workers.dev';
// gemini-2.5-flash/-lite are restricted for newly-created API keys ahead of
// their Oct 2026 retirement, and gemini-1.5-flash/gemini-2.0-flash are fully
// shut down. gemini-3.6-flash works, but as a newer "thinking" model its free
// tier daily quota is only ~20 requests/day (vs. the usual ~1,000+ for a
// "Flash-Lite" tier model) -- far too low for real usage, so we use the
// Flash-Lite variant instead for a much larger daily allowance.
const MODEL = 'gemini-3.5-flash-lite';
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

// Normalizes the `contents` shapes used throughout this file (a plain string,
// or a flat array of parts like [{ text }, { inlineData }]) into the
// Content[] shape Gemini's REST API expects.
function toRestContents(contents) {
  if (typeof contents === 'string') {
    return [{ role: 'user', parts: [{ text: contents }] }];
  }

  return [{ role: 'user', parts: contents }];
}

// The Gemini free tier enforces both a per-minute limit (RPM) and a much
// stricter per-day limit (RPD) -- and Google's 429 response looks identical
// either way, including a short suggested "retryDelay" even when the *daily*
// cap is what got hit. Blindly waiting-and-retrying on every 429 makes a
// daily-quota failure look like it's stuck in a loop: the user waits the
// suggested ~30-60s, retries, gets the exact same 429 with another short
// delay, and repeats indefinitely -- because a daily quota only resets at
// midnight Pacific, no amount of short waits will ever fix it. The `quotaId`
// in the error body is what actually distinguishes the two cases, so check
// that before deciding whether a retry can possibly help.
const MAX_AUTO_RETRY_DELAY_SECONDS = 65;

function getQuotaViolationIds(errorBody) {
  const details = errorBody?.error?.details ?? [];
  const quotaFailure = details.find((detail) => detail['@type']?.includes('QuotaFailure'));
  return (quotaFailure?.violations ?? []).map((violation) => violation.quotaId || '');
}

function isDailyQuotaError(errorBody) {
  return getQuotaViolationIds(errorBody).some(
    (quotaId) => /perday|daily/i.test(quotaId)
  );
}

function extractRetryDelaySeconds(errorBody) {
  const details = errorBody?.error?.details ?? [];
  const retryInfo = details.find((detail) => detail['@type']?.includes('RetryInfo'));
  const match = /^([\d.]+)s$/.exec(retryInfo?.retryDelay ?? '');
  return match ? parseFloat(match[1]) : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestGeminiOnce(contents, { temperature, systemInstruction }, allowRateLimitRetry = true) {
  // The proxy Worker requires proof of a signed-in, approved account before
  // it will spend any of the shared Gemini quota on this request -- see
  // server/gemini-proxy/src/index.ts. Without this header it responds 401.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('You must be signed in to use AI recipe import.');
  }

  let response;
  try {
    response = await fetch(`${PROXY_BASE_URL}/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        contents: toRestContents(contents),
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature,
          // Some Gemini models are "thinking" models that can burn their
          // entire output budget on internal reasoning before ever writing
          // the final JSON answer, which surfaces as an empty response with
          // no error. Recipe extraction doesn't need deep reasoning, so keep
          // thinking minimal to leave the budget for the actual answer.
          thinkingConfig: { thinkingLevel: 'LOW' },
        },
      }),
    });
  } catch (networkError) {
    throw new Error(`Could not reach Gemini. Check your connection. (${networkError.message})`);
  }

  const data = await response.json().catch(() => null);

  if (response.status === 429) {
    if (isDailyQuotaError(data)) {
      throw new Error(
        "You've used up Gemini's free daily limit for today. This resets at midnight Pacific Time -- waiting a few minutes won't help, but it will work again after the reset (or you can try again tomorrow)."
      );
    }

    if (allowRateLimitRetry) {
      const retryDelaySeconds = extractRetryDelaySeconds(data);
      if (retryDelaySeconds != null && retryDelaySeconds <= MAX_AUTO_RETRY_DELAY_SECONDS) {
        await sleep((retryDelaySeconds + 1) * 1000);
        return requestGeminiOnce(contents, { temperature, systemInstruction }, false);
      }
    }
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        "Gemini's free-tier limit is a small number of requests per minute. Please wait about a minute and try again."
      );
    }
    throw new Error(data?.error?.message || `HTTP ${response.status}`);
  }

  return data;
}

function extractText(candidate) {
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text)
    .filter(Boolean)
    .join('');
  return text || null;
}

async function callGemini(contents) {
  const attempts = [
    { temperature: 0.2, systemInstruction: SYSTEM_PROMPT },
    { temperature: 0.6, systemInstruction: SYSTEM_PROMPT },
    { temperature: 0.9, systemInstruction: SYSTEM_PROMPT + RECITATION_RETRY_SUFFIX },
  ];

  let lastReason = 'no candidates returned';

  for (const attempt of attempts) {
    // requestGeminiOnce already produces clear, final error messages
    // (network failure, rate limit, etc.) -- let them propagate as-is
    // instead of wrapping them in a redundant/confusing prefix.
    const response = await requestGeminiOnce(contents, attempt);

    const candidate = response?.candidates?.[0];
    const content = extractText(candidate);
    if (content) {
      return normalizeRecipe(extractJson(content));
    }

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
