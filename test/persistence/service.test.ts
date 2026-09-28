import test from 'node:test';
import assert from 'node:assert';
import {
  PersistenceService,
  createMemoryChromeStorage,
  type PersistedJob,
} from '../../src/persistence/index.ts';

test('PersistenceService - end-to-end queue persistence, media storage, and rehydration', async () => {
  const fakeStorage = createMemoryChromeStorage();
  const service = new PersistenceService({
    storage: fakeStorage,
  });

  // Store media reference blob
  const imageBytes = new Uint8Array([0x10, 0x20, 0x30]);
  const mediaRef = await service.saveMediaBlob('ref-1', imageBytes, 'image/jpeg');
  assert.strictEqual(mediaRef.id, 'ref-1');

  // Store jobs
  const jobs: PersistedJob[] = [
    {
      id: 'job-e2e-1',
      media: 'image',
      mode: 'single-ref',
      prompt: 'Bangkok street market photo',
      referenceId: 'ref-1',
      provider: 'meta',
      state: 'pending',
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  await service.saveQueue(jobs);

  // Simulate worker death and new service instance rehydration
  const freshService = new PersistenceService({
    storage: fakeStorage,
    mediaStorage: service.getMediaStorage(), // shared IDB
  });

  const rehydrated = await freshService.rehydrateQueue();
  assert.strictEqual(rehydrated.jobs.length, 1);
  assert.strictEqual(rehydrated.jobs[0]?.id, 'job-e2e-1');
  assert.strictEqual(rehydrated.jobs[0]?.state, 'pending');

  // Verify media blob can be loaded
  const media = await freshService.getMediaBlob('ref-1');
  assert.ok(media !== null);
  assert.strictEqual(media.mimeType, 'image/jpeg');
  assert.deepStrictEqual(new Uint8Array(media.data), imageBytes);
});
