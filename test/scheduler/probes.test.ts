import test from 'node:test';
import assert from 'node:assert';
import {
  SafeQueueScheduler,
  FakeAlarmClock,
} from '../../src/scheduler/index.ts';
import { QueueManager } from '../../src/queue/index.ts';
import { RecoveryManager } from '../../src/persistence/index.ts';
import type { Job } from '../../src/queue/types.ts';

test('Probe - stale running job detected and recovered on scheduler wakeup', async () => {
  const clock = new FakeAlarmClock();
  const queue = new QueueManager();
  const recovery = new RecoveryManager(3);

  // Stale running job created 200 seconds ago
  const staleJob: Job = {
    id: 'job-stale-1',
    media: 'image',
    mode: 'text-only',
    prompt: 'Stale running prompt',
    provider: 'meta',
    settings: {},
    state: 'running',
    retryCount: 0,
    maxRetries: 3,
    createdAt: clock.now() - 200_000,
    updatedAt: clock.now() - 200_000,
    startedAt: clock.now() - 200_000,
  };

  queue.addJob(staleJob);

  const scheduler = new SafeQueueScheduler({
    queue,
    clock,
    recovery,
    staleRunningTimeoutMs: 180_000,
  });

  scheduler.start();

  // Trigger wakeup
  await scheduler.handleAlarm({ name: 'meta_automator_queue_alarm' });

  // Stale job should have been recovered (reset to pending or processed)
  const job = queue.getJob('job-stale-1');
  assert.ok(job);
  assert.notStrictEqual(job?.startedAt, clock.now() - 200_000);
  scheduler.stop();
});

test('Probe - repeated interruptions escalate job to needs-review during scheduler lifecycle', async () => {
  const clock = new FakeAlarmClock();
  const queue = new QueueManager();
  const recovery = new RecoveryManager(3); // threshold 3

  const flappingJob: Job = {
    id: 'job-flapping',
    media: 'video',
    mode: 'text-only',
    prompt: 'Flapping prompt',
    provider: 'meta',
    settings: {},
    state: 'running',
    retryCount: 0,
    maxRetries: 3,
    createdAt: clock.now(),
    updatedAt: clock.now(),
    startedAt: clock.now() - 200_000,
  };

  queue.addJob(flappingJob);

  const scheduler = new SafeQueueScheduler({
    queue,
    clock,
    recovery,
    staleRunningTimeoutMs: 1000,
  });

  // Interruption 1
  await scheduler.probeAndRecoverStaleJobs();
  let currentJob = queue.getJob('job-flapping')!;
  assert.strictEqual(currentJob.state, 'pending');

  // Simulate starting again then worker suspended
  currentJob.state = 'running';
  currentJob.startedAt = clock.now() - 2000;

  // Interruption 2
  await scheduler.probeAndRecoverStaleJobs();
  currentJob = queue.getJob('job-flapping')!;
  assert.strictEqual(currentJob.state, 'pending');

  // Simulate starting again then worker suspended
  currentJob.state = 'running';
  currentJob.startedAt = clock.now() - 2000;

  // Interruption 3 -> Hits threshold 3, must escalate to needs-review
  await scheduler.probeAndRecoverStaleJobs();
  currentJob = queue.getJob('job-flapping')!;
  assert.strictEqual(currentJob.state, 'needs-review');
  assert.ok(currentJob.error?.includes('repeatedly interrupted'));
});

test('Probe - high-frequency overlapping alarm bursts maintain strict concurrency=1', async () => {
  const clock = new FakeAlarmClock();
  const queue = new QueueManager();

  for (let i = 0; i < 5; i++) {
    queue.addJob({
      id: `burst-${i}`,
      media: 'image',
      mode: 'text-only',
      prompt: `Burst prompt ${i}`,
      provider: 'meta',
      settings: {},
      state: 'pending',
      retryCount: 0,
      maxRetries: 3,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
  }

  let concurrentCount = 0;
  let maxConcurrency = 0;

  const scheduler = new SafeQueueScheduler({
    queue,
    clock,
    executeStep: async () => {
      concurrentCount++;
      maxConcurrency = Math.max(maxConcurrency, concurrentCount);
      await clock.sleep(20);
      const res = await queue.step();
      concurrentCount--;
      return res;
    },
  });

  scheduler.start();

  // Burst of 20 concurrent alarms fired simultaneously
  const alarms = Array.from({ length: 20 }, () =>
    scheduler.handleAlarm({ name: 'meta_automator_queue_alarm' })
  );

  await clock.tick(500);
  await Promise.all(alarms);

  assert.strictEqual(maxConcurrency, 1, 'Max concurrency must never exceed 1');
  scheduler.stop();
});
