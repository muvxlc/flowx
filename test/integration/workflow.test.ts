import test from 'node:test';
import assert from 'node:assert';
import {
  WorkflowOrchestrator,
  type WorkflowOrchestratorOptions,
  type EnqueueBatchInput,
} from '../../src/integration/workflow-orchestrator.ts';
import { RuntimeBridge } from '../../src/integration/service-bridge.ts';
import { MemoryChromeStorageArea } from '../../src/persistence/memory-storage.ts';
import { PersistenceService } from '../../src/persistence/service.ts';
import { QueueManager } from '../../src/queue/queue.ts';
import { FakeAlarmClock } from '../../src/scheduler/clock.ts';
import { SafeQueueScheduler } from '../../src/scheduler/scheduler.ts';
import { MetaMockAdapter } from '../../src/providers/meta/mock-adapter.ts';
import { G0_VERDICT, isLiveAllowed } from '../../src/providers/meta/gate.ts';
import type { EnqueueCommand } from '../../src/ui/create/types.ts';
import type { ReferenceAsset } from '../../src/import/types.ts';

function createTestHarness() {
  const memoryStorage = new MemoryChromeStorageArea();
  const persistence = new PersistenceService({
    storage: memoryStorage,
  });
  const queue = new QueueManager();
  const clock = new FakeAlarmClock();
  const metaAdapter = new MetaMockAdapter();
  const scheduler = new SafeQueueScheduler({
    queue,
    clock,
    alarmName: 'test_workflow_alarm',
  });

  const orchestrator = new WorkflowOrchestrator({
    queue,
    persistence,
    scheduler,
    metaAdapter,
  });

  return { memoryStorage, persistence, queue, clock, metaAdapter, scheduler, orchestrator };
}

test('Gate G0: live Meta AI calls are strictly BLOCKED and forbidden', () => {
  assert.strictEqual(G0_VERDICT.status, 'BLOCKED');
  assert.strictEqual(isLiveAllowed(), false);
  const harness = createTestHarness();
  assert.strictEqual(harness.orchestrator.isLiveBlocked(), true);
  assert.throws(
    () => harness.orchestrator.assertLivePermitted(),
    /Gate G0 BLOCKED/
  );
});

test('WorkflowOrchestrator: six-mode mock batch execution (M1 - M6)', async () => {
  const { orchestrator } = createTestHarness();

  const dummyRef: ReferenceAsset = {
    id: 'ref-1',
    name: 'ref1.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
  };

  const dummyRef2: ReferenceAsset = {
    id: 'ref-2',
    name: 'ref2.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
  };

  const commands: EnqueueBatchInput[] = [
    { media: 'image', mode: 'text-only', promptsText: 'M1 cybernetic tiger', references: [] },
    { media: 'image', mode: 'single-ref', promptsText: 'M2 neon cityscape', references: [dummyRef] },
    { media: 'image', mode: 'paired-ref', promptsText: 'M3 android portrait\nM3 mechanical bird', references: [dummyRef, dummyRef2] },
    { media: 'video', mode: 'text-only', promptsText: 'M4 drone flight', references: [] },
    { media: 'video', mode: 'single-ref', promptsText: 'M5 water ripple', references: [dummyRef] },
    { media: 'video', mode: 'paired-ref', promptsText: 'M6 storm clouds', references: [dummyRef] },
  ];

  for (const cmd of commands) {
    const enqueued = await orchestrator.enqueueBatch(cmd);
    assert.ok(enqueued.length > 0, `Mode ${cmd.media} ${cmd.mode} failed to enqueue`);
  }

  const allJobs = orchestrator.getJobs();
  assert.strictEqual(allJobs.length, 7); // M3 has 2 prompts, total 7 jobs

  // Execute all jobs sequentially via orchestrator
  const results = await orchestrator.runAll();
  assert.strictEqual(results.length, 7);
  for (const job of results) {
    assert.strictEqual(job.state, 'completed');
    assert.ok(job.result?.mediaUrl.startsWith('mock://meta-ai/generated/'));
  }
});

test('WorkflowOrchestrator: pause and resume preserves queue order and state', async () => {
  const { orchestrator } = createTestHarness();

  await orchestrator.enqueueBatch({
    media: 'image',
    mode: 'text-only',
    promptsText: 'Prompt 1\nPrompt 2\nPrompt 3',
    references: [],
  });

  // Step 1: run first job
  const first = await orchestrator.step();
  assert.ok(first);
  assert.strictEqual(first?.state, 'completed');

  // Pause
  orchestrator.pause('User pressed pause');
  assert.strictEqual(orchestrator.isPaused(), true);
  assert.strictEqual(orchestrator.getPauseReason(), 'User pressed pause');

  // Step while paused yields null
  const blockedStep = await orchestrator.step();
  assert.strictEqual(blockedStep, null);

  // Resume
  orchestrator.resume();
  assert.strictEqual(orchestrator.isPaused(), false);

  // Step after resume executes next job
  const second = await orchestrator.step();
  assert.ok(second);
  assert.strictEqual(second?.state, 'completed');
});

test('WorkflowOrchestrator: recovers interrupted jobs after tab close without duplicate generation', async () => {
  const { orchestrator, persistence } = createTestHarness();

  const [job] = await orchestrator.enqueueBatch({
    media: 'image',
    mode: 'text-only',
    promptsText: 'Interrupted prompt',
    references: [],
  });

  assert.ok(job);
  // Simulate job was marked running when tab abruptly closed
  await persistence.saveQueue([
    {
      ...job!,
      state: 'running',
      startedAt: Date.now() - 5000,
    },
  ]);

  // Tab reopens, orchestrator initializes and recovers interrupted jobs
  const report = await orchestrator.recoverInterruptedJobs();
  assert.strictEqual(report.resetToPendingCount, 1);

  const jobsAfterRecovery = orchestrator.getJobs();
  const recoveredJob = jobsAfterRecovery.find((j) => j.id === job!.id);
  assert.strictEqual(recoveredJob?.state, 'pending');

  // Running recovered job succeeds once, without duplicate submissions
  const completed = await orchestrator.step();
  assert.strictEqual(completed?.id, job!.id);
  assert.strictEqual(completed?.state, 'completed');

  // Idempotency: repeated step does not re-submit completed job
  const nextStep = await orchestrator.step();
  assert.strictEqual(nextStep, null);
});

test('Downloads & Export: mock results are flagged as non-downloadable preview', async () => {
  const { orchestrator } = createTestHarness();

  await orchestrator.enqueueBatch({
    media: 'image',
    mode: 'text-only',
    promptsText: 'Export test prompt',
    references: [],
  });

  await orchestrator.runAll();
  const completedJobs = orchestrator.getCompletedJobs();
  assert.strictEqual(completedJobs.length, 1);

  // Mock result URLs (mock://) must be clearly flagged as non-downloadable in mock mode
  const downloadStatus = orchestrator.getJobDownloadStatus(completedJobs[0]!);
  assert.strictEqual(downloadStatus.canDownload, false);
  assert.strictEqual(downloadStatus.statusText, 'Mock Non-Downloadable (Simulated)');

  // CSV export still functions cleanly and excludes secrets
  const csv = orchestrator.exportCsv({ includePrompt: false });
  assert.ok(csv.includes('job_id,media_type,mode,provider,status'));
  assert.ok(!csv.includes('sk-'));
});

test('Security invariant: personal API key is accessible only to service worker', () => {
  const bridge = new RuntimeBridge();
  // UI sidepanel bridge cannot access raw personal API key
  assert.strictEqual(typeof (bridge as unknown as { getPersonalApiKey?: () => string }).getPersonalApiKey, 'undefined');
  // Bridge allows settings querying without leaking the key string
  const settingsSummary = bridge.getSettingsSummary();
  assert.strictEqual(settingsSummary.hasKey, false);
  assert.strictEqual((settingsSummary as unknown as { apiKey?: string }).apiKey, undefined);
});
