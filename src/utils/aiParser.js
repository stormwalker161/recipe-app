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

// Free, keyless search over openly-licensed photos (Flickr, Wikimedia
// Commons, museum collections, etc.) -- used to find an existing photo of a
// dish for recipes that don't have one of their own yet, instead of
// generating a new image. (Gemini's own image-generation models turned out
// to have a hard free-tier quota of zero -- `limit: 0` -- so actually
// generating a photo would require enabling billing; searching for an
// already-existing one sidesteps that entirely, and it's what was asked
// for anyway.)
const OPENVERSE_SEARCH_URL = 'https://api.openverse.org/v1/images/';

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

  return { text, imageUrl: extractImageUrlFromHtml(html, url) };
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

  // This proxy renders the page and returns clean Markdown rather than raw
  // HTML, so there's no <meta>/JSON-LD to read -- but it keeps real image
  // links as Markdown `![alt](url)` syntax, which is enough to still find
  // the article's own photo.
  return { text, imageUrl: extractImageUrlFromMarkdown(text, url) };
}

async function fetchPageContent(url) {
  let lastError;

  try {
    const { text, imageUrl } = await fetchDirect(url);
    return { text: text.slice(0, MAX_PAGE_TEXT_LENGTH), imageUrl };
  } catch (error) {
    lastError = error;
  }

  try {
    const { text, imageUrl } = await fetchViaReaderProxy(url);
    return { text: text.slice(0, MAX_PAGE_TEXT_LENGTH), imageUrl };
  } catch (error) {
    throw new Error(
      `Could not read that page. It may be blocking automated access, or the link may be incorrect. (${lastError.message})`
    );
  }
}

function resolveUrl(maybeUrl, baseUrl) {
  if (!maybeUrl || typeof maybeUrl !== 'string') return null;
  try {
    return new URL(maybeUrl.trim(), baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Best-effort extraction of the "hero" photo a recipe website already has
 * for its own dish -- far more reliable to reuse than generating a new one,
 * and it's literally the photo of the food the author actually made.
 *
 * Tries, in order of reliability for recipe pages specifically:
 *  1. Schema.org Recipe structured data (a JSON-LD `<script>` block with
 *     "@type": "Recipe") -- its `image` field is the dish photo itself,
 *     not a logo or unrelated banner image.
 *  2. The Open Graph `og:image` meta tag.
 *  3. The `twitter:image` meta tag.
 * Returns an absolute URL, or `null` if nothing usable was found. Only
 * usable when raw HTML is available (the direct-fetch path, not the
 * reader-proxy fallback -- see extractImageUrlFromMarkdown for that case).
 */
function extractImageUrlFromHtml(html, baseUrl) {
  const resolve = (maybeUrl) => resolveUrl(maybeUrl, baseUrl);

  const jsonLdBlocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const block of jsonLdBlocks) {
    let parsed;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      continue; // Malformed JSON-LD is common enough in the wild; skip it.
    }
    const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(parsed?.['@graph'] || [])];
    for (const node of nodes) {
      const types = [].concat(node?.['@type'] || []);
      if (!types.some((t) => String(t).toLowerCase() === 'recipe')) continue;

      const image = node.image;
      const imageValue = Array.isArray(image) ? image[0] : image?.url ?? image;
      const resolved = resolve(imageValue);
      if (resolved) return resolved;
    }
  }

  const ogMatch =
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i.exec(
      html
    ) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url)?["']/i.exec(
      html
    );
  if (ogMatch) return resolve(ogMatch[1]);

  const twitterMatch = /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (twitterMatch) return resolve(twitterMatch[1]);

  return null;
}

// Filenames/URLs/alt-text matching this are almost always site chrome (logos,
// icons, tracking pixels, ads) rather than an actual photo of the dish.
const NON_PHOTO_IMAGE_PATTERN = /logo|icon|avatar|sprite|pixel|placeholder|spinner|badge/i;

/**
 * Same goal as extractImageUrlFromHtml, but for when only rendered Markdown
 * is available (the r.jina.ai reader-proxy fallback, used whenever a direct
 * fetch is CORS-blocked -- the common case for a web build calling most
 * recipe sites). The reader keeps real photos as Markdown image syntax
 * (`![alt](url)`), so pick the first one that looks like an actual content
 * photo rather than a lazy-load placeholder or site chrome.
 */
function extractImageUrlFromMarkdown(markdown, baseUrl) {
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)) {
    const [, alt, rawUrl] = match;
    if (/^(blob|data):/i.test(rawUrl)) continue; // Lazy-load placeholders.
    if (/\.svg(\?|$)/i.test(rawUrl)) continue; // Icons, not photos.
    if (NON_PHOTO_IMAGE_PATTERN.test(alt) || NON_PHOTO_IMAGE_PATTERN.test(rawUrl)) continue;

    const resolved = resolveUrl(rawUrl, baseUrl);
    if (resolved) return resolved;
  }
  return null;
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

  let sourceText = trimmedInput;
  let imageUri = null;

  if (isUrl) {
    const { text, imageUrl } = await fetchPageContent(trimmedInput);
    sourceText = text;
    imageUri = imageUrl;
  }

  if (!sourceText) {
    throw new Error('Please paste some recipe text or a valid URL.');
  }

  const promptText = isUrl
    ? `Extract the recipe from the following webpage text (scraped from ${trimmedInput}):\n\n${sourceText}`
    : `Extract the recipe from the following text:\n\n${sourceText}`;

  const recipe = await callGemini(promptText);

  // Prefer the website's own photo of the dish; only fall back to a search
  // if the page didn't have a usable image.
  if (!imageUri) {
    imageUri = await findFoodPhotoOnline(recipe);
  }

  return { ...recipe, imageUri };
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

// Titles/URLs/descriptions containing these words are essentially never an
// appetizing, presentable photo of a finished dish (stock "food porn" sites
// get scraped into Openverse's index too, alongside unrelated illustrations,
// menus, and clip art) -- skip them rather than attaching something odd.
const NON_FOOD_PHOTO_HINT_PATTERN = /clip ?art|illustration|menu|logo|icon|drawing|cartoon/i;

// Words to strip out of a recipe title before using it as a search query --
// both generic filler ("a", "with") and, importantly, the kind of marketing/
// personalizing fluff that's extremely common in recipe titles but will
// essentially *never* appear in a stock photo's own caption or tags
// ("Grandma's", "Copycat", "Air Fryer", "Sheet Pan", "Instant Pot"...).
// Openverse's search treats a multi-word query as an AND across every word,
// so leaving these in very often wiped out results entirely for what is
// otherwise a perfectly ordinary, well-photographed dish -- e.g. "Grandma's
// Sunday Pot Roast" returned nothing, but "roast" alone returned plenty.
const TITLE_STOP_WORDS = new Set([
  'a', 'an', 'the', 'with', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'my', 'your', 'our',
  'food', 'dish', 'recipe', 'meal',
  'breakfast', 'lunch', 'dinner', 'snacks', 'snack', 'dessert',
  'grandmas', 'grandma', 'grandpas', 'grandpa', 'moms', 'mom', 'dads', 'dad',
  'famous', 'homemade', 'copycat', 'easy', 'quick', 'best', 'classic', 'simple',
  'ultimate', 'perfect', 'favorite', 'favourite', 'amazing', 'delicious',
  'air', 'fryer', 'instant', 'pot', 'sheet', 'pan', 'one', 'slow', 'cooker', 'crockpot',
  'crock', 'oven', 'stovetop', 'skillet',
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  'night', 'weeknight',
]);

function titleKeywords(title) {
  return (title || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !TITLE_STOP_WORDS.has(word));
}

async function searchOpenverse(query) {
  const searchUrl = `${OPENVERSE_SEARCH_URL}?${new URLSearchParams({
    q: query,
    page_size: '10',
    mature: 'false',
  })}`;
  // `cache: 'no-store'` -- a GET request to the exact same query string
  // (which happens every time someone re-searches the same recipe, e.g.
  // after removing a bad photo and trying again) would otherwise risk being
  // served straight from the browser's HTTP cache instead of hitting
  // Openverse again, silently repeating whatever result came back the
  // first time.
  const response = await fetch(searchUrl, { cache: 'no-store' });
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return data?.results ?? [];
}

/**
 * Best-effort: searches the open web for an existing, openly-licensed photo
 * that matches the recipe (by title + category), for recipes that don't
 * have a real photo of their own yet -- a scanned handwritten card, a PDF
 * import, a manually-typed recipe with no photo attached, or a website
 * import whose page had no image of its own -- instead of leaving a plain
 * placeholder (and, for the "Scan Handwritten Recipe" flow, instead of using
 * the photo of the paper itself, which is what the camera capture is
 * actually a picture of).
 *
 * Uses Openverse, a free/keyless search engine over Creative-Commons-
 * licensed photos, rather than generating a new image -- Gemini's own image
 * models turned out to require paid billing (their free tier's image-
 * generation quota is zero), and pulling in an existing real photo is what
 * was actually wanted anyway.
 *
 * Returns an image URL (left as an external link, same as a website's own
 * photo -- see recipeImages.js), or `null` if nothing relevant was found or
 * the search failed for any reason. Never throws: a missing "nice to have"
 * photo should never block saving the actual recipe.
 *
 * `excludeUrls` (optional) skips any candidate whose URL is already in that
 * list -- otherwise, since the search is entirely deterministic for a given
 * title, re-running "Find Photo Online" after disliking the result would
 * always hand back that exact same photo again. Passing in whatever's been
 * shown so far lets the caller offer a genuinely different pick each time.
 */
export async function findFoodPhotoOnline(recipe, { excludeUrls = [] } = {}) {
  try {
    const excluded = new Set(excludeUrls);
    const title = (recipe?.title || '').trim();
    if (!title || title.toLowerCase() === 'untitled recipe') return null;

    const keywords = titleKeywords(title);
    if (keywords.length === 0) return null; // Nothing distinctive left to search for.

    // Try the full filtered keyword set first (most specific/accurate
    // match), then progressively drop words from the front and retry --
    // recipe titles tend to put the actual dish noun at the end (e.g.
    // "...Pot Roast", "...Chicken Wings"), so narrowing this way usually
    // lands on the part that's actually going to be photographed.
    //
    // Crucially, a query returning *some* result isn't good enough on its
    // own: Openverse's AND-style search occasionally matches every query
    // word purely by coincidence in some totally unrelated photo's caption/
    // tags (e.g. "Bear Chocolate Chip Cookies" matched exactly one result
    // that turned out to be an unrelated photo of a person -- none of
    // "bear", "chocolate", "chip", or "cookies" actually described it, they
    // just all happened to appear somewhere in its tags). So each attempt
    // is only accepted if the best-scoring candidate's own title actually
    // contains at least one of the recipe's keywords; otherwise, keep
    // narrowing rather than trusting a coincidental match.
    for (let start = 0; start < keywords.length; start++) {
      const queryWords = keywords.slice(start);
      const results = await searchOpenverse(`${queryWords.join(' ')} food`);
      if (results.length === 0) continue;

      const candidates = results.filter((result) => {
        if (typeof result?.url !== 'string' || !result.url) return false;
        if (excluded.has(result.url)) return false;
        const haystack = `${result.title || ''} ${result.url}`;
        return !NON_FOOD_PHOTO_HINT_PATTERN.test(haystack);
      });
      if (candidates.length === 0) continue;

      // Rank by how many of the *full* recipe title's keywords (not just
      // this attempt's narrowed-down subset) show up in each candidate's
      // title -- a photo captioned "Fillet of salmon with asparagus" should
      // outrank one merely captioned "Asparagus" even once we've narrowed
      // the query itself down to just "asparagus".
      const scored = candidates.map((result, index) => {
        const resultTitle = (result.title || '').toLowerCase();
        const score = keywords.filter((word) => resultTitle.includes(word)).length;
        return { result, score, index };
      });
      scored.sort((a, b) => b.score - a.score || a.index - b.index);

      if (scored[0].score > 0) return scored[0].result.url;
    }

    return null;
  } catch (error) {
    console.warn('Failed to find a food photo online:', error.message);
    return null;
  }
}
