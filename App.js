import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AddRecipeScreen from './src/screens/AddRecipeScreen';
import AuthScreen from './src/screens/AuthScreen';
import EditRecipeScreen from './src/screens/EditRecipeScreen';
import GroceryScreen from './src/screens/GroceryScreen';
import HomeScreen from './src/screens/HomeScreen';
import PendingApprovalScreen from './src/screens/PendingApprovalScreen';
import RecipeDetailScreen from './src/screens/RecipeDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { useRecipeStore } from './src/store/useRecipeStore';
import { ThemeProvider, useThemeColors } from './src/theme/ThemeContext';
import { supabase } from './src/utils/supabase';

const Stack = createNativeStackNavigator();

function stackScreenOptions(colors) {
  return {
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.primary,
    headerTitleStyle: { color: colors.textPrimary, fontWeight: '700' },
  };
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [isApproved, setIsApproved] = useState(undefined); // undefined = still checking

  const checkApproval = useCallback(async (currentSession) => {
    if (!currentSession) {
      setIsApproved(undefined);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('is_approved')
      .eq('id', currentSession.user.id)
      .single();

    if (error) {
      console.warn('Failed to load profile approval status:', error.message);
      setIsApproved(false);
      return;
    }

    setIsApproved(Boolean(data?.is_approved));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      checkApproval(session);
    } else if (session === null) {
      setIsApproved(undefined);
      useRecipeStore.getState().clearRecipes();
    }
  }, [session, checkApproval]);

  useEffect(() => {
    if (session && isApproved) {
      useRecipeStore.getState().fetchRecipes();
    }
  }, [session, isApproved]);

  const isLoading = session === undefined || (session && isApproved === undefined);

  return (
    <ThemeProvider session={session || null}>
      <AppShell
        isLoading={isLoading}
        session={session}
        isApproved={isApproved}
        checkApproval={checkApproval}
      />
    </ThemeProvider>
  );
}

function AppShell({ isLoading, session, isApproved, checkApproval }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const navigationTheme = useMemo(() => {
    const base = colors.mode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: colors.mode === 'dark',
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.primary,
      },
    };
  }, [colors]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={colors.mode === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer theme={navigationTheme}>
        {session && isApproved ? (
          <Stack.Navigator initialRouteName="Home" screenOptions={stackScreenOptions(colors)}>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'My Recipes' }} />
            <Stack.Screen
              name="RecipeDetail"
              component={RecipeDetailScreen}
              options={{ title: 'Recipe' }}
            />
            <Stack.Screen
              name="AddRecipe"
              component={AddRecipeScreen}
              options={{ title: 'Add Recipe', presentation: 'modal' }}
            />
            <Stack.Screen
              name="EditRecipe"
              component={EditRecipeScreen}
              options={{ title: 'Edit Recipe', presentation: 'modal' }}
            />
            <Stack.Screen
              name="Grocery"
              component={GroceryScreen}
              options={{ title: 'Grocery List' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: 'Appearance' }}
            />
          </Stack.Navigator>
        ) : (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {session ? (
              <Stack.Screen name="PendingApproval">
                {() => <PendingApprovalScreen onCheckAgain={() => checkApproval(session)} />}
              </Stack.Screen>
            ) : (
              <Stack.Screen name="Auth" component={AuthScreen} />
            )}
          </Stack.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
  });
}
