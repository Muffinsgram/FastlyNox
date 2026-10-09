import { supabase } from './supabase';
import { uploadStorageFile } from './storageUpload';
import { getUploadLimit } from '../hooks/useUploadLimit';

const PROFILE_MEDIA_BUCKET = 'profile-media';
let profileExtrasSupported;

export function getAvatarUrl(value, fallback = 'Fastlynox') {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  const seed = value?.trim() || fallback;
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
}

export function getBannerUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '';
}

function profileWithDefaults(profile) {
  return profile ? { ...profile, banner_url: null, bio: '', status_text: '', status_expires_at: null, banner_position_x: 50, banner_position_y: 50, banner_zoom: 1 } : null;
}

export async function fetchProfile(userId) {
  if (!userId) return null;
  if (profileExtrasSupported !== false) {
    const extended = await supabase.from('profiles').select('id, public_id, username, avatar_url, banner_url, bio, status_text, status_expires_at, banner_position_x, banner_position_y, banner_zoom').eq('id', userId).maybeSingle();
    if (!extended.error) {
      profileExtrasSupported = true;
      return extended.data;
    }
    profileExtrasSupported = false;
  }
  const fallback = await supabase.from('profiles').select('id, username, avatar_url').eq('id', userId).maybeSingle();
  return fallback.error ? null : profileWithDefaults(fallback.data);
}

export async function fetchProfiles(userIds) {
  if (!userIds?.length) return [];
  if (profileExtrasSupported !== false) {
    const extended = await supabase.from('profiles').select('id, public_id, username, avatar_url, banner_url, bio, status_text, status_expires_at, banner_position_x, banner_position_y, banner_zoom').in('id', userIds);
    if (!extended.error) {
      profileExtrasSupported = true;
      return extended.data || [];
    }
    profileExtrasSupported = false;
  }
  const fallback = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds);
  if (fallback.error) return [];
  return (fallback.data || []).map(profileWithDefaults);
}

function imageToWebp(file, shape) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, shape.width / image.width, shape.height / image.height);
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('Görsel düzenleyici başlatılamadı.'));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Görsel küçültülemedi.')), 'image/webp', 0.84);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Bu görsel açılamadı.'));
    };
    image.src = objectUrl;
  });
}

export async function uploadProfileImage(file, userId, kind, onProgress) {
  if (!file || !['avatar', 'banner', 'server-icon'].includes(kind)) throw new Error('Geçerli bir görsel seçin.');
  if (!file.type.startsWith('image/')) throw new Error('Yalnızca görsel dosyaları yüklenebilir.');
  const maxUploadBytes = await getUploadLimit('profile-media');
  if (file.size > maxUploadBytes) throw new Error(`Görsel ${Math.round(maxUploadBytes / 1024 / 1024)} MB sınırını aşmamalı.`);
  const keepAnimatedImage = ['avatar', 'banner'].includes(kind) && file.type === 'image/gif';
  const shape = kind === 'banner' ? { width: 1600, height: 640 } : { width: 640, height: 640 };
  const blob = keepAnimatedImage ? file : await imageToWebp(file, shape);
  const extension = keepAnimatedImage ? 'gif' : 'webp';
  const contentType = keepAnimatedImage ? 'image/gif' : 'image/webp';
  const path = `${userId}/${kind}-${crypto.randomUUID()}.${extension}`;
  const uploadFile = blob.type === contentType ? blob : new File([blob], `${kind}.${extension}`, { type: contentType });
  await uploadStorageFile(PROFILE_MEDIA_BUCKET, path, uploadFile, onProgress);
  const { data } = supabase.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function uploadRoleEmoji(file, userId, onProgress) {
  const supportedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!file || !supportedTypes.includes(file.type)) throw new Error('Rol emojisi PNG, JPG, WebP veya GIF olmalı.');
  if (!userId) throw new Error('Önce hesabına giriş yap.');
  const accountLimit = await getUploadLimit(PROFILE_MEDIA_BUCKET);
  const fileLimit = Math.min(accountLimit, file.type === 'image/gif' ? 1024 * 1024 : 4 * 1024 * 1024);
  if (file.size > fileLimit) throw new Error(`Rol emojisi en fazla ${Math.max(1, Math.floor(fileLimit / 1024 / 1024))} MB olabilir.`);
  const animated = file.type === 'image/gif';
  const blob = animated ? file : await imageToWebp(file, { width: 128, height: 128 });
  const extension = animated ? 'gif' : 'webp';
  const contentType = animated ? 'image/gif' : 'image/webp';
  const path = `${userId}/role-emojis/${crypto.randomUUID()}.${extension}`;
  const uploadFile = blob.type === contentType ? blob : new File([blob], `role-emoji.${extension}`, { type: contentType });
  await uploadStorageFile(PROFILE_MEDIA_BUCKET, path, uploadFile, onProgress);
  const { data } = supabase.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function uploadCroppedAvatarImage(file, userId, crop, onProgress) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Yalnızca görsel dosyaları yüklenebilir.');
  const maxUploadBytes = await getUploadLimit('profile-media');
  if (file.size > maxUploadBytes) throw new Error(`Görsel ${Math.round(maxUploadBytes / 1024 / 1024)} MB sınırını aşmamalı.`);
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Bu görsel açılamadı.'));
      image.src = objectUrl;
    });
  } finally { URL.revokeObjectURL(objectUrl); }
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const zoom = Math.max(1, Math.min(2, Number(crop.zoom) || 1));
  const cropSide = side / zoom;
  const x = Math.max(0, Math.min(100, Number(crop.x) || 0)) / 100;
  const y = Math.max(0, Math.min(100, Number(crop.y) || 0)) / 100;
  const sourceX = (image.naturalWidth - side) / 2 + (side - cropSide) * x;
  const sourceY = (image.naturalHeight - side) / 2 + (side - cropSide) * y;
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 640;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Görsel düzenleyici başlatılamadı.');
  context.drawImage(image, sourceX, sourceY, cropSide, cropSide, 0, 0, 640, 640);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (!blob) throw new Error('Profil fotoğrafı hazırlanamadı.');
  const path = `${userId}/avatar-${crypto.randomUUID()}.webp`;
  await uploadStorageFile(PROFILE_MEDIA_BUCKET, path, new File([blob], 'avatar.webp', { type: 'image/webp' }), onProgress);
  const { data } = supabase.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function removeProfileImage(path) {
  if (!path) return;
  const publicPrefix = `/storage/v1/object/public/${PROFILE_MEDIA_BUCKET}/`;
  const bucketPrefix = `${PROFILE_MEDIA_BUCKET}/`;
  let storagePath;
  if (path.includes(publicPrefix)) storagePath = path.split(publicPrefix).pop();
  else if (path.startsWith(bucketPrefix)) storagePath = path.slice(bucketPrefix.length);
  else return;
  if (!storagePath.includes('/')) return;
  const { error } = await supabase.storage.from(PROFILE_MEDIA_BUCKET).remove([storagePath]);
  if (error) console.warn('Eski profil görseli temizlenemedi.');
}
