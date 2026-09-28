import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBackgroundListeners } from '../src/background/bootstrap.ts';
import { WorkerRuntime } from '../src/integration/worker-runtime.ts';
import { createChromeMock } from './mock-chrome.ts';
import type { ReferenceAsset } from '../src/import/types.ts';
import type { Job } from '../src/queue/types.ts';

test('WorkerRuntime: bootstrap QUEUE_COMMAND replaces dummy ack with real execution', async () => {
  const env = createChromeMock();
  const origChrome = (globalThis as unknown as { chrome?: unknown }).chrome;
  (globalThis as unknown as { chrome: unknown }).chrome = env.mockChrome;

  try {
    setupBackgroundListeners();

    const resp = (await env.sendMessage({
      type: 'QUEUE_COMMAND',
      payload: {
        command: 'ENQUEUE',
        batch: {
          media: 'image',
          mode: 'text-only',
          promptsText: 'Test prompt 1',
          references: [],
        },
      },
    })) as { success: boolean; status?: string; action?: string; jobs?: unknown[] };

    assert.equal(resp.success, true);
    assert.equal(resp.jobs?.length, 1);
    assert.equal(resp.status, undefined);
  } finally {
    (globalThis as unknown as { chrome: unknown }).chrome = origChrome;
  }
});

test('WorkerRuntime: validated ENQUEUE, STATUS, START, PAUSE, and STEP message handling', async () => {
  const env = createChromeMock();
  const runtime = new WorkerRuntime({
    storageArea: env.mockChrome.storage.local as unknown as import('../src/persistence/types.ts').ChromeStorageArea,
  });
  await runtime.init();

  const enqueueRes = await runtime.enqueue({
    media: 'image',
    mode: 'text-only',
    promptsText: 'Prompt A\nPrompt B',
    references: [],
  });

  assert.equal(enqueueRes.success, true);
  assert.equal(enqueueRes.jobs.length, 2);

  const status1 = await runtime.getStatus();
  assert.equal(status1.totalJobs, 2);
  assert.equal(status1.pendingCount, 2);
  assert.equal(status1.completedCount, 0);
  assert.equal(status1.isPaused, true);
  assert.equal(status1.isRunning, false);
  assert.equal(status1.intent, 'idle');

  const stepRes1 = await runtime.step();
  assert.equal(stepRes1.success, true);
  assert.ok(stepRes1.job);
  assert.equal(stepRes1.job.state, 'completed');

  const pauseRes = await runtime.pause('Operator pause');
  assert.equal(pauseRes.success, true);
  assert.equal(pauseRes.status.isPaused, true);

  const stepPaused = await runtime.step();
  assert.equal(stepPaused.success, true);
  assert.equal(stepPaused.job, null);

  const startRes = await runtime.start();
  assert.equal(startRes.success, true);
  assert.equal(startRes.status.isPaused, false);

  const stepRes2 = await runtime.step();
  assert.equal(stepRes2.success, true);
  assert.ok(stepRes2.job);
  assert.equal(stepRes2.job.state, 'completed');
});

test('WorkerRuntime: alarm-driven mock stepping executes pending jobs and respects concurrency', async () => {
  const env = createChromeMock();
  const origChrome = (globalThis as unknown as { chrome?: unknown }).chrome;
  (globalThis as unknown as { chrome: unknown }).chrome = env.mockChrome;

  try {
    const runtime = new WorkerRuntime({
      storageArea: env.mockChrome.storage.local as unknown as import('../src/persistence/types.ts').ChromeStorageArea,
    });
    await runtime.init();

    await runtime.enqueue({
      media: 'image',
      mode: 'text-only',
      promptsText: 'Alarm prompt 1\nAlarm prompt 2',
      references: [],
    });

    await runtime.start();
    assert.ok(env.createdAlarms.has('meta_automator_queue_alarm'));

    await runtime.handleAlarm('meta_automator_queue_alarm');
    let status = await runtime.getStatus();
    assert.equal(status.completedCount, 1);
    assert.equal(status.pendingCount, 1);

    await runtime.handleAlarm('meta_automator_queue_alarm');
    status = await runtime.getStatus();
    assert.equal(status.completedCount, 2);
    assert.equal(status.pendingCount, 0);
  } finally {
    (globalThis as unknown as { chrome: unknown }).chrome = origChrome;
  }
});

test('WorkerRuntime: six modes batch execution (M1 - M6)', async () => {
  const env = createChromeMock();
  const runtime = new WorkerRuntime({
    storageArea: env.mockChrome.storage.local as unknown as import('../src/persistence/types.ts').ChromeStorageArea,
  });
  await runtime.init();

  const dummyRef: ReferenceAsset = {
    id: 'ref-w1',
    name: 'ref1.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
  };
  const dummyRef2: ReferenceAsset = {
    id: 'ref-w2',
    name: 'ref2.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
  };

  const batches = [
    { media: 'image' as const, mode: 'text-only' as const, promptsText: 'W_M1 image text', references: [] },
    { media: 'image' as const, mode: 'single-ref' as const, promptsText: 'W_M2 image single', references: [dummyRef] },
    { media: 'image' as const, mode: 'paired-ref' as const, promptsText: 'W_M3 prompt 1\nW_M3 prompt 2', references: [dummyRef, dummyRef2] },
    { media: 'video' as const, mode: 'text-only' as const, promptsText: 'W_M4 video text', references: [] },
    { media: 'video' as const, mode: 'single-ref' as const, promptsText: 'W_M5 video single', references: [dummyRef] },
    { media: 'video' as const, mode: 'paired-ref' as const, promptsText: 'W_M6 video paired', references: [dummyRef] },
  ];

  for (const b of batches) {
    const res = await runtime.enqueue(b);
    assert.equal(res.success, true);
  }

  const initialStatus = await runtime.getStatus();
  assert.equal(initialStatus.totalJobs, 7);

  for (let i = 0; i < 7; i++) {
    const stepRes = await runtime.step();
    assert.equal(stepRes.success, true);
    assert.ok(stepRes.job);
    assert.equal(stepRes.job.state, 'completed');
  }

  const finalStatus = await runtime.getStatus();
  assert.equal(finalStatus.completedCount, 7);
  assert.equal(finalStatus.pendingCount, 0);
});

test('WorkerRuntime: paused restart recovery preserves paused intent across worker restarts', async () => {
  const env = createChromeMock();
  const storageArea = env.mockChrome.storage.local as unknown as import('../src/persistence/types.ts').ChromeStorageArea;

  const runtime1 = new WorkerRuntime({ storageArea });
  await runtime1.init();
  await runtime1.enqueue({
    media: 'image',
    mode: 'text-only',
    promptsText: 'Paused intent test',
    references: [],
  });
  await runtime1.pause('Persistent pause intent');

  const runtime2 = new WorkerRuntime({ storageArea });
  await runtime2.init();

  const status = await runtime2.getStatus();
  assert.equal(status.isPaused, true);
  assert.equal(status.pauseReason, 'Persistent pause intent');

  const stepRes = await runtime2.step();
  assert.equal(stepRes.job, null);
});
