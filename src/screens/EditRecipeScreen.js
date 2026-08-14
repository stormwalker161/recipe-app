import { Picker } from '@react-native-picker/picker';
import React, { useState } from 'react';
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
import { CATEGORIES, selectRecipeById, useRecipeStore } from '../store/useRecipeStore';

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

  const [title, setTitle] = useState(recipe?.title ?? '');
  const [category, setCategory] = useState(recipe?.category ?? CATEGORIES[0]);
  const [prepTime, setPrepTime] = useState(recipe?.prepTime ?? '');
  const [ingredientsText, setIngredientsText] = useState(toMultilineText(recipe?.ingredients));
  const [instructionsText, setInstructionsText] = useState(toMultilineText(recipe?.instructions));
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
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Grandma's Lasagna"
            placeholderTextColor="#B0AAA2"
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
            placeholderTextColor="#B0AAA2"
            value={prepTime}
            onChangeText={setPrepTime}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Ingredients</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={'One ingredient per line\ne.g. Flour\nSugar\nEggs'}
            placeholderTextColor="#B0AAA2"
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
            placeholderTextColor="#B0AAA2"
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: 20,
    paddingBottom: 60,
    backgroundColor: '#F7F5F2',
    flexGrow: 1,
  },
  banner: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    backgroundColor: '#FDEAE6',
    borderWidth: 1,
    borderColor: '#F5C4B8',
  },
  bannerText: {
    fontSize: 13,
    color: '#5A5A5A',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A4A4A',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0DCD5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2B2B2B',
  },
  textArea: {
    minHeight: 110,
  },
  pickerWrapper: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0DCD5',
    overflow: 'hidden',
  },
  picker: {
    color: '#2B2B2B',
  },
  saveButton: {
    backgroundColor: '#FF6B4A',
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
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  missingContainer: {
    flex: 1,
    backgroundColor: '#F7F5F2',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  missingText: {
    fontSize: 16,
    color: '#4A4A4A',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#FF6B4A',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
