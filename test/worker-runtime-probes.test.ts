import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBackgroundListeners } from '../src/background/bootstrap.ts';
import { WorkerRuntime } from '../src/integration/worker-runtime.ts';
import { createChromeMock } from './mock-chrome.ts';
import { G0_VERDICT } from '../src/providers/meta/gate.ts';
import { G1_VERDICT } from '../src/jev/gate.ts';
import type { Job } from '../src/queue/types.ts';

test('WorkerRuntime probe: persist running before execute and final state after', async () => {
  const env = createChromeMock();
  const storageArea = env.mockChrome.storage.local as unknown as import('../src/persistence/types.ts').ChromeStorageArea;

  let capturedRunningInStorage = false;

  const inspectingAdapter = {
    async execute(job: Job) {
      const stored = (await storageArea.get(['meta_automator_jobs']))['meta_automator_jobs'] as Job[];
      const target = stored?.find((j) => j.id === job.id);
      if (target?.state === 'running') {
        capturedRunningInStorage = true;
      }
      return {
        status: 'completed' as const,
        result: {
          jobId: job.id,
          idempotencyKey: `mock_idem_${job.id}`,
          mediaUrl: 'mock://meta-ai/generated/inspect.png',
          mediaType: job.media,
          mimeType: job.media === 'video' ? 'video/mp4' : 'image/png',
          downloadable: false,
          isMockArtifact: true as const,
          completedAt: Date.now(),
        },
      };
    },
  };

  const runtime = new WorkerRuntime({
    storageArea,
    metaAdapter: inspectingAdapter,
  });
  await runtime.init();

  await runtime.enqueue({
    media: 'image',
    mode: 'text-only',
    promptsText: 'Persistence order check',
    references: [],
  });

  const stepRes = await runtime.step();
  assert.equal(stepRes.success, true);
  assert.equal(capturedRunningInStorage, true);

  const finalStored = (await storageArea.get(['meta_automator_jobs']))['meta_automator_jobs'] as Job[];
  assert.equal(finalStored[0]?.state, 'completed');
});

test('WorkerRuntime probe: worker restart recovers interrupted running job to pending without duplicate submit', async () => {
  const env = createChromeMock();
  const storageArea = env.mockChrome.storage.local as unknown as import('../src/persistence/types.ts').ChromeStorageArea;

  const runtime1 = new WorkerRuntime({ storageArea });
  await runtime1.init();
  const enq = await runtime1.enqueue({
    media: 'video',
    mode: 'text-only',
    promptsText: 'Interrupted job prompt',
    references: [],
  });
  const jobId = enq.jobs[0]!.id;

  const jobsInStorage = (await storageArea.get(['meta_automator_jobs']))['meta_automator_jobs'] as Job[];
  const runningJobs = jobsInStorage.map((j) => (j.id === jobId ? { ...j, state: 'running' as const, startedAt: Date.now() - 5000 } : j));
  await storageArea.set({ meta_automator_jobs: runningJobs });

  const runtime2 = new WorkerRuntime({ storageArea });
  const recoveryReport = await runtime2.init();

  assert.equal(recoveryReport.resetToPendingCount, 1);
  const status = await runtime2.getStatus();
  assert.equal(status.pendingCount, 1);
  assert.equal(status.runningCount, 0);

  const stepRes = await runtime2.step();
  assert.equal(stepRes.job?.id, jobId);
  assert.equal(stepRes.job?.state, 'completed');
});

test('WorkerRuntime probe: Jev mock gating and G1 fallback routes disabled or unverified Jev safely', async () => {
  const env = createChromeMock();
  const storageArea = env.mockChrome.storage.local as unknown as import('../src/persistence/types.ts').ChromeStorageArea;

  const runtime = new WorkerRuntime({ storageArea });
  await runtime.init();

  assert.equal(G1_VERDICT.status, 'BLOCKED');
  assert.equal(G0_VERDICT.status, 'BLOCKED');

  await runtime.enqueue({
    media: 'image',
    mode: 'text-only',
    promptsText: 'Valid prompt for Jev evaluation',
    references: [],
  });

  const stepRes = await runtime.step();
  assert.equal(stepRes.success, true);
  assert.ok(stepRes.job);
  assert.equal(stepRes.job.state, 'completed');
});

test('WorkerRuntime probe: Settings key save and remove commands keep key in worker with public responses only', async () => {
  const env = createChromeMock();
  const storageArea = env.mockChrome.storage.local as unknown as import('../src/persistence/types.ts').ChromeStorageArea;

  const runtime = new WorkerRuntime({ storageArea });
  await runtime.init();

  const initialSettings = await runtime.getSettings();
  assert.equal(initialSettings.hasKey, false);
  assert.equal(initialSettings.endpoint, 'https://9router.bangkhan.com/v1/systemone');
  assert.equal((initialSettings as unknown as { apiKey?: string }).apiKey, undefined);

  const saveRes = await runtime.saveSettingsKey('dummy_secret');
  assert.equal(saveRes.success, true);
  assert.equal(saveRes.hasKey, true);
  assert.equal((saveRes as unknown as { apiKey?: string }).apiKey, undefined);

  const updatedSettings = await runtime.getSettings();
  assert.equal(updatedSettings.hasKey, true);
  assert.equal((updatedSettings as unknown as { apiKey?: string }).apiKey, undefined);

  const removeRes = await runtime.removeSettingsKey();
  assert.equal(removeRes.success, true);
  assert.equal(removeRes.hasKey, false);

  const finalSettings = await runtime.getSettings();
  assert.equal(finalSettings.hasKey, false);
});

test('WorkerRuntime probe: background dispatcher integration validates sender and payload', async () => {
  const env = createChromeMock('allowed-extension-id');
  const origChrome = (globalThis as unknown as { chrome?: unknown }).chrome;
  (globalThis as unknown as { chrome: unknown }).chrome = env.mockChrome;

  try {
    setupBackgroundListeners();

    const validEnqueue = (await env.sendMessage({
      type: 'QUEUE_COMMAND',
      payload: {
        command: 'ENQUEUE',
        batch: {
          media: 'image',
          mode: 'text-only',
          promptsText: 'Dispatch prompt',
          references: [],
        },
      },
    })) as { success: boolean; jobs?: Job[] };

    assert.equal(validEnqueue.success, true);
    assert.equal(validEnqueue.jobs?.length, 1);

    const badSenderResp = (await env.sendMessage(
      { type: 'QUEUE_STATUS_GET' },
      { id: 'malicious-extension-id' }
    )) as { success: boolean; error?: string };

    assert.equal(badSenderResp.success, false);
    assert.ok(badSenderResp.error?.includes('Unauthorized') || badSenderResp.error?.includes('match'));

    const badPayloadResp = (await env.sendMessage({
      type: 'QUEUE_COMMAND',
      payload: { command: 'INVALID_COMMAND_NAME' },
    })) as { success: boolean; error?: string };

    assert.equal(badPayloadResp.success, false);

    const saveKeyResp = (await env.sendMessage({
      type: 'SETTINGS_UPDATE',
      payload: {
        action: 'SAVE_KEY',
        apiKey: 'dummy_secret',
      },
    })) as { success: boolean; hasKey: boolean; apiKey?: string };

    assert.equal(saveKeyResp.success, true);
    assert.equal(saveKeyResp.hasKey, true);
    assert.equal(saveKeyResp.apiKey, undefined);

    const removeKeyResp = (await env.sendMessage({
      type: 'SETTINGS_UPDATE',
      payload: {
        action: 'REMOVE_KEY',
      },
    })) as { success: boolean; hasKey: boolean };

    assert.equal(removeKeyResp.success, true);
    assert.equal(removeKeyResp.hasKey, false);
  } finally {
    (globalThis as unknown as { chrome: unknown }).chrome = origChrome;
  }
});
