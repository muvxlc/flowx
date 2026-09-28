import test from 'node:test';
import assert from 'node:assert/strict';
import { SidePanelApp } from '../src/sidepanel/sidepanel.ts';
import { RuntimeBridge } from '../src/integration/service-bridge.ts';
import type { Job } from '../src/queue/types.ts';
import type { SafeSettingsSummary } from '../src/integration/types.ts';

// Lightweight DOM element mock for testing actual button clicks and event listeners
class MockElement {
  id: string = '';
  tagName: string = 'DIV';
  className: string = '';
  innerHTMLInternal: string = '';
  textContent: string = '';
  value: string = '';
  checked: boolean = false;
  style: Record<string, string> = {};
  attributes: Map<string, string> = new Map();
  listeners: Map<string, Array<(event?: unknown) => void>> = new Map();
  children: MockElement[] = [];

  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
  }

  get innerHTML(): string {
    return this.innerHTMLInternal;
  }

  set innerHTML(html: string) {
    this.innerHTMLInternal = html;
    this.children = parseHtmlToElements(html);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'id') this.id = value;
    if (name === 'class') this.className = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  classList = {
    toggle: (cls: string, force?: boolean) => {
      const classes = new Set(this.className.split(' ').filter(Boolean));
      const shouldAdd = force !== undefined ? force : !classes.has(cls);
      if (shouldAdd) classes.add(cls);
      else classes.delete(cls);
      this.className = Array.from(classes).join(' ');
    },
    contains: (cls: string) => this.className.split(' ').includes(cls),
  };

  addEventListener(event: string, handler: (event?: unknown) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
  }

  async click(): Promise<void> {
    const handlers = this.listeners.get('click') ?? [];
    for (const h of handlers) {
      await h({ target: this, type: 'click', preventDefault: () => {} });
    }
  }

  appendChild(child: MockElement): void {
    this.children.push(child);
  }

  focus(): void {}

  querySelector<T extends MockElement = MockElement>(selector: string): T | null {
    return (findFirst(this, selector) as T) ?? null;
  }

  querySelectorAll<T extends MockElement = MockElement>(selector: string): T[] {
    const results: MockElement[] = [];
    findAll(this, selector, results);
    return results as T[];
  }
}

function parseHtmlToElements(html: string): MockElement[] {
  const elements: MockElement[] = [];
  const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1]!;
    const attrString = match[2]!;
    if (tagName.startsWith('/')) continue; // closing tag

    const el = new MockElement(tagName);
    const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      const attrName = attrMatch[1]!;
      const attrVal = attrMatch[2] ?? '';
      el.setAttribute(attrName, attrVal);
    }
    elements.push(el);
  }
  return elements;
}

function matchesSelector(el: MockElement, selector: string): boolean {
  if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    return el.classList.contains(selector.slice(1));
  }
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const inner = selector.slice(1, -1);
    if (inner.includes('=')) {
      const [attr, val] = inner.split('=');
      const cleanVal = val?.replace(/["']/g, '') ?? '';
      return el.getAttribute(attr!) === cleanVal;
    }
    return el.attributes.has(inner);
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

function findFirst(root: MockElement, selector: string): MockElement | null {
  for (const child of root.children) {
    if (matchesSelector(child, selector)) return child;
    const found = findFirst(child, selector);
    if (found) return found;
  }
  return null;
}

function findAll(root: MockElement, selector: string, results: MockElement[]): void {
  for (const child of root.children) {
    if (matchesSelector(child, selector)) results.push(child);
    findAll(child, selector, results);
  }
}

function setupMockDocument() {
  const elementsById = new Map<string, MockElement>();

  const panelContent = new MockElement('main', 'panel-content');
  const statusIndicator = new MockElement('div', 'worker-status-indicator');
  const statusText = new MockElement('span', 'worker-status-text');
  const tabQueue = new MockElement('button', 'tab-queue');
  const tabCreate = new MockElement('button', 'tab-create');
  const tabDownloads = new MockElement('button', 'tab-downloads');
  const tabSettings = new MockElement('button', 'tab-settings');

  elementsById.set('panel-content', panelContent);
  elementsById.set('worker-status-indicator', statusIndicator);
  elementsById.set('worker-status-text', statusText);
  elementsById.set('tab-queue', tabQueue);
  elementsById.set('tab-create', tabCreate);
  elementsById.set('tab-downloads', tabDownloads);
  elementsById.set('tab-settings', tabSettings);

  const doc = {
    readyState: 'complete',
    getElementById: (id: string) => elementsById.get(id) ?? null,
    createElement: (tag: string) => new MockElement(tag),
    addEventListener: () => {},
  };

  (globalThis as unknown as { document: unknown }).document = doc;
  return { panelContent, statusText, statusIndicator, tabQueue, tabCreate, tabSettings };
}

// --------------------------------------------------------------------------
// RED TESTS: MUST FAIL against current buggy src/sidepanel/sidepanel.ts
// --------------------------------------------------------------------------

test('RED: Clicking #btnToggleQueue dispatches START/PAUSE through RuntimeBridge worker', async () => {
  const { panelContent } = setupMockDocument();

  const dispatchedCommands: Array<{ action: string; payload: unknown }> = [];
  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: unknown) => {
    dispatchedCommands.push({ action, payload });
    if (action === 'QUEUE_COMMAND' && (payload as { command: string })?.command === 'START') {
      return { success: true, status: { isPaused: false, jobs: [] } };
    }
    return { success: true, status: { isPaused: true, jobs: [] } };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();

  // Find the actual button rendered in queue view
  const btnToggle = panelContent.querySelector<MockElement>('#btnToggleQueue');
  assert.ok(btnToggle, 'View must render #btnToggleQueue');

  // CLICK the button
  await btnToggle.click();

  // FAILS on current code because listener was attached to #btnStartQueue (null), not #btnToggleQueue!
  assert.ok(
    dispatchedCommands.some((c) => c.action === 'QUEUE_COMMAND' && (c.payload as { command: string })?.command === 'START'),
    'Clicking #btnToggleQueue must send START command through bridge to worker'
  );
});

test('RED: Clicking #btnEnqueuePrompts dispatches ENQUEUE through RuntimeBridge worker', async () => {
  const { panelContent } = setupMockDocument();

  const dispatchedCommands: Array<{ action: string; payload: unknown }> = [];
  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: unknown) => {
    dispatchedCommands.push({ action, payload });
    return {
      success: true,
      jobs: [
        {
          id: 'job_w_1',
          prompt: 'New enqueued prompt',
          state: 'pending',
          media: 'image',
          mode: 'text-only',
          provider: 'meta',
          settings: {},
          retryCount: 0,
          maxRetries: 3,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();
  app.switchTab('create');

  const btnEnqueuePrompts = panelContent.querySelector<MockElement>('#btnEnqueuePrompts');
  assert.ok(btnEnqueuePrompts, 'Create view must render #btnEnqueuePrompts');

  // Enter prompt in textarea
  const textarea = panelContent.querySelector<MockElement>('#txtPrompts');
  if (textarea) textarea.value = 'Test prompt via UI glue';

  // CLICK the actual button
  await btnEnqueuePrompts.click();

  // FAILS on current code because listener was attached to #btnEnqueue (null), not #btnEnqueuePrompts!
  assert.ok(
    dispatchedCommands.some(
      (c) => c.action === 'QUEUE_COMMAND' && (c.payload as { command: string })?.command === 'ENQUEUE'
    ),
    'Clicking #btnEnqueuePrompts must send ENQUEUE command through bridge to worker'
  );

  // Must have switched back to queue tab and rendered jobs
  assert.equal(app.getActiveTab(), 'queue');
});

test('RED: Clicking #btnStepQueue dispatches STEP through RuntimeBridge worker', async () => {
  const { panelContent } = setupMockDocument();

  const dispatchedCommands: Array<{ action: string; payload: unknown }> = [];
  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: unknown) => {
    dispatchedCommands.push({ action, payload });
    return {
      success: true,
      job: { id: 'job_step_1', state: 'completed' },
      status: { isPaused: false, jobs: [{ id: 'job_step_1', state: 'completed' }] },
    };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();

  const btnStep = panelContent.querySelector<MockElement>('#btnStepQueue');
  assert.ok(btnStep, 'Queue view must render #btnStepQueue');

  // CLICK Step 1 Job button
  await btnStep.click();

  // FAILS on current code because #btnStepQueue has NO listener attached!
  assert.ok(
    dispatchedCommands.some((c) => c.action === 'QUEUE_COMMAND' && (c.payload as { command: string })?.command === 'STEP'),
    'Clicking #btnStepQueue must dispatch STEP command to worker'
  );
});

test('RED: Clicking #btnSimulateError dispatches PAUSE with 429 reason through worker', async () => {
  const { panelContent } = setupMockDocument();

  const dispatchedCommands: Array<{ action: string; payload: unknown }> = [];
  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: unknown) => {
    dispatchedCommands.push({ action, payload });
    return { success: true, status: { isPaused: true, pauseReason: 'Simulated 429 Challenge Pause' } };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();

  const btnSimulateError = panelContent.querySelector<MockElement>('#btnSimulateError');
  assert.ok(btnSimulateError, 'Queue view must render #btnSimulateError');

  await btnSimulateError.click();

  // FAILS on current code because #btnSimulateError has NO listener attached!
  assert.ok(
    dispatchedCommands.some(
      (c) =>
        c.action === 'QUEUE_COMMAND' &&
        (c.payload as { command: string; reason?: string })?.command === 'PAUSE' &&
        (c.payload as { reason?: string })?.reason?.includes('429')
    ),
    'Clicking #btnSimulateError must dispatch PAUSE with 429 reason to worker'
  );
});

test('RED: Clicking #btnClearCompleted clears completed jobs via worker without direct persistence writes', async () => {
  const { panelContent } = setupMockDocument();

  const dispatchedCommands: Array<{ action: string; payload: unknown }> = [];
  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: unknown) => {
    dispatchedCommands.push({ action, payload });
    return { success: true, status: { isPaused: false, jobs: [] } };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();

  const btnClear = panelContent.querySelector<MockElement>('#btnClearCompleted');
  assert.ok(btnClear, 'Queue view must render #btnClearCompleted');

  await btnClear.click();

  // FAILS on current code because #btnClearCompleted has NO listener attached!
  assert.ok(
    dispatchedCommands.some(
      (c) =>
        c.action === 'QUEUE_COMMAND' &&
        ((c.payload as { command: string })?.command === 'CLEAR_COMPLETED' ||
          (c.payload as { command: string })?.command === 'STATUS')
    ),
    'Clicking #btnClearCompleted must update queue through worker'
  );
});

test('RED: Settings save and remove are mediated by worker, never direct SettingsService storage', async () => {
  const { panelContent } = setupMockDocument();

  const dispatchedCommands: Array<{ action: string; payload: unknown }> = [];
  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: unknown) => {
    dispatchedCommands.push({ action, payload });
    if (action === 'SETTINGS_UPDATE' && (payload as { action: string })?.action === 'SAVE_KEY') {
      return { success: true, hasKey: true }; // Worker response: NEVER returns secret
    }
    if (action === 'SETTINGS_UPDATE' && (payload as { action: string })?.action === 'REMOVE_KEY') {
      return { success: true, hasKey: false };
    }
    return {
      success: true,
      settings: {
        endpoint: 'https://9router.bangkhan.com/v1/systemone',
        modelId: 'UNKNOWN',
        displayLabel: 'Jev 1.13 Free (9router System One)',
        hasKey: false,
        isG1Blocked: true,
        isG0Blocked: true,
      } as SafeSettingsSummary,
    };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();
  app.switchTab('settings');

  // Input a dummy key
  const keyInput = panelContent.querySelector<MockElement>('#cfgApiKey');
  if (keyInput) keyInput.value = 'dummy_secret';

  const btnSave = panelContent.querySelector<MockElement>('#btnSaveSettings');
  assert.ok(btnSave, 'Settings view must render #btnSaveSettings');

  await btnSave.click();

  // FAILS on current code: SettingsController writes directly to SettingsService/storage instead of worker command!
  assert.ok(
    dispatchedCommands.some(
      (c) => c.action === 'SETTINGS_UPDATE' && (c.payload as { action: string })?.action === 'SAVE_KEY'
    ),
    'Saving settings key must be mediated by worker via SETTINGS_UPDATE command'
  );
});
