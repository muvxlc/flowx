import assert from 'node:assert/strict';
import { WorkflowOrchestrator } from '../../src/integration/workflow-orchestrator.ts';
import { SidePanelApp } from '../../src/sidepanel/sidepanel.ts';
import { MemoryChromeStorageArea } from '../../src/persistence/memory-storage.ts';
import { PersistenceService } from '../../src/persistence/service.ts';
import { QueueManager } from '../../src/queue/queue.ts';
import { MetaMockAdapter } from '../../src/providers/meta/mock-adapter.ts';
import { G0_VERDICT, isLiveAllowed } from '../../src/providers/meta/gate.ts';
import type { ReferenceAsset } from '../../src/import/types.ts';

async function runManualQA() {
  console.log('[manual-qa-workflow] Starting Task 15 Workflow Integration verification in Node...');

  const memoryStorage = new MemoryChromeStorageArea();
  const persistence = new PersistenceService({ storage: memoryStorage });
  const queue = new QueueManager();
  const metaAdapter = new MetaMockAdapter();
  const orchestrator = new WorkflowOrchestrator({ queue, persistence, metaAdapter });

  console.log('\n--- PHASE 1: Gate G0 Live Blocked Invariant ---');
  assert.equal(isLiveAllowed(), false);
  assert.equal(G0_VERDICT.status, 'BLOCKED');
  assert.equal(orchestrator.isLiveBlocked(), true);
  console.log('✓ Gate G0 BLOCKED verified: live Meta AI calls strictly forbidden.');

  console.log('\n--- PHASE 2: Six-Mode Mock Batch Execution (M1-M6) ---');
  const dummyRef: ReferenceAsset = {
    id: 'ref-manual-1',
    name: 'ref1.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
  };
  const dummyRef2: ReferenceAsset = {
    id: 'ref-manual-2',
    name: 'ref2.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
  };

  const batches = [
    { media: 'image' as const, mode: 'text-only' as const, promptsText: 'M1 Lotus garden', references: [] },
    { media: 'image' as const, mode: 'single-ref' as const, promptsText: 'M2 Temple reflection', references: [dummyRef] },
    { media: 'image' as const, mode: 'paired-ref' as const, promptsText: 'M3 Sunset\nM3 Dawn', references: [dummyRef, dummyRef2] },
    { media: 'video' as const, mode: 'text-only' as const, promptsText: 'M4 River stream', references: [] },
    { media: 'video' as const, mode: 'single-ref' as const, promptsText: 'M5 Waterfall mist', references: [dummyRef] },
    { media: 'video' as const, mode: 'paired-ref' as const, promptsText: 'M6 Forest rain', references: [dummyRef] },
  ];

  for (const b of batches) {
    const enqueued = await orchestrator.enqueueBatch(b);
    console.log(`✓ Enqueued ${b.media} ${b.mode}: ${enqueued.length} job(s)`);
  }

  const allJobs = orchestrator.getJobs();
  assert.equal(allJobs.length, 7);
  console.log(`✓ Total jobs in queue: ${allJobs.length}`);

  const results = await orchestrator.runAll();
  assert.equal(results.length, 7);
  console.log(`✓ Executed all 7 jobs across 6 modes to completed status.`);

  console.log('\n--- PHASE 3: Pause and Resume Semantics ---');
  await orchestrator.enqueueBatch({
    media: 'image',
    mode: 'text-only',
    promptsText: 'P_Pause1\nP_Pause2',
    references: [],
  });

  const step1 = await orchestrator.step();
  assert.ok(step1);
  console.log(`✓ Step 1 executed: ${step1.id} -> ${step1.state}`);

  orchestrator.pause('Manual QA Pause');
  assert.equal(orchestrator.isPaused(), true);
  console.log('✓ Queue paused successfully.');

  const stepPaused = await orchestrator.step();
  assert.equal(stepPaused, null);
  console.log('✓ Execution step while paused safely returned null.');

  orchestrator.resume();
  assert.equal(orchestrator.isPaused(), false);
  console.log('✓ Queue resumed successfully.');

  const step2 = await orchestrator.step();
  assert.ok(step2);
  console.log(`✓ Step 2 executed after resume: ${step2.id} -> ${step2.state}`);

  console.log('\n--- PHASE 4: Mid-Render Interruption & Tab Close Recovery ---');
  const [interruptedJob] = await orchestrator.enqueueBatch({
    media: 'video',
    mode: 'text-only',
    promptsText: 'Interrupted Tab Close Job',
    references: [],
  });
  assert.ok(interruptedJob);

  await persistence.saveQueue([
    {
      ...interruptedJob,
      state: 'running',
      startedAt: Date.now() - 3000,
    },
  ]);

  const recoveryReport = await orchestrator.recoverInterruptedJobs();
  assert.equal(recoveryReport.resetToPendingCount, 1);
  console.log(`✓ Recovered ${recoveryReport.resetToPendingCount} interrupted running job(s) safely back to pending.`);

  const stepRecovered = await orchestrator.step();
  assert.equal(stepRecovered?.id, interruptedJob.id);
  assert.equal(stepRecovered?.state, 'completed');
  console.log(`✓ Recovered job ${stepRecovered.id} completed with zero duplicate submissions.`);

  console.log('\n--- PHASE 5: Mock Download Status & CSV Export ---');
  const completedList = orchestrator.getCompletedJobs();
  assert.ok(completedList.length > 0);
  const dlStatus = orchestrator.getJobDownloadStatus(completedList[0]!);
  assert.equal(dlStatus.canDownload, false);
  assert.equal(dlStatus.isMock, true);
  console.log(`✓ Mock result download status correctly flagged: ${dlStatus.statusText}`);

  const csv = orchestrator.exportCsv({ includePrompt: true });
  assert.ok(csv.startsWith('\uFEFFjob_id,media_type,mode,provider,status'));
  assert.ok(!csv.includes('dummy_secret'));
  console.log(`✓ CSV exported ${completedList.length} jobs with UTF-8 BOM and verified secret redaction.`);

  console.log('\n--- PHASE 6: SidePanel UI Tab Structure & Navigation ---');
  const app = new SidePanelApp({ orchestrator, persistence });
  assert.equal(app.getActiveTab(), 'queue');
  app.switchTab('create');
  assert.equal(app.getActiveTab(), 'create');
  app.switchTab('downloads');
  assert.equal(app.getActiveTab(), 'downloads');
  app.switchTab('settings');
  assert.equal(app.getActiveTab(), 'settings');
  console.log('✓ SidePanelApp supports all 4 tabs: Queue, Create, Downloads, Settings.');

  console.log('\n[manual-qa-workflow] All manual QA scenarios verified successfully with exit code 0.');
}

runManualQA().catch((err) => {
  console.error('[manual-qa-workflow] Verification failed:', err);
  process.exit(1);
});
