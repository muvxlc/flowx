import type { DownloadsAdapter, DownloadsAdapterOptions } from './types.ts';

export class MemoryDownloadsAdapter implements DownloadsAdapter {
  readonly downloads: Array<{
    id: number;
    url: string;
    filename: string;
    conflictAction?: string | undefined;
  }> = [];

  private nextId = 1;
  private readonly failUrls: Set<string>;

  constructor(options?: { failUrls?: Set<string> }) {
    this.failUrls = options?.failUrls ?? new Set();
  }

  async download(options: DownloadsAdapterOptions): Promise<number> {
    if (this.failUrls.has(options.url)) {
      throw new Error(`Download interrupted or revoked URL: ${options.url}`);
    }

    const id = this.nextId++;
    this.downloads.push({
      id,
      url: options.url,
      filename: options.filename,
      conflictAction: options.conflictAction,
    });

    return id;
  }

  reset(): void {
    this.downloads.length = 0;
    this.nextId = 1;
  }
}

export class ChromeDownloadsAdapter implements DownloadsAdapter {
  async download(options: DownloadsAdapterOptions): Promise<number> {
    if (typeof chrome === 'undefined' || !chrome.downloads?.download) {
      throw new Error('chrome.downloads API is unavailable in current runtime context');
    }

    if (options.url.startsWith('mock:')) {
      throw new Error('Chrome downloads API does not permit mock:// scheme; use mock adapter or safe local artifact');
    }

    return new Promise<number>((resolve, reject) => {
      chrome.downloads.download(
        {
          url: options.url,
          filename: options.filename,
          conflictAction: options.conflictAction ?? 'uniquify',
          saveAs: options.saveAs ?? false,
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (downloadId === undefined) {
            reject(new Error('chrome.downloads.download returned undefined ID'));
          } else {
            resolve(downloadId);
          }
        }
      );
    });
  }
}
