import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../theme/ThemeContext';
import { supabase } from '../utils/supabase';

export default function PendingApprovalScreen({ onCheckAgain }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isChecking, setIsChecking] = useState(false);

  const handleCheckAgain = async () => {
    setIsChecking(true);
    try {
      await onCheckAgain();
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⏳</Text>
      <Text style={styles.title}>Awaiting Approval</Text>
      <Text style={styles.subtitle}>
        Your account has been created, but the app owner needs to approve it before you can start
        saving recipes. Check back soon!
      </Text>

      <TouchableOpacity
        style={[styles.checkButton, isChecking && styles.checkButtonDisabled]}
        activeOpacity={0.85}
        onPress={handleCheckAgain}
        disabled={isChecking}
      >
        {isChecking ? (
          <ActivityIndicator color={colors.textOnPrimary} />
        ) : (
          <Text style={styles.checkButtonText}>Check Again</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutButton} activeOpacity={0.7} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    icon: {
      fontSize: 48,
      marginBottom: 12,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 28,
    },
    checkButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 32,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
    checkButtonDisabled: {
      opacity: 0.7,
    },
    checkButtonText: {
      color: colors.textOnPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    signOutButton: {
      marginTop: 18,
    },
    signOutText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '600',
    },
  });
}
