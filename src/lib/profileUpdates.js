export function buildProfilePatch(previous, draft, { avatarChanged = false, bannerChanged = false, statusDuration = 'never', now = Date.now() } = {}) {
  const patch = {};
  if (draft.username.trim() !== previous.username) patch.username = draft.username.trim();
  if (avatarChanged && draft.avatar_url !== previous.avatar_url) patch.avatar_url = draft.avatar_url;
  if (bannerChanged && (draft.banner_url || null) !== (previous.banner_url || null)) patch.banner_url = draft.banner_url || null;
  for (const [field, fallback] of [['banner_position_x', 50], ['banner_position_y', 50], ['banner_zoom', 1]]) {
    if (Number(draft[field]) !== Number(previous[field] ?? fallback)) patch[field] = draft[field];
  }
  if (draft.bio.trim() !== (previous.bio || '')) patch.bio = draft.bio.trim();
  const status = draft.status_text.trim().slice(0, 80);
  if (status !== (previous.status_text || '') || statusDuration !== 'never') {
    patch.status_text = status;
    patch.status_expires_at = status && statusDuration !== 'never' ? new Date(now + Number(statusDuration) * 3_600_000).toISOString() : null;
  }
  return patch;
}

export async function saveProfilePatch(client, userId, patch) {
  if (!Object.keys(patch).length) return;
  const { data, error } = await client.from('profiles').update(patch).eq('id', userId).select('id').maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('Profil kaydedilemedi. Oturumunu yenileyip tekrar dene.');
}

export function profileUpdateError(error) {
  if (error?.code === '23505') return 'Bu kullanıcı adı zaten kullanılıyor.';
  if (error?.code === '42501') return 'Profilini güncelleme izni doğrulanamadı. Tekrar giriş yapıp dene.';
  return error?.message || 'Profil kaydedilemedi. Bağlantını kontrol edip tekrar dene.';
}
