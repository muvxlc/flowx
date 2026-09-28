import {
  VALID_JOB_STATES,
  type ChromeStorageArea,
  type JobState,
  type PersistedJob,
  type QuarantinedRecord,
  type StorageSchemaVersion,
} from './types.ts';
import { createMemoryChromeStorage } from './memory-storage.ts';

export const KEY_SCHEMA_VERSION = 'meta_automator_schema_version';
export const KEY_JOBS = 'meta_automator_jobs';
export const KEY_QUARANTINE = 'meta_automator_quarantine';
export const CURRENT_SCHEMA_VERSION: StorageSchemaVersion = 1;

export interface MetadataStorageOptions {
  readonly storage?: ChromeStorageArea | undefined;
}

export class MetadataStorage {
  private readonly storage: ChromeStorageArea;

  constructor(options?: MetadataStorageOptions) {
    if (options?.storage) {
      this.storage = options.storage;
    } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      this.storage = chrome.storage.local as unknown as ChromeStorageArea;
    } else {
      this.storage = createMemoryChromeStorage();
    }
  }

  async getSchemaVersion(): Promise<StorageSchemaVersion> {
    const data = await this.storage.get(KEY_SCHEMA_VERSION);
    const ver = data[KEY_SCHEMA_VERSION];
    if (typeof ver === 'number') {
      return ver;
    }
    return 0;
  }

  async saveJobs(jobs: PersistedJob[]): Promise<void> {
    this.assertNoRawBlobs(jobs);
    await this.storage.set({
      [KEY_JOBS]: jobs,
      [KEY_SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION,
    });
  }

  async getJobs(): Promise<PersistedJob[]> {
    const { validJobs } = await this.loadWithQuarantine();
    return validJobs;
  }

  async loadWithQuarantine(): Promise<{ validJobs: PersistedJob[]; quarantinedCount: number }> {
    const data = await this.storage.get([KEY_JOBS, KEY_SCHEMA_VERSION]);
    const storedVersion = typeof data[KEY_SCHEMA_VERSION] === 'number' ? data[KEY_SCHEMA_VERSION] : 0;
    const rawJobs = data[KEY_JOBS];

    if (!Array.isArray(rawJobs)) {
      return { validJobs: [], quarantinedCount: 0 };
    }

    // Run migration if older schema version
    const candidateJobs = storedVersion < CURRENT_SCHEMA_VERSION ? this.migrateJobs(rawJobs, storedVersion) : rawJobs;

    const validJobs: PersistedJob[] = [];
    const newQuarantine: QuarantinedRecord[] = [];

    for (let i = 0; i < candidateJobs.length; i++) {
      const item = candidateJobs[i];
      const validation = this.validateJobShape(item);
      if (validation.valid && validation.job) {
        validJobs.push(validation.job);
      } else {
        newQuarantine.push({
          recordIndex: i,
          rawData: item,
          quarantinedAt: Date.now(),
          reason: validation.reason ?? 'Unknown validation failure',
        });
      }
    }

    if (newQuarantine.length > 0) {
      const existingQuarantine = await this.getQuarantinedRecords();
      await this.storage.set({
        [KEY_QUARANTINE]: [...existingQuarantine, ...newQuarantine],
        [KEY_JOBS]: validJobs,
        [KEY_SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION,
      });
    } else if (storedVersion < CURRENT_SCHEMA_VERSION) {
      await this.storage.set({
        [KEY_JOBS]: validJobs,
        [KEY_SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION,
      });
    }

    return {
      validJobs,
      quarantinedCount: newQuarantine.length,
    };
  }

  async getQuarantinedRecords(): Promise<QuarantinedRecord[]> {
    const data = await this.storage.get(KEY_QUARANTINE);
    const records = data[KEY_QUARANTINE];
    if (Array.isArray(records)) {
      return records as QuarantinedRecord[];
    }
    return [];
  }

  async clearQuarantine(): Promise<void> {
    await this.storage.remove(KEY_QUARANTINE);
  }

  private assertNoRawBlobs(jobs: unknown[]): void {
    for (const job of jobs) {
      if (typeof job !== 'object' || job === null) continue;
      const rec = job as Record<string, unknown>;
      for (const [key, value] of Object.entries(rec)) {
        if (
          value instanceof Uint8Array ||
          value instanceof ArrayBuffer ||
          (typeof Blob !== 'undefined' && value instanceof Blob) ||
          key.toLowerCase().includes('rawblob')
        ) {
          throw new Error(`Illegal attempt to persist raw media blobs in chrome.storage on field '${key}'. Store blobs in IndexedDB.`);
        }
      }
    }
  }

  private validateJobShape(item: unknown): { valid: boolean; job?: PersistedJob; reason?: string } {
    if (typeof item !== 'object' || item === null) {
      return { valid: false, reason: 'Record is null or not an object' };
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec['id'] !== 'string' || rec['id'].trim() === '') {
      return { valid: false, reason: 'Missing or empty string id' };
    }
    if (typeof rec['prompt'] !== 'string') {
      return { valid: false, reason: 'Missing string prompt' };
    }
    if (typeof rec['state'] !== 'string' || !VALID_JOB_STATES.includes(rec['state'] as JobState)) {
      return { valid: false, reason: `Missing or invalid job state: ${String(rec['state'])}` };
    }
    return { valid: true, job: item as PersistedJob };
  }

  private migrateJobs(rawJobs: unknown[], fromVersion: number): unknown[] {
    return rawJobs.map((item) => {
      if (typeof item !== 'object' || item === null) return item;
      const rec = item as Record<string, unknown>;
      // Legacy schema (v0) adaptation
      if ('prompt_text' in rec && !('prompt' in rec)) {
        const stateMap: Record<string, string> = {
          queued: 'pending',
          processing: 'running',
          done: 'completed',
          error: 'failed',
        };
        const rawStatus = typeof rec['status'] === 'string' ? rec['status'] : 'pending';
        return {
          id: String(rec['id'] ?? `legacy-${Date.now()}`),
          media: 'image',
          mode: 'text-only',
          prompt: String(rec['prompt_text'] ?? ''),
          provider: 'meta',
          state: stateMap[rawStatus] ?? 'pending',
          retryCount: 0,
          maxRetries: 3,
          createdAt: Number(rec['timestamp'] ?? Date.now()),
          updatedAt: Date.now(),
        };
      }
      return item;
    });
  }
}
