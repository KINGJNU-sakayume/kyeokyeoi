import { useEffect, useState } from 'react';
import { getPhotoBlob } from '../db/index';

const MAX_EDGE = 1600;

/** 긴 변 1600px 이하로 줄이고 WebP(안 되면 JPEG)로 다시 저장해요. 실패하면 원본을 그대로 써요. */
export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const toBlob = (type: string, q: number) =>
      new Promise<Blob | null>(res => canvas.toBlob(res, type, q));
    let out = await toBlob('image/webp', 0.82);
    if (!out || out.type !== 'image/webp') out = await toBlob('image/jpeg', 0.85);
    if (!out) return file;
    return out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

// 같은 사진을 여러 화면에서 쓰므로 object URL을 한 번만 만들어요.
const urlCache = new Map<string, string>();

export function registerPhotoURL(id: string, blob: Blob): string {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function forgetPhotoURL(id: string) {
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
}

export function usePhotoURL(id: string | undefined): string | null {
  // 캐시에 있으면 바로 쓰고, 없으면 읽어 온 뒤 다시 그려요
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id || urlCache.has(id)) return;
    let alive = true;
    getPhotoBlob(id).then(blob => {
      if (alive && blob) setLoaded({ id, url: registerPhotoURL(id, blob) });
    }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  if (!id) return null;
  return urlCache.get(id) ?? (loaded?.id === id ? loaded.url : null);
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)}GB`;
}
