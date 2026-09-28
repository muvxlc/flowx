import type { Job, MediaTarget } from '../queue/types.ts';

export type DownloadStatus = 'idle' | 'in_progress' | 'completed' | 'error';

export interface DownloadItem {
  id: string;
  jobId: string;
  mediaType: MediaTarget;
  filename: string;
  url: string;
  resolution?: string | undefined;
  completedAt: number;
  downloadStatus: DownloadStatus;
  error?: string | undefined;
}

export interface SafeFilenameParams {
  jobId: string;
  suggestedName?: string | undefined;
  mediaType: MediaTarget;
  mimeType?: string | undefined;
  index?: number | undefined;
}

export interface DownloadFilter {
  mediaType?: MediaTarget | 'all' | undefined;
  jobIds?: string[] | undefined;
}

export interface DownloadOptions {
  filter?: DownloadFilter | undefined;
  conflictAction?: 'uniquify' | 'overwrite' | 'prompt' | undefined;
}

export interface DownloadResult {
  jobId: string;
  filename: string;
  status: 'success' | 'error';
  error?: string | undefined;
  downloadId?: number | string | undefined;
}

export interface CsvExportOptions {
  includePrompt?: boolean | undefined;
}

export interface DownloadsAdapterOptions {
  url: string;
  filename: string;
  conflictAction?: 'uniquify' | 'overwrite' | 'prompt' | undefined;
  saveAs?: boolean | undefined;
}

export interface DownloadsAdapter {
  download(options: DownloadsAdapterOptions): Promise<string | number>;
}
