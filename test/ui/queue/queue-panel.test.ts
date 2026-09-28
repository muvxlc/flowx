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
    prompt: 'Sample visual prompt of futuristic cyberpunk street',
    provider: 'meta',
    settings: { aspectRatio: '1:1' },
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

test('QueueController - forbids editing a running job', async () => {
  const storage = new MemoryChromeStorageArea();
  const persistence = new PersistenceService({ storage });
  const controller = new QueueController({ persistence });

  const runningJob = createMockJob({ id: 'job_running_01', state: 'running' });
  const pendingJob = createMockJob({ id: 'job_pending_01', state: 'pending' });

  await controller.setJobs([runningJob, pendingJob]);

  // Attempting to edit a running job MUST fail
  await assert.rejects(
    async () => {
      await controller.editJob('job_running_01', { prompt: 'Updated prompt text' });
    },
    (err: Error) => {
      assert.match(err.message, /cannot edit running job/i);
      return true;
    }
  );

  // But editing a pending job succeeds
  const updatedPending = await controller.editJob('job_pending_01', {
    prompt: 'Clean updated prompt for pending job',
  });
  assert.equal(updatedPending.prompt, 'Clean updated prompt for pending job');
});

test('QueueController - forbids duplicating a running job', async () => {
  const storage = new MemoryChromeStorageArea();
  const persistence = new PersistenceService({ storage });
  const controller = new QueueController({ persistence });

  const runningJob = createMockJob({ id: 'job_running_02', state: 'running' });
  const pausedJob = createMockJob({ id: 'job_paused_02', state: 'paused' });

  await controller.setJobs([runningJob, pausedJob]);

  // Attempting to duplicate running job MUST fail
  await assert.rejects(
    async () => {
      await controller.duplicateJob('job_running_02');
    },
    (err: Error) => {
      assert.match(err.message, /cannot duplicate running job/i);
      return true;
    }
  );

  // Duplicating a non-running job succeeds
  const dup = await controller.duplicateJob('job_paused_02');
  assert.ok(dup.id !== 'job_paused_02');
  assert.equal(dup.prompt, pausedJob.prompt);
  assert.equal(dup.state, 'pending');
});

test('QueueController - persisted mixed reorder updates order and syncs to persistence', async () => {
  const storage = new MemoryChromeStorageArea();
  const persistence = new PersistenceService({ storage });
  const controller = new QueueController({ persistence });

  const jobCompleted = createMockJob({ id: 'j_completed', state: 'completed' });
  const jobPaused = createMockJob({ id: 'j_paused', state: 'paused' });
  const jobPending1 = createMockJob({ id: 'j_pending_1', state: 'pending' });
  const jobPending2 = createMockJob({ id: 'j_pending_2', state: 'pending' });
  const jobFailed = createMockJob({ id: 'j_failed', state: 'failed' });

  const initialList = [jobCompleted, jobPaused, jobPending1, jobPending2, jobFailed];
  await controller.setJobs(initialList);

  // Move j_pending_2 up ahead of j_pending_1
  await controller.moveJob('j_pending_2', -1);
  const reorderedIds1 = controller.getJobs().map((j) => j.id);
  assert.deepEqual(reorderedIds1, ['j_completed', 'j_paused', 'j_pending_2', 'j_pending_1', 'j_failed']);

  // Move j_failed up
  await controller.moveJob('j_failed', -1);
  const reorderedIds2 = controller.getJobs().map((j) => j.id);
  assert.deepEqual(reorderedIds2, ['j_completed', 'j_paused', 'j_pending_2', 'j_failed', 'j_pending_1']);

  // Verify persistence service received the new order
  const rehydrated = await persistence.rehydrateQueue();
  const persistedIds = rehydrated.jobs.map((j) => j.id);
  assert.deepEqual(persistedIds, reorderedIds2);
});

test('renderQueueView - renders Prototype A linear console structure with sample watermark', () => {
  const jobs: Job[] = [
    createMockJob({
      id: 'job_001',
      state: 'completed',
      prompt: 'Cinematic Thai floating market with warm lighting',
    }),
    createMockJob({
      id: 'job_002',
      state: 'running',
      prompt: 'Drone shot of mountain mist over Chiang Mai',
    }),
    createMockJob({
      id: 'job_003',
      state: 'pending',
      prompt: 'Night portrait of cyberpunk Bangkok street vendor',
    }),
    createMockJob({
      id: 'job_004',
      state: 'failed',
      prompt: 'Abstract geometric patterns',
      error: 'Upstream rate limit 429',
    }),
  ];

  const html = renderQueueView({
    jobs,
    queueRunning: true,
    activeJobId: 'job_002',
    progressPercentage: 25,
  });

  // Verify Prototype A toolbar controls
  assert.ok(html.includes('id="btnToggleQueue"'), 'Toolbar contains Start/Pause toggle button');
  assert.ok(html.includes('id="btnStepQueue"'), 'Toolbar contains Step 1 Job button');
  assert.ok(html.includes('id="btnSimulateError"'), 'Toolbar contains Simulate 429 button');
  assert.ok(html.includes('id="btnClearCompleted"'), 'Toolbar contains Clear Done button');

  // Verify Progress card
  assert.ok(html.includes('Queue Progress: 1 of 4 Completed'), 'Contains progress counter text');
  assert.ok(html.includes('25%'), 'Contains percentage');
  assert.ok(html.includes('width: 25%'), 'Progress bar width matches percentage');

  // Verify Sample Data watermark (DESIGN.md policy)
  assert.ok(html.includes('Sample Data') || html.includes('PROTOTYPE • SIMULATED'), 'Visible sample/mock watermark');

  // Verify running job has progress indicators and disabled edit/duplicate
  assert.ok(html.includes('data-running="true"'), 'Running job tagged');
  assert.ok(html.includes('job_002'), 'Running job rendered');
});

test('renderQueueView - empty, loading, and error states provide accessible ARIA semantics', () => {
  // 1. Empty state
  const emptyHtml = renderQueueView({ jobs: [], queueRunning: false });
  assert.ok(emptyHtml.includes('role="status"'), 'Empty state has role="status"');
  assert.ok(emptyHtml.includes('No jobs in queue'), 'Displays empty queue message');

  // 2. Loading state
  const loadingHtml = renderQueueView({ jobs: [], isLoading: true });
  assert.ok(loadingHtml.includes('aria-busy="true"'), 'Loading state specifies aria-busy="true"');
  assert.ok(loadingHtml.includes('queue-item-skeleton'), 'Displays skeleton loading placeholders');

  // 3. Error state
  const errorHtml = renderQueueView({
    jobs: [],
    errorMessage: 'Challenge verification required (429)',
  });
  assert.ok(errorHtml.includes('role="alert"'), 'Error state uses role="alert"');
  assert.ok(errorHtml.includes('Challenge verification required (429)'), 'Displays error text');
});

test('renderQueueView - inspect modal renders accessible dialog with focus restore target', () => {
  const targetJob = createMockJob({
    id: 'job_inspect_99',
    prompt: 'High-detail Bangkok temple roofline with golden leaf',
    state: 'needs-review',
    error: 'Low Jev score: 42/100',
  });

  const html = renderQueueView({
    jobs: [targetJob],
    inspectingJobId: 'job_inspect_99',
  });

  assert.ok(html.includes('role="dialog"'), 'Inspect view has role="dialog"');
  assert.ok(html.includes('aria-modal="true"'), 'Inspect view is marked aria-modal="true"');
  assert.ok(html.includes('aria-labelledby="inspectDialogTitle"'), 'Dialog has labeledby attribute');
  assert.ok(html.includes('data-restore-focus="btn-inspect-job_inspect_99"'), 'Contains focus restore pointer');
  assert.ok(html.includes('job_inspect_99'), 'Displays job ID in inspect view');
  assert.ok(html.includes('Low Jev score: 42/100'), 'Displays error details');
});

test('getQueueViewStyles - enforces 420px container and narrow 320px responsive adaptation', () => {
  const styles = getQueueViewStyles();

  // Root sidepanel width token checks
  assert.ok(styles.includes('420px'), 'Includes standard 420px width limit');
  assert.ok(styles.includes('--bg-canvas'), 'Includes DESIGN.md token --bg-canvas');
  assert.ok(styles.includes('--border-subtle'), 'Includes DESIGN.md token --border-subtle');
  assert.ok(styles.includes(':focus-visible'), 'Includes focus-visible accessibility styling');
  assert.ok(styles.includes('@media'), 'Includes responsive media queries');
  assert.ok(styles.includes('prefers-reduced-motion'), 'Includes motion reduction query');
});
