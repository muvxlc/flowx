import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../../../src/queue/types.ts';
import { MemoryChromeStorageArea } from '../../../src/persistence/memory-storage.ts';
import { PersistenceService } from '../../../src/persistence/service.ts';
import {
  QueueController,
  renderQueueView,
  getQueueViewStyles,
} from '../../../src/ui/queue/index.ts';

function createMockJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job_' + Math.random().toString(36).substring(2, 9),
    media: 'image',
    mode: 'text-only',
    prompt: 'A prompt string',
    provider: 'meta',
    settings: {},
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

test('Probes - XSS payload in prompt, job ID, error, and reference ID is strictly sanitized', () => {
  const xssJob = createMockJob({
    id: 'xss<script>alert(1)</script>',
    prompt: 'Prompt with <img src=x onerror="alert(\'pwned\')"> and & " \' chars',
    referenceId: '<svg onload=alert(2)>',
    state: 'failed',
    error: 'Fatal injection <b style="color:red">bold</b>',
  });

  const html = renderQueueView({
    jobs: [xssJob],
    errorMessage: '<script>alert("error")</script>',
    inspectingJobId: xssJob.id,
  });

  // Verify dangerous tags are never present in raw unescaped form
  assert.ok(!html.includes('<script>alert(1)</script>'), 'Job ID script tag escaped');
  assert.ok(!html.includes('<img src=x onerror='), 'Prompt img tag escaped');
  assert.ok(!html.includes('<svg onload='), 'Ref ID tag escaped');
  assert.ok(!html.includes('<b style='), 'Error b tag escaped');
  assert.ok(!html.includes('<script>alert("error")</script>'), 'Error message script tag escaped');

  // Verify safe escaped entities are present
  assert.ok(html.includes('&lt;script&gt;'), 'Script tags converted to &lt;script&gt;');
  assert.ok(html.includes('&amp;'), 'Ampersands properly escaped');
});

test('Probes - State transition boundaries and illegal actions are rejected', async () => {
  const storage = new MemoryChromeStorageArea();
  const persistence = new PersistenceService({ storage });
  const controller = new QueueController({ persistence });

  const completedJob = createMockJob({ id: 'j_done', state: 'completed' });
  const pendingJob = createMockJob({ id: 'j_wait', state: 'pending' });
  const runningJob = createMockJob({ id: 'j_run', state: 'running' });

  await controller.setJobs([completedJob, pendingJob, runningJob]);

  // 1. Attempting to retry a pending or running job throws
  await assert.rejects(
    async () => controller.retryJob('j_wait'),
    (err: Error) => /only failed or needs-review can be retried/i.test(err.message)
  );

  // 2. Attempting to cancel an already completed job throws
  await assert.rejects(
    async () => controller.cancelJob('j_done'),
    (err: Error) => /cannot cancel completed job/i.test(err.message)
  );

  // 3. Attempting to edit with empty or whitespace-only prompt throws
  await assert.rejects(
    async () => controller.editJob('j_wait', { prompt: '   \n  ' }),
    (err: Error) => /prompt cannot be empty/i.test(err.message)
  );

  // 4. Moving non-existent job throws
  await assert.rejects(
    async () => controller.moveJob('non_existent', 1),
    (err: Error) => /not found/i.test(err.message)
  );

  // 5. Moving at top boundary (index 0 move up) is safe no-op
  await controller.moveJob('j_done', -1);
  assert.equal(controller.getJobs()[0]?.id, 'j_done');

  // 6. Moving at bottom boundary (last index move down) is safe no-op
  await controller.moveJob('j_run', 1);
  assert.equal(controller.getJobs()[2]?.id, 'j_run');
});

test('Probes - Simulate 429 Challenge Pause and Pause/Resume lifecycle', async () => {
  const storage = new MemoryChromeStorageArea();
  const persistence = new PersistenceService({ storage });
  const controller = new QueueController({ persistence });

  const j1 = createMockJob({ id: 'j1', state: 'pending' });
  const j2 = createMockJob({ id: 'j2', state: 'running' });
  const j3 = createMockJob({ id: 'j3', state: 'completed' });

  await controller.setJobs([j1, j2, j3]);

  // Trigger simulate429
  await controller.simulate429();
  const state429 = controller.getState();
  assert.equal(state429.queueRunning, false);
  assert.ok(state429.statusAlert?.includes('429'));
  assert.equal(state429.jobs.find((j) => j.id === 'j1')?.state, 'paused');
  assert.equal(state429.jobs.find((j) => j.id === 'j2')?.state, 'paused');
  assert.equal(state429.jobs.find((j) => j.id === 'j3')?.state, 'completed', 'Completed jobs remain completed');

  // Resume queue
  await controller.resumeQueue();
  const stateResume = controller.getState();
  assert.equal(stateResume.queueRunning, true);
  assert.equal(stateResume.jobs.find((j) => j.id === 'j1')?.state, 'pending');
  assert.equal(stateResume.jobs.find((j) => j.id === 'j2')?.state, 'pending');

  // Clear completed jobs
  await controller.clearCompleted();
  assert.equal(controller.getJobs().length, 2);
  assert.ok(!controller.getJobs().some((j) => j.id === 'j3'));
});

test('Probes - Screen reader and keyboard navigation contract', () => {
  const job = createMockJob({ id: 'j_accessible', prompt: 'Accessibility test prompt' });
  const html = renderQueueView({
    jobs: [job],
    queueRunning: false,
    inspectingJobId: 'j_accessible',
  });

  // Verify ARIA landmarks and roles
  assert.ok(html.includes('aria-label="Generation Queue"'), 'Section has aria-label');
  assert.ok(html.includes('role="toolbar"'), 'Toolbar has role="toolbar"');
  assert.ok(html.includes('role="region"'), 'Progress card has role="region"');
  assert.ok(html.includes('role="progressbar"'), 'Progress bar has role="progressbar"');
  assert.ok(html.includes('aria-valuenow="0"'), 'Progress bar has numeric value');
  assert.ok(html.includes('role="list"'), 'Queue items container has role="list"');
  assert.ok(html.includes('role="listitem"'), 'Queue item has role="listitem"');
  assert.ok(html.includes('aria-label="Move job up"'), 'Move up button has accessible name');
  assert.ok(html.includes('aria-label="Move job down"'), 'Move down button has accessible name');
  assert.ok(html.includes('aria-label="Inspect job j_accessible"'), 'Inspect button has accessible name');
  assert.ok(html.includes('aria-label="Edit prompt for j_accessible"'), 'Edit button has accessible name');
  assert.ok(html.includes('aria-label="Cancel job j_accessible"'), 'Cancel button has accessible name');

  // Dialog accessibility
  assert.ok(html.includes('role="dialog"'), 'Dialog has role="dialog"');
  assert.ok(html.includes('aria-modal="true"'), 'Dialog has aria-modal="true"');
  assert.ok(html.includes('aria-labelledby="inspectDialogTitle"'), 'Dialog has aria-labelledby');
  assert.ok(html.includes('aria-label="Close details"'), 'Dialog close has accessible label');
});

test('Probes - 420px width and 320px narrow responsive CSS checks', () => {
  const css = getQueueViewStyles();

  // Side-panel layout rules
  assert.ok(css.includes('width: 420px'), 'Default 420px width');
  assert.ok(css.includes('max-width: 100%'), 'Fluid responsiveness');
  assert.ok(css.includes('overflow: hidden'), 'Prevents horizontal page blowout');
  assert.ok(css.includes('@media (max-width: 360px)'), 'Responsive breakpoint for narrow views');
  assert.ok(css.includes('flex-direction: column'), 'Columns collapse on narrow screens');
  assert.ok(css.includes('--font-mono'), 'Monospace tokens declared');
});
