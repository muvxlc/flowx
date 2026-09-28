import test from 'node:test';
import assert from 'node:assert/strict';
import { SidePanelApp } from '../src/sidepanel/sidepanel.ts';
import { RuntimeBridge } from '../src/integration/service-bridge.ts';
import type { Job } from '../src/queue/types.ts';
import { setupMockDocument, MockElement } from './mock-dom.ts';

function createDummyJobs(): Job[] {
  return [
    { id: 'job-1', prompt: 'Prompt one', state: 'pending', media: 'image', mode: 'text-only', provider: 'meta', settings: {}, retryCount: 0, maxRetries: 3, createdAt: 1000, updatedAt: 1000 },
    { id: 'job-2', prompt: 'Prompt two', state: 'pending', media: 'image', mode: 'text-only', provider: 'meta', settings: {}, retryCount: 0, maxRetries: 3, createdAt: 2000, updatedAt: 2000 },
    { id: 'job-3', prompt: 'Prompt three', state: 'completed', media: 'video', mode: 'text-only', provider: 'meta', settings: {}, retryCount: 0, maxRetries: 3, createdAt: 3000, updatedAt: 3000, completedAt: 3500 },
    { id: 'job-4', prompt: 'Prompt four', state: 'failed', error: 'Upstream fault', media: 'image', mode: 'text-only', provider: 'meta', settings: {}, retryCount: 1, maxRetries: 3, createdAt: 4000, updatedAt: 4000 },
  ];
}

test('RED: CLEAR_COMPLETED checks worker result and avoids misleading local clear on failure', async () => {
  const { panelContent } = setupMockDocument();
  const jobs = createDummyJobs();
  const dispatched: unknown[] = [];

  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: unknown) => {
    dispatched.push({ action, payload });
    if (action === 'QUEUE_COMMAND' && (payload as { command?: string })?.command === 'CLEAR_COMPLETED') {
      return { success: false, error: 'Storage quota exceeded' };
    }
    return { success: true, status: { jobs, isPaused: false } };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  (app as unknown as { jobs: Job[] }).jobs = [...jobs];
  await app.init();

  const btnClear = panelContent.querySelector<MockElement>('#btnClearCompleted');
  assert.ok(btnClear, 'Queue view must render #btnClearCompleted');

  await btnClear.click();

  const stateJobs = (app as unknown as { jobs: Job[] }).jobs;
  const completedStillPresent = stateJobs.some((j) => j.id === 'job-3');
  assert.equal(completedStillPresent, true, 'Completed job must NOT be cleared when worker returns failure');

  const alertEl = panelContent.querySelector<MockElement>('#queueStatusAlert');
  assert.ok(alertEl?.textContent.includes('Storage quota exceeded'), 'Error alert must be rendered');
});

test('RED: Clicking move-up dispatches worker command and renders returned snapshot', async () => {
  const { panelContent } = setupMockDocument();
  const jobs = createDummyJobs();
  const dispatched: Array<{ action: string; payload: any }> = [];

  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: any) => {
    dispatched.push({ action, payload });
    if (payload?.command === 'MOVE' || payload?.command === 'MOVE_UP') {
      const swapped = [jobs[1]!, jobs[0]!, jobs[2]!, jobs[3]!];
      return { success: true, status: { jobs: swapped, isPaused: false } };
    }
    return { success: true, status: { jobs, isPaused: false } };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  (app as unknown as { jobs: Job[] }).jobs = [...jobs];
  await app.init();

  const btnMoveUp = panelContent.querySelector<MockElement>('button[data-action="move-up"][data-id="job-2"]');
  assert.ok(btnMoveUp, 'Must render move-up button for job-2');

  await btnMoveUp.click();

  assert.ok(
    dispatched.some((d) => (d.payload?.command === 'MOVE' || d.payload?.command === 'MOVE_UP') && d.payload?.jobId === 'job-2'),
    'Must dispatch MOVE/MOVE_UP worker command for job-2'
  );

  const currentJobs = (app as unknown as { jobs: Job[] }).jobs;
  assert.equal(currentJobs[0]!.id, 'job-2', 'First job must now be job-2 from snapshot');
});

test('RED: Clicking move-down dispatches worker command and renders returned snapshot', async () => {
  const { panelContent } = setupMockDocument();
  const jobs = createDummyJobs();
  const dispatched: Array<{ action: string; payload: any }> = [];

  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: any) => {
    dispatched.push({ action, payload });
    if (payload?.command === 'MOVE' || payload?.command === 'MOVE_DOWN') {
      const swapped = [jobs[1]!, jobs[0]!, jobs[2]!, jobs[3]!];
      return { success: true, status: { jobs: swapped, isPaused: false } };
    }
    return { success: true, status: { jobs, isPaused: false } };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  (app as unknown as { jobs: Job[] }).jobs = [...jobs];
  await app.init();

  const btnMoveDown = panelContent.querySelector<MockElement>('button[data-action="move-down"][data-id="job-1"]');
  assert.ok(btnMoveDown, 'Must render move-down button for job-1');

  await btnMoveDown.click();

  assert.ok(
    dispatched.some((d) => (d.payload?.command === 'MOVE' || d.payload?.command === 'MOVE_DOWN') && d.payload?.jobId === 'job-1'),
    'Must dispatch MOVE/MOVE_DOWN worker command for job-1'
  );
  const currentJobs = (app as unknown as { jobs: Job[] }).jobs;
  assert.equal(currentJobs[1]!.id, 'job-1', 'Second job must now be job-1 from snapshot');
});

test('RED: Clicking duplicate dispatches worker command and renders duplicate in snapshot', async () => {
  const { panelContent } = setupMockDocument();
  const jobs = createDummyJobs();
  const dispatched: Array<{ action: string; payload: any }> = [];

  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: any) => {
    dispatched.push({ action, payload });
    if (payload?.command === 'DUPLICATE') {
      const copy: Job = { ...jobs[0]!, id: 'job-1-dup' };
      return { success: true, duplicate: copy, status: { jobs: [...jobs, copy], isPaused: false } };
    }
    return { success: true, status: { jobs, isPaused: false } };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  (app as unknown as { jobs: Job[] }).jobs = [...jobs];
  await app.init();

  const btnDup = panelContent.querySelector<MockElement>('button[data-action="duplicate"][data-id="job-1"]');
  assert.ok(btnDup, 'Must render duplicate button for job-1');

  await btnDup.click();

  assert.ok(
    dispatched.some((d) => d.payload?.command === 'DUPLICATE' && d.payload?.jobId === 'job-1'),
    'Must dispatch DUPLICATE worker command'
  );
  const currentJobs = (app as unknown as { jobs: Job[] }).jobs;
  assert.equal(currentJobs.length, 5, 'Queue must contain 5 jobs after duplicate');
});

test('RED: Clicking cancel dispatches worker command and transitions job to failed', async () => {
  const { panelContent } = setupMockDocument();
  const jobs = createDummyJobs();
  const dispatched: Array<{ action: string; payload: any }> = [];

  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: any) => {
    dispatched.push({ action, payload });
    if (payload?.command === 'CANCEL') {
      const updated = jobs.map((j) => (j.id === 'job-1' ? { ...j, state: 'failed' as const, error: 'Cancelled by operator' } : j));
      return { success: true, status: { jobs: updated, isPaused: false } };
    }
    return { success: true, status: { jobs, isPaused: false } };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  (app as unknown as { jobs: Job[] }).jobs = [...jobs];
  await app.init();

  const btnCancel = panelContent.querySelector<MockElement>('button[data-action="cancel"][data-id="job-1"]');
  assert.ok(btnCancel, 'Must render cancel button for job-1');

  await btnCancel.click();

  assert.ok(
    dispatched.some((d) => d.payload?.command === 'CANCEL' && d.payload?.jobId === 'job-1'),
    'Must dispatch CANCEL worker command'
  );
  const cancelled = (app as unknown as { jobs: Job[] }).jobs.find((j) => j.id === 'job-1');
  assert.equal(cancelled?.state, 'failed');
});

test('RED: Clicking retry on failed job dispatches worker command and transitions to pending', async () => {
  const { panelContent } = setupMockDocument();
  const jobs = createDummyJobs();
  const dispatched: Array<{ action: string; payload: any }> = [];

  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: any) => {
    dispatched.push({ action, payload });
    if (payload?.command === 'RETRY') {
      const updated = jobs.map((j) => (j.id === 'job-4' ? { ...j, state: 'pending' as const, error: undefined } : j));
      return { success: true, status: { jobs: updated, isPaused: false } };
    }
    return { success: true, status: { jobs, isPaused: false } };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  (app as unknown as { jobs: Job[] }).jobs = [...jobs];
  await app.init();

  const btnRetry = panelContent.querySelector<MockElement>('button[data-action="retry"][data-id="job-4"]');
  assert.ok(btnRetry, 'Must render retry button for failed job-4');

  await btnRetry.click();

  assert.ok(
    dispatched.some((d) => d.payload?.command === 'RETRY' && d.payload?.jobId === 'job-4'),
    'Must dispatch RETRY worker command'
  );
  const retried = (app as unknown as { jobs: Job[] }).jobs.find((j) => j.id === 'job-4');
  assert.equal(retried?.state, 'pending');
});

test('RED: Clicking edit validates prompt and dispatches worker command with updated prompt', async () => {
  const { panelContent } = setupMockDocument();
  const jobs = createDummyJobs();
  const dispatched: Array<{ action: string; payload: any }> = [];

  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: any) => {
    dispatched.push({ action, payload });
    if (payload?.command === 'EDIT') {
      const updated = jobs.map((j) => (j.id === 'job-1' ? { ...j, prompt: payload.updates?.prompt ?? payload.prompt } : j));
      return { success: true, status: { jobs: updated, isPaused: false } };
    }
    return { success: true, status: { jobs, isPaused: false } };
  };

  (globalThis as unknown as { window?: unknown }).window = {
    prompt: (_msg: string, _def: string) => 'Updated prompt text via test',
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  (app as unknown as { jobs: Job[] }).jobs = [...jobs];
  await app.init();

  const btnEdit = panelContent.querySelector<MockElement>('button[data-action="edit"][data-id="job-1"]');
  assert.ok(btnEdit, 'Must render edit button for job-1');

  await btnEdit.click();

  assert.ok(
    dispatched.some((d) => d.payload?.command === 'EDIT' && d.payload?.jobId === 'job-1'),
    'Must dispatch EDIT worker command'
  );
  const edited = (app as unknown as { jobs: Job[] }).jobs.find((j) => j.id === 'job-1');
  assert.equal(edited?.prompt, 'Updated prompt text via test');
});
