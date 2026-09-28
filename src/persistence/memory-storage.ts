import type { ChromeStorageArea } from './types.ts';

export class MemoryChromeStorageArea implements ChromeStorageArea {
  private readonly store = new Map<string, unknown>();

  async get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    if (keys === null || keys === undefined) {
      for (const [k, v] of this.store.entries()) {
        result[k] = structuredClone(v);
      }
      return result;
    }

    if (typeof keys === 'string') {
      if (this.store.has(keys)) {
        result[keys] = structuredClone(this.store.get(keys));
      }
      return result;
    }

    if (Array.isArray(keys)) {
      for (const key of keys) {
        if (this.store.has(key)) {
          result[key] = structuredClone(this.store.get(key));
        }
      }
      return result;
    }

    // Default object mapping { key: defaultValue }
    for (const [key, defaultValue] of Object.entries(keys)) {
      if (this.store.has(key)) {
        result[key] = structuredClone(this.store.get(key));
      } else {
        result[key] = structuredClone(defaultValue);
      }
    }
    return result;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(items)) {
      this.store.set(k, structuredClone(v));
    }
  }

  async remove(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) {
      this.store.delete(k);
    }
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

export function createMemoryChromeStorage(): ChromeStorageArea {
  return new MemoryChromeStorageArea();
}
