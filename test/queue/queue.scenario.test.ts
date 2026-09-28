import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createJob,
  transitionJob,
  QueueManager,
  type Job,
  type JobResult
} from '../../src/queue/index.ts';

test('Mixed queue scenario: 6 modes progress sequentially with zero race conditions', async () => {
  // Given: 6 jobs representing the full M1-M6 feature matrix
  const jobs: Job[] = [
    createJob({ media: 'image', mode: 'text-only', prompt: 'M1: Thai temple at sunset' }),
    createJob({ media: 'image', mode: 'single-ref', prompt: 'M2: Cyberpunk monk', referenceId: 'ref_monk_01' }),
    createJob({ media: 'image', mode: 'paired-ref', prompt: 'M3: Floating market watercolor', referenceId: 'ref_market_01' }),
    createJob({ media: 'video', mode: 'text-only', prompt: 'M4: Drone flyover of Bangkok expressway' }),
    createJob({ media: 'video', mode: 'single-ref', prompt: 'M5: Animate neon signs glowing', referenceId: 'ref_neon_01' }),
    createJob({ media: 'video', mode: 'paired-ref', prompt: 'M6: Tuk-tuk racing down Sukhumvit', referenceId: 'ref_tuktuk_01' })
  ];

  const executionLog: string[] = [];
  const queue = new QueueManager({
    executeJob: async (job: Job) => {
      executionLog.push(`START:${job.id}:${job.media}:${job.mode}`);
      // simulate realistic execution delay
      await new Promise((resolve) => setTimeout(resolve, 5));
      executionLog.push(`DONE:${job.id}`);
      return transitionJob(job, {
        type: 'COMPLETE',
        result: {
          idempotencyKey: `idem_${job.id}`,
          mediaUrl: `https://example.com/artifacts/${job.id}.${job.media === 'video' ? 'mp4' : 'png'}`,
          mediaType: job.media,
          mimeType: job.media === 'video' ? 'video/mp4' : 'image/png',
          completedAt: Date.now()
        }
      });
    }
  });

  for (const j of jobs) {
    queue.addJob(transitionJob(j, { type: 'SUBMIT' }));
  }

  // When: queue starts and processes all 6 jobs
  await queue.start();

  // Then: all 6 jobs completed, status is 100% complete
  const status = queue.getQueueStatus();
  assert.equal(status.total, 6);
  assert.equal(status.completed, 6);
  assert.equal(status.pending, 0);
  assert.equal(status.running, 0);

  // Execution was strictly sequential without interleaving
  for (let i = 0; i < jobs.length; i++) {
    const startIdx = executionLog.indexOf(`START:${jobs[i]!.id}:${jobs[i]!.media}:${jobs[i]!.mode}`);
    const doneIdx = executionLog.indexOf(`DONE:${jobs[i]!.id}`);
    assert.ok(startIdx !== -1, `Job ${i} must have started`);
    assert.ok(doneIdx !== -1, `Job ${i} must have finished`);
    assert.ok(startIdx < doneIdx, `Job ${i} must start before it finishes`);
    if (i > 0) {
      const prevDoneIdx = executionLog.indexOf(`DONE:${jobs[i - 1]!.id}`);
      assert.ok(prevDoneIdx < startIdx, `Job ${i} must not start before job ${i - 1} finishes`);
    }
  }
});

test('Failure scenario: injected 429 rate limit or challenge pauses queue instead of blind retry', async () => {
  // Given: queue with 3 pending jobs
  const job1 = transitionJob(createJob({ media: 'image', mode: 'text-only', prompt: 'Prompt 1' }), { type: 'SUBMIT' });
  const job2 = transitionJob(createJob({ media: 'image', mode: 'text-only', prompt: 'Prompt 2' }), { type: 'SUBMIT' });
  const job3 = transitionJob(createJob({ media: 'image', mode: 'text-only', prompt: 'Prompt 3' }), { type: 'SUBMIT' });

  let job1Attempts = 0;
  let job2Attempts = 0;

  const queue = new QueueManager({
    executeJob: async (job: Job) => {
      if (job.id === job1.id) {
        job1Attempts++;
        // Simulate upstream rate limit / challenge error
        throw new Error('Upstream Rate-Limit (429): Meta login verification challenge required');
      }
      job2Attempts++;
      return transitionJob(job, {
        type: 'COMPLETE',
        result: {
          idempotencyKey: `idem_${job.id}`,
          mediaUrl: 'https://example.com/ok.png',
          mediaType: 'image',
          mimeType: 'image/png',
          completedAt: Date.now()
        }
      });
    }
  });

  queue.addJob(job1);
  queue.addJob(job2);
  queue.addJob(job3);

  // When: queue starts processing
  await queue.start();

  // Then:
  // 1. job1 was paused due to safety gate, NOT retried repeatedly
  assert.equal(job1Attempts, 1, 'Job 1 should only be attempted once before safety pause');
  const storedJob1 = queue.getJob(job1.id);
  assert.equal(storedJob1?.state, 'paused');
  assert.match(storedJob1?.error || '', /Safety pause/);

  // 2. job2 and job3 were NOT executed while queue is paused
  assert.equal(job2Attempts, 0, 'Subsequent jobs must not be submitted while queue is paused');
  const storedJob2 = queue.getJob(job2.id);
  assert.equal(storedJob2?.state, 'pending');

  const status = queue.getQueueStatus();
  assert.equal(status.paused, 1);
  assert.equal(status.pending, 2);
  assert.equal(status.completed, 0);
});

test('Failure scenario: injected timeout marks job needs-review instead of infinite retry', async () => {
  // Given: queue where video generation times out (>180s)
  const job = transitionJob(
    createJob({ media: 'video', mode: 'text-only', prompt: 'High complexity 4K video render' }),
    { type: 'SUBMIT' }
  );

  let attempts = 0;
  const queue = new QueueManager({
    executeJob: async (j: Job) => {
      attempts++;
      throw new Error('Upstream video generation timed out after 180s');
    }
  });

  queue.addJob(job);

  // When: job runs
  await queue.step();

  // Then: job transitions to needs-review, zero repeated executions
  assert.equal(attempts, 1);
  const updated = queue.getJob(job.id);
  assert.equal(updated?.state, 'needs-review');
  assert.match(updated?.error || '', /Execution timeout/);
});

test('Queue controls: pause, resume, and reorder pending jobs', async () => {
  // Given: queue with 3 pending jobs
  const j1 = transitionJob(createJob({ media: 'image', mode: 'text-only', prompt: 'Job 1' }), { type: 'SUBMIT' });
  const j2 = transitionJob(createJob({ media: 'image', mode: 'text-only', prompt: 'Job 2' }), { type: 'SUBMIT' });
  const j3 = transitionJob(createJob({ media: 'image', mode: 'text-only', prompt: 'Job 3' }), { type: 'SUBMIT' });

  const queue = new QueueManager();
  queue.addJob(j1);
  queue.addJob(j2);
  queue.addJob(j3);

  // When: pause is called
  queue.pause('Operator paused');

  // Then: all pending jobs become paused
  assert.equal(queue.getJob(j1.id)?.state, 'paused');
  assert.equal(queue.getJob(j2.id)?.state, 'paused');
  assert.equal(queue.getJob(j3.id)?.state, 'paused');

  // When: resume is called
  queue.resume();

  // Then: all paused jobs revert to pending
  assert.equal(queue.getJob(j1.id)?.state, 'pending');
  assert.equal(queue.getJob(j2.id)?.state, 'pending');
  assert.equal(queue.getJob(j3.id)?.state, 'pending');

  // When: reorder pending jobs (move j3 to front: [j3, j1, j2])
  queue.reorderPending([j3.id, j1.id, j2.id]);

  // Then: order is preserved in getJobs()
  const ordered = queue.getJobs().map((j) => j.id);
  assert.deepEqual(ordered, [j3.id, j1.id, j2.id]);
});

test('Cancellation race: cancelling in-flight job never resurrects completed state', async () => {
  // Given: queue where job execution is deferred
  let resolveExecution!: () => void;
  const qm = new QueueManager({
    executeJob: async (job: Job) => {
      await new Promise<void>((r) => {
        resolveExecution = r;
      });
      return transitionJob(job, {
        type: 'COMPLETE',
        result: {
          idempotencyKey: 'idem_1',
          mediaUrl: 'http://example.com/1.png',
          mediaType: 'image',
          mimeType: 'image/png',
          completedAt: Date.now()
        }
      });
    }
  });

  qm.addJob(createJob({ id: 'j1', state: 'pending' }));

  // When: step starts and job is cancelled while executeJob is pending
  const stepPromise = qm.step();
  qm.cancelJob('j1', 'User abort');

  // Then: immediate state is failed
  assert.equal(qm.getJob('j1')?.state, 'failed');

  // When: background execution finishes
  resolveExecution();
  await stepPromise;

  // Then: job state MUST remain failed and NOT be resurrected to completed
  assert.equal(qm.getJob('j1')?.state, 'failed');
  assert.equal(qm.getJob('j1')?.error, 'User abort');
});

test('Concurrency lock holds during cancellation until in-flight settles (second pending job)', async () => {
  // Given: queue with 2 pending jobs and controllable execution
  let resolveExecution1!: () => void;
  const qm = new QueueManager({
    executeJob: async (job: Job) => {
      if (job.id === 'j1') {
        await new Promise<void>((r) => {
          resolveExecution1 = r;
        });
      }
      return transitionJob(job, {
        type: 'COMPLETE',
        result: {
          idempotencyKey: `idem_${job.id}`,
          mediaUrl: `http://example.com/${job.id}.png`,
          mediaType: 'image',
          mimeType: 'image/png',
          completedAt: Date.now()
        }
      });
    }
  });

  qm.addJob(createJob({ id: 'j1', state: 'pending' }));
  qm.addJob(createJob({ id: 'j2', state: 'pending' }));

  // When: j1 starts executing and is cancelled while in-flight
  const step1Promise = qm.step();
  qm.cancelJob('j1', 'User cancelled j1');

  // Then: activeJobId / lock is NOT released prematurely; second job cannot run concurrently
  assert.equal(qm.getActiveJob()?.id, 'j1');
  await assert.rejects(
    qm.step(),
    /Cannot step queue: job 'j1' is currently running/
  );

  // When: in-flight execution for j1 settles
  resolveExecution1();
  const step1Result = await step1Promise;

  // Then: j1 settles as failed and lock is released
  assert.equal(step1Result?.state, 'failed');
  assert.equal(qm.getJob('j1')?.state, 'failed');
  assert.equal(qm.getActiveJob(), null);

  // Then: j2 can now step cleanly without concurrency violation
  const step2Result = await qm.step();
  assert.equal(step2Result?.id, 'j2');
  assert.equal(step2Result?.state, 'completed');
  assert.equal(qm.getJob('j2')?.state, 'completed');
});

