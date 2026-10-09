import { supabase } from './supabase';

/** Upload through Supabase Storage with real byte-level progress events. */
export async function uploadStorageFile(bucket, path, file, onProgress) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error('Oturumun sona ermiş. Yeniden giriş yap.');

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', endpoint);
    request.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY);
    request.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.setRequestHeader('x-upsert', 'false');
    request.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100)));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      let message = `Yükleme başarısız (${request.status}).`;
      try { message = JSON.parse(request.responseText)?.message || message; } catch { /* Keep the HTTP fallback. */ }
      reject(new Error(message));
    });
    request.addEventListener('error', () => reject(new Error('Ağ bağlantısı kesildi; yükleme tamamlanamadı.')));
    request.addEventListener('abort', () => reject(new Error('Yükleme iptal edildi.')));
    request.send(file);
  });
}
