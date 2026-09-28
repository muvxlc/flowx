import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerRuntime } from '../../src/integration/worker-runtime.ts';
import { dispatchMessage, setWorkerRuntime } from '../../src/background/dispatcher.ts';
import { createChromeMock } from '../mock-chrome.ts';
import type { Job } from '../../src/queue/types.ts';

test('RED 1: Jev evaluation metadata retained on completed job after step', async () => {
  const env = createChromeMock();
  const runtime = new WorkerRuntime({ storageArea: env.mockChrome.storage.local as any });
  await runtime.init();

  await runtime.enqueue({
    media: 'image',
    mode: 'text-only',
    promptsText: 'Evaluate and retain Jev metadata',
    references: [],
  });

  const stepRes = await runtime.step();
  assert.equal(stepRes.success, true);
  assert.ok(stepRes.job);
  assert.equal(stepRes.job.state, 'completed');

  const jevMeta = stepRes.job.settings?.customParameters?.jevGate as { status: string; mode?: string } | undefined;
  assert.ok(jevMeta, 'Job customParameters.jevGate must be defined');
  assert.equal(jevMeta.status, 'reviewed');
});

test('RED 2: Initial idle status distinct from active (prevents start toggle inversion)', async () => {
  const env = createChromeMock();
  const runtime = new WorkerRuntime({ storageArea: env.mockChrome.storage.local as any });
  await runtime.init();

  const status = await runtime.getStatus();
  assert.equal(status.intent, 'idle', 'Initial queue intent must be idle');
  assert.equal(status.isRunning, false, 'Initial queue must not be running');
  assert.equal(status.isPaused, true, 'isPaused must be true on idle queue so !isPaused is false');
  assert.equal(status.pauseReason, null, 'Idle queue has no pause reason');
});

test('RED 3: Active intent re-arms alarm on worker recreation / init', async () => {
  const env = createChromeMock();
  await env.mockChrome.storage.local.set({
    meta_automator_queue_intent: { intent: 'active' },
  });

  let alarmCreatedName: string | null = null;
  const mockClock = {
    createAlarm(name: string) {
      alarmCreatedName = name;
    },
    clearAlarm() {},
    now() {
      return Date.now();
    },
    async sleep() {},
    onAlarm() {},
  };

  const runtime = new WorkerRuntime({
    storageArea: env.mockChrome.storage.local as any,
    clock: mockClock,
  });
  await runtime.init();

  assert.equal(alarmCreatedName, 'meta_automator_queue_alarm', 'Alarm must be rearmed on init when intent is active');
  const status = await runtime.getStatus();
  assert.equal(status.intent, 'active');
  assert.equal(status.isRunning, true);
  assert.equal(status.isPaused, false);
});

test('RED 4: CLEAR_COMPLETED handled atomically and persistently via dispatcher', async () => {
  const env = createChromeMock('ext-id-1');
  const storageArea = env.mockChrome.storage.local as any;
  const runtime = new WorkerRuntime({ storageArea });
  await runtime.init();
  setWorkerRuntime(runtime);

  await runtime.enqueue({
    media: 'image',
    mode: 'text-only',
    promptsText: 'Prompt 1\nPrompt 2',
    references: [],
  });

  // Step 1 job to completion
  const stepRes = await runtime.step();
  assert.equal(stepRes.job?.state, 'completed');

  const statusBefore = await runtime.getStatus();
  assert.equal(statusBefore.completedCount, 1);
  assert.equal(statusBefore.pendingCount, 1);

  // Dispatch CLEAR_COMPLETED via QUEUE_COMMAND
  const resp = (await dispatchMessage(
    {
      type: 'QUEUE_COMMAND',
      payload: { command: 'CLEAR_COMPLETED' },
    },
    { id: 'ext-id-1' } as any
  )) as { success: boolean; clearedCount: number; status?: any };

  assert.equal(resp.success, true);
  assert.equal(resp.clearedCount, 1);

  const statusAfter = await runtime.getStatus();
  assert.equal(statusAfter.completedCount, 0);
  assert.equal(statusAfter.pendingCount, 1);

  // Verify persistence in storage
  const stored = (await storageArea.get(['meta_automator_jobs'])).meta_automator_jobs as Job[];
  assert.equal(stored.length, 1);
  assert.equal(stored[0]!.state, 'pending');
});

test('RED 5: Malformed ENQUEUE payload is rejected with typed error without throwing', async () => {
  const env = createChromeMock('ext-id-1');
  const runtime = new WorkerRuntime({ storageArea: env.mockChrome.storage.local as any });
  await runtime.init();
  setWorkerRuntime(runtime);

  // 1. null jobs array in ENQUEUE_JOBS
  const resp1 = (await dispatchMessage(
    {
      type: 'ENQUEUE',
      payload: { type: 'ENQUEUE_JOBS', jobs: null } as any,
    },
    { id: 'ext-id-1' } as any
  )) as { success: boolean; error?: string };

  assert.equal(resp1.success, false);
  assert.ok(resp1.error?.includes('Malformed') || resp1.error?.includes('jobs'));

  // 2. null payload
  const resp2 = (await dispatchMessage(
    {
      type: 'ENQUEUE',
      payload: null as any,
    },
    { id: 'ext-id-1' } as any
  )) as { success: boolean; error?: string };

  assert.equal(resp2.success, false);
  assert.ok(resp2.error);

  // 3. empty promptText
  const resp3 = (await dispatchMessage(
    {
      type: 'QUEUE_COMMAND',
      payload: { command: 'ENQUEUE', batch: { media: 'image', mode: 'text-only', promptsText: '   ', references: [] } },
    },
    { id: 'ext-id-1' } as any
  )) as { success: boolean; error?: string };

  assert.equal(resp3.success, false);
  assert.ok(resp3.error);
});

test('RED 6: Worker commands for move, reorder, edit, duplicate, cancel, retry', async () => {
  const env = createChromeMock('ext-id-1');
  const storageArea = env.mockChrome.storage.local as any;
  const runtime = new WorkerRuntime({ storageArea });
  await runtime.init();
  setWorkerRuntime(runtime);

  const enq = await runtime.enqueue({
    media: 'image',
    mode: 'text-only',
    promptsText: 'First prompt\nSecond prompt\nThird prompt',
    references: [],
  });
  const [j1, j2, j3] = enq.jobs;

  // 1. MOVE command (move j1 down)
  const moveResp = (await dispatchMessage(
    {
      type: 'QUEUE_COMMAND',
      payload: { command: 'MOVE', jobId: j1!.id, direction: 1 },
    },
    { id: 'ext-id-1' } as any
  )) as { success: boolean };
  assert.equal(moveResp.success, true);
  let jobs = (await runtime.getStatus()).jobs;
  assert.equal(jobs[0]!.id, j2!.id);
  assert.equal(jobs[1]!.id, j1!.id);

  // 2. REORDER command
  const reorderResp = (await dispatchMessage(
    {
      type: 'QUEUE_COMMAND',
      payload: { command: 'REORDER', orderedIds: [j3!.id, j1!.id, j2!.id] },
    },
    { id: 'ext-id-1' } as any
  )) as { success: boolean };
  assert.equal(reorderResp.success, true);
  jobs = (await runtime.getStatus()).jobs;
  assert.deepEqual(jobs.map((j) => j.id), [j3!.id, j1!.id, j2!.id]);

  // 3. EDIT command
  const editResp = (await dispatchMessage(
    {
      type: 'QUEUE_COMMAND',
      payload: { command: 'EDIT', jobId: j1!.id, updates: { prompt: 'Edited prompt content' } },
    },
    { id: 'ext-id-1' } as any
  )) as { success: boolean; job?: Job };
  assert.equal(editResp.success, true);
  assert.equal(editResp.job?.prompt, 'Edited prompt content');

  // 4. DUPLICATE command
  const dupResp = (await dispatchMessage(
    {
      type: 'QUEUE_COMMAND',
      payload: { command: 'DUPLICATE', jobId: j1!.id },
    },
    { id: 'ext-id-1' } as any
  )) as { success: boolean; duplicate?: Job };
  assert.equal(dupResp.success, true);
  assert.ok(dupResp.duplicate);
  assert.notEqual(dupResp.duplicate.id, j1!.id);
  assert.equal(dupResp.duplicate.prompt, 'Edited prompt content');
  assert.equal((await runtime.getStatus()).totalJobs, 4);

  // 5. CANCEL command
  const cancelResp = (await dispatchMessage(
    {
      type: 'QUEUE_COMMAND',
      payload: { command: 'CANCEL', jobId: j2!.id, reason: 'Operator test cancel' },
    },
    { id: 'ext-id-1' } as any
  )) as { success: boolean };
  assert.equal(cancelResp.success, true);
  const cancelledJob = (await runtime.getStatus()).jobs.find((j) => j.id === j2!.id);
  assert.equal(cancelledJob?.state, 'failed');

  // 6. RETRY command on cancelled/failed job
  const retryResp = (await dispatchMessage(
    {
      type: 'QUEUE_COMMAND',
      payload: { command: 'RETRY', jobId: j2!.id },
    },
    { id: 'ext-id-1' } as any
  )) as { success: boolean; retried?: Job };
  assert.equal(retryResp.success, true);
  assert.equal(retryResp.retried?.state, 'pending');
  assert.equal(retryResp.retried?.error, null);
});
