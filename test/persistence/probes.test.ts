import test from 'node:test';
import assert from 'node:assert';
import {
  MetadataStorage,
  RecoveryManager,
  PersistenceService,
  createMemoryChromeStorage,
  type PersistedJob,
} from '../../src/persistence/index.ts';

test('Probe - repeated interrupts escalate to needs-review to prevent infinite retry loop', () => {
  const recovery = new RecoveryManager(3); // max 3 interrupts allowed
  let job: PersistedJob = {
    id: 'job-unstable-worker',
    media: 'video',
    mode: 'text-only',
    prompt: 'Prompt that crashes worker',
    provider: 'meta',
    state: 'running',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1000,
    updatedAt: 1000,
  };

  // Interruption 1
  let res = recovery.rehydrateOnWorkerRestart([job]);
  assert.strictEqual(res.jobs[0]?.state, 'pending');
  assert.strictEqual(res.jobs[0]?.interruptCount, 1);

  // Job runs again and gets interrupted 2nd time
  job = { ...res.jobs[0]!, state: 'running' };
  res = recovery.rehydrateOnWorkerRestart([job]);
  assert.strictEqual(res.jobs[0]?.state, 'pending');
  assert.strictEqual(res.jobs[0]?.interruptCount, 2);

  // Job runs again and gets interrupted 3rd time
  job = { ...res.jobs[0]!, state: 'running' };
  res = recovery.rehydrateOnWorkerRestart([job]);
  // 3rd interrupt hits threshold -> MUST escalate to 'needs-review'
  assert.strictEqual(res.jobs[0]?.state, 'needs-review');
  assert.strictEqual(res.jobs[0]?.interruptCount, 3);
  assert.ok(res.jobs[0]?.error?.includes('repeatedly interrupted'));
});

test('Probe - malformed and dirty storage entries never crash loader and preserve clean jobs', async () => {
  const storage = createMemoryChromeStorage();

  // Inject dirty, partial, and malformed structures
  await storage.set({
    'meta_automator_jobs': [
      12345, // primitive number
      {}, // empty object
      { id: 'job-good-1', prompt: 'clean prompt', state: 'pending' },
      { id: '', prompt: 'blank id', state: 'pending' },
      { id: 'job-missing-state', prompt: 'missing state' },
      { id: 'job-good-2', prompt: 'another clean prompt', state: 'completed' },
      undefined,
      false,
    ],
  });

  const metadataStore = new MetadataStorage({ storage });
  const report = await metadataStore.loadWithQuarantine();

  assert.strictEqual(report.validJobs.length, 2);
  assert.strictEqual(report.validJobs[0]?.id, 'job-good-1');
  assert.strictEqual(report.validJobs[1]?.id, 'job-good-2');
  assert.strictEqual(report.quarantinedCount, 6);

  const quarantined = await metadataStore.getQuarantinedRecords();
  assert.strictEqual(quarantined.length, 6);
});

test('Probe - worker recreation lifecycle simulation (Node manual QA scenario)', async () => {
  // Simulates a single shared Chrome storage area across multiple Service Worker instantiations
  const sharedStorage = createMemoryChromeStorage();

  // Worker Instance 1: Starts up, adds jobs, starts processing
  const worker1 = new PersistenceService({ storage: sharedStorage });
  const initialJobs: PersistedJob[] = [
    {
      id: 'job-worker-1',
      media: 'image',
      mode: 'text-only',
      prompt: 'Worker recreation test prompt 1',
      provider: 'meta',
      state: 'completed',
      retryCount: 0,
      maxRetries: 3,
      createdAt: 1000,
      updatedAt: 1500,
      completedAt: 1500,
      result: {
        idempotencyKey: 'idem-1',
        mediaUrl: 'https://example.com/result.jpg',
        mediaType: 'image',
        mimeType: 'image/jpeg',
        completedAt: 1500,
      },
    },
    {
      id: 'job-worker-2',
      media: 'video',
      mode: 'text-only',
      prompt: 'Worker recreation test prompt 2',
      provider: 'meta',
      state: 'running', // Mid-execution when worker 1 terminated
      retryCount: 0,
      maxRetries: 3,
      createdAt: 1200,
      updatedAt: 1800,
      startedAt: 1800,
    },
  ];
  await worker1.saveQueue(initialJobs);

  // Worker Instance 1 dies / suspends.
  // Worker Instance 2 spins up on wakeup alarm/event.
  const worker2 = new PersistenceService({ storage: sharedStorage });
  const rehydration = await worker2.rehydrateQueue();

  assert.strictEqual(rehydration.jobs.length, 2);
  assert.strictEqual(rehydration.interruptedResetCount, 1);

  // Verify invariants after recreation
  const job1 = rehydration.jobs.find((j) => j.id === 'job-worker-1');
  assert.strictEqual(job1?.state, 'completed');
  assert.strictEqual(job1?.completedAt, 1500);

  const job2 = rehydration.jobs.find((j) => j.id === 'job-worker-2');
  assert.strictEqual(job2?.state, 'pending');
  assert.strictEqual(job2?.startedAt, null);
  assert.ok(job2?.error?.includes('interrupted'));

  // Clean-up check: clearAll wipes everything safely
  await worker2.clearAll();
  const emptyQueue = await worker2.rehydrateQueue();
  assert.strictEqual(emptyQueue.jobs.length, 0);
  const emptyQuarantine = await worker2.getQuarantinedRecords();
  assert.strictEqual(emptyQuarantine.length, 0);
});

test('Probe 5.1 - completed job with purged input reference remains completed upon rehydration', async () => {
  const storage = createMemoryChromeStorage();
  const service = new PersistenceService({ storage });
  const completedJob: PersistedJob = {
    id: 'job_done_1',
    media: 'image',
    mode: 'single-ref',
    prompt: 'pine forest',
    referenceId: 'ref_purged_1',
    provider: 'meta',
    state: 'completed',
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: Date.now(),
    idempotencyKey: 'idem_done_1',
    result: {
      idempotencyKey: 'idem_done_1',
      mediaUrl: 'http://example.com/out.png',
      mediaType: 'image',
      mimeType: 'image/png',
      completedAt: Date.now(),
    },
  };

  await service.saveQueue([completedJob]);
  const report = await service.rehydrateQueue();

  assert.strictEqual(report.jobs.length, 1);
  assert.strictEqual(report.jobs[0]?.state, 'completed');
  assert.strictEqual(report.jobs[0]?.error ?? null, null);
  assert.strictEqual(report.missingMediaCount, 0);
});

test('Probe 5.2 - poisoned job state evading quarantine is strictly caught and quarantined', async () => {
  const storage = createMemoryChromeStorage();
  const meta = new MetadataStorage({ storage });

  await storage.set({
    meta_automator_jobs: [
      { id: 'j1', prompt: 'p', state: 'BOGUS_CORRUPT_STATE' },
    ],
  });

  const res = await meta.loadWithQuarantine();
  assert.strictEqual(res.quarantinedCount, 1);
  assert.strictEqual(res.validJobs.length, 0);

  const quarantine = await meta.getQuarantinedRecords();
  assert.strictEqual(quarantine.length, 1);
  assert.strictEqual((quarantine[0]?.rawData as Record<string, unknown>)?.['state'], 'BOGUS_CORRUPT_STATE');
});

