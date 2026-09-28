import type { DownloadItem } from '../../exports/types.ts';

export interface DownloadsViewOptions {
  items: readonly DownloadItem[];
  activeFilter?: 'all' | 'image' | 'video' | undefined;
}
