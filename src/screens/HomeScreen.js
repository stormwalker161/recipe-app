import React, { useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import RecipeCard from '../components/RecipeCard';
import {
  CATEGORIES,
  selectRecipesByCategory,
  selectSortedRecipes,
  useRecipeStore,
} from '../store/useRecipeStore';
import { useThemeColors } from '../theme/ThemeContext';
import { supabase } from '../utils/supabase';

const FILTERS = ['All', ...CATEGORIES];

export default function HomeScreen({ navigation }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Grocery')}
            style={styles.headerIconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.headerIcon}>🛒</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('MealPlanner')}
            style={styles.headerIconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.headerIcon}>📅</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.headerIconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.headerIcon}>🎨</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => supabase.auth.signOut()}
            style={styles.headerLogoutButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.headerLogoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, styles]);

  // selectSortedRecipes/selectRecipesByCategory build a fresh sorted array on every
  // call, so they must be wrapped in useShallow -- otherwise React's external store
  // sync sees a "new" value on every render and loops infinitely.
  const categoryRecipes = useRecipeStore(
    useShallow(
      selectedCategory === 'All' ? selectSortedRecipes : selectRecipesByCategory(selectedCategory)
    )
  );

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const recipes = trimmedQuery
    ? categoryRecipes.filter((recipe) => recipe.title.toLowerCase().includes(trimmedQuery))
    : categoryRecipes;

  const handleAddPress = () => {
    navigation.navigate('AddRecipe');
  };

  const renderChip = ({ item }) => {
    const isActive = item === selectedCategory;
    return (
      <TouchableOpacity
        style={[styles.chip, isActive && styles.chipActive]}
        onPress={() => setSelectedCategory(item)}
        activeOpacity={0.7}
      >
        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{item}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.searchWrapper}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes…"
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item}
        renderItem={renderChip}
        style={styles.chipRow}
        contentContainerStyle={styles.chipList}
      />

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            onPress={() => navigation.navigate('RecipeDetail', { id: item.id })}
          />
        )}
        contentContainerStyle={styles.recipeList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {trimmedQuery ? 'No recipes match your search.' : 'No recipes in this category yet.'}
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handleAddPress} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    searchWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    searchIcon: {
      fontSize: 15,
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.textPrimary,
      padding: 0,
    },
    searchClear: {
      fontSize: 14,
      color: colors.textMuted,
      paddingHorizontal: 4,
    },
    chipRow: {
      flexGrow: 0,
    },
    chipList: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8,
    },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    chipTextActive: {
      color: colors.textOnPrimary,
    },
    recipeList: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 100,
    },
    emptyState: {
      alignItems: 'center',
      marginTop: 60,
    },
    emptyText: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 28,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 6,
    },
    fabIcon: {
      fontSize: 30,
      color: colors.textOnPrimary,
      lineHeight: 32,
      fontWeight: '400',
    },
    headerButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    headerIconButton: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    headerIcon: {
      fontSize: 20,
    },
    headerLogoutButton: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    headerLogoutText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.primary,
    },
  });
}
