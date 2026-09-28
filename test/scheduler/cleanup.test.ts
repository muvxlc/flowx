import test from 'node:test';
import assert from 'node:assert';
import { safeCleanupTempStorage } from '../../src/scheduler/index.ts';
import {
  MetadataStorage,
  MediaStorage,
  createMemoryChromeStorage,
  type PersistedJob,
} from '../../src/persistence/index.ts';

test('Cleanup - rejects unconfirmed cleanup request without touching data', async () => {
  const storage = createMemoryChromeStorage();
  const metadata = new MetadataStorage({ storage });
  const media = new MediaStorage(true);

  // Setup valid queue and key
  await storage.set({
    meta_automator_jobs: [{ id: 'job-1', prompt: 'test', state: 'pending' }],
    meta_automator_settings: { endpoint: 'https://example.com' },
    jev_api_key: 'dummy_secret',
  });

  await assert.rejects(
    async () => {
      await safeCleanupTempStorage({ metadata, media, options: { userConfirmed: false } });
    },
    /confirmation required/i
  );

  const data = await storage.get(null);
  assert.ok(data.meta_automator_jobs, 'Queue jobs must remain untouched');
  assert.strictEqual(data.jev_api_key, 'dummy_secret', 'API key must remain untouched');
});

test('Cleanup - removes temporary unreferenced media blobs while preserving active queue assets', async () => {
  const storage = createMemoryChromeStorage();
  const metadata = new MetadataStorage({ storage });
  const media = new MediaStorage(true);

  // Active referenced media blob
  const activeBlob = new Uint8Array([1, 2, 3, 4, 5]);
  const activeRef = await media.saveMedia('ref-active-1', activeBlob, 'image/png');

  // Orphaned/temp media blob
  const tempBlob = new Uint8Array([9, 9, 9]);
  const tempRef = await media.saveMedia('temp-orphaned-blob', tempBlob, 'image/png');

  const activeJob: PersistedJob = {
    id: 'job-with-ref',
    media: 'image',
    mode: 'single-ref',
    prompt: 'A prompt with active reference',
    referenceId: activeRef.id,
    provider: 'meta',
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await metadata.saveJobs([activeJob]);

  // Execute confirmed cleanup
  const result = await safeCleanupTempStorage({
    metadata,
    media,
    options: { userConfirmed: true },
  });

  assert.strictEqual(result.clearedTempBlobsCount, 1, 'Only 1 orphaned temp blob should be removed');
  assert.strictEqual(result.preservedQueueJobsCount, 1, 'Active queue job preserved');

  // Verify active blob is intact
  const loadedActive = await media.getMedia('ref-active-1');
  assert.ok(loadedActive, 'Active referenced media must NOT be deleted');

  // Verify orphaned blob is removed
  const loadedTemp = await media.getMedia('temp-orphaned-blob');
  assert.strictEqual(loadedTemp, null, 'Orphaned temp blob must be deleted');
});

test('Cleanup - cleans quarantined temporary entries without deleting valid queue jobs or credentials', async () => {
  const storage = createMemoryChromeStorage();
  const metadata = new MetadataStorage({ storage });
  const media = new MediaStorage(true);

  // Set malformed quarantine + valid jobs + secret key
  await storage.set({
    meta_automator_jobs: [{ id: 'job-valid', prompt: 'clean', state: 'pending' }],
    meta_automator_quarantine: [
      { recordIndex: 0, rawData: 'corrupt', quarantinedAt: Date.now(), reason: 'bad entry' },
    ],
    meta_automator_settings: { timeout: 30 },
    jev_api_key: 'dummy_secret',
  });

  const result = await safeCleanupTempStorage({
    metadata,
    media,
    options: { userConfirmed: true, deleteQuarantine: true },
  });

  assert.strictEqual(result.clearedQuarantineCount, 1);
  assert.strictEqual(result.preservedQueueJobsCount, 1);
  assert.ok(result.preservedKeysCount >= 2);

  const data = await storage.get(null);
  assert.strictEqual(data.jev_api_key, 'dummy_secret');
  assert.ok(data.meta_automator_jobs);
  const quarantined = await metadata.getQuarantinedRecords();
  assert.deepStrictEqual(quarantined, []);
});
