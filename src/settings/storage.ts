import type { StorageAdapter } from './types.ts';

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    const raw = this.store.get(key);
    if (raw === undefined) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export class ChromeLocalStorageAdapter implements StorageAdapter {
  async get<T>(key: string): Promise<T | null> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return null;
    }
    return new Promise<T | null>((resolve) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime?.lastError) {
          resolve(null);
          return;
        }
        const val = result ? (result[key] as T | undefined) : undefined;
        resolve(val ?? null);
      });
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return;
    }
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  async remove(key: string): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return;
    }
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.remove([key], () => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }
}
