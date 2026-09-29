import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../theme/ThemeContext';

export default function RecipeCard({ recipe, onPress }) {
  const { title, category, prepTime, imageUri } = recipe;
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.imagePlaceholderIcon}>🍽️</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{category}</Text>
          </View>
          {!!prepTime && <Text style={styles.prepTime}>⏱ {prepTime}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 14,
      marginBottom: 12,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    image: {
      width: 88,
      height: 88,
      backgroundColor: colors.primaryLight,
    },
    imagePlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    imagePlaceholderIcon: {
      fontSize: 28,
    },
    info: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
      justifyContent: 'center',
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    categoryBadge: {
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 12,
      marginRight: 10,
    },
    categoryText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
    },
    prepTime: {
      fontSize: 12,
      color: colors.textSecondary,
    },
  });
}
