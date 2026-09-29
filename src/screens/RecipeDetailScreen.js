import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { addGroceryItems } from '../services/grocery';
import { selectRecipeById, useRecipeStore } from '../store/useRecipeStore';
import { SERVING_MULTIPLIERS, scaleIngredientText } from '../utils/servingScaler';

const BANNER_DURATION_MS = 4000;

export default function RecipeDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const recipe = useRecipeStore(selectRecipeById(id));
  const deleteRecipe = useRecipeStore((state) => state.deleteRecipe);

  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [isAddingToGroceryList, setIsAddingToGroceryList] = useState(false);

  // Alert.alert() is a silent no-op on web, so status messages go through
  // this in-app banner instead -- same pattern as AddRecipeScreen.
  const [banner, setBanner] = useState(null);
  const bannerTimeoutRef = useRef(null);

  const showBanner = (type, title, message) => {
    clearTimeout(bannerTimeoutRef.current);
    setBanner({ type, title, message });
    bannerTimeoutRef.current = setTimeout(() => setBanner(null), BANNER_DURATION_MS);
  };

  useEffect(() => {
    return () => clearTimeout(bannerTimeoutRef.current);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: recipe ? recipe.title : 'Recipe',
      headerRight: recipe
        ? () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('EditRecipe', { id })}
              style={styles.headerEditButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.headerEditText}>Edit</Text>
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [navigation, recipe, id]);

  const handleConfirmDelete = () => {
    setIsConfirmVisible(false);
    deleteRecipe(id);
    navigation.goBack();
  };

  const handleAddToGroceryList = async () => {
    if (!recipe?.ingredients?.length) return;

    setIsAddingToGroceryList(true);
    try {
      // Use the currently-selected serving multiplier so a 2x recipe adds
      // "4 cups flour" to the grocery list, not the unscaled "2 cups flour"
      // shown before the user picked a serving size.
      const scaledIngredients = recipe.ingredients.map((item) =>
        scaleIngredientText(item, servingMultiplier)
      );
      const added = await addGroceryItems(scaledIngredients);
      const mergedCount = added.filter((item) => item.wasMerged).length;
      const newCount = added.length - mergedCount;

      let message;
      if (newCount && mergedCount) {
        message = `${newCount} new item${newCount === 1 ? '' : 's'} added, ${mergedCount} combined with items already on your list.`;
      } else if (mergedCount) {
        message = `Combined with ${mergedCount} ingredient${mergedCount === 1 ? '' : 's'} already on your list.`;
      } else {
        message = `${newCount} ingredient${newCount === 1 ? '' : 's'} added.`;
      }
      showBanner('success', 'Added to Grocery List', message);
    } catch (error) {
      showBanner(
        'error',
        'Couldn\u2019t Add Ingredients',
        error.message || 'Something went wrong adding these ingredients.'
      );
    } finally {
      setIsAddingToGroceryList(false);
    }
  };

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

  const { title, category, prepTime, imageUri, ingredients, instructions } = recipe;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        {banner && (
          <TouchableOpacity
            style={[
              styles.banner,
              banner.type === 'error' ? styles.bannerError : styles.bannerSuccess,
            ]}
            activeOpacity={0.8}
            onPress={() => setBanner(null)}
          >
            <Text style={styles.bannerTitle}>{banner.title}</Text>
            {!!banner.message && <Text style={styles.bannerMessage}>{banner.message}</Text>}
          </TouchableOpacity>
        )}

        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <Text style={styles.heroPlaceholderIcon}>🍽️</Text>
          </View>
        )}

        <Text style={styles.title}>{title}</Text>

        <View style={styles.metaRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{category}</Text>
          </View>
          {!!prepTime && <Text style={styles.prepTime}>⏱ {prepTime}</Text>}
        </View>

        {ingredients && ingredients.length > 0 && (
          <View style={styles.servingRow}>
            <Text style={styles.servingLabel}>Servings</Text>
            <View style={styles.servingChips}>
              {SERVING_MULTIPLIERS.map((option) => {
                const isActive = option.value === servingMultiplier;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.servingChip, isActive && styles.servingChipActive]}
                    onPress={() => setServingMultiplier(option.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.servingChipText, isActive && styles.servingChipTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          {ingredients && ingredients.length > 0 ? (
            ingredients.map((item, index) => (
              <View key={`${item}-${index}`} style={styles.listRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.listText}>{scaleIngredientText(item, servingMultiplier)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No ingredients added yet.</Text>
          )}

          {ingredients && ingredients.length > 0 && (
            <TouchableOpacity
              style={styles.groceryButton}
              activeOpacity={0.85}
              onPress={handleAddToGroceryList}
              disabled={isAddingToGroceryList}
            >
              {isAddingToGroceryList ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.groceryButtonText}>🛒 Add Ingredients to Grocery List</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          {instructions && instructions.length > 0 ? (
            instructions.map((step, index) => (
              <View key={`${step}-${index}`} style={styles.listRow}>
                <Text style={styles.stepNumber}>{index + 1}.</Text>
                <Text style={styles.listText}>{step}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No cooking instructions added yet.</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          activeOpacity={0.85}
          onPress={() => setIsConfirmVisible(true)}
        >
          <Text style={styles.deleteButtonText}>Delete Recipe</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={isConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete this recipe?</Text>
            <Text style={styles.modalSubtitle}>
              This can&apos;t be undone. &quot;{title}&quot; will be permanently removed.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setIsConfirmVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalDeleteButton]}
                onPress={handleConfirmDelete}
                activeOpacity={0.85}
              >
                <Text style={styles.modalDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#F7F5F2',
  },
  container: {
    padding: 20,
    paddingBottom: 60,
  },
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: '#F0EAE3',
    marginBottom: 18,
  },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderIcon: {
    fontSize: 56,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2B2B2B',
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  categoryBadge: {
    backgroundColor: '#FFF1EC',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 12,
  },
  categoryText: {
    fontSize: 13,
    color: '#FF6B4A',
    fontWeight: '600',
  },
  prepTime: {
    fontSize: 13,
    color: '#8A8A8A',
  },
  servingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  servingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A4A4A',
    marginRight: 12,
  },
  servingChips: {
    flexDirection: 'row',
    gap: 8,
  },
  servingChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0DCD5',
  },
  servingChipActive: {
    backgroundColor: '#FF6B4A',
    borderColor: '#FF6B4A',
  },
  servingChipText: {
    fontSize: 13,
    color: '#4A4A4A',
    fontWeight: '600',
  },
  servingChipTextActive: {
    color: '#fff',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2B2B2B',
    marginBottom: 12,
  },
  listRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  bullet: {
    fontSize: 15,
    color: '#FF6B4A',
    marginRight: 10,
    lineHeight: 22,
  },
  stepNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FF6B4A',
    marginRight: 10,
    lineHeight: 22,
    minWidth: 20,
  },
  listText: {
    flex: 1,
    fontSize: 15,
    color: '#3A3A3A',
    lineHeight: 22,
  },
  emptyText: {
    fontSize: 14,
    color: '#9A9A9A',
    fontStyle: 'italic',
  },
  groceryButton: {
    backgroundColor: '#FF6B4A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  groceryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  banner: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  bannerError: {
    backgroundColor: '#FDEAE6',
    borderWidth: 1,
    borderColor: '#F5C4B8',
  },
  bannerSuccess: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2B2B2B',
    marginBottom: 2,
  },
  bannerMessage: {
    fontSize: 13,
    color: '#5A5A5A',
  },
  deleteButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#FDEAE6',
    borderWidth: 1,
    borderColor: '#F5C4B8',
  },
  deleteButtonText: {
    color: '#D64A2E',
    fontSize: 16,
    fontWeight: '700',
  },
  headerEditButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerEditText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B4A',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2B2B2B',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8A8A8A',
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 10,
  },
  modalButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalCancelButton: {
    backgroundColor: '#F0EDE7',
  },
  modalCancelText: {
    color: '#4A4A4A',
    fontWeight: '600',
  },
  modalDeleteButton: {
    backgroundColor: '#D64A2E',
  },
  modalDeleteText: {
    color: '#fff',
    fontWeight: '700',
  },
});
