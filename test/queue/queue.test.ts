import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createJob,
  transitionJob,
  canTransition,
  QueueManager,
  type Job,
  type JobResult
} from '../../src/queue/index.ts';

test('Job creation defaults to draft state and assigns unique id', () => {
  // Given: job parameters without state or id
  const params = {
    media: 'image' as const,
    mode: 'text-only' as const,
    prompt: 'A cyberpunk cityscape at dawn',
    provider: 'meta' as const
  };

  // When: job is created
  const job = createJob(params);

  // Then: default fields are assigned correctly
  assert.ok(job.id.startsWith('job_'), 'Job ID should start with prefix job_');
  assert.equal(job.state, 'draft');
  assert.equal(job.media, 'image');
  assert.equal(job.mode, 'text-only');
  assert.equal(job.retryCount, 0);
  assert.equal(job.maxRetries, 3);
  assert.ok(job.createdAt > 0);
  assert.ok(job.updatedAt >= job.createdAt);
});

test('Legal state transitions: draft -> pending -> running -> completed', () => {
  // Given: a newly created draft job
  const job = createJob({
    media: 'video',
    mode: 'single-ref',
    prompt: 'Gentle water ripples in motion',
    referenceId: 'ref_123',
    provider: 'meta'
  });

  // When / Then: 1. draft -> pending on SUBMIT
  const pendingJob = transitionJob(job, { type: 'SUBMIT' });
  assert.equal(pendingJob.state, 'pending');

  // When / Then: 2. pending -> running on START
  const startTime = 1000;
  const runningJob = transitionJob(pendingJob, { type: 'START', startedAt: startTime });
  assert.equal(runningJob.state, 'running');
  assert.equal(runningJob.startedAt, startTime);

  // When / Then: 3. running -> completed on COMPLETE
  const mockResult: JobResult = {
    idempotencyKey: 'idem_abc123',
    mediaUrl: 'https://example.com/mock.mp4',
    mediaType: 'video',
    mimeType: 'video/mp4',
    durationSeconds: 5,
    completedAt: 2000
  };
  const completedJob = transitionJob(runningJob, { type: 'COMPLETE', result: mockResult });
  assert.equal(completedJob.state, 'completed');
  assert.equal(completedJob.completedAt, 2000);
  assert.deepEqual(completedJob.result, mockResult);
  assert.equal(completedJob.idempotencyKey, 'idem_abc123');
});

test('Bounded retry: transient error increments retryCount and reverts to pending until maxRetries', () => {
  // Given: running job with maxRetries = 2, retryCount = 0
  const job = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Studio portrait',
    provider: 'meta',
    maxRetries: 2
  });
  const running1 = transitionJob(transitionJob(job, { type: 'SUBMIT' }), { type: 'START' });

  // When: first transient failure occurs
  const retried1 = transitionJob(running1, { type: 'FAIL', error: 'Network timeout', fatal: false });

  // Then: retryCount increments and state returns to pending for another attempt
  assert.equal(retried1.state, 'pending');
  assert.equal(retried1.retryCount, 1);
  assert.equal(retried1.error, 'Network timeout');

  // When: second attempt starts and fails
  const running2 = transitionJob(retried1, { type: 'START' });
  const retried2 = transitionJob(running2, { type: 'FAIL', error: 'Socket reset', fatal: false });

  // Then: retryCount reaches maxRetries (2) and transitions to terminal failed state
  assert.equal(retried2.state, 'failed');
  assert.equal(retried2.retryCount, 2);
  assert.equal(retried2.error, 'Socket reset');
});

test('Fatal error fails immediately without retrying', () => {
  // Given: running job with remaining retries
  const job = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Test prompt',
    provider: 'meta',
    maxRetries: 3
  });
  const running = transitionJob(transitionJob(job, { type: 'SUBMIT' }), { type: 'START' });

  // When: fatal error occurs (e.g. policy violation or fatal format error)
  const failed = transitionJob(running, { type: 'FAIL', error: 'Policy violation', fatal: true });

  // Then: state transitions directly to failed with zero retry increments
  assert.equal(failed.state, 'failed');
  assert.equal(failed.retryCount, 0);
  assert.equal(failed.error, 'Policy violation');
});

test('Safety gate: MARK_NEEDS_REVIEW halts execution for operator inspection', () => {
  // Given: running job
  const job = createJob({ media: 'video', mode: 'text-only', prompt: 'Sensitive prompt', provider: 'meta' });
  const running = transitionJob(transitionJob(job, { type: 'SUBMIT' }), { type: 'START' });

  // When: upstream challenge or ambiguous safety condition occurs
  const underReview = transitionJob(running, {
    type: 'MARK_NEEDS_REVIEW',
    reason: 'Upstream verification challenge required'
  });

  // Then: state is needs-review and error holds explanation
  assert.equal(underReview.state, 'needs-review');
  assert.equal(underReview.error, 'Upstream verification challenge required');

  // When: operator approves review
  const approved = transitionJob(underReview, { type: 'RESOLVE_REVIEW', approve: true });
  assert.equal(approved.state, 'pending');

  // When: operator rejects review
  const rejected = transitionJob(underReview, { type: 'RESOLVE_REVIEW', approve: false });
  assert.equal(rejected.state, 'failed');
});

test('User cancellation transitions non-terminal jobs to failed state with reason', () => {
  // Given: jobs in draft, pending, running, paused
  const draft = createJob({ media: 'image', mode: 'text-only', prompt: 'test' });
  const pending = transitionJob(draft, { type: 'SUBMIT' });
  const running = transitionJob(pending, { type: 'START' });
  const paused = transitionJob(running, { type: 'PAUSE', reason: 'User paused' });

  // When / Then: all non-terminal states can be cancelled
  const cancelledFromPending = transitionJob(pending, { type: 'CANCEL', reason: 'User cancelled' });
  assert.equal(cancelledFromPending.state, 'failed');
  assert.equal(cancelledFromPending.error, 'User cancelled');

  const cancelledFromRunning = transitionJob(running, { type: 'CANCEL', reason: 'User cancelled' });
  assert.equal(cancelledFromRunning.state, 'failed');

  const cancelledFromPaused = transitionJob(paused, { type: 'CANCEL', reason: 'User cancelled' });
  assert.equal(cancelledFromPaused.state, 'failed');
});

test('Illegal state transitions are rejected and throw descriptive error', () => {
  // Given: completed job
  const job = createJob({ media: 'image', mode: 'text-only', prompt: 'test' });
  const completed = transitionJob(
    transitionJob(transitionJob(job, { type: 'SUBMIT' }), { type: 'START' }),
    {
      type: 'COMPLETE',
      result: {
        idempotencyKey: 'idem_1',
        mediaUrl: 'https://example.com/img.png',
        mediaType: 'image',
        mimeType: 'image/png',
        completedAt: 1000
      }
    }
  );

  // When / Then: attempting to START or SUBMIT completed job throws
  assert.throws(
    () => transitionJob(completed, { type: 'START' }),
    /Invalid state transition from 'completed' with event 'START'/
  );
  assert.throws(
    () => transitionJob(completed, { type: 'SUBMIT' }),
    /Invalid state transition from 'completed' with event 'SUBMIT'/
  );

  // When / Then: attempting to complete draft job directly throws
  assert.throws(
    () => transitionJob(job, {
      type: 'COMPLETE',
      result: {
        idempotencyKey: 'k',
        mediaUrl: 'u',
        mediaType: 'image',
        mimeType: 'image/png',
        completedAt: 1
      }
    }),
    /Invalid state transition from 'draft' with event 'COMPLETE'/
  );
});

test('Idempotent completion: re-completing with same idempotencyKey returns current job', () => {
  // Given: completed job
  const job = createJob({ media: 'image', mode: 'text-only', prompt: 'test' });
  const result: JobResult = {
    idempotencyKey: 'idem_key_42',
    mediaUrl: 'https://example.com/img.png',
    mediaType: 'image',
    mimeType: 'image/png',
    completedAt: 1000
  };
  const completed = transitionJob(
    transitionJob(transitionJob(job, { type: 'SUBMIT' }), { type: 'START' }),
    { type: 'COMPLETE', result }
  );

  // When: COMPLETE event is sent again with same idempotencyKey
  const duplicate = transitionJob(completed, { type: 'COMPLETE', result });

  // Then: no error is thrown and completed job is returned unchanged
  assert.equal(duplicate.state, 'completed');
  assert.equal(duplicate.idempotencyKey, 'idem_key_42');
});

test('QueueManager enforces single active submission (concurrency = 1)', async () => {
  // Given: QueueManager with mock asynchronous executor
  let runningCount = 0;
  let maxConcurrentRunning = 0;

  const queue = new QueueManager({
    executeJob: async (job: Job) => {
      runningCount++;
      if (runningCount > maxConcurrentRunning) {
        maxConcurrentRunning = runningCount;
      }
      // simulate asynchronous execution
      await new Promise((resolve) => setTimeout(resolve, 10));
      runningCount--;
      return transitionJob(job, {
        type: 'COMPLETE',
        result: {
          idempotencyKey: `idem_${job.id}`,
          mediaUrl: `https://example.com/${job.id}.png`,
          mediaType: job.media,
          mimeType: 'image/png',
          completedAt: Date.now()
        }
      });
    }
  });

  const job1 = createJob({ media: 'image', mode: 'text-only', prompt: 'prompt 1' });
  const job2 = createJob({ media: 'video', mode: 'single-ref', prompt: 'prompt 2', referenceId: 'ref_1' });
  const job3 = createJob({ media: 'image', mode: 'paired-ref', prompt: 'prompt 3', referenceId: 'ref_2' });

  queue.addJob(transitionJob(job1, { type: 'SUBMIT' }));
  queue.addJob(transitionJob(job2, { type: 'SUBMIT' }));
  queue.addJob(transitionJob(job3, { type: 'SUBMIT' }));

  // When: queue starts and processes all jobs
  await queue.start();

  // Then: at most 1 job was ever running concurrently
  assert.equal(maxConcurrentRunning, 1, 'Concurrency must never exceed 1 active submission');
  const allJobs = queue.getJobs();
  assert.equal(allJobs.length, 3);
  assert.ok(allJobs.every((j) => j.state === 'completed'));
});

test('reorderPending rejects duplicate or omitted IDs without job loss', () => {
  // Given: queue with 2 pending jobs
  const qm = new QueueManager();
  const j1 = createJob({ id: 'j1', state: 'pending', prompt: 'p1' });
  const j2 = createJob({ id: 'j2', state: 'pending', prompt: 'p2' });
  qm.addJob(j1);
  qm.addJob(j2);

  // When / Then: passing duplicate IDs throws error and preserves jobs
  assert.throws(
    () => qm.reorderPending(['j1', 'j1']),
    /duplicate|unique|permutation/i
  );
  assert.deepEqual(qm.getJobs().map((j) => j.id), ['j1', 'j2']);

  // When / Then: passing omitted / missing IDs throws error and preserves jobs
  assert.throws(
    () => qm.reorderPending(['j1']),
    /match pending job count|missing|omitted/i
  );
  assert.deepEqual(qm.getJobs().map((j) => j.id), ['j1', 'j2']);

  // When / Then: passing unknown IDs throws error and preserves jobs
  assert.throws(
    () => qm.reorderPending(['j1', 'j3']),
    /not in pending state or not found/i
  );
  assert.deepEqual(qm.getJobs().map((j) => j.id), ['j1', 'j2']);
});

