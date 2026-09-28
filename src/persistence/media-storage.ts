import type { MediaReference, StoredMedia } from './types.ts';

const DB_NAME = 'meta_automator_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'media_blobs';

interface IDBRecord {
  id: string;
  mimeType: string;
  byteLength: number;
  createdAt: number;
  data: ArrayBuffer;
}

export class MediaStorage {
  private readonly memoryStore = new Map<string, IDBRecord>();
  private readonly useIndexedDB: boolean;

  constructor(forceMemory = false) {
    this.useIndexedDB = !forceMemory && typeof indexedDB !== 'undefined';
  }

  async saveMedia(
    id: string,
    data: Uint8Array | ArrayBuffer | Blob,
    mimeType: string
  ): Promise<MediaReference> {
    const buffer = await this.toBuffer(data);
    const record: IDBRecord = {
      id,
      mimeType,
      byteLength: buffer.byteLength,
      createdAt: Date.now(),
      data: buffer,
    };

    if (this.useIndexedDB) {
      await this.saveToIDB(record);
    } else {
      this.memoryStore.set(id, record);
    }

    return {
      id: record.id,
      mimeType: record.mimeType,
      byteLength: record.byteLength,
      createdAt: record.createdAt,
    };
  }

  async getMedia(id: string): Promise<StoredMedia | null> {
    if (this.useIndexedDB) {
      const rec = await this.getFromIDB(id);
      if (!rec) return null;
      return {
        data: rec.data,
        mimeType: rec.mimeType,
      };
    }

    const rec = this.memoryStore.get(id);
    if (!rec) return null;
    return {
      data: rec.data.slice(0),
      mimeType: rec.mimeType,
    };
  }

  async hasMedia(id: string): Promise<boolean> {
    if (this.useIndexedDB) {
      const rec = await this.getFromIDB(id);
      return rec !== null;
    }
    return this.memoryStore.has(id);
  }

  async deleteMedia(id: string): Promise<boolean> {
    if (this.useIndexedDB) {
      return this.deleteFromIDB(id);
    }
    return this.memoryStore.delete(id);
  }

  async clear(): Promise<void> {
    if (this.useIndexedDB) {
      await this.clearIDB();
    } else {
      this.memoryStore.clear();
    }
  }

  private async toBuffer(input: Uint8Array | ArrayBuffer | Blob): Promise<ArrayBuffer> {
    if (input instanceof ArrayBuffer) {
      return input.slice(0);
    }
    if (input instanceof Uint8Array) {
      const copy = new Uint8Array(input.byteLength);
      copy.set(input);
      return copy.buffer;
    }
    if (typeof Blob !== 'undefined' && input instanceof Blob) {
      return input.arrayBuffer();
    }
    throw new Error('Unsupported media data type: expected Uint8Array, ArrayBuffer, or Blob.');
  }

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  private async saveToIDB(record: IDBRecord): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  private async getFromIDB(id: string): Promise<IDBRecord | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  private async deleteFromIDB(id: string): Promise<boolean> {
    const exists = await this.hasMedia(id);
    if (!exists) return false;
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  private async clearIDB(): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }
}
