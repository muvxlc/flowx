import assert from 'node:assert';
import {
  PersistenceService,
  createMemoryChromeStorage,
  type PersistedJob,
} from '../../src/persistence/index.ts';

async function runWorkerRecreationManualQACheck() {
  console.log('[manual-qa] Starting worker recreation lifecycle check in Node...');

  const sharedStorage = createMemoryChromeStorage();

  // Phase 1: Service Worker Instance 1 simulates queueing and running a job
  console.log('[manual-qa] Phase 1: Booting worker instance 1');
  const worker1 = new PersistenceService({ storage: sharedStorage });

  const testImage = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const mediaRef = await worker1.saveMediaBlob('ref-image-alpha', testImage, 'image/jpeg');
  assert.strictEqual(mediaRef.id, 'ref-image-alpha');
  console.log('[manual-qa] Saved media blob to IndexedDB adapter (bytes: %d)', mediaRef.byteLength);

  const initialJobs: PersistedJob[] = [
    {
      id: 'job-completed-prior',
      media: 'image',
      mode: 'text-only',
      prompt: 'A completed portrait',
      provider: 'meta',
      state: 'completed',
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 5000,
      completedAt: Date.now() - 5000,
      result: {
        idempotencyKey: 'idem-prior',
        mediaUrl: 'https://example.com/portrait.jpg',
        mediaType: 'image',
        mimeType: 'image/jpeg',
        completedAt: Date.now() - 5000,
      },
    },
    {
      id: 'job-mid-execution',
      media: 'image',
      mode: 'single-ref',
      prompt: 'Stylized photo of Bangkok river',
      referenceId: 'ref-image-alpha',
      provider: 'meta',
      state: 'running', // Mid-execution when worker is suspended
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now() - 3000,
      updatedAt: Date.now() - 1000,
      startedAt: Date.now() - 1000,
    },
  ];

  await worker1.saveQueue(initialJobs);
  console.log('[manual-qa] Worker 1 saved queue state with 1 completed and 1 running job.');

  // Phase 2: Service Worker suspension simulation
  // Simulate complete teardown of worker instance 1 in memory
  console.log('[manual-qa] Phase 2: Simulating worker suspension/teardown (worker 1 terminated)');

  // Phase 3: Service Worker Instance 2 boots up (e.g. on chrome.alarms wakeup)
  console.log('[manual-qa] Phase 3: Booting worker instance 2 from persistent storage');
  const worker2 = new PersistenceService({
    storage: sharedStorage,
    mediaStorage: worker1.getMediaStorage(), // IndexedDB persists across SW lifecycles
  });

  const rehydration = await worker2.rehydrateQueue();
  console.log(
    '[manual-qa] Worker 2 rehydration complete: %d jobs, %d interrupted reset, %d missing media, %d quarantined',
    rehydration.jobs.length,
    rehydration.interruptedResetCount,
    rehydration.missingMediaCount,
    rehydration.quarantinedCount
  );

  // Invariant assertions
  assert.strictEqual(rehydration.jobs.length, 2, 'Must preserve all jobs');
  assert.strictEqual(rehydration.interruptedResetCount, 1, 'Must detect 1 interrupted job');

  const completedJob = rehydration.jobs.find((j) => j.id === 'job-completed-prior');
  assert.strictEqual(completedJob?.state, 'completed', 'Completed job must NOT be reset or repeated');

  const interruptedJob = rehydration.jobs.find((j) => j.id === 'job-mid-execution');
  assert.strictEqual(interruptedJob?.state, 'pending', 'Interrupted job must safely reset to pending');
  assert.strictEqual(interruptedJob?.startedAt, null, 'startedAt must be cleared on interrupted reset');
  assert.ok(interruptedJob?.error?.includes('interrupted'), 'Error reason must note worker interruption');

  // Verify media reference is still accessible
  const retrievedMedia = await worker2.getMediaBlob('ref-image-alpha');
  assert.ok(retrievedMedia !== null, 'Media must still exist across worker lifecycles');
  assert.strictEqual(retrievedMedia.mimeType, 'image/jpeg');

  console.log('[manual-qa] All worker recreation invariants verified successfully.');
}

runWorkerRecreationManualQACheck().catch((err) => {
  console.error('[manual-qa] QA check failed:', err);
  process.exit(1);
});
