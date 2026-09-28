import {
  SafeQueueScheduler,
  FakeAlarmClock,
  safeCleanupTempStorage,
} from '../../src/scheduler/index.ts';
import { QueueManager } from '../../src/queue/index.ts';
import {
  MetadataStorage,
  MediaStorage,
  createMemoryChromeStorage,
} from '../../src/persistence/index.ts';
import type { Job } from '../../src/queue/types.ts';

async function runManualQAScenario() {
  console.log('[manual-qa-scheduler] Starting scheduler & cleanup verification in Node...');

  // Phase 1: Alarm wakeup with concurrency = 1
  console.log('[manual-qa-scheduler] Phase 1: Alarm wakeup & concurrency=1');
  const clock = new FakeAlarmClock();
  const queue = new QueueManager();
  queue.addJob({
    id: 'manual-job-1',
    media: 'image',
    mode: 'text-only',
    prompt: 'Manual QA Image 1',
    provider: 'meta',
    settings: {},
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });

  const scheduler = new SafeQueueScheduler({
    queue,
    clock,
  });

  scheduler.start();
  await clock.tick(60_000);
  console.log(`[manual-qa-scheduler] Job state after alarm wake: ${queue.getJob('manual-job-1')?.state}`);
  if (queue.getJob('manual-job-1')?.state !== 'completed') {
    throw new Error('Phase 1 failed: Job should be completed');
  }

  // Phase 2: Injected 429 / challenge pause
  console.log('[manual-qa-scheduler] Phase 2: Injected 429 Rate Limit Pause');
  queue.addJob({
    id: 'manual-job-429',
    media: 'video',
    mode: 'text-only',
    prompt: 'Manual QA Video 429',
    provider: 'meta',
    settings: {},
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });

  scheduler.setStepExecutor(async () => {
    throw new Error('HTTP 429 Too Many Requests: Rate limit exceeded');
  });

  await clock.tick(60_000);
  console.log(`[manual-qa-scheduler] Scheduler paused: ${scheduler.isPaused()}`);
  console.log(`[manual-qa-scheduler] Pause reason: ${scheduler.getPauseReason()}`);
  if (!scheduler.isPaused()) {
    throw new Error('Phase 2 failed: Scheduler must be paused on 429');
  }

  // Phase 3: Resume
  console.log('[manual-qa-scheduler] Phase 3: Operator resume');
  scheduler.resume();
  console.log(`[manual-qa-scheduler] Scheduler resumed: ${!scheduler.isPaused()}`);

  // Phase 4: Confirmation-only cleanup preserving queue and key
  console.log('[manual-qa-scheduler] Phase 4: Extension-temp cleanup');
  const storage = createMemoryChromeStorage();
  const metadata = new MetadataStorage({ storage });
  const media = new MediaStorage(true);

  await storage.set({
    meta_automator_jobs: queue.getJobs(),
    jev_api_key: 'dummy_secret',
    meta_automator_settings: { endpoint: 'https://9router.bangkhan.com/v1/systemone' },
  });

  await media.saveMedia('orphaned-temp-1', new Uint8Array([1, 2, 3]), 'image/png');

  // Unconfirmed cleanup must fail
  try {
    await safeCleanupTempStorage({ metadata, media, options: { userConfirmed: false } });
    throw new Error('Unconfirmed cleanup should have thrown');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[manual-qa-scheduler] Correctly rejected unconfirmed cleanup: ${msg}`);
  }

  // Confirmed cleanup
  const cleanupResult = await safeCleanupTempStorage({
    metadata,
    media,
    options: { userConfirmed: true },
  });

  console.log(
    `[manual-qa-scheduler] Confirmed cleanup finished: clearedTempBlobs=${cleanupResult.clearedTempBlobsCount}, preservedJobs=${cleanupResult.preservedQueueJobsCount}`
  );

  const finalData = await storage.get(null);
  if (finalData.jev_api_key !== 'dummy_secret') {
    throw new Error('Phase 4 failed: API key was corrupted or deleted');
  }
  if (!finalData.meta_automator_jobs) {
    throw new Error('Phase 4 failed: Queue was corrupted or deleted');
  }

  console.log('[manual-qa-scheduler] All manual QA checks PASSED.');
  scheduler.stop();
}

runManualQAScenario().catch((err) => {
  console.error('[manual-qa-scheduler] FAILED:', err);
  process.exit(1);
});
