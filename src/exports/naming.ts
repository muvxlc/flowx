import type { MediaTarget } from '../queue/types.ts';
import type { SafeFilenameParams } from './types.ts';

function inferExtension(mediaType: MediaTarget, mimeType?: string): string {
  if (mimeType) {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
    if (normalized.includes('png')) return '.png';
    if (normalized.includes('webp')) return '.webp';
    if (normalized.includes('gif')) return '.gif';
    if (normalized.includes('mp4')) return '.mp4';
    if (normalized.includes('webm')) return '.webm';
    if (normalized.includes('quicktime')) return '.mov';
  }
  return mediaType === 'image' ? '.png' : '.mp4';
}

function sanitizeBase(name: string): string {
  return name
    .replace(/\.\./g, '_')
    .replace(/[/\\]/g, '_')
    .replace(/[<>:"|?*]/g, '_')
    // Strip non-printable ASCII control chars
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .replace(/^[._]+/, '')
    .slice(0, 100);
}

export function generateSafeFilename(params: SafeFilenameParams): string {
  const ext = inferExtension(params.mediaType, params.mimeType);
  const rawBase = params.suggestedName ? params.suggestedName.replace(/\.[^/.]+$/, '') : '';
  const sanitized = sanitizeBase(rawBase);
  const base = sanitized.length > 0 ? sanitized : `meta_${params.mediaType}_${params.jobId}`;

  return `${base}${ext}`;
}

export class FilenameRegistry {
  private readonly usedNames = new Map<string, number>();

  getUniqueFilename(params: SafeFilenameParams): string {
    const ext = inferExtension(params.mediaType, params.mimeType);
    const rawBase = params.suggestedName ? params.suggestedName.replace(/\.[^/.]+$/, '') : '';
    const sanitized = sanitizeBase(rawBase);
    const base = sanitized.length > 0 ? sanitized : `meta_${params.mediaType}_${params.jobId}`;

    const count = this.usedNames.get(base) ?? 0;
    this.usedNames.set(base, count + 1);

    if (count === 0) {
      return `${base}${ext}`;
    }
    return `${base}_${count}${ext}`;
  }

  reset(): void {
    this.usedNames.clear();
  }
}
