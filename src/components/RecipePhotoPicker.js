import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useThemeColors } from '../theme/ThemeContext';
import { findFoodPhotoOnline } from '../utils/aiParser';

/**
 * Tappable recipe photo preview + "take photo / choose from library / find
 * online / remove" picker. Used by both Add and Edit Recipe screens so
 * every recipe -- not just ones captured via the handwritten-recipe scanner,
 * or freshly created ones -- can have a photo, including recipes already
 * sitting in the library without one.
 *
 * `onChange(uri | null)` is called with either a local device URI or an
 * external `https://` URL (from the online search); the caller
 * (useRecipeStore) is responsible for uploading local ones to permanent
 * storage and leaving external ones as direct links.
 *
 * `recipe` (optional) supplies the title/category/ingredients used to build
 * the online photo search query -- without it, "Find Photo Online" is
 * disabled, since there'd be nothing to search for yet.
 */
export default function RecipePhotoPicker({ imageUri, onChange, recipe }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');

  // The search is otherwise entirely deterministic for a given title, so
  // without this, disliking a result and searching again would always hand
  // back that exact same photo. Track everything shown so far (starting
  // with whatever's already attached, if it looks like a previous online
  // find rather than the user's own photo) so each retry can ask for a
  // genuinely different one instead.
  const [triedUrls, setTriedUrls] = useState(() =>
    imageUri && /^https?:\/\//i.test(imageUri) ? [imageUri] : []
  );

  const canSearchOnline = !!recipe?.title?.trim();

  const findPhotoOnline = async () => {
    setIsPickerVisible(false);
    setSearchMessage('');
    setIsSearching(true);

    const foundUri = await findFoodPhotoOnline(recipe, { excludeUrls: triedUrls });

    setIsSearching(false);
    if (foundUri) {
      setTriedUrls((prev) => [...prev, foundUri]);
      onChange(foundUri);
    } else {
      setSearchMessage(
        triedUrls.length > 0
          ? "Couldn't find another matching photo online. Try again later or add your own."
          : "Couldn't find a matching photo online. Try again or add your own."
      );
      setTimeout(() => setSearchMessage(''), 4000);
    }
  };

  const pickFromLibrary = async () => {
    setIsPickerVisible(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets?.[0]) {
      onChange(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    setIsPickerVisible(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets?.[0]) {
      onChange(result.assets[0].uri);
    }
  };

  const removePhoto = () => {
    setIsPickerVisible(false);
    onChange(null);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.wrapper}
        activeOpacity={0.85}
        disabled={isSearching}
        onPress={() => setIsPickerVisible(true)}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderIcon}>📷</Text>
            <Text style={styles.placeholderText}>Add a Photo</Text>
          </View>
        )}
        {isSearching && (
          <View style={[styles.image, styles.searchingOverlay]}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.searchingText}>Searching for a photo…</Text>
          </View>
        )}
        <View style={styles.editBadge}>
          <Text style={styles.editBadgeText}>{imageUri ? 'Change Photo' : 'Add Photo'}</Text>
        </View>
      </TouchableOpacity>

      {!!searchMessage && (
        <View style={styles.searchMessageBox}>
          <Text style={styles.searchMessageText}>{searchMessage}</Text>
        </View>
      )}

      <Modal
        visible={isPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Recipe Photo</Text>

            <TouchableOpacity style={styles.modalOption} onPress={takePhoto} activeOpacity={0.7}>
              <Text style={styles.modalOptionText}>📷 Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={pickFromLibrary} activeOpacity={0.7}>
              <Text style={styles.modalOptionText}>🖼️ Choose from Library</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={findPhotoOnline}
              activeOpacity={0.7}
              disabled={!canSearchOnline}
            >
              <Text
                style={[styles.modalOptionText, !canSearchOnline && styles.modalOptionDisabled]}
              >
                {triedUrls.length > 0 ? '🔍 Find a Different Photo' : '🔍 Find Photo Online'}
              </Text>
            </TouchableOpacity>
            {!!imageUri && (
              <TouchableOpacity style={styles.modalOption} onPress={removePhoto} activeOpacity={0.7}>
                <Text style={[styles.modalOptionText, styles.modalOptionDanger]}>🗑️ Remove Photo</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setIsPickerVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrapper: {
      marginBottom: 16,
    },
    image: {
      width: '100%',
      height: 160,
      borderRadius: 16,
      backgroundColor: colors.primaryLight,
    },
    placeholder: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    placeholderIcon: {
      fontSize: 30,
      marginBottom: 6,
    },
    placeholderText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    searchingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    searchingText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '600',
      marginTop: 8,
    },
    searchMessageBox: {
      marginBottom: 16,
      padding: 10,
      borderRadius: 10,
      backgroundColor: colors.errorLight,
      borderWidth: 1,
      borderColor: colors.errorBorder,
    },
    searchMessageText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    editBadge: {
      position: 'absolute',
      right: 10,
      bottom: 10,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    editBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
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
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 12,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      paddingVertical: 10,
    },
    modalOption: {
      paddingVertical: 14,
      paddingHorizontal: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    modalOptionText: {
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    modalOptionDanger: {
      color: colors.error,
    },
    modalOptionDisabled: {
      color: colors.textMuted,
    },
    modalCancel: {
      marginTop: 6,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 12,
    },
    modalCancelText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary,
    },
  });
}
