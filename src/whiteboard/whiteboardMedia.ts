import { supabase } from '../lib/supabase';

const WHITEBOARD_MEDIA_BUCKET = 'whiteboard-media';

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `wb_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function parseTimeValue(value: string | null): number | undefined {
  if (!value) return undefined;
  const raw = value.trim().toLowerCase();
  if (!raw) return undefined;

  if (/^\d+$/.test(raw)) return Number(raw);

  const compact = raw.replace(/\s+/g, '');
  const match = compact.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) return undefined;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : undefined;
}

async function readImageDimensions(blob: Blob): Promise<{ w: number; h: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    const dims = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return dims;
  }

  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const dims = { w: img.naturalWidth, h: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image dimensions.'));
    };
    img.src = url;
  });
}

function normalizeExtension(ext: string | undefined, mime: string): string {
  const clean = (ext || '').trim().toLowerCase().replace(/^\./, '');
  if (clean) return clean;
  return IMAGE_MIME_TO_EXT[mime] || 'png';
}

export async function uploadBoardImage(
  file: File | Blob,
  ext: string | undefined,
  options: { userId: string; boardRowId: string },
): Promise<{ url: string; path: string; w: number; h: number; mime: string }> {
  const mime = file.type || 'image/png';
  const finalExt = normalizeExtension(ext, mime);
  const objectName = `${options.userId}/${options.boardRowId}/${randomId()}.${finalExt}`;

  const dims = await readImageDimensions(file);

  const { error: uploadError } = await supabase.storage
    .from(WHITEBOARD_MEDIA_BUCKET)
    .upload(objectName, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: mime,
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload image.');
  }

  const { data } = supabase.storage.from(WHITEBOARD_MEDIA_BUCKET).getPublicUrl(objectName);
  if (!data?.publicUrl) {
    throw new Error('Failed to resolve uploaded image URL.');
  }

  return {
    url: data.publicUrl,
    path: objectName,
    w: dims.w,
    h: dims.h,
    mime,
  };
}

export function parseYouTubeUrl(text: string): { videoId: string; start?: number } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let videoId = '';

  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] || '';
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v') || '';
    } else if (url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/').filter(Boolean)[1] || '';
    } else if (url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/').filter(Boolean)[1] || '';
    }
  }

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

  const start = parseTimeValue(url.searchParams.get('t') || url.searchParams.get('start'));
  return start ? { videoId, start } : { videoId };
}
