import { supabase } from '../utils/supabase';

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

function rowToItem(row) {
  return {
    id: row.id,
    ingredient: row.ingredient,
    amount: row.amount ?? '',
    isCompleted: row.is_completed,
    createdAt: row.created_at,
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
  return (data ?? []).map(rowToItem);
}

/** Adds a single custom item (e.g. from the "Add item" box on the Grocery screen). */
export async function addGroceryItem({ ingredient, amount = '' }) {
  const cleanIngredient = sanitizeText(ingredient);
  if (!cleanIngredient) {
    throw new Error('Please enter an item name.');
  }

  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('grocery_items')
    .insert({
      user_id: userId,
      ingredient: cleanIngredient,
      amount: sanitizeText(amount) || null,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToItem(data);
}

/**
 * Bulk-adds a recipe's ingredients to the grocery list. Accepts either plain
 * strings (e.g. "2 cups flour", the shape recipes store ingredients in) or
 * { ingredient, amount } objects.
 */
export async function addGroceryItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const userId = await getCurrentUserId();

  const rows = items
    .map((item) => (typeof item === 'string' ? { ingredient: item, amount: '' } : item))
    .map(({ ingredient, amount }) => ({
      user_id: userId,
      ingredient: sanitizeText(ingredient),
      amount: sanitizeText(amount) || null,
    }))
    .filter((row) => row.ingredient);

  if (rows.length === 0) return [];

  const { data, error } = await supabase.from('grocery_items').insert(rows).select();
  if (error) throw error;
  return (data ?? []).map(rowToItem);
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
