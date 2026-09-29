import { supabase } from '../utils/supabase';

const BUCKET = 'recipe-images';

/**
 * The camera/library pickers (and the OCR "Scan Handwritten Recipe" flow)
 * hand back a URI that only exists on *this* device/browser session --
 * `file://...` or `content://...` on native, `blob:...` on web. Those never
 * survive an app restart, a page reload, or opening the recipe from a
 * different device, which is why photos used to silently vanish. A URL this
 * app already uploaded (Supabase Storage's public URL) is the only kind
 * that's safe to leave as-is.
 */
export function isLocalImageUri(uri) {
  return typeof uri === 'string' && /^(file|content|blob|ph|data):/i.test(uri);
}

function guessExtension(uri) {
  const match = /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.exec(uri || '');
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

function contentTypeForExtension(ext) {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

/**
 * Uploads a local device photo to a permanent, publicly-readable location
 * (Supabase Storage) and returns that public URL. Always writes to the same
 * path per recipe (`<userId>/<recipeId>.<ext>`, upserted) so re-uploading a
 * new photo for the same recipe replaces the old file instead of leaking
 * orphaned storage objects.
 *
 * Returns `null` (rather than throwing) on failure, since a photo upload
 * hiccup shouldn't block saving the rest of the recipe -- callers should
 * fall back to no image and let the user retry from the edit screen.
 */
export async function uploadRecipeImage(userId, recipeId, localUri) {
  try {
    const response = await fetch(localUri);
    const arrayBuffer = await response.arrayBuffer();
    const ext = guessExtension(localUri);
    const path = `${userId}/${recipeId}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, {
      contentType: contentTypeForExtension(ext),
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // Bust any CDN/browser cache so replacing a photo for the same recipe
    // shows up immediately instead of the old image sticking around.
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (error) {
    console.warn('Failed to upload recipe image:', error.message);
    return null;
  }
}

/** Best-effort cleanup when a recipe is deleted. Never throws. */
export async function deleteRecipeImages(userId, recipeId) {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
      search: recipeId,
    });
    if (error || !data?.length) return;

    const paths = data.map((file) => `${userId}/${file.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
  } catch (error) {
    console.warn('Failed to clean up recipe images:', error.message);
  }
}
