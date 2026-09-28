import type { Job } from '../queue/types.ts';
import { FilenameRegistry } from './naming.ts';
import type {
  DownloadItem,
  DownloadOptions,
  DownloadResult,
  DownloadsAdapter,
} from './types.ts';

const VERIFIED_META_HOST_SUFFIXES = [
  'meta.ai',
  'fbcdn.net',
  'instagram.com',
];

export function validateJobProvenance(
  job: Job
): { ok: true; url: string } | { ok: false; error: string } {
  if (job.state !== 'completed' || !job.result?.mediaUrl) {
    return { ok: false, error: 'Incomplete job or missing verified result URL' };
  }

  if (job.result.mediaType !== job.media) {
    return {
      ok: false,
      error: `Media type mismatch: job requested ${job.media} but result is ${job.result.mediaType}`,
    };
  }

  const rawUrl = job.result.mediaUrl.trim();
  if (rawUrl.length === 0) {
    return { ok: false, error: 'Empty media URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: `Invalid URL format: ${rawUrl.slice(0, 30)}` };
  }

  if (parsed.protocol === 'http:') {
    return { ok: false, error: `Insecure plain HTTP disallowed: ${rawUrl.slice(0, 30)}` };
  }

  if (parsed.protocol === 'https:') {
    const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    const isVerifiedHost = VERIFIED_META_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
    if (!isVerifiedHost) {
      return { ok: false, error: `Unverified provider origin: ${host}` };
    }
    return { ok: true, url: rawUrl };
  }

  if (parsed.protocol === 'mock:') {
    if (parsed.hostname === 'meta-ai') {
      return { ok: true, url: rawUrl };
    }
    return { ok: false, error: `Unverified mock artifact host: ${parsed.hostname}` };
  }

  if (parsed.protocol === 'blob:') {
    return { ok: true, url: rawUrl };
  }

  if (parsed.protocol === 'data:') {
    const mediaType = parsed.pathname.split(';')[0]?.toLowerCase();
    if (mediaType && (mediaType.startsWith('image/') || mediaType.startsWith('video/'))) {
      return { ok: true, url: rawUrl };
    }
    return { ok: false, error: `Unsafe or disallowed URL scheme: ${rawUrl.slice(0, 30)}` };
  }

  return { ok: false, error: `Unsafe or disallowed URL scheme: ${rawUrl.slice(0, 30)}` };
}

export class DownloadManager {
  private readonly adapter: DownloadsAdapter;
  private readonly filenameRegistry: FilenameRegistry;

  constructor(options: {
    adapter: DownloadsAdapter;
    filenameRegistry?: FilenameRegistry | undefined;
  }) {
    this.adapter = options.adapter;
    this.filenameRegistry = options.filenameRegistry ?? new FilenameRegistry();
  }

  async downloadJob(
    job: Job,
    options?: {
      suggestedName?: string | undefined;
      conflictAction?: 'uniquify' | 'overwrite' | 'prompt' | undefined;
    } | undefined
  ): Promise<DownloadResult> {
    const validation = validateJobProvenance(job);
    if (!validation.ok) {
      return {
        jobId: job.id,
        filename: '',
        status: 'error',
        error: validation.error,
      };
    }

    const url = validation.url;
    const filename = this.filenameRegistry.getUniqueFilename({
      jobId: job.id,
      suggestedName: options?.suggestedName,
      mediaType: job.media,
      mimeType: job.result!.mimeType,
    });

    try {
      const downloadId = await this.adapter.download({
        url,
        filename,
        conflictAction: options?.conflictAction ?? 'uniquify',
      });

      return {
        jobId: job.id,
        filename,
        status: 'success',
        downloadId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        jobId: job.id,
        filename,
        status: 'error',
        error: message,
      };
    }
  }

  async downloadJobs(
    jobs: readonly Job[],
    options?: DownloadOptions
  ): Promise<DownloadResult[]> {
    let targetJobs = jobs;

    if (options?.filter?.mediaType && options.filter.mediaType !== 'all') {
      targetJobs = targetJobs.filter((j) => j.media === options.filter?.mediaType);
    }

    if (options?.filter?.jobIds && options.filter.jobIds.length > 0) {
      const idSet = new Set(options.filter.jobIds);
      targetJobs = targetJobs.filter((j) => idSet.has(j.id));
    }

    const results: DownloadResult[] = [];
    for (const job of targetJobs) {
      const res = await this.downloadJob(job, {
        conflictAction: options?.conflictAction,
      });
      results.push(res);
    }

    return results;
  }

  static createDownloadItems(jobs: readonly Job[]): DownloadItem[] {
    return jobs
      .filter((j): j is Job & { result: NonNullable<Job['result']> } => {
        return validateJobProvenance(j).ok;
      })
      .map((j) => {
        const resolution =
          j.result.width && j.result.height
            ? `${j.result.width}x${j.result.height}`
            : j.media === 'video'
              ? '1080p'
              : 'Unknown';

        return {
          id: `dl_${j.id}`,
          jobId: j.id,
          mediaType: j.media,
          filename: `meta_${j.media}_${j.id}.${j.media === 'image' ? 'png' : 'mp4'}`,
          url: j.result.mediaUrl,
          resolution,
          completedAt: j.completedAt ?? Date.now(),
          downloadStatus: 'idle',
        };
      });
  }
}
