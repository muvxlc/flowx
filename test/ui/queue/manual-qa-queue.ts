import assert from 'node:assert/strict';
import type { Job } from '../../../src/queue/types.ts';
import { MemoryChromeStorageArea } from '../../../src/persistence/memory-storage.ts';
import { PersistenceService } from '../../../src/persistence/service.ts';
import {
  QueueController,
  renderQueueView,
  getQueueViewStyles,
} from '../../../src/ui/queue/index.ts';

async function runManualQAQueueScenario() {
  console.log('====================================================');
  console.log('TASK 7: MANUAL QA ACCESSIBLE QUEUE PANEL SCENARIO');
  console.log('====================================================\n');

  const storage = new MemoryChromeStorageArea();
  const persistence = new PersistenceService({ storage });
  const controller = new QueueController({ persistence });

  console.log('--- 1. Initializing Mixed Queue (6 Modes) ---');
  const job1: Job = {
    id: 'job_m1_text_img',
    media: 'image',
    mode: 'text-only',
    prompt: 'Hyperrealistic Thai lotus temple in Bangkok at sunrise',
    provider: 'meta',
    settings: { aspectRatio: '1:1' },
    state: 'completed',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727500000000,
    updatedAt: 1727500050000,
    completedAt: 1727500050000,
    result: {
      idempotencyKey: 'idem_m1',
      mediaUrl: 'https://mock.meta.internal/lotus_temple.png',
      mediaType: 'image',
      mimeType: 'image/png',
      completedAt: 1727500050000,
    },
  };

  const job2: Job = {
    id: 'job_m2_single_img',
    media: 'image',
    mode: 'single-ref',
    prompt: 'Cyberpunk street vendor in Chinatown night market',
    referenceId: 'ref_portrait_01',
    provider: 'meta',
    settings: { aspectRatio: '9:16' },
    state: 'running',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727500100000,
    updatedAt: 1727500110000,
    startedAt: 1727500110000,
  };

  const job3: Job = {
    id: 'job_m3_paired_img',
    media: 'image',
    mode: 'paired-ref',
    prompt: 'Ornate golden stupa surrounded by frangipani blossoms',
    referenceId: 'ref_stupa_01',
    provider: 'meta',
    settings: { aspectRatio: '1:1' },
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727500200000,
    updatedAt: 1727500200000,
  };

  const job4: Job = {
    id: 'job_m4_text_vid',
    media: 'video',
    mode: 'text-only',
    prompt: 'Floating lanterns ascending into night sky with cinematic lighting',
    provider: 'meta',
    settings: { durationSeconds: 5 },
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727500300000,
    updatedAt: 1727500300000,
  };

  const job5: Job = {
    id: 'job_m5_single_vid',
    media: 'video',
    mode: 'single-ref',
    prompt: 'Slow pan across tropical rain forest canopy in Chiang Mai',
    referenceId: 'ref_forest_01',
    provider: 'meta',
    settings: { durationSeconds: 5 },
    state: 'paused',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727500400000,
    updatedAt: 1727500410000,
  };

  const job6: Job = {
    id: 'job_m6_paired_vid',
    media: 'video',
    mode: 'paired-ref',
    prompt: 'Time-lapse of bustling Bangkok intersection with vehicle light trails',
    referenceId: 'ref_traffic_01',
    provider: 'meta',
    settings: { durationSeconds: 5 },
    state: 'failed',
    error: 'Upstream rate limit 429 encountered',
    retryCount: 3,
    maxRetries: 3,
    createdAt: 1727500500000,
    updatedAt: 1727500550000,
  };

  const initialJobs = [job1, job2, job3, job4, job5, job6];
  await controller.setJobs(initialJobs);
  console.log('✓ Initialized queue with 6 jobs across 6 generation modes in mixed states.');

  console.log('\n--- 2. Verifying Guardrails: Forbid Running Job Edit / Duplicate ---');
  // Attempting to edit running job
  let editBlocked = false;
  try {
    await controller.editJob('job_m2_single_img', { prompt: 'Hacked prompt' });
  } catch (err: unknown) {
    editBlocked = true;
    console.log('✓ Edit running job correctly blocked: %s', (err as Error).message);
  }
  assert.ok(editBlocked, 'Must forbid editing running job');

  // Attempting to duplicate running job
  let duplicateBlocked = false;
  try {
    await controller.duplicateJob('job_m2_single_img');
  } catch (err: unknown) {
    duplicateBlocked = true;
    console.log('✓ Duplicate running job correctly blocked: %s', (err as Error).message);
  }
  assert.ok(duplicateBlocked, 'Must forbid duplicating running job');

  console.log('\n--- 3. Verifying Persisted Mixed Reorder ---');
  // Move job4 up ahead of job3
  await controller.moveJob('job_m4_text_vid', -1);
  const reorderedOrder = controller.getJobs().map((j) => j.id);
  console.log('Reordered queue IDs: %j', reorderedOrder);
  assert.deepEqual(reorderedOrder, [
    'job_m1_text_img',
    'job_m2_single_img',
    'job_m4_text_vid',
    'job_m3_paired_img',
    'job_m5_single_vid',
    'job_m6_paired_vid',
  ]);

  // Check persistence synchronization
  const rehydrated = await persistence.rehydrateQueue();
  assert.deepEqual(rehydrated.jobs.map((j) => j.id), reorderedOrder);
  console.log('✓ Reorder verified and strictly synchronized to persistence storage.');

  console.log('\n--- 4. Verifying Edit and Retry Operations ---');
  // Edit pending job
  const updatedJob3 = await controller.editJob('job_m3_paired_img', {
    prompt: 'Updated: Golden stupa surrounded by white frangipani at dusk',
  });
  assert.equal(updatedJob3.prompt, 'Updated: Golden stupa surrounded by white frangipani at dusk');
  console.log('✓ Pending job edited successfully.');

  // Retry failed job6
  const retriedJob6 = await controller.retryJob('job_m6_paired_vid');
  assert.equal(retriedJob6.state, 'pending');
  assert.equal(retriedJob6.error, null);
  assert.equal(retriedJob6.retryCount, 0);
  console.log('✓ Failed job6 retried and transitioned to pending.');

  console.log('\n--- 5. Verifying Queue Controls: Pause, Resume, Simulate 429, Step ---');
  await controller.simulate429();
  assert.equal(controller.getState().queueRunning, false);
  console.log('✓ Simulate 429 triggered challenge pause.');

  await controller.resumeQueue();
  assert.equal(controller.getState().queueRunning, true);
  console.log('✓ Queue resumed.');

  const steppedJob = await controller.stepQueue();
  assert.ok(steppedJob);
  assert.equal(steppedJob.state, 'completed');
  console.log('✓ Stepped queue executed job: %s', steppedJob.id);

  console.log('\n--- 6. Rendering Prototype A HTML and Responsive CSS ---');
  const viewHtml = renderQueueView({
    jobs: controller.getJobs(),
    queueRunning: true,
    inspectingJobId: 'job_m1_text_img',
    progressPercentage: 33,
  });

  assert.ok(viewHtml.includes('tabContentQueue'));
  assert.ok(viewHtml.includes('Queue Progress: 2 of 6 Completed'));
  assert.ok(viewHtml.includes('[PROTOTYPE • SIMULATED] Sample Data'));
  assert.ok(viewHtml.includes('role="dialog"'));
  assert.ok(viewHtml.includes('job_m1_text_img'));
  console.log('✓ HTML rendered matching Prototype A console layout with dialog and sample watermarks.');

  const styles = getQueueViewStyles();
  assert.ok(styles.includes('width: 420px'));
  assert.ok(styles.includes('@media (max-width: 360px)'));
  assert.ok(styles.includes(':focus-visible'));
  console.log('✓ CSS verified: 420px container, narrow 320px responsive rules, focus ring styling.');

  console.log('\n====================================================');
  console.log('ALL MANUAL QA QUEUE SCENARIO CHECKS PASSED.');
  console.log('====================================================');
}

runManualQAQueueScenario().catch((err) => {
  console.error('[manual-qa-queue] ERROR:', err);
  process.exit(1);
});
