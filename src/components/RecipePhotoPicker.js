import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../theme/ThemeContext';

/**
 * Tappable recipe photo preview + "take photo / choose from library / remove"
 * picker. Used by both Add and Edit Recipe screens so every recipe -- not
 * just ones captured via the handwritten-recipe scanner -- can have a photo.
 * `onChange(uri | null)` is called with a local device URI; the caller
 * (useRecipeStore) is responsible for uploading it to permanent storage.
 */
export default function RecipePhotoPicker({ imageUri, onChange }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isPickerVisible, setIsPickerVisible] = useState(false);

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
      <TouchableOpacity style={styles.wrapper} activeOpacity={0.85} onPress={() => setIsPickerVisible(true)}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderIcon}>📷</Text>
            <Text style={styles.placeholderText}>Add a Photo</Text>
          </View>
        )}
        <View style={styles.editBadge}>
          <Text style={styles.editBadgeText}>{imageUri ? 'Change Photo' : 'Add Photo'}</Text>
        </View>
      </TouchableOpacity>

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
