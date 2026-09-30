import { supabase } from '../utils/supabase';

/** The 7 valid values for `meal_plan.day_of_week` (also enforced by a DB check constraint). */
export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

// What `meal_plan.meal_type` defaults to when the caller doesn't specify one
// -- matches the DB column default, kept here too so the UI and the DB stay
// in sync without either one having to import the other's source file.
export const DEFAULT_MEAL_TYPE = 'Dinner';

// Columns pulled from the *embedded* recipe row via the recipe_id foreign
// key -- just enough for the Meal Planner screen to show a thumbnail/title
// without a second round-trip per entry.
const RECIPE_COLUMNS = 'id, title, category, image_uri, prep_time';

function rowToEntry(row) {
  const recipe = row.recipes;
  return {
    id: row.id,
    recipeId: row.recipe_id,
    dayOfWeek: row.day_of_week,
    mealType: row.meal_type,
    createdAt: row.created_at,
    recipe: recipe
      ? {
          id: recipe.id,
          title: recipe.title,
          category: recipe.category,
          imageUri: recipe.image_uri ?? null,
          prepTime: recipe.prep_time ?? '',
        }
      : null,
  };
}

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('You must be signed in to manage your meal plan.');
  }
  return user.id;
}

/**
 * Loads every meal-plan entry for the signed-in user, each with its
 * recipe's title/photo/etc. embedded (via the recipe_id foreign key) so the
 * Meal Planner screen can render straight from this one call.
 *
 * Note: if a recipe was deleted after being scheduled, `recipe_id`'s
 * `on delete cascade` means the meal-plan entry itself is removed too --
 * `entry.recipe` should never actually come back null in practice, but the
 * mapping above stays defensive about it just in case.
 */
export async function fetchMealPlan() {
  const { data, error } = await supabase
    .from('meal_plan')
    .select(`*, recipes (${RECIPE_COLUMNS})`)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(rowToEntry);
}

/**
 * Schedules a recipe for a given day of the week (and optionally a meal
 * type -- defaults to "Dinner"). Multiple recipes can be scheduled for the
 * same day/meal slot; this doesn't replace an existing entry, it adds
 * another one alongside it.
 */
export async function addMealPlanEntry({ recipeId, dayOfWeek, mealType = DEFAULT_MEAL_TYPE }) {
  if (!recipeId) {
    throw new Error('Please choose a recipe.');
  }
  if (!DAYS_OF_WEEK.includes(dayOfWeek)) {
    throw new Error('Please choose a valid day of the week.');
  }

  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('meal_plan')
    .insert({
      user_id: userId,
      recipe_id: recipeId,
      day_of_week: dayOfWeek,
      meal_type: mealType || DEFAULT_MEAL_TYPE,
    })
    .select(`*, recipes (${RECIPE_COLUMNS})`)
    .single();

  if (error) throw error;
  return rowToEntry(data);
}

/** Removes a single scheduled entry (the "Remove" link on the Meal Planner screen). */
export async function removeMealPlanEntry(id) {
  const { error } = await supabase.from('meal_plan').delete().eq('id', id);
  if (error) throw error;
}
