import test from 'node:test';
import assert from 'node:assert';
import {
  SafeQueueScheduler,
  FakeAlarmClock,
} from '../../src/scheduler/index.ts';
import { QueueManager } from '../../src/queue/index.ts';
import type { Job } from '../../src/queue/types.ts';

function createSampleJob(id: string): Job {
  return {
    id,
    media: 'image',
    mode: 'text-only',
    prompt: `Sample prompt ${id}`,
    provider: 'meta',
    settings: {},
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

test('Scheduler - alarms wakeup triggers queue execution with concurrency=1', async () => {
  const clock = new FakeAlarmClock();
  const queue = new QueueManager();
  queue.addJob(createSampleJob('job-1'));
  queue.addJob(createSampleJob('job-2'));

  let activeExecutions = 0;
  let maxConcurrentExecutions = 0;

  const scheduler = new SafeQueueScheduler({
    queue,
    clock,
    executeStep: async () => {
      activeExecutions++;
      maxConcurrentExecutions = Math.max(maxConcurrentExecutions, activeExecutions);
      await clock.sleep(10);
      const res = await queue.step();
      activeExecutions--;
      return res;
    },
  });

  scheduler.start();

  // Fire alarm
  await clock.tick(60_000);

  assert.strictEqual(maxConcurrentExecutions, 1, 'Concurrency must strictly equal 1');
  const status = queue.getQueueStatus();
  assert.ok(status.completed >= 1, 'At least one job should be completed on alarm');
  scheduler.stop();
});

test('Scheduler - multiple rapid overlapping alarms are coalesced without duplicate submit', async () => {
  const clock = new FakeAlarmClock();
  const queue = new QueueManager();
  queue.addJob(createSampleJob('job-fast-1'));

  let submitCount = 0;
  const scheduler = new SafeQueueScheduler({
    queue,
    clock,
    executeStep: async () => {
      submitCount++;
      await clock.sleep(50);
      return queue.step();
    },
  });

  scheduler.start();

  // Trigger rapid burst of 5 alarms before step finishes
  const alarmPromises = [
    scheduler.handleAlarm({ name: 'meta_automator_queue_alarm' }),
    scheduler.handleAlarm({ name: 'meta_automator_queue_alarm' }),
    scheduler.handleAlarm({ name: 'meta_automator_queue_alarm' }),
    scheduler.handleAlarm({ name: 'meta_automator_queue_alarm' }),
    scheduler.handleAlarm({ name: 'meta_automator_queue_alarm' }),
  ];

  await clock.tick(100);
  await Promise.all(alarmPromises);

  assert.strictEqual(submitCount, 1, 'Rapid alarms must be coalesced into single execution');
  assert.strictEqual(queue.getJob('job-fast-1')?.state, 'completed');
  scheduler.stop();
});

test('Scheduler - browser sleep overdue alarm is processed once and not multiplied', async () => {
  const clock = new FakeAlarmClock();
  const queue = new QueueManager();
  queue.addJob(createSampleJob('job-sleep-1'));

  let stepCallCount = 0;
  const scheduler = new SafeQueueScheduler({
    queue,
    clock,
    executeStep: async () => {
      stepCallCount++;
      return queue.step();
    },
  });

  scheduler.start();

  // Fast forward clock by 1 hour (simulating wake from computer sleep)
  // This simulates an alarm overdue by 60 minutes
  await clock.tick(3_600_000);

  // Even with 60 overdue minutes, scheduler should process the tick cleanly without flooding
  assert.strictEqual(queue.getJob('job-sleep-1')?.state, 'completed');
  assert.strictEqual(stepCallCount, 1);
  scheduler.stop();
});

test('Scheduler - 429 rate limit or challenge triggers immediate pause and stops automatic wakeups', async () => {
  const clock = new FakeAlarmClock();
  const queue = new QueueManager();
  queue.addJob(createSampleJob('job-rate-limited'));

  const scheduler = new SafeQueueScheduler({
    queue,
    clock,
    executeStep: async () => {
      throw new Error('HTTP 429 Rate Limit exceeded: Try again later');
    },
  });

  scheduler.start();

  // Wakeup alarm fires
  await clock.tick(60_000);

  assert.strictEqual(scheduler.isPaused(), true, 'Scheduler must be paused on 429');
  assert.ok(scheduler.getPauseReason()?.includes('429'), 'Pause reason must mention 429');
  assert.strictEqual(queue.getJob('job-rate-limited')?.state, 'paused');

  // Next alarm should NOT run because scheduler is paused
  let attemptedRunWhilePaused = false;
  scheduler.setStepExecutor(async () => {
    attemptedRunWhilePaused = true;
    return null;
  });

  await clock.tick(60_000);
  assert.strictEqual(attemptedRunWhilePaused, false, 'No execution while paused');

  // Resume resumes execution
  scheduler.resume();
  assert.strictEqual(scheduler.isPaused(), false);
  scheduler.stop();
});

test('Scheduler - bounded backoff applies to transient faults and resets on success', async () => {
  const clock = new FakeAlarmClock();
  const queue = new QueueManager();
  queue.addJob(createSampleJob('job-flaky'));

  let attempts = 0;
  const scheduler = new SafeQueueScheduler({
    queue,
    clock,
    baseBackoffMs: 1_000,
    maxBackoffMs: 8_000,
    backoffFactor: 2,
    executeStep: async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Transient network glitch');
      }
      return queue.step();
    },
  });

  scheduler.start();

  // Attempt 1 fails -> backoff delay = 1000ms
  await clock.tick(0);
  assert.strictEqual(scheduler.getCurrentBackoffDelay(), 1000);

  // Attempt 2 fails -> backoff delay = 2000ms
  await clock.tick(1000);
  assert.strictEqual(scheduler.getCurrentBackoffDelay(), 2000);

  // Attempt 3 succeeds -> backoff resets to 0
  await clock.tick(2000);
  assert.strictEqual(scheduler.getCurrentBackoffDelay(), 0);
  assert.strictEqual(queue.getJob('job-flaky')?.state, 'completed');
  scheduler.stop();
});
