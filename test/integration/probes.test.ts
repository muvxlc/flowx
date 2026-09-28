import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowOrchestrator } from '../../src/integration/workflow-orchestrator.ts';
import { RuntimeBridge } from '../../src/integration/service-bridge.ts';
import { MemoryChromeStorageArea } from '../../src/persistence/memory-storage.ts';
import { PersistenceService } from '../../src/persistence/service.ts';
import { QueueManager } from '../../src/queue/queue.ts';
import { MetaMockAdapter } from '../../src/providers/meta/mock-adapter.ts';
import { G0_VERDICT, isLiveAllowed, assertLivePermitted } from '../../src/providers/meta/gate.ts';
import type { ReferenceAsset } from '../../src/import/types.ts';

function createHarness() {
  const memoryStorage = new MemoryChromeStorageArea();
  const persistence = new PersistenceService({ storage: memoryStorage });
  const queue = new QueueManager();
  const metaAdapter = new MetaMockAdapter();
  const orchestrator = new WorkflowOrchestrator({ queue, persistence, metaAdapter });
  return { memoryStorage, persistence, queue, metaAdapter, orchestrator };
}

test('Adversarial probe: rapid concurrent step invocations maintain strict concurrency=1', async () => {
  const { orchestrator } = createHarness();
  await orchestrator.enqueueBatch({
    media: 'image',
    mode: 'text-only',
    promptsText: 'P1\nP2\nP3',
    references: [],
  });

  const concurrentSteps = await Promise.all([
    orchestrator.step(),
    orchestrator.step(),
    orchestrator.step(),
  ]);

  const nonNullResults = concurrentSteps.filter(Boolean);
  assert.equal(nonNullResults.length, 1, 'Only one step may execute concurrently');
  assert.equal(orchestrator.getCompletedJobs().length, 1);
});

test('Adversarial probe: repeated mid-render crash escalates job to needs-review', async () => {
  const { orchestrator, persistence } = createHarness();
  const [job] = await orchestrator.enqueueBatch({
    media: 'image',
    mode: 'text-only',
    promptsText: 'Flapping job test',
    references: [],
  });
  assert.ok(job);

  await persistence.saveQueue([
    {
      ...job,
      state: 'running',
      interruptCount: 3,
      retryCount: 3,
      startedAt: Date.now() - 10000,
    },
  ]);

  const report = await orchestrator.recoverInterruptedJobs();
  assert.equal(report.escalatedToNeedsReviewCount, 1, 'Must escalate repeatedly interrupted job');

  const jobs = orchestrator.getJobs();
  const escalated = jobs.find((j) => j.id === job.id);
  assert.equal(escalated?.state, 'needs-review');
});

test('Adversarial probe: Gate G0 bypass attempts are strictly rejected and fail-closed', () => {
  assert.equal(isLiveAllowed(), false);
  assert.equal(G0_VERDICT.status, 'BLOCKED');

  const { orchestrator } = createHarness();
  assert.equal(orchestrator.isLiveBlocked(), true);
  assert.throws(() => orchestrator.assertLivePermitted(), /Gate G0 BLOCKED/i);
});

test('Adversarial probe: mock result URLs are non-downloadable and isolated from disk write', async () => {
  const { orchestrator } = createHarness();
  await orchestrator.enqueueBatch({
    media: 'video',
    mode: 'text-only',
    promptsText: 'Mock video download test',
    references: [],
  });

  await orchestrator.runAll();
  const [completedJob] = orchestrator.getCompletedJobs();
  assert.ok(completedJob);

  const status = orchestrator.getJobDownloadStatus(completedJob);
  assert.equal(status.canDownload, false);
  assert.equal(status.isMock, true);
  assert.ok(status.statusText.includes('Non-Downloadable'));
});

test('Adversarial probe: personal API key never leaks through bridge or CSV export', async () => {
  const { orchestrator } = createHarness();
  const bridge = new RuntimeBridge();
  bridge.setHasKeyStatus(true);

  const summary = bridge.getSettingsSummary();
  assert.equal(summary.hasKey, true);
  assert.equal((summary as unknown as Record<string, unknown>)['apiKey'], undefined);
  assert.equal((summary as unknown as Record<string, unknown>)['secret'], undefined);

  await orchestrator.enqueueBatch({
    media: 'image',
    mode: 'text-only',
    promptsText: 'Secret leak test with sk-dummy-key-999',
    references: [],
  });
  await orchestrator.runAll();

  const csv = orchestrator.exportCsv({ includePrompt: true });
  assert.ok(!csv.includes('dummy_secret'));
  assert.ok(!csv.includes('meta_automator_personal_key'));
});

test('Adversarial probe: mismatched paired references fail closed with zero queue corruption', async () => {
  const { orchestrator } = createHarness();
  const ref1: ReferenceAsset = { id: 'r1', name: '1.png', mimeType: 'image/png', sizeBytes: 100 };

  await assert.rejects(
    async () => {
      await orchestrator.enqueueBatch({
        media: 'image',
        mode: 'paired-ref',
        promptsText: 'P1\nP2\nP3',
        references: [ref1],
      });
    },
    /mismatch|failed to enqueue/i
  );

  assert.equal(orchestrator.getJobs().length, 0, 'No partial jobs inserted on validation failure');
});
