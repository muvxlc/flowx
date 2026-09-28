import test from 'node:test';
import assert from 'node:assert/strict';
import { SidePanelApp } from '../src/sidepanel/sidepanel.ts';
import { RuntimeBridge } from '../src/integration/service-bridge.ts';
import { setupMockDocument, MockElement } from './mock-dom.ts';
import type { Job } from '../src/queue/types.ts';

function installMockChrome(handler: (msg: any, callback: (resp: any) => void) => void) {
  const originalChrome = (globalThis as any).chrome;
  (globalThis as any).chrome = {
    runtime: {
      id: 'mock-extension-id',
      lastError: null,
      sendMessage: (message: any, callback: (resp: any) => void) => {
        handler(message, callback);
      },
    },
    storage: {
      local: {
        get: (_k: any, cb: any) => cb?.({}),
        set: (_items: any, cb: any) => cb?.(),
      },
    },
  };
  return () => {
    if (originalChrome === undefined) {
      delete (globalThis as any).chrome;
    } else {
      (globalThis as any).chrome = originalChrome;
    }
  };
}

test('RED: When chrome.runtime is present and returns Unauthorized on ENQUEUE, reject fallback and preserve input', async () => {
  const { panelContent } = setupMockDocument();
  const restoreChrome = installMockChrome((msg, callback) => {
    if (msg.type === 'QUEUE_COMMAND' && msg.payload?.command === 'ENQUEUE') {
      callback({ success: false, error: 'Unauthorized: Tab content script is not permitted to perform privileged action' });
      return;
    }
    if (msg.type === 'PING') {
      callback({ success: true });
      return;
    }
    callback({ success: true });
  });

  try {
    const bridge = new RuntimeBridge();
    assert.equal(bridge.hasRuntime(), true, 'Must detect chrome.runtime as present');

    const app = new SidePanelApp({ bridge });
    await app.init();
    app.switchTab('create');

    const promptText = 'Cinematic shot of Bangkok temples at dawn';
    app.createController.setMode('text-only');
    app.createController.setPromptsText(promptText);
    app.render();

    const btnEnqueue = panelContent.querySelector<MockElement>('#btnEnqueuePrompts');
    assert.ok(btnEnqueue, 'Must render enqueue button');

    await btnEnqueue.click();

    // Must NOT switch to queue tab
    assert.equal(app.getActiveTab(), 'create', 'Must remain on create tab after worker rejection');

    // Must PRESERVE user input in controller and state
    assert.equal(app.createController.getState().promptsText, promptText, 'Must preserve prompt input text');

    // Must NOT write to local queue or claim accepted
    assert.equal((app as any).jobs.length, 0, 'Must NOT write jobs to sidepanel queue');
    assert.equal(app.queueController.getState().jobs.length, 0, 'Must NOT write jobs to local queueController');

    // Must display actionable error
    const errAlert = panelContent.querySelector<MockElement>('#createValidationError');
    assert.ok(errAlert, 'Must display validation error banner');
    const errItem = panelContent.querySelector<MockElement>('li');
    assert.ok(
      errItem?.textContent.includes('Unauthorized'),
      `Error banner must contain actionable Unauthorized message, got: ${errItem?.textContent}`
    );
  } finally {
    restoreChrome();
  }
});

test('RED: When chrome.runtime is present and sendMessage has lastError (transport fault), reject fallback and preserve input', async () => {
  const { panelContent } = setupMockDocument();
  const restoreChrome = installMockChrome((msg, callback) => {
    if (msg.type === 'QUEUE_COMMAND' && msg.payload?.command === 'ENQUEUE') {
      (globalThis as any).chrome.runtime.lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
      callback(undefined);
      (globalThis as any).chrome.runtime.lastError = null;
      return;
    }
    callback({ success: true });
  });

  try {
    const bridge = new RuntimeBridge();
    assert.equal(bridge.hasRuntime(), true);

    const app = new SidePanelApp({ bridge });
    await app.init();
    app.switchTab('create');

    const promptText = 'Preserve this input on transport fault';
    app.createController.setMode('text-only');
    app.createController.setPromptsText(promptText);
    app.render();

    const btnEnqueue = panelContent.querySelector<MockElement>('#btnEnqueuePrompts');
    await btnEnqueue?.click();

    assert.equal(app.getActiveTab(), 'create', 'Must remain on create tab after transport error');
    assert.equal(app.createController.getState().promptsText, promptText, 'Must preserve prompt input text on transport fault');
    assert.equal((app as any).jobs.length, 0, 'Must NOT write jobs to queue on transport fault');

    const errAlert = panelContent.querySelector<MockElement>('#createValidationError');
    assert.ok(errAlert, 'Must display validation error banner on transport error');
    const errItem = panelContent.querySelector<MockElement>('li');
    assert.ok(
      errItem?.textContent.includes('Could not establish connection') || errItem?.textContent.includes('worker'),
      `Must display actionable transport error, got: ${errItem?.textContent}`
    );
  } finally {
    restoreChrome();
  }
});

test('RED: When chrome.runtime is present and returns Unauthorized on queue toggle, reject fallback toggle', async () => {
  const { panelContent } = setupMockDocument();
  const restoreChrome = installMockChrome((msg, callback) => {
    if (msg.type === 'QUEUE_COMMAND' && (msg.payload?.command === 'START' || msg.payload?.command === 'PAUSE')) {
      callback({ success: false, error: 'Unauthorized sender' });
      return;
    }
    callback({ success: true });
  });

  try {
    const bridge = new RuntimeBridge();
    const app = new SidePanelApp({ bridge });
    await app.init();
    app.switchTab('queue');

    const btnToggle = panelContent.querySelector<MockElement>('#btnToggleQueue');
    assert.ok(btnToggle, 'Must render toggle button');

    await btnToggle.click();

    // Must NOT start queue running locally
    assert.equal((app as any).queueRunning, false, 'Queue running must remain false on worker rejection');
    assert.equal(app.queueController.getState().queueRunning, false, 'Local queueController must remain not running');

    // Must render actionable error alert
    const statusAlert = panelContent.querySelector<MockElement>('#queueStatusAlert');
    assert.ok(statusAlert, 'Must render status alert');
    assert.ok(
      statusAlert.textContent.includes('Unauthorized sender'),
      `Alert must display Unauthorized sender, got: ${statusAlert.textContent}`
    );
  } finally {
    restoreChrome();
  }
});

test('RED: When chrome.runtime is present and returns Unauthorized on queue step, reject fallback step', async () => {
  const { panelContent } = setupMockDocument();
  let steppedLocal = false;

  const restoreChrome = installMockChrome((msg, callback) => {
    if (msg.type === 'QUEUE_COMMAND' && msg.payload?.command === 'STEP') {
      callback({ success: false, error: 'Unauthorized: Tab content script is not permitted' });
      return;
    }
    callback({ success: true });
  });

  try {
    const bridge = new RuntimeBridge();
    const app = new SidePanelApp({ bridge });
    // Override orchestrator step to detect if local fallback step is invoked
    app.orchestrator.step = async () => {
      steppedLocal = true;
      return null;
    };
    await app.init();
    app.switchTab('queue');

    const btnStep = panelContent.querySelector<MockElement>('#btnStepQueue');
    assert.ok(btnStep, 'Must render step button');

    await btnStep.click();

    assert.equal(steppedLocal, false, 'Must NOT invoke local orchestrator step on worker rejection');
    const statusAlert = panelContent.querySelector<MockElement>('#queueStatusAlert');
    assert.ok(
      statusAlert?.textContent.includes('Unauthorized'),
      `Alert must show Unauthorized error, got: ${statusAlert?.textContent}`
    );
  } finally {
    restoreChrome();
  }
});

test('RED: When chrome.runtime is present and returns Unauthorized on syncQueue, set error and do not load local queue', async () => {
  setupMockDocument();
  const restoreChrome = installMockChrome((msg, callback) => {
    if (msg.type === 'QUEUE_COMMAND' && msg.payload?.command === 'STATUS') {
      callback({ success: false, error: 'Unauthorized sender' });
      return;
    }
    callback({ success: true });
  });

  try {
    const bridge = new RuntimeBridge();
    const app = new SidePanelApp({ bridge });
    // Pre-populate queueController with local dummy jobs to check if it mistakenly falls back to local persistence
    const dummyJob: Job = {
      id: 'local-ghost-job',
      prompt: 'Ghost job in local queue',
      state: 'pending',
      media: 'image',
      mode: 'text-only',
      provider: 'meta',
      settings: {},
      retryCount: 0,
      maxRetries: 3,
      createdAt: 1,
      updatedAt: 1,
    };
    await app.queueController.loadFromPersistence();
    (app.queueController as any).jobs = [dummyJob];

    await app.syncQueueFromWorker();

    assert.equal((app as any).jobs.length, 0, 'Must NOT load local queue when runtime is present but unauthorized');
    assert.equal((app as any).errorMessage, 'Unauthorized sender', 'Must set actionable error message from worker');
  } finally {
    restoreChrome();
  }
});

test('HTTP preview: When chrome.runtime is absent, fallback mock mode operates with SW Standby', async () => {
  const { panelContent } = setupMockDocument();
  // Ensure chrome is completely undefined
  const originalChrome = (globalThis as any).chrome;
  delete (globalThis as any).chrome;

  try {
    const bridge = new RuntimeBridge();
    assert.equal(bridge.hasRuntime(), false, 'Must detect runtime as absent in HTTP preview');

    const app = new SidePanelApp({ bridge });
    await app.init();

    // Verify worker status indicator
    const statusText = panelContent.querySelector<MockElement>('#worker-status-text') ?? { textContent: '' };
    // In HTTP preview, ping returns false -> SW Standby
    assert.equal(await app.updateWorkerStatus(), false);

    // Create tab enqueue in HTTP preview uses local mock queue
    app.switchTab('create');
    app.createController.setMode('text-only');
    app.createController.setPromptsText('HTTP Preview Mock Prompt');
    app.render();

    const btnEnqueue = panelContent.querySelector<MockElement>('#btnEnqueuePrompts');
    await btnEnqueue?.click();

    // In HTTP preview (runtime absent), mock fallback is permitted
    assert.equal(app.getActiveTab(), 'queue', 'HTTP preview mock mode enqueues and transitions to queue');
    assert.equal((app as any).jobs.length, 1, 'HTTP preview enqueues 1 local job');
    assert.equal((app as any).jobs[0].prompt, 'HTTP Preview Mock Prompt');
  } finally {
    if (originalChrome !== undefined) {
      (globalThis as any).chrome = originalChrome;
    }
  }
});
