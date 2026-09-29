import { supabase } from '../utils/supabase';
import { formatQuantity, parseLeadingQuantity } from '../utils/servingScaler';

// Same rationale as useRecipeStore.js: Postgres text columns reject the
// literal NUL byte outright, and AI-parsed ingredient text (from scanned
// recipes, PDFs, or scraped web pages) can occasionally carry one in from
// garbled source data. Strip control characters before anything reaches
// Supabase so one bad character can't fail an insert.
function sanitizeText(value) {
  if (typeof value !== 'string') return value;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

// Recognized unit words, mapped to a canonical singular form. Used both to
// pull a unit out of a raw recipe line ("2 cups flour" -> amount "2 cups",
// name "flour") and to decide whether two amounts are safe to add together
// ("2 cups" + "1 cup" -> same canonical unit "cup" -> mergeable).
const UNIT_ALIASES = {
  cup: 'cup', cups: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbsps: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tsps: 'tsp',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  gram: 'g', grams: 'g', g: 'g',
  kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', ml: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l',
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
  clove: 'clove', cloves: 'clove',
  can: 'can', cans: 'can',
  jar: 'jar', jars: 'jar',
  package: 'pkg', packages: 'pkg', pkg: 'pkg', pkgs: 'pkg',
  slice: 'slice', slices: 'slice',
  stick: 'stick', sticks: 'stick',
  bunch: 'bunch', bunches: 'bunch',
  head: 'head', heads: 'head',
  quart: 'qt', quarts: 'qt', qt: 'qt',
  pint: 'pt', pints: 'pt', pt: 'pt',
  gallon: 'gal', gallons: 'gal', gal: 'gal',
};

/**
 * Splits a raw recipe ingredient line like "2 cups flour" or "3 large eggs"
 * into a separate { amount, ingredient } pair, e.g. { amount: "2 cups",
 * ingredient: "flour" } -- the same shape the manual "Add an item" row on
 * the Grocery screen already produces. Splitting recipe-imported lines this
 * way, instead of dumping the whole string into the `ingredient` column, is
 * what lets two different recipes that both need "flour" be recognized as
 * the same grocery item so their amounts can stack (see mergeAmounts below).
 */
function splitIngredientLine(text) {
  const trimmed = (text || '').trim();
  const parsed = parseLeadingQuantity(trimmed);
  if (!parsed) {
    return { ingredient: trimmed, amount: '' };
  }

  const remainder = parsed.remainder.trim();
  const [firstWord, ...rest] = remainder.split(/\s+/);
  const canonicalUnit = firstWord ? UNIT_ALIASES[firstWord.toLowerCase()] : undefined;

  if (canonicalUnit && rest.length > 0) {
    return {
      ingredient: rest.join(' '),
      amount: `${formatQuantity(parsed.value)} ${firstWord}`,
    };
  }

  // No recognized unit word (e.g. "3 large eggs") -- keep the whole
  // remainder as the ingredient name and just the number as the amount.
  return {
    ingredient: remainder || trimmed,
    amount: formatQuantity(parsed.value),
  };
}

function normalizeIngredientName(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,]+$/, '');
}

/**
 * Parses an amount string ("2 cups", "3", "1 gallon") into { value, unit }
 * for merging purposes. Returns null if it has no parseable leading
 * quantity, or if there's trailing text after the number that isn't a
 * recognized unit -- in both cases we refuse to guess and let the caller
 * keep the amounts as separate lines instead of fabricating a total.
 */
function parseAmountForMerge(trimmedAmount) {
  const parsed = parseLeadingQuantity(trimmedAmount);
  if (!parsed) return null;

  const remainder = parsed.remainder.trim();
  if (!remainder) return { value: parsed.value, unit: '' };

  const canonicalUnit = UNIT_ALIASES[remainder.toLowerCase()];
  if (!canonicalUnit) return null;

  return { value: parsed.value, unit: canonicalUnit };
}

/**
 * Tries to combine two amounts for the *same* ingredient name into one
 * (e.g. "2 cups" + "1 cup" -> "3 cups"). Returns null when they can't be
 * safely combined (different/unrecognized units, non-numeric amounts like
 * "to taste", etc.), so the caller falls back to keeping them as two
 * separate lines rather than silently dropping or fabricating a quantity.
 */
function mergeAmounts(existingAmount, incomingAmount) {
  const existingTrimmed = (existingAmount || '').trim();
  const incomingTrimmed = (incomingAmount || '').trim();

  if (!existingTrimmed && !incomingTrimmed) return '';
  if (!existingTrimmed) return incomingTrimmed;
  if (!incomingTrimmed) return existingTrimmed;

  const a = parseAmountForMerge(existingTrimmed);
  const b = parseAmountForMerge(incomingTrimmed);
  if (!a || !b || a.unit !== b.unit) return null;

  const summed = formatQuantity(a.value + b.value);
  return a.unit ? `${summed} ${a.unit}` : summed;
}

function rowToItem(row, wasMerged = false) {
  return {
    id: row.id,
    ingredient: row.ingredient,
    amount: row.amount ?? '',
    isCompleted: row.is_completed,
    createdAt: row.created_at,
    wasMerged,
  };
}

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('You must be signed in to manage your grocery list.');
  }
  return user.id;
}

/** Loads the signed-in user's grocery list, oldest first. */
export async function fetchGroceryItems() {
  const { data, error } = await supabase
    .from('grocery_items')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => rowToItem(row));
}

/**
 * Inserts { ingredient, amount } lines for a user, combining any line whose
 * ingredient name matches an existing *uncompleted* item into that item's
 * amount instead of creating a duplicate row -- this is what makes
 * overlapping ingredients from multiple recipes (or a second manual add)
 * stack ("2 cups flour" + "1 cup flour" -> one row, "3 cups flour") instead
 * of showing up as separate lines. Completed items are left alone: if
 * you've already bought and checked off flour, a newly-needed batch of
 * flour should show up as a fresh, unchecked line, not reopen the old one.
 */
async function upsertGroceryLines(userId, lines) {
  if (lines.length === 0) return [];

  const { data: existingRows, error: fetchError } = await supabase
    .from('grocery_items')
    .select('*')
    .eq('user_id', userId)
    .eq('is_completed', false);
  if (fetchError) throw fetchError;

  const existingByName = new Map();
  for (const row of existingRows ?? []) {
    existingByName.set(normalizeIngredientName(row.ingredient), row);
  }

  const updatesById = new Map(); // id -> next amount
  const inserts = []; // rows to insert
  const pendingByName = new Map(); // name -> row object already queued in `inserts`

  for (const line of lines) {
    const key = normalizeIngredientName(line.ingredient);
    if (!key) continue;

    const existing = existingByName.get(key);
    if (existing) {
      const merged = mergeAmounts(existing.amount, line.amount);
      if (merged !== null) {
        existing.amount = merged;
        updatesById.set(existing.id, merged || null);
        continue;
      }
      // Couldn't safely combine (e.g. mismatched units) -- fall through and
      // add this as its own line rather than losing either quantity.
    }

    const pending = pendingByName.get(key);
    if (pending) {
      const merged = mergeAmounts(pending.amount, line.amount);
      if (merged !== null) {
        pending.amount = merged || null;
        continue;
      }
    }

    const newRow = {
      user_id: userId,
      ingredient: line.ingredient,
      amount: line.amount || null,
    };
    inserts.push(newRow);
    pendingByName.set(key, newRow);
  }

  const updatedItems = [];
  for (const [id, amount] of updatesById) {
    const { data, error } = await supabase
      .from('grocery_items')
      .update({ amount })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    updatedItems.push(rowToItem(data, true));
  }

  let insertedItems = [];
  if (inserts.length > 0) {
    const { data, error } = await supabase.from('grocery_items').insert(inserts).select();
    if (error) throw error;
    insertedItems = (data ?? []).map((row) => rowToItem(row, false));
  }

  return [...updatedItems, ...insertedItems];
}

/**
 * Adds a single custom item (e.g. from the "Add item" box on the Grocery
 * screen). If an uncompleted item with the same name already exists, its
 * amount is combined with this one instead of creating a duplicate row.
 */
export async function addGroceryItem({ ingredient, amount = '' }) {
  const cleanIngredient = sanitizeText(ingredient);
  if (!cleanIngredient) {
    throw new Error('Please enter an item name.');
  }

  const userId = await getCurrentUserId();
  const [result] = await upsertGroceryLines(userId, [
    { ingredient: cleanIngredient, amount: sanitizeText(amount) },
  ]);
  return result;
}

/**
 * Bulk-adds a recipe's ingredients to the grocery list. Accepts either plain
 * strings (e.g. "2 cups flour", the shape recipes store ingredients in -- if
 * you're scaling servings, pass the already-scaled strings in) or
 * { ingredient, amount } objects. Ingredients that match an existing
 * uncompleted grocery item have their amounts combined instead of creating
 * duplicate rows (see upsertGroceryLines).
 */
export async function addGroceryItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const userId = await getCurrentUserId();

  const lines = items
    .map((item) => (typeof item === 'string' ? splitIngredientLine(item) : item))
    .map(({ ingredient, amount }) => ({
      ingredient: sanitizeText(ingredient),
      amount: sanitizeText(amount),
    }))
    .filter((row) => row.ingredient);

  return upsertGroceryLines(userId, lines);
}

/** Flips an item's checked/unchecked (is_completed) state. */
export async function toggleGroceryItem(id, isCompleted) {
  const { error } = await supabase
    .from('grocery_items')
    .update({ is_completed: isCompleted })
    .eq('id', id);

  if (error) throw error;
}

/** Deletes a single grocery item. */
export async function deleteGroceryItem(id) {
  const { error } = await supabase.from('grocery_items').delete().eq('id', id);
  if (error) throw error;
}

/** Deletes every checked-off item for the signed-in user (the "Clear Completed" button). */
export async function clearCompletedGroceryItems() {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from('grocery_items')
    .delete()
    .eq('user_id', userId)
    .eq('is_completed', true);

  if (error) throw error;
}
