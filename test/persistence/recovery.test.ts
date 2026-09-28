import test from 'node:test';
import assert from 'node:assert';
import {
  RecoveryManager,
  type PersistedJob,
} from '../../src/persistence/index.ts';

test('RecoveryManager - worker recreation resets running jobs and preserves completed jobs', () => {
  const recovery = new RecoveryManager();
  const now = Date.now();

  const persistedJobs: PersistedJob[] = [
    {
      id: 'job-completed',
      media: 'image',
      mode: 'text-only',
      prompt: 'Done job',
      provider: 'meta',
      state: 'completed',
      retryCount: 0,
      maxRetries: 3,
      createdAt: now - 5000,
      updatedAt: now - 1000,
      completedAt: now - 1000,
      result: {
        idempotencyKey: 'key-123',
        mediaUrl: 'https://example.com/res.png',
        mediaType: 'image',
        mimeType: 'image/png',
        completedAt: now - 1000,
      },
    },
    {
      id: 'job-interrupted',
      media: 'video',
      mode: 'text-only',
      prompt: 'Job running when service worker suspended',
      provider: 'meta',
      state: 'running',
      retryCount: 0,
      maxRetries: 3,
      createdAt: now - 2000,
      updatedAt: now - 100,
      startedAt: now - 500,
    },
    {
      id: 'job-paused',
      media: 'image',
      mode: 'text-only',
      prompt: 'User paused job',
      provider: 'meta',
      state: 'paused',
      retryCount: 0,
      maxRetries: 3,
      createdAt: now - 3000,
      updatedAt: now - 2500,
    },
  ];

  const recoveryResult = recovery.rehydrateOnWorkerRestart(persistedJobs);

  assert.strictEqual(recoveryResult.jobs.length, 3);
  assert.strictEqual(recoveryResult.interruptedResetCount, 1);

  // Completed job MUST NEVER be repeated or reset to pending
  const completedJob = recoveryResult.jobs.find((j) => j.id === 'job-completed');
  assert.strictEqual(completedJob?.state, 'completed');
  assert.strictEqual(completedJob?.completedAt, now - 1000);

  // Interrupted running job should be reset to pending
  const interruptedJob = recoveryResult.jobs.find((j) => j.id === 'job-interrupted');
  assert.strictEqual(interruptedJob?.state, 'pending');
  assert.ok(interruptedJob?.error?.includes('interrupted'));

  // Paused job stays paused
  const pausedJob = recoveryResult.jobs.find((j) => j.id === 'job-paused');
  assert.strictEqual(pausedJob?.state, 'paused');
});

test('RecoveryManager - detects missing media blob for paired/single-ref jobs', async () => {
  const recovery = new RecoveryManager();
  const jobs: PersistedJob[] = [
    {
      id: 'job-with-missing-ref',
      media: 'image',
      mode: 'single-ref',
      prompt: 'Image with ref',
      referenceId: 'ref-missing-xyz',
      provider: 'meta',
      state: 'pending',
      retryCount: 0,
      maxRetries: 3,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  const result = await recovery.verifyMediaIntegrity(jobs, async (refId) => {
    return refId === 'ref-existing';
  });

  assert.strictEqual(result.missingMediaCount, 1);
  const auditedJob = result.jobs[0];
  assert.strictEqual(auditedJob?.state, 'needs-review');
  assert.ok(auditedJob?.error?.includes('Missing media reference: ref-missing-xyz'));
});

test('RecoveryManager - verifyMediaIntegrity preserves completed jobs even if input reference is missing', async () => {
  const recovery = new RecoveryManager();
  const jobs: PersistedJob[] = [
    {
      id: 'job-completed-purged-ref',
      media: 'image',
      mode: 'single-ref',
      prompt: 'Image completed prior',
      referenceId: 'ref-purged-input',
      provider: 'meta',
      state: 'completed',
      retryCount: 0,
      maxRetries: 3,
      createdAt: 1000,
      updatedAt: 2000,
      completedAt: 2000,
      result: {
        idempotencyKey: 'idem-done',
        mediaUrl: 'https://example.com/done.png',
        mediaType: 'image',
        mimeType: 'image/png',
        completedAt: 2000,
      },
    },
    {
      id: 'job-pending-missing-ref',
      media: 'image',
      mode: 'single-ref',
      prompt: 'Image pending with missing ref',
      referenceId: 'ref-missing-input',
      provider: 'meta',
      state: 'pending',
      retryCount: 0,
      maxRetries: 3,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  const result = await recovery.verifyMediaIntegrity(jobs, async (_refId) => {
    return false;
  });

  const completedJob = result.jobs.find((j) => j.id === 'job-completed-purged-ref');
  assert.strictEqual(completedJob?.state, 'completed');
  assert.strictEqual(completedJob?.error ?? null, null);

  const pendingJob = result.jobs.find((j) => j.id === 'job-pending-missing-ref');
  assert.strictEqual(pendingJob?.state, 'needs-review');
  assert.strictEqual(result.missingMediaCount, 1);
});

