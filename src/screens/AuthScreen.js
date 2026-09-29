import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useThemeColors } from '../theme/ThemeContext';
import { isSupabaseConfigured, supabase } from '../utils/supabase';

export default function AuthScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [mode, setMode] = useState('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isSignUp = mode === 'signUp';

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    setError('');
    setNotice('');

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.');
      return;
    }

    if (!trimmedEmail || !password) {
      setError('Please enter both an email and a password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (signUpError) throw signUpError;

        if (!data.session) {
          // Email confirmation is enabled on this Supabase project -- there's
          // no session until the user clicks the link in their inbox.
          setNotice('Account created! Check your email to confirm it, then sign in.');
          setMode('signIn');
        }
        // If a session comes back immediately (confirmation disabled), App.js
        // picks it up via onAuthStateChange and shows the pending-approval
        // screen -- new accounts always start out unapproved until the app
        // owner approves them (see profiles.is_approved).
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (submitError) {
      setError(submitError.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>🍽️</Text>
        <Text style={styles.title}>My Recipes</Text>
        <Text style={styles.subtitle}>
          {isSignUp ? 'Create an account to save your recipes.' : 'Sign in to see your saved recipes.'}
        </Text>

        {!!error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {!!notice && (
          <View style={styles.noticeBanner}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={isSignUp ? 'newPassword' : 'password'}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          activeOpacity={0.85}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.submitButtonText}>{isSignUp ? 'Sign Up' : 'Sign In'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchModeButton}
          activeOpacity={0.7}
          onPress={() => {
            setMode(isSignUp ? 'signIn' : 'signUp');
            setError('');
            setNotice('');
          }}
        >
          <Text style={styles.switchModeText}>
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 24,
    },
    logo: {
      fontSize: 48,
      textAlign: 'center',
      marginBottom: 8,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    errorBanner: {
      backgroundColor: colors.errorLight,
      borderWidth: 1,
      borderColor: colors.errorBorder,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    errorText: {
      fontSize: 13,
      color: colors.textPrimary,
    },
    noticeBanner: {
      backgroundColor: colors.infoLight,
      borderWidth: 1,
      borderColor: colors.infoBorder,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    noticeText: {
      fontSize: 13,
      color: colors.textPrimary,
    },
    formGroup: {
      marginBottom: 16,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.textPrimary,
    },
    submitButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
    submitButtonDisabled: {
      opacity: 0.7,
    },
    submitButtonText: {
      color: colors.textOnPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    switchModeButton: {
      marginTop: 18,
      alignItems: 'center',
    },
    switchModeText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '600',
    },
  });
}
