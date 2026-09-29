import { Picker } from '@react-native-picker/picker';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import RecipePhotoPicker from '../components/RecipePhotoPicker';
import { CATEGORIES, selectRecipeById, useRecipeStore } from '../store/useRecipeStore';
import { useThemeColors } from '../theme/ThemeContext';

function toMultilineText(list) {
  return Array.isArray(list) ? list.join('\n') : '';
}

function fromMultilineText(text) {
  return text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function EditRecipeScreen({ route, navigation }) {
  const { id } = route.params;
  const recipe = useRecipeStore(selectRecipeById(id));
  const updateRecipe = useRecipeStore((state) => state.updateRecipe);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [title, setTitle] = useState(recipe?.title ?? '');
  const [category, setCategory] = useState(recipe?.category ?? CATEGORIES[0]);
  const [prepTime, setPrepTime] = useState(recipe?.prepTime ?? '');
  const [ingredientsText, setIngredientsText] = useState(toMultilineText(recipe?.ingredients));
  const [instructionsText, setInstructionsText] = useState(toMultilineText(recipe?.instructions));
  const [photoUri, setPhotoUri] = useState(recipe?.imageUri ?? null);
  const [error, setError] = useState('');

  if (!recipe) {
    return (
      <View style={styles.missingContainer}>
        <Text style={styles.missingText}>This recipe no longer exists.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Please enter a title for your recipe.');
      return;
    }

    await updateRecipe(id, {
      title: title.trim(),
      category,
      prepTime: prepTime.trim(),
      ingredients: fromMultilineText(ingredientsText),
      instructions: fromMultilineText(instructionsText),
      imageUri: photoUri,
    });

    const latestError = useRecipeStore.getState().error;
    if (latestError) {
      setError(latestError);
      return;
    }

    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {!!error && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{error}</Text>
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Photo</Text>
          <RecipePhotoPicker
            imageUri={photoUri}
            onChange={setPhotoUri}
            recipe={{
              title,
              category,
              ingredients: fromMultilineText(ingredientsText),
            }}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Grandma's Lasagna"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Category</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={category} onValueChange={setCategory} style={styles.picker}>
              {CATEGORIES.map((cat) => (
                <Picker.Item key={cat} label={cat} value={cat} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Prep Time</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 25 min"
            placeholderTextColor={colors.textMuted}
            value={prepTime}
            onChangeText={setPrepTime}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Ingredients</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={'One ingredient per line\ne.g. Flour\nSugar\nEggs'}
            placeholderTextColor={colors.textMuted}
            value={ingredientsText}
            onChangeText={setIngredientsText}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Instructions</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={'One step per line\ne.g. Preheat the oven to 350°F'}
            placeholderTextColor={colors.textMuted}
            value={instructionsText}
            onChangeText={setInstructionsText}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity style={styles.saveButton} activeOpacity={0.85} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Changes</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    container: {
      padding: 20,
      paddingBottom: 60,
      backgroundColor: colors.background,
      flexGrow: 1,
    },
    banner: {
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
      backgroundColor: colors.errorLight,
      borderWidth: 1,
      borderColor: colors.errorBorder,
    },
    bannerText: {
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
    textArea: {
      minHeight: 110,
    },
    pickerWrapper: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    picker: {
      color: colors.textPrimary,
    },
    saveButton: {
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
    saveButtonText: {
      color: colors.textOnPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    missingContainer: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    missingText: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    backButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    backButtonText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
    },
  });
}
