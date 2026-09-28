import type {
  CleanupContext,
  CleanupResult,
} from './types.ts';
import type { MediaStorage } from '../persistence/index.ts';

async function listAllMediaIds(media: MediaStorage): Promise<string[]> {
  const memStore = (media as unknown as { memoryStore?: Map<string, unknown> }).memoryStore;
  if (memStore instanceof Map) {
    return Array.from(memStore.keys());
  }

  if (typeof indexedDB !== 'undefined') {
    return new Promise((resolve) => {
      const req = indexedDB.open('meta_automator_media_db', 1);
      req.onerror = () => resolve([]);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('media_blobs')) {
          db.close();
          return resolve([]);
        }
        const tx = db.transaction('media_blobs', 'readonly');
        const store = tx.objectStore('media_blobs');
        const keysReq = store.getAllKeys();
        keysReq.onsuccess = () => {
          db.close();
          resolve(keysReq.result.map(String));
        };
        keysReq.onerror = () => {
          db.close();
          resolve([]);
        };
      };
    });
  }

  return [];
}

export async function safeCleanupTempStorage(context: CleanupContext): Promise<CleanupResult> {
  const { metadata, media, options } = context;

  // Strict invariant: Confirmation required
  if (options.userConfirmed !== true) {
    throw new Error('Cleanup rejected: user confirmation required');
  }

  // 1. Get active jobs to identify referenced media
  const activeJobs = await metadata.getJobs();
  const referencedIds = new Set<string>();
  for (const job of activeJobs) {
    if (typeof job.referenceId === 'string' && job.referenceId.trim().length > 0) {
      referencedIds.add(job.referenceId);
    }
  }

  // 2. Scan and remove orphaned/temporary media blobs
  const allMediaIds = await listAllMediaIds(media);
  let clearedTempBlobsCount = 0;
  let bytesFreed = 0;

  for (const mediaId of allMediaIds) {
    if (!referencedIds.has(mediaId)) {
      const stored = await media.getMedia(mediaId);
      if (stored) {
        bytesFreed += stored.data.byteLength;
      }
      await media.deleteMedia(mediaId);
      clearedTempBlobsCount++;
    }
  }

  // 3. Clear quarantine if requested
  let clearedQuarantineCount = 0;
  if (options.deleteQuarantine) {
    const quarantined = await metadata.getQuarantinedRecords();
    clearedQuarantineCount = quarantined.length;
    await metadata.clearQuarantine();
  }

  // 4. Verify preserved keys in storage
  const storage = (metadata as unknown as { storage?: { get(k: null): Promise<Record<string, unknown>> } }).storage;
  let preservedKeysCount = 0;
  if (storage && typeof storage.get === 'function') {
    const allStored = await storage.get(null);
    preservedKeysCount = Object.keys(allStored).length;
  }

  return {
    clearedTempBlobsCount,
    clearedQuarantineCount,
    preservedQueueJobsCount: activeJobs.length,
    preservedKeysCount,
    bytesFreed,
  };
}
