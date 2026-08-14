import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Dessert'];

const mockRecipes = [
  {
    id: 'mock-1',
    title: 'Spaghetti Carbonara',
    category: 'Dinner',
    prepTime: '25 min',
    imageUri: null,
    ingredients: ['Spaghetti', 'Eggs', 'Pancetta', 'Parmesan', 'Black pepper'],
    instructions: [
      'Cook spaghetti until al dente.',
      'Fry pancetta until crisp.',
      'Whisk eggs and parmesan together.',
      'Combine pasta, pancetta, and egg mixture off the heat.',
    ],
    createdAt: '2026-08-10T09:00:00.000Z',
  },
  {
    id: 'mock-2',
    title: 'Avocado Toast',
    category: 'Breakfast',
    prepTime: '10 min',
    imageUri: null,
    ingredients: ['Sourdough bread', 'Avocado', 'Lemon juice', 'Chili flakes', 'Salt'],
    instructions: [
      'Toast the bread.',
      'Mash avocado with lemon juice and salt.',
      'Spread on toast and top with chili flakes.',
    ],
    createdAt: '2026-08-11T09:00:00.000Z',
  },
  {
    id: 'mock-3',
    title: 'Chocolate Chip Cookies',
    category: 'Dessert',
    prepTime: '35 min',
    imageUri: null,
    ingredients: ['Flour', 'Butter', 'Brown sugar', 'Chocolate chips', 'Eggs'],
    instructions: [
      'Cream butter and sugar together.',
      'Mix in eggs, then fold in flour and chocolate chips.',
      'Bake at 350°F (175°C) for 10-12 minutes.',
    ],
    createdAt: '2026-08-12T09:00:00.000Z',
  },
];

// Persisted to AsyncStorage so recipes survive force-closing/reopening the
// app -- without this, Zustand state only lives in memory for the life of
// the JS process, and every relaunch would reset back to the seed mock data.
export const useRecipeStore = create(
  persist(
    (set) => ({
      recipes: mockRecipes,

      addRecipe: (recipe) =>
        set((state) => ({
          recipes: [
            ...state.recipes,
            {
              id: recipe.id ?? Date.now().toString(),
              createdAt: recipe.createdAt ?? new Date().toISOString(),
              ...recipe,
            },
          ],
        })),

      deleteRecipe: (id) =>
        set((state) => ({
          recipes: state.recipes.filter((recipe) => recipe.id !== id),
        })),

      updateRecipe: (id, updates) =>
        set((state) => ({
          recipes: state.recipes.map((recipe) =>
            recipe.id === id ? { ...recipe, ...updates } : recipe
          ),
        })),
    }),
    {
      name: 'recipe-app-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the recipes themselves need to survive a restart -- actions are
      // functions and get re-created fresh from the store definition above
      // every launch, so persisting them would be wasted/invalid storage.
      partialize: (state) => ({ recipes: state.recipes }),
    }
  )
);

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
