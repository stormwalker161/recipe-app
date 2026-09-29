import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addGroceryItem,
  clearCompletedGroceryItems,
  deleteGroceryItem,
  fetchGroceryItems,
  toggleGroceryItem,
} from '../services/grocery';

const BANNER_DURATION_MS = 4000;

export default function GroceryScreen() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  const [newIngredient, setNewIngredient] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [banner, setBanner] = useState(null);
  const bannerTimeoutRef = useRef(null);

  const showBanner = (type, message) => {
    clearTimeout(bannerTimeoutRef.current);
    setBanner({ type, message });
    bannerTimeoutRef.current = setTimeout(() => setBanner(null), BANNER_DURATION_MS);
  };

  // Refetch every time this screen gains focus, since items are often added
  // from a recipe's "Add Ingredients to Grocery List" button on a different
  // screen and we want those to show up the moment the user checks the list.
  // The `isActive` guard follows React Navigation's documented pattern for
  // async work in useFocusEffect: if the user navigates away before the
  // fetch resolves, we skip updating state on this now-blurred screen
  // instead of racing a stale response against whatever comes next.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      setIsLoading(true);
      fetchGroceryItems()
        .then((data) => {
          if (isActive) setItems(data);
        })
        .catch((error) => {
          if (isActive) showBanner('error', error?.message || 'Could not load your grocery list.');
        })
        .finally(() => {
          if (isActive) setIsLoading(false);
        });

      return () => {
        isActive = false;
      };
    }, [])
  );

  const handleAddItem = async () => {
    const ingredient = newIngredient.trim();
    if (!ingredient) return;

    setIsAdding(true);
    try {
      const item = await addGroceryItem({ ingredient, amount: newAmount.trim() });
      setItems((current) => [...current, item]);
      setNewIngredient('');
      setNewAmount('');
    } catch (error) {
      showBanner('error', error.message || 'Could not add that item.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleItem = async (item) => {
    const nextCompleted = !item.isCompleted;
    setItems((current) =>
      current.map((existing) =>
        existing.id === item.id ? { ...existing, isCompleted: nextCompleted } : existing
      )
    );

    try {
      await toggleGroceryItem(item.id, nextCompleted);
    } catch (error) {
      // Roll back on failure so the checkbox doesn't lie about server state.
      setItems((current) =>
        current.map((existing) =>
          existing.id === item.id ? { ...existing, isCompleted: item.isCompleted } : existing
        )
      );
      showBanner('error', error.message || 'Could not update that item.');
    }
  };

  const handleDeleteItem = async (item) => {
    const previousItems = items;
    setItems((current) => current.filter((existing) => existing.id !== item.id));

    try {
      await deleteGroceryItem(item.id);
    } catch (error) {
      setItems(previousItems);
      showBanner('error', error.message || 'Could not delete that item.');
    }
  };

  const handleClearCompleted = async () => {
    const previousItems = items;
    const remaining = items.filter((item) => !item.isCompleted);
    if (remaining.length === items.length) return; // nothing checked off

    setIsClearing(true);
    setItems(remaining);
    try {
      await clearCompletedGroceryItems();
    } catch (error) {
      setItems(previousItems);
      showBanner('error', error.message || 'Could not clear completed items.');
    } finally {
      setIsClearing(false);
    }
  };

  const hasCompletedItems = items.some((item) => item.isCompleted);

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.checkboxTouchable}
        onPress={() => handleToggleItem(item)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={[styles.checkbox, item.isCompleted && styles.checkboxChecked]}>
          {item.isCompleted && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>

      <View style={styles.itemTextWrapper}>
        <Text
          style={[styles.itemText, item.isCompleted && styles.itemTextCompleted]}
          numberOfLines={2}
        >
          {item.ingredient}
        </Text>
        {!!item.amount && (
          <Text style={[styles.itemAmount, item.isCompleted && styles.itemTextCompleted]}>
            {item.amount}
          </Text>
        )}
      </View>

      <TouchableOpacity
        onPress={() => handleDeleteItem(item)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.deleteTouchable}
      >
        <Text style={styles.deleteIcon}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {banner && (
        <TouchableOpacity
          style={[styles.banner, banner.type === 'error' ? styles.bannerError : styles.bannerInfo]}
          activeOpacity={0.8}
          onPress={() => setBanner(null)}
        >
          <Text style={styles.bannerText}>{banner.message}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, styles.ingredientInput]}
          placeholder="Add an item…"
          placeholderTextColor="#B0AAA2"
          value={newIngredient}
          onChangeText={setNewIngredient}
          onSubmitEditing={handleAddItem}
          returnKeyType="done"
        />
        <TextInput
          style={[styles.input, styles.amountInput]}
          placeholder="Amount"
          placeholderTextColor="#B0AAA2"
          value={newAmount}
          onChangeText={setNewAmount}
          onSubmitEditing={handleAddItem}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addButton, (isAdding || !newIngredient.trim()) && styles.addButtonDisabled]}
          onPress={handleAddItem}
          activeOpacity={0.85}
          disabled={isAdding || !newIngredient.trim()}
        >
          {isAdding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.addButtonText}>+</Text>
          )}
        </TouchableOpacity>
      </View>

      {hasCompletedItems && (
        <TouchableOpacity
          style={styles.clearButton}
          onPress={handleClearCompleted}
          activeOpacity={0.7}
          disabled={isClearing}
        >
          {isClearing ? (
            <ActivityIndicator color="#FF6B4A" size="small" />
          ) : (
            <Text style={styles.clearButtonText}>Clear Completed</Text>
          )}
        </TouchableOpacity>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B4A" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🛒</Text>
              <Text style={styles.emptyText}>
                Your grocery list is empty. Add an item above, or tap "Add Ingredients to Grocery
                List" from any recipe.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5F2',
  },
  banner: {
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
  },
  bannerError: {
    backgroundColor: '#FDEAE6',
    borderWidth: 1,
    borderColor: '#F5C4B8',
  },
  bannerInfo: {
    backgroundColor: '#EAF1FD',
    borderWidth: 1,
    borderColor: '#C4D7F5',
  },
  bannerText: {
    fontSize: 13,
    color: '#4A4A4A',
    fontWeight: '600',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0DCD5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#2B2B2B',
  },
  ingredientInput: {
    flex: 1,
  },
  amountInput: {
    width: 90,
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FF6B4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '400',
    lineHeight: 26,
  },
  clearButton: {
    alignSelf: 'flex-end',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF6B4A',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 60,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  checkboxTouchable: {
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E0DCD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#FF6B4A',
    borderColor: '#FF6B4A',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  itemTextWrapper: {
    flex: 1,
  },
  itemText: {
    fontSize: 15,
    color: '#2B2B2B',
    fontWeight: '500',
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#B0AAA2',
  },
  itemAmount: {
    fontSize: 12,
    color: '#9A9A9A',
    marginTop: 2,
  },
  deleteTouchable: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginLeft: 8,
  },
  deleteIcon: {
    fontSize: 14,
    color: '#B0AAA2',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 30,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#9A9A9A',
    textAlign: 'center',
    lineHeight: 20,
  },
});
