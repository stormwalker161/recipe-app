import { create } from 'zustand';
import { supabase } from '../utils/supabase';

export const CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Dessert'];

// The `recipes` table uses snake_case columns; the rest of the app works
// with the camelCase shape it always has, so translate at the store boundary
// instead of leaking Postgres column names into every screen.
function rowToRecipe(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    prepTime: row.prep_time ?? '',
    imageUri: row.image_uri ?? null,
    ingredients: row.ingredients ?? [],
    instructions: row.instructions ?? [],
    createdAt: row.created_at,
  };
}

// Postgres text/jsonb columns reject the literal NUL byte outright (insert
// fails with "unsupported Unicode escape sequence"), and OCR output from the
// "Scan Handwritten Recipe" flow occasionally slips one in from garbled scan
// artifacts. Strip control characters everywhere before they ever reach
// Supabase so a single bad character can't silently kill the whole insert.
function sanitizeText(value) {
  if (typeof value !== 'string') return value;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

function sanitizeList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeText).filter(Boolean);
}

function recipeToRow(recipe, userId) {
  return {
    user_id: userId,
    title: sanitizeText(recipe.title),
    category: recipe.category,
    prep_time: sanitizeText(recipe.prepTime) ?? '',
    image_uri: recipe.imageUri ?? null,
    ingredients: sanitizeList(recipe.ingredients),
    instructions: sanitizeList(recipe.instructions),
  };
}

// Recipes now live in Supabase (scoped to the signed-in user via row-level
// security), not local-only storage -- this is what makes them show up the
// same way on every device you log into instead of being stuck on whichever
// device/browser first created them.
export const useRecipeStore = create((set, get) => ({
  recipes: [],
  isLoading: false,
  error: null,

  /** Loads the current user's recipes from Supabase. Call after sign-in. */
  fetchRecipes: async () => {
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      set({ isLoading: false, error: error.message });
      return;
    }

    set({ recipes: (data ?? []).map(rowToRecipe), isLoading: false });
  },

  /** Clears local state. Call on sign-out so the next login starts fresh. */
  clearRecipes: () => set({ recipes: [], error: null }),

  addRecipe: async (recipe) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.warn('Cannot add a recipe while signed out.');
      return;
    }

    // The `recipes.id` column is text with no default, so an id must always
    // be supplied on insert -- generate it client-side up front and reuse it
    // for both the optimistic local entry and the actual row, rather than
    // relying on a server-assigned id that was never going to exist.
    const id = recipe.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = recipe.createdAt ?? new Date().toISOString();
    const cleanRecipe = {
      ...recipe,
      title: sanitizeText(recipe.title),
      prepTime: sanitizeText(recipe.prepTime),
      ingredients: sanitizeList(recipe.ingredients),
      instructions: sanitizeList(recipe.instructions),
    };

    set((state) => ({
      recipes: [...state.recipes, { ...cleanRecipe, id, createdAt }],
    }));

    const { error } = await supabase
      .from('recipes')
      .insert({ id, ...recipeToRow(cleanRecipe, user.id) });

    if (error) {
      console.warn('Failed to save recipe to Supabase:', error.message);
      set((state) => ({
        recipes: state.recipes.filter((item) => item.id !== id),
        error: error.message,
      }));
      throw error;
    }
  },

  deleteRecipe: async (id) => {
    const previousRecipes = get().recipes;
    set((state) => ({ recipes: state.recipes.filter((recipe) => recipe.id !== id) }));

    const { error } = await supabase.from('recipes').delete().eq('id', id);
    if (error) {
      console.warn('Failed to delete recipe from Supabase:', error.message);
      set({ recipes: previousRecipes, error: error.message });
    }
  },

  updateRecipe: async (id, updates) => {
    const previousRecipes = get().recipes;
    set((state) => ({
      recipes: state.recipes.map((recipe) => (recipe.id === id ? { ...recipe, ...updates } : recipe)),
    }));

    const row = {};
    if (updates.title !== undefined) row.title = sanitizeText(updates.title);
    if (updates.category !== undefined) row.category = updates.category;
    if (updates.prepTime !== undefined) row.prep_time = sanitizeText(updates.prepTime);
    if (updates.imageUri !== undefined) row.image_uri = updates.imageUri;
    if (updates.ingredients !== undefined) row.ingredients = sanitizeList(updates.ingredients);
    if (updates.instructions !== undefined) row.instructions = sanitizeList(updates.instructions);

    const { error } = await supabase.from('recipes').update(row).eq('id', id);
    if (error) {
      console.warn('Failed to update recipe in Supabase:', error.message);
      set({ recipes: previousRecipes, error: error.message });
    }
  },
}));

/**
 * Selector factory: returns a single recipe by id, or undefined if it no
 * longer exists (e.g. it was just deleted).
 */
export const selectRecipeById = (id) => (state) =>
  state.recipes.find((recipe) => recipe.id === id);

/**
 * Selector: returns all recipes sorted alphabetically (A-Z) by title.
 * This is the default way recipe data should be read by the UI, e.g.
 *   const recipes = useRecipeStore(selectSortedRecipes);
 */
export const selectSortedRecipes = (state) =>
  [...state.recipes].sort((a, b) => a.title.localeCompare(b.title));

/**
 * Selector factory: returns the alphabetically sorted list filtered down
 * to an exact category match, e.g.
 *   const breakfastRecipes = useRecipeStore(selectRecipesByCategory('Breakfast'));
 */
export const selectRecipesByCategory = (category) => (state) =>
  selectSortedRecipes(state).filter((recipe) => recipe.category === category);
