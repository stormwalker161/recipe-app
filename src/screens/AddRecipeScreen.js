import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import RecipePhotoPicker from '../components/RecipePhotoPicker';
import { CATEGORIES, useRecipeStore } from '../store/useRecipeStore';
import { useThemeColors } from '../theme/ThemeContext';
import {
  findFoodPhotoOnline,
  parseRecipeFromImage,
  parseRecipeFromPdf,
  parseRecipeFromText,
} from '../utils/aiParser';

const BANNER_DURATION_MS = 5000;

const ACTIONS = [
  { key: 'url', icon: '🔗', label: 'Paste Website URL', subtitle: 'Import from a recipe link' },
  { key: 'scan', icon: '📷', label: 'Scan Handwritten Recipe', subtitle: 'Use your camera' },
  { key: 'pdf', icon: '📄', label: 'Upload PDF', subtitle: 'Import from a document' },
  { key: 'manual', icon: '⌨️', label: 'Type Manually', subtitle: 'Fill out the form below' },
];

export default function AddRecipeScreen({ navigation }) {
  const addRecipe = useRecipeStore((state) => state.addRecipe);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [prepTime, setPrepTime] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');
  const [photoUri, setPhotoUri] = useState(null);

  const [isUrlModalVisible, setIsUrlModalVisible] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const [isPageConfirmVisible, setIsPageConfirmVisible] = useState(false);
  const [pageConfirmCount, setPageConfirmCount] = useState(0);
  const pageConfirmResolverRef = useRef(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('');

  // Alert.alert() is a silent no-op on web (react-native-web has no native
  // dialog backing it), so status messages are shown via this in-app banner
  // instead -- it works identically across web, iOS, and Android.
  const [banner, setBanner] = useState(null);
  const bannerTimeoutRef = useRef(null);

  useEffect(() => {
    return () => clearTimeout(bannerTimeoutRef.current);
  }, []);

  const showBanner = (type, title, message) => {
    clearTimeout(bannerTimeoutRef.current);
    setBanner({ type, title, message });
    bannerTimeoutRef.current = setTimeout(() => setBanner(null), BANNER_DURATION_MS);
  };

  const handlePasteUrl = () => {
    setIsUrlModalVisible(true);
  };

  const handleCancelUrlImport = () => {
    setIsUrlModalVisible(false);
    setUrlInput('');
  };

  const handleConfirmUrlImport = async () => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) {
      showBanner('error', 'Missing URL', 'Please paste a recipe URL first.');
      return;
    }

    setIsUrlModalVisible(false);
    setIsProcessing(true);
    setProcessingLabel('Reading recipe from the web…');

    try {
      const recipe = await parseRecipeFromText(trimmedUrl);
      await addRecipe(recipe);
      setUrlInput('');
      navigation.goBack();
    } catch (error) {
      showBanner('error', 'Import Failed', error.message || 'Something went wrong importing that URL.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Resolves once the user taps either button on the "add another page?"
  // modal -- lets the capture loop below `await` a yes/no answer instead of
  // needing separate state machines for each step.
  const askContinueScanning = (pagesCaptured) =>
    new Promise((resolve) => {
      pageConfirmResolverRef.current = resolve;
      setPageConfirmCount(pagesCaptured);
      setIsPageConfirmVisible(true);
    });

  const handlePageConfirmChoice = (shouldContinue) => {
    setIsPageConfirmVisible(false);
    pageConfirmResolverRef.current?.(shouldContinue);
    pageConfirmResolverRef.current = null;
  };

  const handleScanHandwritten = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showBanner('error', 'Camera Permission Needed', 'Please allow camera access to scan a recipe.');
        return;
      }

      const photos = [];

      // Loop so a recipe that spans several pages (e.g. ingredients on one
      // page, instructions on the next) can be captured as one batch and
      // sent to Gemini together instead of only ever reading the first page.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          base64: true,
          quality: 0.6,
        });

        if (result.canceled || !result.assets?.[0]) {
          break;
        }

        const photo = result.assets[0];
        if (!photo.base64) {
          showBanner('error', 'Scan Failed', 'Could not read the captured photo. Please try again.');
          break;
        }

        photos.push(photo);

        const shouldContinue = await askContinueScanning(photos.length);
        if (!shouldContinue) {
          break;
        }
      }

      if (photos.length === 0) {
        return;
      }

      setIsProcessing(true);
      setProcessingLabel(
        photos.length > 1 ? `Reading ${photos.length}-page recipe…` : 'Reading handwritten recipe…'
      );

      const recipe = await parseRecipeFromImage(
        photos.map((photo) => ({ base64: photo.base64, mimeType: photo.mimeType || 'image/jpeg' }))
      );

      // Deliberately NOT `photos[0].uri` -- that's a picture of the paper
      // recipe card itself, not the finished dish. Look for a real photo of
      // the dish online instead (best-effort; recipe still saves fine if
      // nothing is found, just without a photo).
      setProcessingLabel('Finding a photo of your dish…');
      const imageUri = await findFoodPhotoOnline(recipe);

      await addRecipe({ ...recipe, imageUri });
      navigation.goBack();
    } catch (error) {
      showBanner('error', 'Scan Failed', error.message || 'Something went wrong scanning that recipe.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const document = result.assets[0];

      setIsProcessing(true);
      setProcessingLabel('Reading PDF recipe…');

      // Web returns base64 directly on the asset; native platforms need the
      // cached file read from disk via expo-file-system.
      let base64Pdf = document.base64;
      if (!base64Pdf) {
        const file = new File(document.uri);
        base64Pdf = await file.base64();
      }
      base64Pdf = base64Pdf.replace(/^data:application\/pdf;base64,/, '');

      const recipe = await parseRecipeFromPdf(base64Pdf);

      setProcessingLabel('Finding a photo of your dish…');
      const imageUri = await findFoodPhotoOnline(recipe);

      await addRecipe({ ...recipe, imageUri });
      navigation.goBack();
    } catch (error) {
      showBanner('error', 'PDF Import Failed', error.message || 'Something went wrong reading that PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTypeManually = () => {
    showBanner('info', 'Type Manually', 'Fill out the form below and tap "Save Recipe".');
  };

  const actionHandlers = {
    url: handlePasteUrl,
    scan: handleScanHandwritten,
    pdf: handleUploadPdf,
    manual: handleTypeManually,
  };

  const handleSave = async () => {
    if (!title.trim()) {
      showBanner('error', 'Missing Title', 'Please enter a title for your recipe.');
      return;
    }

    const ingredientList = ingredients
      .split(/,|\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    const instructionList = instructions
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      let finalImageUri = photoUri;

      // Only bother searching for one if the user didn't already attach a
      // real photo themselves -- their own photo always wins.
      if (!finalImageUri) {
        setIsProcessing(true);
        setProcessingLabel('Finding a photo of your dish…');
        finalImageUri = await findFoodPhotoOnline({
          title: title.trim(),
          category,
          ingredients: ingredientList,
        });
      }

      await addRecipe({
        title: title.trim(),
        category,
        prepTime: prepTime.trim(),
        ingredients: ingredientList,
        instructions: instructionList,
        imageUri: finalImageUri,
      });

      setTitle('');
      setCategory(CATEGORIES[0]);
      setPrepTime('');
      setIngredients('');
      setInstructions('');
      setPhotoUri(null);

      navigation.goBack();
    } catch (error) {
      showBanner('error', 'Save Failed', error.message || 'Something went wrong saving that recipe.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {banner && (
          <TouchableOpacity
            style={[
              styles.banner,
              banner.type === 'error' ? styles.bannerError : styles.bannerInfo,
            ]}
            activeOpacity={0.8}
            onPress={() => setBanner(null)}
          >
            <Text style={styles.bannerTitle}>{banner.title}</Text>
            {!!banner.message && <Text style={styles.bannerMessage}>{banner.message}</Text>}
          </TouchableOpacity>
        )}

        <Text style={styles.sectionTitle}>Add a Recipe</Text>
        <Text style={styles.sectionSubtitle}>Choose how you&apos;d like to add it</Text>

        <View style={styles.actionGrid}>
          {ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={styles.actionCard}
              activeOpacity={0.8}
              disabled={isProcessing}
              onPress={actionHandlers[action.key]}
            >
              <Text style={styles.actionIcon}>{action.icon}</Text>
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Or Enter Manually</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Photo</Text>
          <RecipePhotoPicker imageUri={photoUri} onChange={setPhotoUri} />
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
            placeholder={'Separate with commas or new lines\ne.g. Flour, Sugar, Eggs'}
            placeholderTextColor={colors.textMuted}
            value={ingredients}
            onChangeText={setIngredients}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Cooking Instructions</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={'One step per line\ne.g. Preheat the oven to 350°F'}
            placeholderTextColor={colors.textMuted}
            value={instructions}
            onChangeText={setInstructions}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={styles.saveButton}
          activeOpacity={0.85}
          onPress={handleSave}
          disabled={isProcessing}
        >
          <Text style={styles.saveButtonText}>Save Recipe</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={isUrlModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelUrlImport}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Paste Website URL</Text>
            <Text style={styles.modalSubtitle}>
              We&apos;ll read the page and use AI to fill in the recipe details.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="https://example.com/recipe"
              placeholderTextColor={colors.textMuted}
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={handleCancelUrlImport}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleConfirmUrlImport}
                activeOpacity={0.85}
              >
                <Text style={styles.modalConfirmText}>Import</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isPageConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => handlePageConfirmChoice(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Page {pageConfirmCount} captured
            </Text>
            <Text style={styles.modalSubtitle}>
              Does this recipe continue onto another page?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => handlePageConfirmChoice(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Done, Extract Recipe</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={() => handlePageConfirmChoice(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalConfirmText}>Scan Next Page</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {isProcessing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingText}>{processingLabel}</Text>
          </View>
        </View>
      )}
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
    },
    bannerError: {
      backgroundColor: colors.errorLight,
      borderWidth: 1,
      borderColor: colors.errorBorder,
    },
    bannerInfo: {
      backgroundColor: colors.infoLight,
      borderWidth: 1,
      borderColor: colors.infoBorder,
    },
    bannerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    bannerMessage: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    sectionSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    actionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    actionCard: {
      width: '48%',
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingVertical: 20,
      paddingHorizontal: 12,
      alignItems: 'center',
      marginBottom: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    actionIcon: {
      fontSize: 30,
      marginBottom: 10,
    },
    actionLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 4,
    },
    actionSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 20,
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
      minHeight: 90,
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
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    modalSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
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
      backgroundColor: colors.background,
    },
    modalCancelText: {
      color: colors.textSecondary,
      fontWeight: '600',
    },
    modalConfirmButton: {
      backgroundColor: colors.primary,
    },
    modalConfirmText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
    },
    processingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: `${colors.background}EB`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    processingCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingVertical: 28,
      paddingHorizontal: 32,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 4,
    },
    processingText: {
      marginTop: 14,
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '600',
    },
  });
}
