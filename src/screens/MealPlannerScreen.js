import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DAYS_OF_WEEK,
  fetchMealPlan,
  formatWeekLabel,
  getWeekStartDate,
  removeMealPlanEntry,
} from '../services/mealPlanner';
import { useThemeColors } from '../theme/ThemeContext';

const BANNER_DURATION_MS = 4000;

export default function MealPlannerScreen({ navigation }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // 0 = this week, 1 = next week, -1 = last week, etc. -- lets the whole
  // screen page back and forth between weeks instead of only ever showing
  // one merged view of "Monday" regardless of which week it's in.
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStartDate = useMemo(() => getWeekStartDate(weekOffset), [weekOffset]);
  const weekLabel = useMemo(
    () => formatWeekLabel(weekStartDate, weekOffset),
    [weekStartDate, weekOffset]
  );

  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [banner, setBanner] = useState(null);
  const bannerTimeoutRef = useRef(null);

  const showBanner = (type, message) => {
    clearTimeout(bannerTimeoutRef.current);
    setBanner({ type, message });
    bannerTimeoutRef.current = setTimeout(() => setBanner(null), BANNER_DURATION_MS);
  };

  // Same pattern as GroceryScreen: refetch on every focus, since entries are
  // most often added from a recipe's "Plan for a Meal" button on a
  // different screen, and guard against updating state after navigating
  // away before the fetch resolves. `weekStartDate` is also in the deps
  // list so tapping the ‹ / › week arrows (which stay on this screen, never
  // blurring it) still triggers a fresh fetch for the newly-selected week.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      setIsLoading(true);
      fetchMealPlan(weekStartDate)
        .then((data) => {
          if (isActive) setEntries(data);
        })
        .catch((error) => {
          if (isActive) showBanner('error', error?.message || 'Could not load your meal plan.');
        })
        .finally(() => {
          if (isActive) setIsLoading(false);
        });

      return () => {
        isActive = false;
      };
    }, [weekStartDate])
  );

  const entriesByDay = useMemo(() => {
    const grouped = new Map(DAYS_OF_WEEK.map((day) => [day, []]));
    for (const entry of entries) {
      grouped.get(entry.dayOfWeek)?.push(entry);
    }
    return grouped;
  }, [entries]);

  const handleRemove = async (entry) => {
    const previousEntries = entries;
    setEntries((current) => current.filter((item) => item.id !== entry.id));

    try {
      await removeMealPlanEntry(entry.id);
    } catch (error) {
      setEntries(previousEntries);
      showBanner('error', error.message || 'Could not remove that meal.');
    }
  };

  const handleView = (entry) => {
    if (!entry.recipe) return;
    navigation.navigate('RecipeDetail', { id: entry.recipe.id });
  };

  const renderEntry = (entry) => (
    <View key={entry.id} style={styles.entryRow}>
      <TouchableOpacity
        style={styles.entryTouchable}
        activeOpacity={0.7}
        onPress={() => handleView(entry)}
        disabled={!entry.recipe}
      >
        {entry.recipe?.imageUri ? (
          <Image source={{ uri: entry.recipe.imageUri }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbPlaceholderIcon}>🍽️</Text>
          </View>
        )}

        <View style={styles.entryInfo}>
          <Text style={styles.entryTitle} numberOfLines={1}>
            {entry.recipe?.title ?? 'Recipe no longer exists'}
          </Text>
          <View style={styles.mealTypeBadge}>
            <Text style={styles.mealTypeText}>{entry.mealType}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.entryActions}>
        <TouchableOpacity
          onPress={() => handleView(entry)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          disabled={!entry.recipe}
        >
          <Text style={styles.viewLink}>View</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleRemove(entry)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.removeLink}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {banner && (
        <TouchableOpacity
          style={styles.banner}
          activeOpacity={0.8}
          onPress={() => setBanner(null)}
        >
          <Text style={styles.bannerText}>{banner.message}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.weekNav}>
        <TouchableOpacity
          onPress={() => setWeekOffset((current) => current - 1)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.weekNavArrow}
        >
          <Text style={styles.weekNavArrowText}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.weekNavLabel} numberOfLines={1}>
          {weekLabel}
        </Text>

        <TouchableOpacity
          onPress={() => setWeekOffset((current) => current + 1)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.weekNavArrow}
        >
          <Text style={styles.weekNavArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {DAYS_OF_WEEK.map((day) => {
            const dayEntries = entriesByDay.get(day) ?? [];
            return (
              <View key={day} style={styles.daySection}>
                <Text style={styles.dayTitle}>{day}</Text>
                {dayEntries.length > 0 ? (
                  dayEntries.map(renderEntry)
                ) : (
                  <Text style={styles.emptyDayText}>No meals planned yet.</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    banner: {
      borderRadius: 12,
      padding: 14,
      marginHorizontal: 16,
      marginTop: 12,
      backgroundColor: colors.errorLight,
      borderWidth: 1,
      borderColor: colors.errorBorder,
    },
    bannerText: {
      fontSize: 13,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      gap: 16,
    },
    weekNavArrow: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekNavArrowText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.primary,
      lineHeight: 20,
    },
    weekNavLabel: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      minWidth: 150,
      textAlign: 'center',
    },
    list: {
      padding: 16,
      paddingBottom: 60,
    },
    daySection: {
      marginBottom: 20,
    },
    dayTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 10,
    },
    emptyDayText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    entryTouchable: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    thumb: {
      width: 48,
      height: 48,
      borderRadius: 10,
      backgroundColor: colors.primaryLight,
    },
    thumbPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbPlaceholderIcon: {
      fontSize: 20,
    },
    entryInfo: {
      flex: 1,
      marginLeft: 12,
    },
    entryTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    mealTypeBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    mealTypeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.primary,
    },
    entryActions: {
      alignItems: 'flex-end',
      gap: 8,
      marginLeft: 8,
    },
    viewLink: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    removeLink: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.error,
    },
  });
}
