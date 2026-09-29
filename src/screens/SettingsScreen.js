import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeContext';

export default function SettingsScreen() {
  const { colors, themeKey, setTheme, themes } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Color Theme</Text>
        <Text style={styles.sectionSubtitle}>
          Pick a look for your account. It's saved to your profile, so it follows you to any device
          you sign in on.
        </Text>

        <View style={styles.grid}>
          {themes.map((theme) => {
            const isActive = theme.key === themeKey;
            return (
              <TouchableOpacity
                key={theme.key}
                style={[styles.card, isActive && { borderColor: theme.primary }]}
                activeOpacity={0.8}
                onPress={() => setTheme(theme.key)}
              >
                <View style={styles.swatchRow}>
                  <View style={[styles.swatch, { backgroundColor: theme.primary }]} />
                  <View style={[styles.swatch, { backgroundColor: theme.background }]} />
                  <View style={[styles.swatch, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]} />
                </View>
                <Text style={styles.cardLabel}>{theme.label}</Text>
                {isActive && (
                  <View style={[styles.activeBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.activeBadgeText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 60,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    sectionSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
      marginBottom: 20,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    card: {
      width: '48%',
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 14,
    },
    swatchRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 10,
    },
    swatch: {
      width: 28,
      height: 28,
      borderRadius: 14,
    },
    cardLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    activeBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activeBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
  });
}
